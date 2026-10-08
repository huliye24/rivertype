/**
 * RSP 0.1 · RiverType Studio Project 数据模型
 *
 * 三条不可动摇的纪律：
 *  1. 整页永不栅格化 —— 画布上每个字都是活文本节点。
 *  2. 长文正文存 Markdown（content/<id>.md），可脱离 Studio 单独编辑。
 *  3. 缺失素材必须显式登记为 placeholder，绝不伪造。
 */

export const RSP_VERSION = '0.1' as const;

export type BlockType =
  | 'title'
  | 'poem'
  | 'body'
  | 'image'
  | 'caption'
  | 'header'
  | 'footer'
  | 'nfc'
  | 'rule';

export type FontKey = 'song' | 'kai' | 'hei' | 'sans';

export type Align = 'left' | 'center' | 'right' | 'justify';

export interface BlockStyle {
  /** 对齐 */
  align: Align;
  /** 字号 pt */
  size: number;
  /** 行高倍数 */
  lineHeight: number;
  /** 字距 em */
  letterSpacing: number;
  /** 字重 */
  weight: number;
  /** 颜色 */
  color: string;
  /** 字体族 */
  font: FontKey;
  /** 段前 mm */
  marginTop: number;
  /** 段后 mm */
  marginBottom: number;
  /** 宽度，占内容区百分比 */
  width: number;
  /** 水平微调 mm（可为负） */
  offsetX: number;
  /** 竖排 */
  vertical: boolean;
  /** 分栏数（正文用） */
  columns: number;
  /** 透明度 */
  opacity: number;
  /** 图片出血：铺满整页，忽略安全区 */
  fullBleed: boolean;
}

export interface Block {
  id: string;
  type: BlockType;
  /** 文本内容。body 为 Markdown；poem 按行断句；其余为纯文本 */
  text: string;
  /**
   * .rtsz 内正文的落盘路径（仅 body 块使用，形如 content/<id>.md）。
   * 内存模型里 text 始终是权威值；contentFile 只是序列化提示。
   */
  contentFile?: string;
  /** image 块引用的素材 id */
  assetId: string;
  /** 图片替代描述 / 说明块锚点 */
  alt: string;
  style: BlockStyle;
  /** 明确标记为占位（缺失素材） */
  placeholder: boolean;
  /** 占位原因，会打印到成品上 */
  placeholderNote: string;
  /** 视觉隐藏（不进成品） */
  hidden: boolean;
}

export type AssetStatus = 'provided' | 'placeholder';

export interface Asset {
  id: string;
  name: string;
  mime: string;
  /** base64（不含 data: 前缀）。placeholder 时为空串 */
  data: string;
  status: AssetStatus;
  /** 缺失说明，例如「封面艺术图未提供」 */
  missing: string;
}

export type MediaKind = 'audio' | 'video';

export interface MediaSlot {
  id: string;
  kind: MediaKind;
  title: string;
  description: string;
  /** 外部地址（如音乐平台 / 视频平台链接）。占位时为空 */
  src: string;
  status: AssetStatus;
  missing: string;
}

export interface Page {
  id: string;
  /** 展示名，例如「正面」「背面」 */
  label: string;
  side: 'front' | 'back';
  background: string;
  blocks: Block[];
}

export interface ProjectMeta {
  title: string;
  issue: string;
  author: string;
  publisher: string;
  date: string;
  language: string;
  description: string;
  /** NFC 写入的目标地址，必须为长期稳定 HTTPS */
  nfcUrl: string;
  /** 是否在版面上附二维码备用入口 */
  qrFallback: boolean;
}

export interface PrintSpec {
  size: 'A4';
  /** mm */
  widthMm: number;
  /** mm */
  heightMm: number;
  /** 出血 mm */
  bleedMm: number;
  /** 安全区 mm（自裁切边内缩） */
  safeMm: number;
}

export interface StudioProject {
  rsp: typeof RSP_VERSION;
  meta: ProjectMeta;
  print: PrintSpec;
  pages: Page[];
  assets: Asset[];
  media: MediaSlot[];
}

