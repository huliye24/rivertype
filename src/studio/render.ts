/**
 * project → 分页 HTML/CSS。
 *
 * 这是 Studio 唯一的渲染器：画布、PDF 导出、移动版都走同一份代码，
 * 于是「屏幕上看到的」与「印出来的」不可能漂移。
 *
 * 两条硬约束：
 *  1. 页面尺寸在 CSS 里被钉死（@page size: 210mm 297mm; margin: 0），
 *     PDF 页数因此由 .page 元素个数决定 —— 可断言，不靠猜。
 *  2. 每个字都是活文本节点。整页永不栅格化。
 */

import { marked } from 'marked';
import DOMPurify from 'dompurify';

import {
  Asset,
  Block,
  BlockStyle,
  FONT_STACKS,
  StudioProject,
  missingReport,
} from './model';
import { qrSvg } from './qr';

export interface RenderOptions {
  /** 编辑器辅助线（安全区 / 出血 / 中线）。导出成品时必须为 false */
  guides?: boolean;
  /** 只渲染指定页（渲染全部时省略） */
  onlyPage?: string;
  /** 画布缩放由外层 transform 负责，这里不参与 */
  resolveAsset?: (asset: Asset | undefined) => string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, '&#39;');
}

function markdownToHtml(src: string): string {
  const raw = marked.parse(src, { async: false, gfm: true, breaks: true }) as string;
  return DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } });
}

/** 图片数据内联，让导出物自包含（Vivliostyle 拿到的 HTML 不依赖任何外部文件） */
export function assetToDataUrl(asset: Asset | undefined): string {
  if (!asset || asset.status !== 'provided' || !asset.data) return '';
  return `data:${asset.mime};base64,${asset.data}`;
}

function styleToCss(style: BlockStyle): string {
  const parts: string[] = [
    `font-family:${FONT_STACKS[style.font]}`,
    `font-size:${style.size}pt`,
    `line-height:${style.lineHeight}`,
    `letter-spacing:${style.letterSpacing}em`,
    `font-weight:${style.weight}`,
    `color:${style.color}`,
    `text-align:${style.align}`,
    `opacity:${style.opacity}`,
    `margin-top:${style.marginTop}mm`,
    `margin-bottom:${style.marginBottom}mm`,
    `width:${style.width}%`,
  ];
  if (style.columns > 1) {
    parts.push(`column-count:${style.columns}`, 'column-gap:8mm');
  }
  if (style.vertical) {
    parts.push('writing-mode:vertical-rl', 'text-orientation:upright', 'max-height:100%');
  }
  if (style.offsetX) parts.push(`transform:translateX(${style.offsetX}mm)`);
  // 宽度不足 100% 时按对齐方式落位
  if (style.width < 100) {
    const self = style.align === 'center' ? 'center' : style.align === 'right' ? 'flex-end' : 'flex-start';
    parts.push(`align-self:${self}`);
  } else {
    parts.push('align-self:stretch');
  }
  return parts.join(';');
}

function renderPlaceholder(block: Block, asset: Asset | undefined, variant: 'image' | 'media'): string {
  const note = block.placeholderNote || asset?.missing || '素材未提供';
  const label = variant === 'image' ? '图片占位' : '媒体占位';
  return `<div class="ph" data-placeholder="1">
      <div class="ph-tag">${escapeHtml(label)} · 尚未提供</div>
      <div class="ph-note">${escapeHtml(note)}</div>
      <div class="ph-hint">正式印刷前需替换为真实素材</div>
    </div>`;
}

