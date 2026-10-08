/**
 * RSP 0.1 读写：.rtsz 打包/解包、图片导入、草稿自动保存。
 *
 * 落盘布局（zip 内）：
 *   project.json          结构化项目（页面 / 块 / 版式属性 / 素材登记）
 *   content/<id>.md       长文正文，纯 Markdown，可脱离 Studio 编辑
 *   assets/<name>         图片原件
 *   README.txt            格式说明
 *
 * 保存路径优先使用 File System Access API 直接落盘（可反复覆盖同一文件）；
 * 不支持时退化为下载 Blob。
 */

import { Asset, Block, MediaSlot, StudioProject, coerceProject, makeId } from './model';
import { base64FromBytes, bytesFromBase64, zipRead, zipWrite } from './zip';

const DRAFT_KEY = 'rivertype.studio.draft';

export interface SaveResult {
  fileName: string;
  bytes: number;
  via: 'file-handle' | 'download';
}

// ------------------------------------------------------------- 序列化

interface SerializedProject extends Record<string, unknown> {
  rsp?: string;
}

function serialize(project: StudioProject): { json: SerializedProject; extra: { name: string; data: Uint8Array }[] } {
  const enc = new TextEncoder();
  const extra: { name: string; data: Uint8Array }[] = [];

  // 深拷贝，body 正文外置为 content/<id>.md
  const clone: StudioProject = JSON.parse(JSON.stringify(project));
  for (const page of clone.pages) {
    for (const block of page.blocks) {
      if (block.type === 'body' && block.text.trim()) {
        const path = `content/${block.id}.md`;
        extra.push({ name: path, data: enc.encode(block.text) });
        block.contentFile = path;
        block.text = '';
      } else {
        delete block.contentFile;
      }
    }
  }

  for (const asset of clone.assets) {
    if (asset.status === 'provided' && asset.data) {
      extra.push({ name: `assets/${asset.name}`, data: bytesFromBase64(asset.data) });
      // 素材二进制已在 assets/ 下落盘，json 里只留登记信息
      asset.data = '';
    }
  }

  return { json: clone as unknown as SerializedProject, extra };
}

function deserialize(json: SerializedProject, files: Map<string, Uint8Array>): StudioProject {
  const project = coerceProject(json);
  const dec = new TextDecoder('utf-8');

  for (const page of project.pages) {
    for (const block of page.blocks) {
      const path = (block as Block).contentFile;
      if (block.type === 'body' && path && files.has(path)) {
        block.text = dec.decode(files.get(path)!);
      }
    }
  }
  for (const asset of project.assets) {
    const bytes = files.get(`assets/${asset.name}`);
    if (bytes) {
      asset.data = base64FromBytes(bytes);
      asset.status = 'provided';
    }
  }
  return project;
}

const README = (project: StudioProject): string =>
  [
    `RiverType Studio 项目（RSP 0.1）`,
    ``,
    `书名：${project.meta.title}${project.meta.issue ? ` · ${project.meta.issue}` : ''}`,
    `导出时间：${new Date().toISOString()}`,
    ``,
    `目录说明`,
    `  project.json     结构化项目：页面、内容块、版式属性、素材登记表`,
    `  content/*.md     正文长文（纯 Markdown），文件名 = 块 id，可单独用任意编辑器修改`,
    `  assets/*         图片原件，按原始字节存放，未做二次编码`,
    ``,
    `纪律`,
    `  1. 本格式不保存整页位图。版面永远由 HTML/CSS 重新排版，文字永远可选中、可编辑。`,
    `  2. status 为 placeholder 的素材表示「尚未提供」。导出物上会保留可见占位框，不会用假素材顶替。`,
    ``,
  ].join('\n');

export function packProject(project: StudioProject): Uint8Array {
  const { json, extra } = serialize(project);
  const enc = new TextEncoder();
  const entries = [
    { name: 'project.json', data: enc.encode(JSON.stringify(json, null, 2)) },
    ...extra,
    { name: 'README.txt', data: enc.encode(README(project)) },
  ];
  return zipWrite(entries);
}