// ---------------------------------------------------------------- 默认值

export const DEFAULT_PRINT: PrintSpec = {
  size: 'A4',
  widthMm: 210,
  heightMm: 297,
  bleedMm: 3,
  safeMm: 12,
};

export const FONT_STACKS: Record<FontKey, string> = {
  song: '"Source Han Serif SC","Noto Serif CJK SC","Songti SC",STSong,"Adobe Song Std",SimSun,serif',
  kai: 'STKaiti,KaiTi,"Kaiti SC",STSong,serif',
  hei: '"Source Han Sans SC","Noto Sans CJK SC","PingFang SC",SimHei,"Adobe Heiti Std",sans-serif',
  sans: '"Helvetica Neue",Helvetica,Arial,"PingFang SC","Microsoft YaHei",sans-serif',
};

export const FONT_LABELS: Record<FontKey, string> = {
  song: '宋体',
  kai: '楷体',
  hei: '黑体',
  sans: '无衬线',
};

export const BLOCK_LABELS: Record<BlockType, string> = {
  title: '标题',
  poem: '诗歌',
  body: '正文',
  image: '图片',
  caption: '说明',
  header: '页眉',
  footer: '页脚',
  nfc: 'NFC / 二维码',
  rule: '分隔线',
};

export function defaultStyle(type: BlockType): BlockStyle {
  const base: BlockStyle = {
    align: 'left',
    size: 11,
    lineHeight: 1.7,
    letterSpacing: 0,
    weight: 400,
    color: '#1a1a1a',
    font: 'song',
    marginTop: 0,
    marginBottom: 3,
    width: 100,
    offsetX: 0,
    vertical: false,
    columns: 1,
    opacity: 1,
    fullBleed: false,
  };
  switch (type) {
    case 'title':
      return { ...base, align: 'center', size: 34, lineHeight: 1.25, weight: 600, letterSpacing: 0.18, marginBottom: 6 };
    case 'poem':
      return { ...base, align: 'center', size: 13, lineHeight: 2.0, letterSpacing: 0.06, marginBottom: 5 };
    case 'body':
      return { ...base, align: 'justify', size: 10.5, lineHeight: 1.85, marginBottom: 4 };
    case 'caption':
      return { ...base, align: 'center', size: 8.5, color: '#6b6b6b', marginTop: 2, marginBottom: 4 };
    case 'header':
      return { ...base, align: 'center', size: 8, color: '#8a8a8a', letterSpacing: 0.2, marginBottom: 6 };
    case 'footer':
      return { ...base, align: 'center', size: 8, color: '#8a8a8a', letterSpacing: 0.2, marginTop: 6, marginBottom: 0 };
    case 'nfc':
      return { ...base, align: 'center', size: 8.5, color: '#4a4a4a', marginTop: 4, marginBottom: 0 };
    case 'image':
      return { ...base, align: 'center', size: 10, marginBottom: 2 };
    case 'rule':
      return { ...base, marginTop: 4, marginBottom: 4, color: '#c9c9c9' };
    default:
      return base;
  }
}

export function newBlock(type: BlockType, patch: Partial<Block> = {}): Block {
  return {
    id: makeId(type),
    type,
    text: '',
    assetId: '',
    alt: '',
    style: defaultStyle(type),
    placeholder: false,
    placeholderNote: '',
    hidden: false,
    ...patch,
  };
}

let idSeq = 0;
export function makeId(prefix = 'b'): string {
  idSeq += 1;
  const stamp = Date.now().toString(36).slice(-4);
  return `${prefix}${stamp}${idSeq.toString(36).padStart(2, '0')}${Math.random().toString(36).slice(2, 6)}`;
}