function renderBlock(block: Block, project: StudioProject, opts: RenderOptions): string {
  const style = block.style;
  if (block.hidden) return '';
  const css = styleToCss(style);
  const attrs = `class="block block-${block.type}" data-block-id="${escapeAttr(block.id)}" data-block-type="${block.type}" style="${css}"`;

  if (style.fullBleed && block.type === 'image') {
    const asset = project.assets.find((a) => a.id === block.assetId);
    const src = opts.resolveAsset ? opts.resolveAsset(asset) : assetToDataUrl(asset);
    const body = src
      ? `<img class="bleed-img" src="${escapeAttr(src)}" alt="${escapeAttr(block.alt || block.text)}" />`
      : renderPlaceholder(block, asset, 'image');
    return `<div ${attrs} data-bleed="1"><div class="bleed-layer">${body}</div></div>`;
  }

  let inner = '';
  switch (block.type) {
    case 'image': {
      const asset = project.assets.find((a) => a.id === block.assetId);
      const src = opts.resolveAsset ? opts.resolveAsset(asset) : assetToDataUrl(asset);
      inner = src
        ? `<img class="block-img" src="${escapeAttr(src)}" alt="${escapeAttr(block.alt || asset?.name || '')}" />`
        : renderPlaceholder(block, asset, 'image');
      break;
    }
    case 'body':
      inner = `<div class="md">${markdownToHtml(block.text)}</div>`;
      break;
    case 'poem': {
      const lines = block.text.split('\n').map((l) => (l.trim() ? escapeHtml(l) : '&nbsp;'));
      inner = `<div class="poem">${lines.map((l) => `<p>${l}</p>`).join('')}</div>`;
      break;
    }
    case 'nfc': {
      const url = project.meta.nfcUrl.trim();
      const qr = url && project.meta.qrFallback ? qrSvg(url, { scale: 4, quiet: 3, label: `扫码访问 ${url}` }) : '';
      inner = `<div class="nfc">
          ${qr ? `<div class="nfc-qr">${qr}</div>` : ''}
          <div class="nfc-text">${escapeHtml(block.text || url || 'NFC 入口待填写')}</div>
          ${url ? `<div class="nfc-url">${escapeHtml(url)}</div>` : '<div class="nfc-url nfc-url-missing">（NFC 地址未填写）</div>'}
        </div>`;
      break;
    }
    case 'rule':
      inner = '<hr class="block-rule" />';
      break;
    default:
      inner = escapeHtml(block.text).replace(/\n/g, '<br />');
  }

  return `<div ${attrs}><div class="block-inner">${inner}</div></div>`;
}

function guidesHtml(project: StudioProject): string {
  const { safeMm, bleedMm } = project.print;
  return [
    `<div class="guide guide-bleed" aria-hidden="true"><span>出血 ${bleedMm}mm</span></div>`,
    `<div class="guide guide-safe" aria-hidden="true"><span>安全区 ${safeMm}mm</span></div>`,
    `<div class="guide guide-center" aria-hidden="true"></div>`,
  ].join('');
}

/** 渲染全部（或指定）页面的 <section class="page"> 片段 */
export function renderPages(project: StudioProject, opts: RenderOptions = {}): string {
  const pages = opts.onlyPage ? project.pages.filter((p) => p.id === opts.onlyPage) : project.pages;
  return pages
    .map((page, index) => {
      const fullBleed = page.blocks
        .filter((b) => !b.hidden && b.style.fullBleed && b.type === 'image')
        .map((b) => renderBlock(b, project, opts))
        .join('');
      const flow = page.blocks
        .filter((b) => !b.hidden && !(b.style.fullBleed && b.type === 'image'))
        .map((b) => renderBlock(b, project, opts))
        .join('');
      return `<section class="page" data-page-id="${escapeAttr(page.id)}" data-side="${page.side}"
       data-page-index="${opts.onlyPage ? project.pages.findIndex((p) => p.id === page.id) : index}"
       style="background:${escapeAttr(page.background)}">
      ${fullBleed}
      <div class="page-content">${flow}</div>
      ${opts.guides ? guidesHtml(project) : ''}
    </section>`;
    })
    .join('\n');
}

