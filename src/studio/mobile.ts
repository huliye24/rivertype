/**
 * 与印刷品同源的移动版网页。
 *
 * 内容来源与 A4 版面完全一致（同一个 StudioProject），不是另写一份文案。
 * 音频 / 短片位在未提供素材时渲染为可见的占位卡，绝不静默省略，
 * 也绝不用示例素材冒充。
 */

import { MediaSlot, StudioProject } from './model';
import { assetToDataUrl } from './render';
import { qrSvg } from './qr';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function mediaCard(slot: MediaSlot): string {
  const ico = slot.kind === 'audio' ? '♪' : '▶';
  const kindLabel = slot.kind === 'audio' ? '音频' : '短片';
  if (slot.status === 'provided' && slot.src) {
    const embed =
      slot.kind === 'audio'
        ? `<audio class="m-player" controls preload="none" src="${esc(slot.src)}"></audio>`
        : `<video class="m-player" controls preload="metadata" src="${esc(slot.src)}"></video>`;
    return `<section class="m-card">
        <div class="m-card-head"><span class="m-ico">${ico}</span><span class="m-kind">${kindLabel}</span><h3>${esc(slot.title)}</h3></div>
        ${slot.description ? `<p class="m-desc">${esc(slot.description)}</p>` : ''}
        ${embed}
      </section>`;
  }
  return `<section class="m-card m-card-placeholder">
      <div class="m-card-head"><span class="m-ico">${ico}</span><span class="m-kind">${kindLabel}</span><h3>${esc(slot.title || '未命名')}</h3></div>
      <div class="m-ph">尚未提供素材${slot.missing ? ` · ${esc(slot.missing)}` : ''}</div>
      ${slot.description ? `<p class="m-desc">${esc(slot.description)}</p>` : ''}
    </section>`;
}

function textSections(project: StudioProject): string {
  const out: string[] = [];
  for (const page of project.pages) {
    for (const block of page.blocks) {
      if (block.hidden) continue;
      if (block.type === 'header' || block.type === 'footer' || block.type === 'nfc') continue;
      if (block.type === 'image') {
        const asset = project.assets.find((a) => a.id === block.assetId);
        const src = assetToDataUrl(asset);
        out.push(
          src
            ? `<figure class="m-figure"><img src="${esc(src)}" alt="${esc(block.alt)}" /></figure>`
            : `<figure class="m-figure m-figure-placeholder"><div class="m-ph">图片尚未提供${asset?.missing ? ` · ${esc(asset.missing)}` : ''}</div></figure>`,
        );
        continue;
      }
      if (block.type === 'rule') {
        out.push('<hr class="m-rule" />');
        continue;
      }
      if (!block.text.trim()) continue;
      const cls =
        block.type === 'title' ? 'm-title' : block.type === 'poem' ? 'm-poem' : block.type === 'caption' ? 'm-caption' : 'm-body';
      const html =
        block.type === 'poem'
          ? block.text
              .split('\n')
              .map((l) => `<p>${esc(l) || '&nbsp;'}</p>`)
              .join('')
          : block.type === 'body'
            ? block.text
                .split(/\n{2,}/)
                .map((p) => `<p>${esc(p).replace(/\n/g, '<br />')}</p>`)
                .join('')
            : `<p>${esc(block.text)}</p>`;
      out.push(`<div class="${cls}" data-from-block="${esc(block.id)}">${html}</div>`);
    }
  }
  return out.join('\n');
}