export async function unpackProject(buf: ArrayBuffer | Uint8Array): Promise<StudioProject> {
  const entries = await zipRead(buf);
  const files = new Map<string, Uint8Array>();
  let json: SerializedProject | null = null;
  for (const e of entries) {
    if (e.name === 'project.json') json = JSON.parse(new TextDecoder('utf-8').decode(e.data));
    else files.set(e.name, e.data);
  }
  if (!json) throw new Error('这个文件里没有 project.json —— 不是 RSP 项目包');
  return deserialize(json, files);
}

export function projectFileName(project: StudioProject): string {
  const safe = (s: string) => s.replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 60) || 'untitled';
  return `${safe(project.meta.title)}${project.meta.issue ? '_' + safe(project.meta.issue) : ''}.rtsz`;
}

// ------------------------------------------------------------- 文件出口

let fileHandle: any = null;

export function hasFileSystemAccess(): boolean {
  return typeof (window as any).showSaveFilePicker === 'function';
}

export async function saveProject(project: StudioProject, forceDialog = false): Promise<SaveResult> {
  const bytes = packProject(project);
  const fileName = projectFileName(project);

  if (hasFileSystemAccess()) {
    try {
      if (!fileHandle || forceDialog) {
        fileHandle = await (window as any).showSaveFilePicker({
          suggestedName: fileName,
          types: [{ description: 'RiverType Studio 项目', accept: { 'application/zip': ['.rtsz'] } }],
        });
      }
      const writable = await fileHandle.createWritable();
      await writable.write(bytes);
      await writable.close();
      return { fileName: fileHandle.name ?? fileName, bytes: bytes.length, via: 'file-handle' };
    } catch (err: any) {
      if (err?.name === 'AbortError') throw err;
      // 落到下载路径
    }
  }

  downloadBytes(bytes, fileName, 'application/zip');
  return { fileName, bytes: bytes.length, via: 'download' };
}

/** 另存为：强制弹出选择器 */
export async function saveProjectAs(project: StudioProject): Promise<SaveResult> {
  fileHandle = null;
  return saveProject(project, true);
}

export function downloadBytes(bytes: Uint8Array, fileName: string, mime: string): void {
  const blob = new Blob([bytes as unknown as BlobPart], { type: mime });
  downloadBlob(blob, fileName);
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function pickProjectFile(): Promise<StudioProject | null> {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.rtsz,.zip';
  const file = await new Promise<File | null>((resolve) => {
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
  if (!file) return null;
  return unpackProject(await file.arrayBuffer());
}

// ------------------------------------------------------------- 图片导入

export const IMAGE_MIME = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'];

export async function importImage(file: File): Promise<Asset> {
  if (!IMAGE_MIME.includes(file.type)) {
    throw new Error(`不支持的图片类型：${file.type || file.name}（支持 PNG / JPEG / WebP / GIF / SVG）`);
  }
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  return {
    id: makeId('img'),
    name: file.name.replace(/[\\/:*?"<>|]+/g, '_'),
    mime: file.type,
    data: base64FromBytes(bytes),
    status: 'provided',
    missing: '',
  };
}

/** 登记一个「尚未提供」的素材（占位，不伪造） */
export function registerMissingAsset(name: string, missing: string, mime = 'image/png'): Asset {
  return {
    id: makeId('img'),
    name: name.replace(/[\\/:*?"<>|]+/g, '_'),
    mime,
    data: '',
    status: 'placeholder',
    missing,
  };
}

export function registerMediaSlot(kind: MediaSlot['kind'], title: string, missing: string): MediaSlot {
  return {
    id: makeId(kind === 'audio' ? 'aud' : 'vid'),
    kind,
    title,
    description: '',
    src: '',
    status: 'placeholder',
    missing,
  };
}

export function assetDataUrl(asset: Asset | undefined): string {
  if (!asset || asset.status !== 'provided' || !asset.data) return '';
  return `data:${asset.mime};base64,${asset.data}`;
}

// ------------------------------------------------------------- 草稿

export function saveDraft(project: StudioProject): void {
  try {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ at: Date.now(), project: JSON.parse(JSON.stringify(project)) }),
    );
  } catch {
    /* 超过配额就放弃草稿，不影响正常保存 */
  }
}

export function loadDraft(): { at: number; project: StudioProject } | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.project) return null;
    return { at: parsed.at ?? 0, project: coerceProject(parsed.project) };
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}