/** 打印与画布共用的基础 CSS */
export function pageCss(project: StudioProject, opts: RenderOptions = {}): string {
  const { widthMm, heightMm, safeMm, bleedMm } = project.print;
  const guides = opts.guides
    ? `
.page { outline: 1px solid #d8d8d8; box-shadow: 0 0 0 1px rgba(0,0,0,.04); }
.guide { position: absolute; pointer-events: none; z-index: 50; }
.guide span {
  position: absolute; font: 400 7px/1.4 ui-sans-serif, system-ui, sans-serif;
  color: #b26a00; background: #fff6e5; border: 1px solid #f0c987; border-radius: 2px;
  padding: 1px 4px; white-space: nowrap;
}
.guide-safe { inset: ${safeMm}mm; border: 1px dashed #d93025; }
.guide-safe span { top: -9px; left: -1px; }
.guide-bleed { inset: ${bleedMm}mm; border: 1px dashed #1a73e8; }
.guide-bleed span { top: -9px; right: -1px; }
.guide-center { left: 50%; top: 0; bottom: 0; width: 0; border-left: 1px dotted #bbb; }
.guide-center { transform: translateX(-0.5px); }
`
    : '';

  return `
.riverstudio-root { --page-w: ${widthMm}mm; --page-h: ${heightMm}mm; --safe: ${safeMm}mm; }

.riverstudio-root .page,
.riverstudio-root .page * { box-sizing: border-box; }

.riverstudio-root .page {
  position: relative;
  width: var(--page-w);
  height: var(--page-h);
  overflow: hidden;
  background: #fff;
  flex: 0 0 auto;
}

.riverstudio-root .page-content {
  position: absolute;
  left: var(--safe); right: var(--safe);
  top: var(--safe); bottom: var(--safe);
  display: flex;
  flex-direction: column;
  z-index: 2;
}

.riverstudio-root .block { position: relative; z-index: 2; }
.riverstudio-root .block-footer { margin-top: auto; }
.riverstudio-root .block-inner { width: 100%; }

.riverstudio-root .block-image[data-bleed="1"] {
  position: absolute; inset: 0; width: 100% !important; z-index: 1; margin: 0 !important;
  transform: none !important;
}
.riverstudio-root .bleed-layer { position: absolute; inset: 0; overflow: hidden; }
.riverstudio-root .bleed-img { width: 100%; height: 100%; object-fit: cover; display: block; }

.riverstudio-root .block-img { max-width: 100%; height: auto; display: block; margin: 0 auto; }

.riverstudio-root .md > *:first-child { margin-top: 0; }
.riverstudio-root .md > *:last-child { margin-bottom: 0; }
.riverstudio-root .md p { margin: 0 0 .6em; text-indent: 2em; }
.riverstudio-root .md h1, .riverstudio-root .md h2, .riverstudio-root .md h3 { margin: .8em 0 .4em; text-indent: 0; }
.riverstudio-root .md blockquote {
  margin: .6em 0; padding: .2em 0 .2em .8em; border-left: 2px solid #c9c9c9; color: #555;
}
.riverstudio-root .md blockquote p { text-indent: 0; }
.riverstudio-root .md ul, .riverstudio-root .md ol { margin: .4em 0 .6em; padding-left: 1.6em; }
.riverstudio-root .md li { text-indent: 0; }
.riverstudio-root .md em { font-style: italic; }
.riverstudio-root .md strong { font-weight: 600; }

.riverstudio-root .poem p { margin: 0; text-indent: 0; }

.riverstudio-root .block-rule { border: 0; border-top: 1px solid currentColor; margin: 0; opacity: .55; }

.riverstudio-root .ph {
  border: 1px dashed #c0392b;
  background: repeating-linear-gradient(45deg, #fff7f6, #fff7f6 6px, #fdeceb 6px, #fdeceb 12px);
  color: #a03024;
  padding: 8mm 6mm;
  text-align: center;
  display: flex; flex-direction: column; gap: 2mm; align-items: center; justify-content: center;
  min-height: 26mm;
}
.riverstudio-root .block-image[data-bleed="1"] .ph { min-height: 100%; height: 100%; border-style: dashed; }
.riverstudio-root .ph-tag { font: 600 9pt/1.4 ${FONT_STACKS.sans}; letter-spacing: .06em; }
.riverstudio-root .ph-note { font: 400 8.5pt/1.5 ${FONT_STACKS.song}; }
.riverstudio-root .ph-hint { font: 400 7.5pt/1.4 ${FONT_STACKS.sans}; color: #b97168; }

.riverstudio-root .nfc { display: flex; flex-direction: column; align-items: center; gap: 2mm; }
.riverstudio-root .nfc-qr svg { width: 26mm; height: 26mm; }
.riverstudio-root .nfc-url { font: 400 7pt/1.4 ${FONT_STACKS.sans}; color: #777; word-break: break-all; }
.riverstudio-root .nfc-url-missing { color: #b26a00; }
${guides}
@media print {
  html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
  .riverstudio-root .page { box-shadow: none !important; outline: none !important; break-inside: avoid; }
  .riverstudio-root .page + .page { break-before: page; }
  .riverstudio-root .page:last-child { break-after: auto; }
  .guide { display: none !important; }
}
`;
}

