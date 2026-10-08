/**
 * RiverType Studio 三栏工作区。
 *
 * 左：素材与内容块　中：A4 实际比例画布　右：版式属性
 *
 * 设计取舍：画布与导出共用 render.ts 的同一份 HTML/CSS，
 * 所以「所见」与「所印」之间没有第二套排版逻辑可以漂移。
 */

import {
  Align,
  Asset,
  BLOCK_LABELS,
  Block,
  BlockType,
  FONT_LABELS,
  FontKey,
  StudioProject,
  defaultStyle,
  missingReport,
} from './model';
import {
  assetDataUrl,
  downloadBlob,
  downloadBytes,
  hasFileSystemAccess,
  importImage,
  loadDraft,
  packProject,
  pickProjectFile,
  registerMediaSlot,
  registerMissingAsset,
  saveDraft,
  saveProject,
  saveProjectAs,
} from './io';
import { canvasDocument, measureOverflow, printDocument } from './render';
import { mobilePage } from './mobile';
import { StudioStore } from './store';
import { emptyStarter, wenchuan01 } from './demo';

// ---------------------------------------------------------------- DOM 助手

type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, string | number | boolean | null | undefined | ((event: any) => void)>;

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  children: Child[] = [],
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    } else if (key === 'value' && el instanceof HTMLInputElement) {
      el.value = String(value);
    } else if (key === 'checked' && el instanceof HTMLInputElement) {
      el.checked = Boolean(value);
    } else {
      el.setAttribute(key, String(value));
    }
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    el.append(typeof child === 'string' || typeof child === 'number' ? String(child) : child);
  }
  return el;
}

function text(value: string): Text {
  return document.createTextNode(value);
}

// ---------------------------------------------------------------- 服务端

interface ServiceError {
  error: string;
  detail?: string;
  hint?: string;
}

class StudioApi {
  online: boolean | null = null;

  private async postJson(url: string, body: unknown): Promise<any> {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      let payload: ServiceError | null = null;
      try {
        payload = await res.json();
      } catch {
        payload = null;
      }
      const err = new Error(
        payload ? `${payload.error}${payload.detail ? ` —— ${payload.detail}` : ''}` : `服务返回 ${res.status}`,
      ) as Error & { hint?: string };
      err.hint = payload?.hint;
      throw err;
    }
    return res;
  }

  async probe(): Promise<boolean> {
    try {
      const res = await fetch('/api/studio/health', { method: 'GET' });
      this.online = res.ok;
    } catch {
      this.online = false;
    }
    return this.online;
  }

  async pdf(html: string, name: string): Promise<Blob> {
    const res = await this.postJson('/api/studio/pdf', { html, name });
    return res.blob();
  }

  async mobile(html: string, name: string): Promise<{ path: string }> {
    const res = await this.postJson('/api/studio/mobile', { html, name });
    return res.json();
  }

  async verify(html: string, name: string): Promise<any> {
    const res = await this.postJson('/api/studio/verify', { html, name });
    return res.json();
  }
}

// ---------------------------------------------------------------- 主入口

export interface StudioHandle {
  store: StudioStore;
  reload(): void;
}