export function emptyProject(meta: Partial<ProjectMeta> = {}): StudioProject {
  return {
    rsp: RSP_VERSION,
    meta: {
      title: '未命名',
      issue: '',
      author: '',
      publisher: '',
      date: new Date().toISOString().slice(0, 10),
      language: 'zh-Hans',
      description: '',
      nfcUrl: '',
      qrFallback: true,
      ...meta,
    },
    print: { ...DEFAULT_PRINT },
    pages: [
      { id: 'p1', label: '正面', side: 'front', background: '#ffffff', blocks: [] },
      { id: 'p2', label: '背面', side: 'back', background: '#ffffff', blocks: [] },
    ],
    assets: [],
    media: [],
  };
}

/** 校验并补齐反序列化后的项目对象（读取旧 .rtsz 时用） */
export function coerceProject(raw: unknown): StudioProject {
  const obj = (raw ?? {}) as Record<string, any>;
  const base = emptyProject();
  const project: StudioProject = {
    rsp: RSP_VERSION,
    meta: { ...base.meta, ...(obj.meta ?? {}) },
    print: { ...base.print, ...(obj.print ?? {}) },
    pages: Array.isArray(obj.pages) && obj.pages.length ? obj.pages : base.pages,
    assets: Array.isArray(obj.assets) ? obj.assets : [],
    media: Array.isArray(obj.media) ? obj.media : [],
  };
  project.pages = project.pages.map((p: any, i: number) => ({
    id: typeof p?.id === 'string' ? p.id : `p${i + 1}`,
    label: typeof p?.label === 'string' ? p.label : i === 0 ? '正面' : '背面',
    side: p?.side === 'back' ? 'back' : 'front',
    background: typeof p?.background === 'string' ? p.background : '#ffffff',
    blocks: (Array.isArray(p?.blocks) ? p.blocks : []).map((b: any) => {
      const type: BlockType = (Object.keys(BLOCK_LABELS) as BlockType[]).includes(b?.type) ? b.type : 'body';
      return {
        ...newBlock(type),
        ...b,
        id: typeof b?.id === 'string' ? b.id : makeId(type),
        style: { ...defaultStyle(type), ...(b?.style ?? {}) },
      } as Block;
    }),
  }));
  project.assets = project.assets.map((a: any, i: number) => ({
    id: typeof a?.id === 'string' ? a.id : `a${i + 1}`,
    name: typeof a?.name === 'string' ? a.name : `asset-${i + 1}`,
    mime: typeof a?.mime === 'string' ? a.mime : 'application/octet-stream',
    data: typeof a?.data === 'string' ? a.data : '',
    status: a?.status === 'provided' ? 'provided' : 'placeholder',
    missing: typeof a?.missing === 'string' ? a.missing : '',
  }));
  project.media = project.media.map((m: any, i: number) => ({
    id: typeof m?.id === 'string' ? m.id : `m${i + 1}`,
    kind: m?.kind === 'video' ? 'video' : 'audio',
    title: typeof m?.title === 'string' ? m.title : '',
    description: typeof m?.description === 'string' ? m.description : '',
    src: typeof m?.src === 'string' ? m.src : '',
    status: m?.status === 'provided' ? 'provided' : 'placeholder',
    missing: typeof m?.missing === 'string' ? m.missing : '',
  }));
  return project;
}

/** 统计仍处于占位状态的素材与媒体位，用于「不得伪造」的显式提示 */
export function missingReport(project: StudioProject): { assets: Asset[]; media: MediaSlot[]; blocks: Block[] } {
  const byId = new Map(project.assets.map((a) => [a.id, a]));
  const blocks: Block[] = [];
  for (const page of project.pages) {
    for (const b of page.blocks) {
      if (b.hidden) continue;
      const needsAsset = b.type === 'image';
      const asset = needsAsset && b.assetId ? byId.get(b.assetId) : undefined;
      const assetMissing = needsAsset && (!asset || asset.status === 'placeholder');
      if (b.placeholder || assetMissing) blocks.push(b);
    }
  }
  return {
    assets: project.assets.filter((a) => a.status === 'placeholder'),
    media: project.media.filter((m) => m.status === 'placeholder'),
    blocks,
  };
}