/**
 * 独立的打印文档 —— 交给 Vivliostyle 的就是这个字符串。
 * 自包含：图片已内联为 data URL，不依赖任何外部文件。
 */
export function printDocument(project: StudioProject, opts: RenderOptions = {}): string {
  const { widthMm, heightMm } = project.print;
  const title = `${project.meta.title}${project.meta.issue ? ' · ' + project.meta.issue : ''}`;
  return `<!DOCTYPE html>
<html lang="${escapeAttr(project.meta.language || 'zh-Hans')}">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
@page { size: ${widthMm}mm ${heightMm}mm; margin: 0; }
html, body { margin: 0; padding: 0; }
body { background: #fff; color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
</style>
<style>${pageCss(project, { ...opts, guides: false })}</style>
</head>
<body class="riverstudio-root">
${renderPages(project, { ...opts, guides: false })}
</body>
</html>
`;
}

/** 编辑器画布用的片段（不含 @page，仍保留辅助线开关） */
export function canvasDocument(project: StudioProject, opts: RenderOptions = {}): string {
  return `<style>${pageCss(project, opts)}</style><div class="riverstudio-root">${renderPages(project, opts)}</div>`;
}

export interface OverflowReport {
  pageId: string;
  pageLabel: string;
  overflowMm: number;
  worstBlockId: string | null;
  worstBlockLabel: string;
}

/**
 * 溢出检测：对每一页比较「内容实际高度」与「页面内容区高度」。
 * 用 offsetHeight/scrollHeight 而非 getBoundingClientRect —— 前者不受画布 zoom 影响。
 */
export function measureOverflow(root: HTMLElement, project: StudioProject): OverflowReport[] {
  const mmPerPx = 25.4 / 96;
  const reports: OverflowReport[] = [];
  const pages = root.querySelectorAll<HTMLElement>('.page');
  pages.forEach((pageEl, i) => {
    const content = pageEl.querySelector<HTMLElement>('.page-content');
    const page = project.pages[i];
    if (!content || !page) return;
    const overflowPx = content.scrollHeight - content.clientHeight;
    let worstBlockId: string | null = null;
    let worstBlockLabel = '';
    let worst = 0;
    content.querySelectorAll<HTMLElement>('.block').forEach((el) => {
      const id = el.dataset.blockId ?? null;
      const bottom = el.offsetTop + el.offsetHeight;
      const excess = bottom - content.clientHeight;
      if (excess > worst) {
        worst = excess;
        worstBlockId = id;
        const block = page.blocks.find((b) => b.id === id);
        worstBlockLabel = block ? `${block.type}` : '';
      }
    });
    reports.push({
      pageId: page.id,
      pageLabel: page.label,
      overflowMm: Math.max(0, overflowPx) * mmPerPx,
      worstBlockId,
      worstBlockLabel,
    });
  });
  return reports;
}

/** 供面板展示「仍有 N 处占位」 */
export function placeholderCount(project: StudioProject): number {
  const r = missingReport(project);
  return r.blocks.length + r.media.length;
}