export function mountStudio(root: HTMLElement): StudioHandle {
  const api = new StudioApi();
  const draft = loadDraft();
  const store = new StudioStore(draft ? draft.project : wenchuan01());

  let zoom = 0.62;
  let guides = true;
  let twoUp = false;
  let serviceOnline = false;
  let notice: { kind: 'ok' | 'warn' | 'danger'; html: string } | null = null;

  root.innerHTML = '';
  const topbar = h('div', { class: 'rs-topbar' });
  const leftPane = h('div', { class: 'rs-scroll' });
  const canvasBar = h('div', { class: 'rs-canvas-bar' });
  const alerts = h('div', { class: 'rs-alerts' });
  const pageHost = h('div', { class: 'rs-page-host', id: 'rs-pages' });
  const rightPane = h('div', { class: 'rs-scroll' });
  const leftCount = h('span', { class: 'rs-hint' });

  const zoomWrap = h('div', { class: 'rs-zoom' }, [pageHost]);
  const app = h('div', { class: 'rs-app' }, [
    topbar,
    h('div', { class: 'rs-body' }, [
      h('section', { class: 'rs-col rs-col-left' }, [
        h('div', { class: 'rs-col-head' }, [h('span', {}, ['素材与内容块']), leftCount]),
        leftPane,
      ]),
      h('section', { class: 'rs-col rs-col-center' }, [
        canvasBar,
        h('div', { class: 'rs-scroll' }, [alerts, h('div', { class: 'rs-canvas' }, [zoomWrap])]),
      ]),
      h('section', { class: 'rs-col rs-col-right' }, [
        h('div', { class: 'rs-col-head' }, [h('span', {}, ['版式属性'])]),
        rightPane,
      ]),
    ]),
  ]);
  root.append(app);

  void api.probe().then((ok) => {
    serviceOnline = ok;
    renderTopbar();
    renderAlerts();
  });

  // ------------------------------------------------------------ 渲染：顶栏

  function renderTopbar(): void {
    const project = store.project;
    const missing = missingReport(project);
    topbar.replaceChildren(
      h('div', { class: 'rs-brand' }, [h('b', {}, ['RiverType Studio']), h('span', {}, ['0.1'])]),
      h('button', { class: 'rs-btn', onclick: () => doNew() }, ['新建']),
      h('button', { class: 'rs-btn', onclick: () => doLoadDemo() }, ['载入演示项目']),
      h('button', { class: 'rs-btn', onclick: () => doOpen() }, ['打开 .rtsz']),
      h('div', { class: 'rs-sep' }),
      h('button', { class: 'rs-btn', onclick: () => doSave(false) }, ['保存']),
      h('button', { class: 'rs-btn', onclick: () => doSave(true) }, ['另存为']),
      h('button', { class: 'rs-btn', onclick: () => doExportDir() }, ['导出工程目录']),
      h('div', { class: 'rs-sep' }),
      h('button', { class: 'rs-btn', disabled: !store.canUndo(), onclick: () => store.undo() }, ['撤销']),
      h('button', { class: 'rs-btn', disabled: !store.canRedo(), onclick: () => store.redo() }, ['重做']),
      h('div', { class: 'rs-spacer' }),
      missing.blocks.length + missing.media.length > 0
        ? h('span', { class: 'rs-badge rs-badge-warn' }, [
            `待补素材 ${missing.blocks.length + missing.media.length}`,
          ])
        : h('span', { class: 'rs-badge rs-badge-ok' }, ['素材齐备']),
      serviceOnline
        ? h('span', { class: 'rs-badge rs-badge-ok' }, ['排版服务在线'])
        : h('span', { class: 'rs-badge rs-badge-warn' }, ['排版服务离线']),
      ...(store.dirty ? [h('span', { class: 'rs-badge' }, ['未保存'])] : []),
      h('div', { class: 'rs-sep' }),
      h('button', { class: 'rs-btn rs-btn-primary', onclick: (e: Event) => doExportPdf(e.currentTarget as HTMLButtonElement) }, [
        '导出 PDF',
      ]),
      h('button', { class: 'rs-btn', onclick: () => doExportMobile() }, ['导出移动版']),
      h('button', { class: 'rs-btn', onclick: () => doSelfCheck() }, ['版面自检']),
    );
  }

  // ------------------------------------------------------------ 渲染：左栏

  function renderLeft(): void {
    const project = store.project;
    const page = store.page;
    leftCount.textContent = `${project.pages.length} 页 · ${page.blocks.length} 块`;

    const addRow = h('div', { class: 'rs-grid-3' },
      (['title', 'poem', 'body', 'image', 'caption', 'header', 'footer', 'nfc', 'rule'] as BlockType[]).map((type) =>
        h('button', { class: 'rs-btn rs-btn-sm', onclick: () => addBlock(type) }, [`+ ${BLOCK_LABELS[type]}`]),
      ),
    );

    const list = h('ul', { class: 'rs-blocklist' });
    page.blocks.forEach((block, index) => {
      const asset = block.assetId ? project.assets.find((a) => a.id === block.assetId) : undefined;
      const isPlaceholder = block.placeholder || (block.type === 'image' && (!asset || asset.status === 'placeholder'));
      const row = h('li', {
        class: `rs-blockrow${store.selectedId === block.id ? ' is-selected' : ''}${block.hidden ? ' is-hidden' : ''}`,
        draggable: 'true',
        'data-index': index,
        onclick: () => store.select(block.id),
        ondragstart: (e: DragEvent) => {
          e.dataTransfer?.setData('text/plain', String(index));
          if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
        },
        ondragover: (e: DragEvent) => {
          e.preventDefault();
          if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
        },
        ondrop: (e: DragEvent) => {
          e.preventDefault();
          const from = Number(e.dataTransfer?.getData('text/plain'));
          if (Number.isFinite(from) && from !== index) moveBlock(from, index);
        },
      }, [
        h('span', { class: 'rs-kind' }, [BLOCK_LABELS[block.type]]),
        h('span', { class: 'rs-label' }, [blockLabel(block)]),
        isPlaceholder ? h('span', { class: 'rs-badge rs-badge-warn' }, ['占位']) : null,
        h('span', { class: 'rs-acts' }, [
          h('button', { class: 'rs-iconbtn', title: '上移', onclick: (e: Event) => { e.stopPropagation(); moveBlock(index, index - 1); } }, ['↑']),
          h('button', { class: 'rs-iconbtn', title: '下移', onclick: (e: Event) => { e.stopPropagation(); moveBlock(index, index + 1); } }, ['↓']),
          h('button', { class: 'rs-iconbtn', title: block.hidden ? '显示' : '隐藏', onclick: (e: Event) => { e.stopPropagation(); toggleHidden(block.id); } }, [block.hidden ? '◌' : '●']),
          h('button', { class: 'rs-iconbtn', title: '复制', onclick: (e: Event) => { e.stopPropagation(); duplicateBlock(block.id); } }, ['⧉']),
          h('button', { class: 'rs-iconbtn', title: '删除', onclick: (e: Event) => { e.stopPropagation(); deleteBlock(block.id); } }, ['✕']),
        ]),
      ]);
      list.append(row);
    });

    const pagesGroup = h('div', { class: 'rs-group' }, [
      h('div', { class: 'rs-group-title' }, [h('span', {}, ['页面'])]),
    ]);
    project.pages.forEach((p, i) => {
      pagesGroup.append(
        h('div', { class: 'rs-row', style: 'margin-bottom:4px' }, [
          h('input', {
            class: 'rs-input',
            value: p.label,
            oninput: (e: Event) => {
              const v = (e.target as HTMLInputElement).value;
              store.mutate((proj) => { proj.pages[i].label = v; }, { coalesceKey: `page-label-${p.id}` });
            },
          }),
          h('input', {
            type: 'color',
            class: 'rs-input',
            style: 'width:42px;padding:2px',
            value: p.background,
            oninput: (e: Event) => {
              const v = (e.target as HTMLInputElement).value;
              store.mutate((proj) => { proj.pages[i].background = v; }, { coalesceKey: `page-bg-${p.id}` });
            },
          }),
          h('button', {
            class: 'rs-btn rs-btn-sm',
            onclick: () => store.setPage(i),
            disabled: i === store.pageIndex,
          }, [i === store.pageIndex ? '当前' : '切换']),
        ]),
      );
    });

    // 素材库
    const assetsGroup = h('div', { class: 'rs-group' }, [
      h('div', { class: 'rs-group-title' }, [
        h('span', {}, ['素材库']),
        h('span', { class: 'rs-row' }, [
          h('button', { class: 'rs-btn rs-btn-sm', onclick: () => doImportImage() }, ['导入图片']),
          h('button', { class: 'rs-btn rs-btn-sm', onclick: () => doRegisterMissing() }, ['登记缺失']),
        ]),
      ]),
    ]);
    if (!project.assets.length) {
      assetsGroup.append(h('div', { class: 'rs-hint' }, ['还没有素材。导入图片，或先登记一条「尚未提供」。']));
    }
    for (const asset of project.assets) {
      const dataUrl = assetDataUrl(asset);
      assetsGroup.append(
        h('div', { class: `rs-asset${asset.status === 'placeholder' ? ' rs-asset-ph' : ''}` }, [
          h('div', { class: 'rs-asset-thumb' }, [
            dataUrl ? h('img', { src: dataUrl, alt: asset.name }) : text('缺'),
          ]),
          h('div', { class: 'rs-asset-meta' }, [
            h('div', { class: 'rs-asset-name' }, [asset.name]),
            h('div', { class: 'rs-asset-sub' }, [
              asset.status === 'provided' ? `${asset.mime} · ${Math.round(asset.data.length * 0.75 / 1024)} KB` : `占位 · ${asset.missing || '未提供'}`,
            ]),
          ]),
          h('button', {
            class: 'rs-btn rs-btn-sm',
            onclick: () => addImageBlock(asset.id),
          }, ['插入']),
          h('button', {
            class: 'rs-iconbtn',
            title: '删除素材',
            onclick: () => {
              store.mutate((proj) => { proj.assets = proj.assets.filter((a) => a.id !== asset.id); });
            },
          }, ['✕']),
        ]),
      );
    }

    // 移动版媒体位
    const mediaGroup = h('div', { class: 'rs-group' }, [
      h('div', { class: 'rs-group-title' }, [
        h('span', {}, ['移动版媒体位']),
        h('button', { class: 'rs-btn rs-btn-sm', onclick: () => doAddMedia('audio') }, ['+ 音频']),
      ]),
    ]);
    mediaGroup.append(
      h('div', { class: 'rs-row', style: 'margin-bottom:6px' }, [
        h('button', { class: 'rs-btn rs-btn-sm', onclick: () => doAddMedia('video') }, ['+ 短片']),
      ]),
    );
    if (!project.media.length) {
      mediaGroup.append(h('div', { class: 'rs-hint' }, ['移动版暂无音频 / 短片位。']));
    }
    project.media.forEach((slot, i) => {
      mediaGroup.append(
        h('div', { class: 'rs-asset' }, [
          h('div', { class: 'rs-asset-thumb' }, [slot.kind === 'audio' ? '♪' : '▶']),
          h('div', { class: 'rs-asset-meta' }, [
            h('input', {
              class: 'rs-input',
              value: slot.title,
              oninput: (e: Event) => {
                const v = (e.target as HTMLInputElement).value;
                store.mutate((proj) => { proj.media[i].title = v; }, { coalesceKey: `media-title-${slot.id}` });
              },
            }),
            h('div', { class: 'rs-asset-sub' }, [slot.status === 'provided' ? slot.src : `占位 · ${slot.missing}`]),
          ]),
          h('button', {
            class: 'rs-iconbtn',
            title: '删除',
            onclick: () => store.mutate((proj) => { proj.media = proj.media.filter((m) => m.id !== slot.id); }),
          }, ['✕']),
        ]),
      );
    });

    leftPane.replaceChildren(
      h('div', { class: 'rs-group' }, [
        h('div', { class: 'rs-group-title' }, [h('span', {}, ['添加内容块'])]),
        addRow,
      ]),
      h('div', { class: 'rs-group' }, [
        h('div', { class: 'rs-group-title' }, [h('span', {}, [`本页内容块（${page.label}）`])]),
        page.blocks.length ? list : h('div', { class: 'rs-scrim-empty' }, ['本页还没有内容块。用上面的按钮添加。']),
      ]),
      pagesGroup,
      assetsGroup,
      mediaGroup,
    );
  }

  function blockLabel(block: Block): string {
    if (block.type === 'image') {
      const asset = store.project.assets.find((a) => a.id === block.assetId);
      return asset ? asset.name : '（未选择图片）';
    }
    if (block.type === 'rule') return '——';
    const first = block.text.split('\n').find((l) => l.trim()) ?? '';
    return first.slice(0, 26) || '（空）';
  }

  // ------------------------------------------------------------ 渲染：画布

  function renderCanvas(): void {
    const project = store.project;
    canvasBar.replaceChildren(
      h('div', { class: 'rs-tabs' },
        project.pages.map((p, i) =>
          h('button', {
            class: `rs-tab${i === store.pageIndex ? ' is-active' : ''}`,
            onclick: () => store.setPage(i),
          }, [`${p.label}`]),
        ),
      ),
      h('label', { class: 'rs-check' }, [
        h('input', { type: 'checkbox', checked: twoUp, onchange: (e: Event) => { twoUp = (e.target as HTMLInputElement).checked; renderCanvas(); } }),
        '双页视图',
      ]),
      h('label', { class: 'rs-check' }, [
        h('input', { type: 'checkbox', checked: guides, onchange: (e: Event) => { guides = (e.target as HTMLInputElement).checked; renderCanvas(); } }),
        '打印标线',
      ]),
      h('div', { class: 'rs-spacer' }),
      h('span', { class: 'rs-hint' }, [`A4 ${project.print.widthMm}×${project.print.heightMm}mm`]),
      h('button', { class: 'rs-btn rs-btn-sm', onclick: () => setZoom(zoom - 0.08) }, ['−']),
      h('span', { class: 'rs-hint', style: 'min-width:38px;text-align:center' }, [`${Math.round(zoom * 100)}%`]),
      h('button', { class: 'rs-btn rs-btn-sm', onclick: () => setZoom(zoom + 0.08) }, ['+']),
      h('button', { class: 'rs-btn rs-btn-sm', onclick: () => setZoom(0.62) }, ['适应']),
    );

    const page = store.page;
    const html = canvasDocument(project, {
      guides,
      onlyPage: twoUp ? undefined : page.id,
    });
    pageHost.innerHTML = html;

    // 点击选中；图片可拖入
    pageHost.querySelectorAll<HTMLElement>('.block').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = el.dataset.blockId ?? null;
        store.select(id);
      });
    });
    pageHost.addEventListener('click', () => store.select(null));

    zoomWrap.style.transform = `scale(${zoom})`;

    // 溢出告警
    const reports = measureOverflow(pageHost, project);
    alerts.replaceChildren();
    if (notice) {
      alerts.append(h('div', { class: `rs-alert rs-alert-${notice.kind}` }, [
        h('div', {}, [h('div', { html: notice.html })]),
        h('button', { class: 'rs-iconbtn', onclick: () => { notice = null; renderAlerts(); } }, ['✕']),
      ]));
    }
    for (const r of reports) {
      if (r.overflowMm > 0.3) {
        alerts.append(
          h('div', { class: 'rs-alert rs-alert-danger' }, [
            `「${r.pageLabel}」内容超出安全区约 ${r.overflowMm.toFixed(1)}mm，印刷会被裁掉。请减小字号、行高或段距。`,
          ]),
        );
      }
    }
    const missing = missingReport(project);
    const total = missing.blocks.length + missing.media.length;
    if (total > 0) {
      alerts.append(
        h('div', { class: 'rs-alert rs-alert-warn' }, [
          `本项目中 ${total} 处素材尚未提供，已按占位处理并在成品上保留可见标记：` +
            [...missing.blocks.map((b) => BLOCK_LABELS[b.type]), ...missing.media.map((m) => m.title)].join('、'),
        ]),
      );
    }
  }

  function renderAlerts(): void {
    renderCanvas();
  }

  function setZoom(next: number): void {
    zoom = Math.min(1.6, Math.max(0.2, next));
    zoomWrap.style.transform = `scale(${zoom})`;
    renderCanvas();
  }

  // ------------------------------------------------------------ 渲染：右栏

  function renderRight(): void {
    const project = store.project;
    const block = store.selected;
    rightPane.replaceChildren();

    if (!block) {
      rightPane.append(projectPanel(project));
      return;
    }
    rightPane.append(blockPanel(block));
  }

  function projectPanel(project: StudioProject): HTMLElement {
    const meta = project.meta;
    const setMeta = (key: keyof typeof meta, value: any, coalesce?: string) =>
      store.mutate((proj) => { (proj.meta as any)[key] = value; }, { coalesceKey: coalesce });

    const printField = (key: 'bleedMm' | 'safeMm', label: string, min: number, max: number) =>
      h('div', { class: 'rs-field' }, [
        h('label', {}, [`${label}（mm）`]),
        h('input', {
          class: 'rs-input', type: 'number', min, max, step: 0.5, value: String(project.print[key]),
          oninput: (e: Event) => {
            const v = Number((e.target as HTMLInputElement).value);
            if (Number.isFinite(v)) store.mutate((proj) => { proj.print[key] = v; }, { coalesceKey: `print-${key}` });
          },
        }),
      ]);

    return h('div', {}, [
      h('div', { class: 'rs-group' }, [
        h('div', { class: 'rs-group-title' }, [h('span', {}, ['项目设置'])]),
        h('div', { class: 'rs-hint' }, ['未选中内容块时显示项目级设置。点击画布上的任意块可编辑其版式属性。']),
        field('书名', h('input', { class: 'rs-input', value: meta.title, oninput: (e: Event) => setMeta('title', (e.target as HTMLInputElement).value, 'm-title') })),
        field('期号 / 副题', h('input', { class: 'rs-input', value: meta.issue, oninput: (e: Event) => setMeta('issue', (e.target as HTMLInputElement).value, 'm-issue') })),
        field('著者 / 编者', h('input', { class: 'rs-input', value: meta.author, oninput: (e: Event) => setMeta('author', (e.target as HTMLInputElement).value, 'm-author') })),
        field('出版方', h('input', { class: 'rs-input', value: meta.publisher, oninput: (e: Event) => setMeta('publisher', (e.target as HTMLInputElement).value, 'm-pub') })),
        field('日期', h('input', { class: 'rs-input', value: meta.date, oninput: (e: Event) => setMeta('date', (e.target as HTMLInputElement).value, 'm-date') })),
        field('语言', h('input', { class: 'rs-input', value: meta.language, oninput: (e: Event) => setMeta('language', (e.target as HTMLInputElement).value, 'm-lang') })),
        field('简介', h('textarea', { class: 'rs-textarea', oninput: (e: Event) => setMeta('description', (e.target as HTMLTextAreaElement).value, 'm-desc') }, [meta.description])),
      ]),
      h('div', { class: 'rs-group' }, [
        h('div', { class: 'rs-group-title' }, [h('span', {}, ['NFC 数字入口'])]),
        field('目标地址（须为长期稳定 HTTPS）', h('input', {
          class: 'rs-input', value: meta.nfcUrl, placeholder: 'https://example.com/book/01',
          oninput: (e: Event) => setMeta('nfcUrl', (e.target as HTMLInputElement).value, 'm-nfc'),
        })),
        h('label', { class: 'rs-check' }, [
          h('input', {
            type: 'checkbox', checked: meta.qrFallback,
            onchange: (e: Event) => setMeta('qrFallback', (e.target as HTMLInputElement).checked),
          }),
          '在版面上附二维码备用入口',
        ]),
        h('div', { class: 'rs-hint rs-hint-warn', style: 'margin-top:6px' }, [
          '写入 NFC 标签前请确认该地址已长期可访问、且不依赖任何临时域名。地址为空时，版面上会明确印出「未填写」。',
        ]),
      ]),
      h('div', { class: 'rs-group' }, [
        h('div', { class: 'rs-group-title' }, [h('span', {}, ['印张设置'])]),
        field('成品尺寸', h('input', { class: 'rs-input', value: `A4 · ${project.print.widthMm} × ${project.print.heightMm} mm`, readonly: 'readonly' })),
        printField('bleedMm', '出血', 0, 10),
        printField('safeMm', '安全区（自裁切边内缩）', 3, 40),
      ]),
      h('div', { class: 'rs-group' }, [
        h('div', { class: 'rs-group-title' }, [h('span', {}, ['项目文件'])]),
        h('div', { class: 'rs-hint' }, [
          `格式 RSP ${project.rsp} · project.json + content/*.md + assets/`,
          hasFileSystemAccess() ? '　当前浏览器支持直接覆盖保存。' : '　当前浏览器仅支持下载保存。',
        ]),
        h('div', { class: 'rs-row', style: 'margin-top:8px' }, [
          h('button', { class: 'rs-btn', onclick: () => doExportDir() }, ['导出工程目录']),
          h('button', { class: 'rs-btn', onclick: () => doExportMobile() }, ['导出移动版 HTML']),
        ]),
      ]),
    ]);
  }

  function blockPanel(block: Block): HTMLElement {
    const project = store.project;
    const idx = store.page.blocks.findIndex((b) => b.id === block.id);
    const setStyle = (key: keyof Block['style'], value: any, coalesce = true) =>
      store.mutate((proj) => {
        const target = proj.pages[store.pageIndex].blocks[idx];
        if (target) (target.style as any)[key] = value;
      }, { coalesceKey: coalesce ? `style-${block.id}-${String(key)}` : undefined });
    const setBlock = (key: keyof Block, value: any, coalesce = false) =>
      store.mutate((proj) => {
        const target = proj.pages[store.pageIndex].blocks[idx];
        if (target) (target as any)[key] = value;
      }, { coalesceKey: coalesce ? `block-${block.id}-${String(key)}` : undefined });

    const style = block.style;
    const asset = block.assetId ? project.assets.find((a) => a.id === block.assetId) : undefined;
    const inner = block.type === 'image' && (!asset || asset.status === 'placeholder');

    const textInput =
      block.type === 'body'
        ? h('textarea', {
            class: 'rs-textarea rs-textarea-md',
            oninput: (e: Event) => setBlock('text', (e.target as HTMLTextAreaElement).value, true),
          }, [block.text])
        : block.type === 'poem'
          ? h('textarea', {
              class: 'rs-textarea', rows: '6',
              oninput: (e: Event) => setBlock('text', (e.target as HTMLTextAreaElement).value, true),
            }, [block.text])
          : h('textarea', {
              class: 'rs-textarea', rows: '3',
              oninput: (e: Event) => setBlock('text', (e.target as HTMLTextAreaElement).value, true),
            }, [block.text]);

    const numRow = (
      label: string,
      key: keyof Block['style'],
      opts: { min: number; max: number; step: number },
    ) =>
      h('div', { class: 'rs-field' }, [
        h('label', {}, [`${label}：${style[key] as number}`]),
        h('input', {
          class: 'rs-range', type: 'range', min: opts.min, max: opts.max, step: opts.step,
          value: String(style[key]),
          oninput: (e: Event) => setStyle(key, Number((e.target as HTMLInputElement).value)),
        }),
      ]);

    const rows: (Node | null)[] = [
      h('div', { class: 'rs-group' }, [
        h('div', { class: 'rs-group-title' }, [
          h('span', {}, [`内容 · ${BLOCK_LABELS[block.type]}`]),
          h('span', { class: 'rs-hint' }, [`第 ${idx + 1} / ${store.page.blocks.length} 块`]),
        ]),

        block.type === 'image'
          ? h('div', {}, [
              field('图片素材', h('select', {
                class: 'rs-select',
                onchange: (e: Event) => setBlock('assetId', (e.target as HTMLSelectElement).value),
              }, [
                h('option', { value: '' }, ['（未选择）']),
                ...project.assets.map((a) => h('option', { value: a.id, selected: a.id === block.assetId }, [
                  a.status === 'provided' ? a.name : `${a.name}（占位）`,
                ])),
              ])),
              field('替代描述 alt', h('input', {
                class: 'rs-input', value: block.alt,
                oninput: (e: Event) => setBlock('alt', (e.target as HTMLInputElement).value, true),
              })),
              h('label', { class: 'rs-check' }, [
                h('input', {
                  type: 'checkbox', checked: style.fullBleed,
                  onchange: (e: Event) => setStyle('fullBleed', (e.target as HTMLInputElement).checked, false),
                }),
                '整页出血（铺满成品，忽略安全区）',
              ]),
              !asset || asset.status === 'placeholder'
                ? h('div', { class: 'rs-hint rs-hint-warn', style: 'margin-top:6px' }, [
                    '该位置没有可用图片，版面上会印出可见占位框。这是刻意的：不用假素材顶替。',
                  ])
                : null,
            ])
          : block.type === 'nfc'
            ? h('div', {}, [
                field('说明文字', textInput),
                h('div', { class: 'rs-hint' }, [
                  `二维码指向项目设置里的 NFC 地址：${project.meta.nfcUrl || '（尚未填写）'}`,
                ]),
              ])
            : field(block.type === 'body' ? '正文（Markdown）' : '文字', textInput),

        field('占位说明（会印在成品上）', h('input', {
          class: 'rs-input', value: block.placeholderNote,
          oninput: (e: Event) => setBlock('placeholderNote', (e.target as HTMLInputElement).value, true),
        })),
        h('label', { class: 'rs-check' }, [
          h('input', {
            type: 'checkbox', checked: block.placeholder,
            onchange: (e: Event) => setBlock('placeholder', (e.target as HTMLInputElement).checked),
          }),
          '标记为占位内容',
        ]),
        h('label', { class: 'rs-check' }, [
          h('input', {
            type: 'checkbox', checked: block.hidden,
            onchange: (e: Event) => setBlock('hidden', (e.target as HTMLInputElement).checked),
          }),
          '隐藏（不进成品）',
        ]),
        inner ? h('div', { class: 'rs-hint rs-hint-warn' }, ['当前为占位图片块。']) : null,
      ]),

      h('div', { class: 'rs-group' }, [
        h('div', { class: 'rs-group-title' }, [h('span', {}, ['排版属性'])]),
        field('字体', h('select', {
          class: 'rs-select',
          onchange: (e: Event) => setStyle('font', (e.target as HTMLSelectElement).value as FontKey, false),
        }, (Object.keys(FONT_LABELS) as FontKey[]).map((k) =>
          h('option', { value: k, selected: style.font === k }, [FONT_LABELS[k]]),
        ))),
        field('对齐', h('select', {
          class: 'rs-select',
          onchange: (e: Event) => setStyle('align', (e.target as HTMLSelectElement).value as Align, false),
        }, ([['left', '左'], ['center', '居中'], ['right', '右'], ['justify', '两端对齐']] as [Align, string][]).map(([v, l]) =>
          h('option', { value: v, selected: style.align === v }, [l]),
        ))),
        numRow('字号 pt', 'size', { min: 6, max: 72, step: 0.5 }),
        numRow('行高', 'lineHeight', { min: 1, max: 3, step: 0.05 }),
        numRow('字距 em', 'letterSpacing', { min: -0.05, max: 0.5, step: 0.01 }),
        numRow('字重', 'weight', { min: 300, max: 800, step: 100 }),
        numRow('宽度 %', 'width', { min: 10, max: 100, step: 1 }),
        numRow('段前 mm', 'marginTop', { min: 0, max: 200, step: 0.5 }),
        numRow('段后 mm', 'marginBottom', { min: 0, max: 40, step: 0.5 }),
        numRow('水平微调 mm', 'offsetX', { min: -60, max: 60, step: 0.5 }),
        numRow('透明度', 'opacity', { min: 0.1, max: 1, step: 0.05 }),
        block.type === 'body' ? numRow('分栏', 'columns', { min: 1, max: 4, step: 1 }) : null,
        field('颜色', h('input', {
          class: 'rs-input', type: 'color', value: style.color,
          oninput: (e: Event) => setStyle('color', (e.target as HTMLInputElement).value),
        })),
        h('label', { class: 'rs-check' }, [
          h('input', {
            type: 'checkbox', checked: style.vertical,
            onchange: (e: Event) => setStyle('vertical', (e.target as HTMLInputElement).checked, false),
          }),
          '竖排',
        ]),
      ]),

      h('div', { class: 'rs-group' }, [
        h('div', { class: 'rs-group-title' }, [h('span', {}, ['块操作'])]),
        h('div', { class: 'rs-row' }, [
          h('button', { class: 'rs-btn rs-btn-sm', disabled: idx === 0, onclick: () => moveBlock(idx, idx - 1) }, ['上移']),
          h('button', { class: 'rs-btn rs-btn-sm', disabled: idx === store.page.blocks.length - 1, onclick: () => moveBlock(idx, idx + 1) }, ['下移']),
          h('button', { class: 'rs-btn rs-btn-sm', onclick: () => duplicateBlock(block.id) }, ['复制']),
          h('button', { class: 'rs-btn rs-btn-sm rs-btn-danger', onclick: () => deleteBlock(block.id) }, ['删除']),
        ]),
      ]),
    ];
    return h('div', {}, rows);
  }

  function field(label: string, control: Node): HTMLElement {
    return h('div', { class: 'rs-field' }, [h('label', {}, [label]), control]);
  }

  // ------------------------------------------------------------ 操作

  function addBlock(type: BlockType): void {
    store.mutate((proj) => {
      const page = proj.pages[store.pageIndex];
      const block = blankBlock(type);
      const footerIndex = page.blocks.findIndex((b) => b.type === 'footer');
      if (type !== 'footer' && footerIndex >= 0) page.blocks.splice(footerIndex, 0, block);
      else page.blocks.push(block);
      store.selectedId = block.id;
    });
  }

  function blankBlock(type: BlockType): Block {
    return {
      id: `b${Math.random().toString(36).slice(2, 10)}`,
      type,
      text: type === 'title' ? '标题' : type === 'poem' ? '第一行\n第二行' : type === 'header' ? '页眉' : type === 'footer' ? '页脚' : '',
      assetId: '',
      alt: '',
      style: defaultStyleOf(type),
      placeholder: false,
      placeholderNote: '',
      hidden: false,
    };
  }

  function addImageBlock(assetId: string): void {
    store.mutate((proj) => {
      const page = proj.pages[store.pageIndex];
      const block: Block = {
        id: `b${Math.random().toString(36).slice(2, 10)}`,
        type: 'image',
        text: '',
        assetId,
        alt: '',
        style: defaultStyleOf('image'),
        placeholder: false,
        placeholderNote: '',
        hidden: false,
      };
      page.blocks.push(block);
      store.selectedId = block.id;
    });
  }

  function moveBlock(from: number, to: number): void {
    store.mutate((proj) => {
      const blocks = proj.pages[store.pageIndex].blocks;
      if (from < 0 || to < 0 || from >= blocks.length || to >= blocks.length) return;
      const [item] = blocks.splice(from, 1);
      blocks.splice(to, 0, item);
    });
  }

  function toggleHidden(id: string): void {
    store.mutate((proj) => {
      const b = proj.pages[store.pageIndex].blocks.find((x) => x.id === id);
      if (b) b.hidden = !b.hidden;
    });
  }

  function duplicateBlock(id: string): void {
    store.mutate((proj) => {
      const blocks = proj.pages[store.pageIndex].blocks;
      const index = blocks.findIndex((b) => b.id === id);
      if (index < 0) return;
      const copy: Block = JSON.parse(JSON.stringify(blocks[index]));
      copy.id = `b${Math.random().toString(36).slice(2, 10)}`;
      copy.placeholderNote = blocks[index].placeholderNote;
      blocks.splice(index + 1, 0, copy);
      store.selectedId = copy.id;
    });
  }

  function deleteBlock(id: string): void {
    store.mutate((proj) => {
      proj.pages[store.pageIndex].blocks = proj.pages[store.pageIndex].blocks.filter((b) => b.id !== id);
      if (store.selectedId === id) store.selectedId = null;
    });
  }

  function doNew(): void {
    if (store.dirty && !confirm('当前项目有未保存的改动，确定要新建吗？')) return;
    store.replace(emptyStarter());
  }

  function doLoadDemo(): void {
    if (store.dirty && !confirm('当前项目有未保存的改动，确定要载入演示项目吗？')) return;
    store.replace(wenchuan01());
    setNotice('ok', '已载入演示项目《文川·第一号：花开时节》。其中封面艺术图、内页插画、主题曲与纪录短片均为<b>明确标注的占位</b>，未使用任何替代素材。');
  }

  async function doOpen(): Promise<void> {
    try {
      const project = await pickProjectFile();
      if (!project) return;
      store.replace(project);
      setNotice('ok', `已打开项目：${project.meta.title}`);
    } catch (err: any) {
      setNotice('danger', `打开失败：${escapeHtml(err?.message ?? String(err))}`);
    }
  }

  async function doSave(forceDialog: boolean): Promise<void> {
    try {
      const result = forceDialog ? await saveProjectAs(store.project) : await saveProject(store.project);
      store.dirty = false;
      setNotice('ok', `已保存 ${escapeHtml(result.fileName)}（${(result.bytes / 1024).toFixed(1)} KB，${result.via === 'file-handle' ? '直接写入文件' : '浏览器下载'}）`);
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      setNotice('danger', `保存失败：${escapeHtml(err?.message ?? String(err))}`);
    }
  }

  function doExportDir(): void {
    const files = exportProjectFiles(store.project);
    downloadBytes(files[0].data, files[0].name, 'application/zip');
    setNotice('ok', '已导出 .rtsz（ZIP）。用任意解压工具打开即可得到 project.json + content/*.md + assets/ 的可版本化目录。');
  }

  function exportProjectFiles(project: StudioProject): { name: string; data: Uint8Array }[] {
    return [packForExport(project)];
  }

  async function doImportImage(): Promise<void> {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    const files = await new Promise<FileList | null>((resolve) => {
      input.onchange = () => resolve(input.files);
      input.click();
    });
    if (!files?.length) return;
    try {
      const assets: Asset[] = [];
      for (const file of Array.from(files)) assets.push(await importImage(file));
      store.mutate((proj) => {
        proj.assets.push(...assets);
        const page = proj.pages[store.pageIndex];
        for (const a of assets) {
          page.blocks.push({
            id: `b${Math.random().toString(36).slice(2, 10)}`,
            type: 'image', text: '', assetId: a.id, alt: '',
            style: defaultStyleOf('image'), placeholder: false, placeholderNote: '', hidden: false,
          });
        }
      });
      setNotice('ok', `已导入 ${assets.length} 张图片，并插入当前页。`);
    } catch (err: any) {
      setNotice('danger', `导入失败：${escapeHtml(err?.message ?? String(err))}`);
    }
  }

  function doRegisterMissing(): void {
    const name = prompt('素材文件名（例如 cover-art.png）', 'cover-art.png');
    if (!name) return;
    const why = prompt('缺失说明（会印在占位框上）', '原始素材未提供，请替换为经授权的文件') ?? '';
    store.mutate((proj) => { proj.assets.push(registerMissingAsset(name, why)); });
    setNotice('warn', '已登记一条占位素材。它不会被伪造成图片，版面上会留下可见的空位。');
  }

  function doAddMedia(kind: 'audio' | 'video'): void {
    const title = prompt(kind === 'audio' ? '音频标题' : '短片标题', kind === 'audio' ? '主题曲' : '纪录短片');
    if (title === null) return;
    store.mutate((proj) => {
      proj.media.push(registerMediaSlot(kind, title, kind === 'audio' ? '音频尚未提供' : '短片尚未提供'));
    });
  }

  async function doExportPdf(button: HTMLButtonElement): Promise<void> {
    const project = store.project;
    const html = printDocument(project);
    const name = `${project.meta.title}${project.meta.issue ? '_' + project.meta.issue : ''}`.replace(/[\\/:*?"<>|\s]+/g, '_');
    const original = button.textContent;
    button.disabled = true;
    button.textContent = '排版中…';
    try {
      const reports = measureOverflow(pageHost, project);
      const over = reports.filter((r) => r.overflowMm > 0.3);
      if (over.length) {
        const msg = over.map((r) => `「${r.pageLabel}」超出安全区约 ${r.overflowMm.toFixed(1)}mm`).join('；');
        if (!confirm(`${msg}。\n继续导出会把这些内容裁掉。仍要继续吗？`)) return;
      }
      if (!serviceOnline) {
        openPrintFallback(html, name);
        setNotice('warn', '排版服务（localhost:3000）当前离线，已改用浏览器打印对话框导出 PDF。<br />启用完整链路：<code>node backend/studio-service.mjs</code>');
        return;
      }
      const blob = await api.pdf(html, name);
      downloadBlob(blob, `${name}.pdf`);
      setNotice('ok', `已生成 PDF：${escapeHtml(name)}.pdf（恰好 ${project.pages.length} 页 · A4 ${project.print.widthMm}×${project.print.heightMm}mm）`);
    } catch (err: any) {
      const hint = (err as any)?.hint ? `<br />建议：${escapeHtml((err as any).hint)}` : '';
      setNotice('danger', `PDF 生成失败：${escapeHtml(err?.message ?? String(err))}${hint}`);
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  }

  async function doExportMobile(): Promise<void> {
    const project = store.project;
    const html = mobilePage(project);
    const name = `${project.meta.title}${project.meta.issue ? '_' + project.meta.issue : ''}`.replace(/[\\/:*?"<>|\s]+/g, '_');
    downloadBytes(new TextEncoder().encode(html), `${name}-mobile.html`, 'text/html');
    if (serviceOnline) {
      try {
        const res = await api.mobile(html, name);
        setNotice('ok', `移动版已下载，同时写入服务端：${escapeHtml(res.path)}`);
        return;
      } catch {
        /* 服务端写入失败不影响下载 */
      }
    }
    setNotice('ok', `已生成移动版网页（含音频 / 短片占位与二维码备用入口）：${escapeHtml(name)}-mobile.html`);
  }

  async function doSelfCheck(): Promise<void> {
    const project = store.project;
    const reports = measureOverflow(pageHost, project);
    const missing = missingReport(project);
    const lines = [
      `页面尺寸：A4 ${project.print.widthMm} × ${project.print.heightMm} mm，共 ${project.pages.length} 页`,
      `安全区：${project.print.safeMm} mm，出血：${project.print.bleedMm} mm`,
      ...reports.map((r) =>
        r.overflowMm > 0.3 ? `✗ ${r.pageLabel}：溢出约 ${r.overflowMm.toFixed(1)}mm` : `✓ ${r.pageLabel}：无溢出`,
      ),
      missing.blocks.length || missing.media.length
        ? `⚠ 占位：${missing.blocks.length} 处内容块、${missing.media.length} 处媒体位尚未提供素材`
        : '✓ 素材齐备',
      project.meta.nfcUrl ? `NFC 入口：${project.meta.nfcUrl}` : '⚠ NFC 入口地址尚未填写',
    ];
    const qr = pageHost.querySelector('.nfc-qr svg');
    lines.push(qr ? '✓ 版面上已生成二维码备用入口' : '⚠ 版面上没有二维码');

    setNotice(reports.some((r) => r.overflowMm > 0.3) || missing.blocks.length ? 'warn' : 'ok',
      `<b>版面自检</b><br />${lines.map((l) => escapeHtml(l)).join('<br />')}`);
  }

  function openPrintFallback(html: string, name: string): void {
    const win = window.open('', '_blank');
    if (!win) {
      setNotice('danger', '浏览器拦截了打印窗口。请允许本站弹出窗口后重试。');
      return;
    }
    win.document.write(html);
    win.document.title = name;
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 400);
  }

  function setNotice(kind: 'ok' | 'warn' | 'danger', html: string): void {
    notice = { kind, html };
    renderAlerts();
  }

  function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ------------------------------------------------------------ 订阅与快捷键

  store.subscribe(() => {
    renderTopbar();
    renderLeft();
    renderCanvas();
    renderRight();
    saveDraft(store.project);
  });

  document.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    if (e.key.toLowerCase() === 'z' && !e.shiftKey) {
      e.preventDefault();
      store.undo();
    } else if ((e.key.toLowerCase() === 'z' && e.shiftKey) || e.key.toLowerCase() === 'y') {
      e.preventDefault();
      store.redo();
    } else if (e.key.toLowerCase() === 's') {
      e.preventDefault();
      void doSave(false);
    }
  });

  const handle: StudioHandle = { store, reload: () => renderCanvas() };
  return handle;
}

// ---------------------------------------------------------------- 模块级小工具

function defaultStyleOf(type: BlockType): Block['style'] {
  return defaultStyle(type);
}

function packForExport(project: StudioProject): { name: string; data: Uint8Array } {
  const data = packProject(project);
  const safe =
    `${project.meta.title}${project.meta.issue ? '_' + project.meta.issue : ''}`.replace(/[\\/:*?"<>|\s]+/g, '_') ||
    'untitled';
  return { name: `${safe}.rtsz`, data };
}
