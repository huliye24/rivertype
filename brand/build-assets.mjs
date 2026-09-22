import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const assets = path.join(root, 'assets');
const emblem = `data:image/jpeg;base64,${fs.readFileSync(path.join(root, '..', 'logo', 'logo.jpg')).toString('base64')}`;
const texture = `data:image/png;base64,${fs.readFileSync(path.join(assets, 'river-texture.png')).toString('base64')}`;
const C = { ink: '#111715', paper: '#F8F5ED', red: '#8F101C', gold: '#B4975D', white: '#F6F2EA', muted: '#A9B0A8' };

function svg(width, height, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">
<defs><clipPath id="seal"><circle cx="625" cy="600" r="500"/></clipPath></defs>
${body}
</svg>\n`;
}
function mark(x, y, size) {
  return `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="125 100 1000 1000" overflow="hidden"><image x="0" y="0" width="1300" height="1300" href="${emblem}" xlink:href="${emblem}" clip-path="url(#seal)"/></svg>`;
}
function wordmark(x, y, color, subcolor, scale = 1) {
  return `<text x="${x}" y="${y}" fill="${color}" font-family="Georgia, 'Times New Roman', serif" font-weight="700" font-size="${118*scale}" letter-spacing="${-3*scale}">RiverType</text>
<rect x="${x}" y="${y+25*scale}" width="${155*scale}" height="${5*scale}" fill="${C.gold}"/>
<text x="${x}" y="${y+92*scale}" fill="${subcolor}" font-family="'Noto Serif SC','Microsoft YaHei',serif" font-size="${34*scale}" letter-spacing="${5*scale}">古籍转译与出版协议</text>`;
}
const dark = svg(1600, 440, `<rect width="1600" height="440" fill="${C.ink}"/>${mark(80, 46, 348)}${wordmark(505, 215, C.white, C.muted, 1)}<text x="505" y="383" fill="${C.gold}" font-family="Georgia,serif" font-size="20" letter-spacing="5">FROM SOURCE TO EDITION</text>`);
const light = svg(1600, 440, `<rect width="1600" height="440" fill="${C.paper}"/>${mark(80, 46, 348)}${wordmark(505, 215, C.ink, '#54615D', 1)}<text x="505" y="383" fill="${C.red}" font-family="Georgia,serif" font-size="20" letter-spacing="5">FROM SOURCE TO EDITION</text>`);
const header = svg(1600, 480, `<image width="1600" height="480" href="${texture}" xlink:href="${texture}" preserveAspectRatio="xMidYMid slice"/><rect width="1600" height="480" fill="${C.ink}" opacity=".34"/>${mark(75, 55, 355)}${wordmark(500, 224, C.white, C.white, 1)}<text x="500" y="391" fill="${C.gold}" font-family="Georgia,serif" font-size="20" letter-spacing="4">AI-NATIVE CLASSICAL PUBLISHING</text>`);
const social = svg(1200, 630, `<rect width="1200" height="630" fill="${C.ink}"/><image y="280" width="1200" height="400" href="${texture}" xlink:href="${texture}" preserveAspectRatio="xMidYMid slice" opacity=".75"/><rect width="1200" height="630" fill="${C.ink}" opacity=".26"/>${mark(70, 107, 415)}<text x="520" y="255" fill="${C.white}" font-family="Georgia,serif" font-size="102" font-weight="700" letter-spacing="-2">RiverType</text><rect x="526" y="287" width="145" height="5" fill="${C.gold}"/><text x="522" y="359" fill="${C.white}" font-family="'Noto Serif SC','Microsoft YaHei',serif" font-size="34" letter-spacing="4">古籍转译与出版协议</text><text x="526" y="490" fill="${C.gold}" font-family="Georgia,serif" font-size="18" letter-spacing="3">SOURCE  ·  OCR  ·  EDITION  ·  EPUB</text>`);
const avatar = svg(1024, 1024, `<rect width="1024" height="1024" fill="${C.ink}"/>${mark(80, 80, 864)}`);
const icon = svg(512, 512, `<rect width="512" height="512" rx="90" fill="${C.ink}"/>${mark(54, 54, 404)}`);

for (const [name, content] of Object.entries({
  'lockup-dark.svg': dark,
  'lockup-light.svg': light,
  'github-header.svg': header,
  'social-card.svg': social,
  'avatar.svg': avatar,
  'app-icon.svg': icon,
})) {
  fs.writeFileSync(path.join(assets, name), content, 'utf8');
  process.stdout.write(`${name}\n`);
}