export function mobilePage(project: StudioProject): string {
  const { meta } = project;
  const url = meta.nfcUrl.trim();
  const qr = url && meta.qrFallback ? qrSvg(url, { scale: 4, quiet: 2, label: `扫码访问 ${url}` }) : '';
  const missing = [
    ...project.assets.filter((a) => a.status === 'placeholder').map((a) => `图片：${a.name}${a.missing ? `（${a.missing}）` : ''}`),
    ...project.media.filter((m) => m.status === 'placeholder').map((m) => `${m.kind === 'audio' ? '音频' : '短片'}：${m.title}${m.missing ? `（${m.missing}）` : ''}`),
  ];

  return `<!DOCTYPE html>
<html lang="${esc(meta.language || 'zh-Hans')}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>${esc(meta.title)}${meta.issue ? ' · ' + esc(meta.issue) : ''}</title>
<style>
:root { color-scheme: light; --ink:#1c1a17; --muted:#6f6a62; --line:#e2ddd4; --paper:#fbf9f5; --accent:#8c2f22; }
* { box-sizing: border-box; }
body { margin:0; background:var(--paper); color:var(--ink);
  font-family:"Source Han Serif SC","Noto Serif CJK SC","Songti SC",STSong,SimSun,serif;
  line-height:1.85; -webkit-text-size-adjust:100%; }
main { max-width: 40rem; margin: 0 auto; padding: 1.25rem 1.1rem 4rem; }
.m-cover { margin: -1.25rem -1.1rem 1.4rem; }
.m-cover img { width:100%; display:block; }
.m-cover-placeholder { aspect-ratio: 210/297; display:flex; align-items:center; justify-content:center;
  background: repeating-linear-gradient(45deg,#fff7f6,#fff7f6 8px,#fdeceb 8px,#fdeceb 16px);
  border-bottom:1px dashed #c0392b; color:#a03024; text-align:center; padding:1.5rem; font-size:.9rem; }
.m-kicker { font-size:.72rem; letter-spacing:.28em; color:var(--accent); text-transform:uppercase;
  font-family:"Helvetica Neue",Arial,"PingFang SC",sans-serif; margin-bottom:.5rem; }
.m-title p { font-size:2rem; font-weight:600; letter-spacing:.14em; margin:0 0 .3rem; }
.m-poem p { margin:0; text-align:center; letter-spacing:.06em; }
.m-body p { margin:0 0 1em; text-indent:2em; }
.m-caption p { margin:0 0 1em; text-align:center; font-size:.85rem; color:var(--muted); text-indent:0; }
.m-rule { border:0; border-top:1px solid var(--line); margin:1.6rem 0; }
.m-figure { margin:1.4rem 0; }
.m-figure img { width:100%; display:block; }
.m-ph { border:1px dashed #c0392b; background:rgba(192,57,43,.05); color:#a03024;
  padding:1rem; text-align:center; font-size:.85rem; border-radius:.25rem; }
.m-card { border:1px solid var(--line); border-radius:.5rem; padding:1rem; margin:1.2rem 0; background:#fff; }
.m-card-placeholder { border-style:dashed; border-color:#c0392b; background:#fffafa; }
.m-card-head { display:flex; align-items:center; gap:.5rem; flex-wrap:wrap; margin-bottom:.5rem; }
.m-card-head h3 { margin:0; font-size:1rem; font-weight:600; }
.m-ico { font-size:1.1rem; color:var(--accent); }
.m-kind { font-size:.7rem; letter-spacing:.16em; color:var(--muted);
  font-family:"Helvetica Neue",Arial,"PingFang SC",sans-serif; }
.m-desc { font-size:.88rem; color:var(--muted); margin:.5rem 0 0; }
.m-player { width:100%; margin-top:.75rem; }
.m-entry { margin-top:2.2rem; border-top:1px solid var(--line); padding-top:1.2rem; text-align:center; }
.m-entry .m-qr svg { width:150px; height:150px; }
.m-entry-url { font-size:.75rem; color:var(--muted); word-break:break-all;
  font-family:"Helvetica Neue",Arial,"PingFang SC",sans-serif; }
.m-audit { margin-top:2rem; font-size:.78rem; color:var(--muted);
  font-family:"Helvetica Neue",Arial,"PingFang SC",sans-serif; }
.m-audit ul { margin:.4rem 0 0; padding-left:1.2rem; }
</style>
</head>
<body>
<main>
  ${(() => {
    const cover = project.pages[0]?.blocks.find((b) => b.type === 'image' && b.style.fullBleed);
    const asset = cover ? project.assets.find((a) => a.id === cover.assetId) : undefined;
    const src = assetToDataUrl(asset);
    if (src) return `<div class="m-cover"><img src="${esc(src)}" alt="${esc(meta.title)}" /></div>`;
    return `<div class="m-cover m-cover-placeholder"><div>封面艺术图尚未提供${asset?.missing ? `<br />${esc(asset.missing)}` : ''}</div></div>`;
  })()}
  ${meta.issue ? `<div class="m-kicker">${esc(meta.issue)}</div>` : ''}
  ${textSections(project)}
  ${project.media.map(mediaCard).join('\n')}
  <section class="m-entry">
    ${qr ? `<div class="m-qr">${qr}</div>` : ''}
    <p>${url ? '扫码或轻触 NFC 打开本页' : 'NFC 地址尚未填写'}</p>
    ${url ? `<div class="m-entry-url">${esc(url)}</div>` : ''}
  </section>
  <section class="m-audit">
    <strong>素材清单</strong>
    ${
      missing.length
        ? `<ul>${missing.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>`
        : '<p>全部素材已提供。</p>'
    }
  </section>
</main>
</body>
</html>
`;
}
