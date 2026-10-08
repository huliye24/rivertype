/**
 * 最小 QR 编码器 —— byte 模式，纠错等级 L，版本 1..10，自选掩码。
 *
 * 为什么自己写：Studio 需要一个「不联网、不装依赖」也能出二维码的备用入口。
 * 引入 qrcode 包会打破「无 AI key、无后端也能离线用核心功能」的前提。
 *
 * 正确性由 tools/studio-verify.mjs 用 Chromium 的 BarcodeDetector 真解码回读断言，
 * 而不是只做结构自检 —— 自实现编码器最容易错的地方，恰恰是自检看不出来的地方。
 *
 * 实现依循 ISO/IEC 18004 的标准流程：
 *   分段 → 位流填充 → RS 纠错 → 交织 → 功能图形 → 数据蛇形放置 → 掩码择优 → 格式/版本信息
 */

// ---------------------------------------------------------------- GF(256)

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255];
})();

const gfMul = (a: number, b: number): number => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

function rsGenPoly(degree: number): number[] {
  let poly = [1];
  for (let i = 0; i < degree; i += 1) {
    poly.push(0);
    for (let j = poly.length - 1; j > 0; j -= 1) poly[j] ^= gfMul(poly[j - 1], EXP[i % 255]);
  }
  return poly;
}

/** 多项式长除法求余式 —— 余式即纠错码字 */
function rsEncode(data: number[], degree: number): number[] {
  const gen = rsGenPoly(degree);
  const rem = new Array<number>(degree).fill(0);
  for (const byte of data) {
    const factor = byte ^ rem[0];
    rem.shift();
    rem.push(0);
    if (factor !== 0) {
      for (let j = 0; j < degree; j += 1) rem[j] ^= gfMul(gen[j + 1], factor);
    }
  }
  return rem;
}

// ---------------------------------------------------------------- 版本表

/** 纠错等级 L：每块纠错码字数 + 分块结构 [[块数, 每块数据码字数], ...] */
const RS_BLOCKS: Record<number, { ec: number; groups: [number, number][] }> = {
  1: { ec: 7, groups: [[1, 19]] },
  2: { ec: 10, groups: [[1, 34]] },
  3: { ec: 15, groups: [[1, 55]] },
  4: { ec: 20, groups: [[1, 80]] },
  5: { ec: 26, groups: [[1, 108]] },
  6: { ec: 18, groups: [[2, 68]] },
  7: { ec: 20, groups: [[2, 78]] },
  8: { ec: 24, groups: [[2, 97]] },
  9: { ec: 30, groups: [[2, 116]] },
  10: { ec: 18, groups: [[2, 68], [2, 69]] },
};

const ALIGN_POS: Record<number, number[]> = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
  7: [6, 22, 38],
  8: [6, 24, 42],
  9: [6, 26, 46],
  10: [6, 28, 50],
};

const MAX_VERSION = 10;

function dataCodewords(version: number): number {
  const spec = RS_BLOCKS[version];
  return spec.groups.reduce((n, [count, dc]) => n + count * dc, 0);
}

function totalCodewords(version: number): number {
  const spec = RS_BLOCKS[version];
  return spec.groups.reduce((n, [count, dc]) => n + count * (dc + spec.ec), 0);
}

function chooseVersion(byteLength: number): number {
  for (let v = 1; v <= MAX_VERSION; v += 1) {
    const countBits = v <= 9 ? 8 : 16;
    if (4 + countBits + byteLength * 8 <= dataCodewords(v) * 8) return v;
  }
  throw new Error(`内容过长（${byteLength} 字节），超出本编码器支持的版本上限 ${MAX_VERSION}（纠错 L）`);
}

// ---------------------------------------------------------------- 位流

class BitBuffer {
  bits: number[] = [];
  put(value: number, length: number): void {
    for (let i = 0; i < length; i += 1) this.bits.push((value >>> (length - i - 1)) & 1);
  }
  get length(): number {
    return this.bits.length;
  }
}

function buildCodewords(bytes: Uint8Array, version: number): number[] {
  const countBits = version <= 9 ? 8 : 16;
  const totalData = dataCodewords(version);
  const buf = new BitBuffer();
  buf.put(0b0100, 4); // byte 模式指示符
  buf.put(bytes.length, countBits);
  for (const b of bytes) buf.put(b, 8);

  const capacityBits = totalData * 8;
  if (buf.length > capacityBits) throw new Error('内部错误：数据超出容量');

  if (buf.length + 4 <= capacityBits) buf.put(0, 4); // 结束符
  while (buf.length % 8 !== 0) buf.put(0, 1); // 补齐字节边界
  for (let pad = 0; buf.length < capacityBits; pad += 1) buf.put(pad % 2 === 0 ? 0xec : 0x11, 8);

  const data = new Array<number>(totalData);
  for (let i = 0; i < totalData; i += 1) {
    let byte = 0;
    for (let b = 0; b < 8; b += 1) byte = (byte << 1) | buf.bits[i * 8 + b];
    data[i] = byte;
  }

  // 分块 + 逐块 RS 纠错 + 交织
  const spec = RS_BLOCKS[version];
  const dcBlocks: number[][] = [];
  const ecBlocks: number[][] = [];
  let at = 0;
  for (const [count, dcCount] of spec.groups) {
    for (let i = 0; i < count; i += 1) {
      const block = data.slice(at, at + dcCount);
      at += dcCount;
      dcBlocks.push(block);
      ecBlocks.push(rsEncode(block, spec.ec));
    }
  }

  const out: number[] = [];
  const maxDc = Math.max(...dcBlocks.map((b) => b.length));
  for (let i = 0; i < maxDc; i += 1) {
    for (const block of dcBlocks) if (i < block.length) out.push(block[i]);
  }
  for (let i = 0; i < spec.ec; i += 1) {
    for (const block of ecBlocks) out.push(block[i]);
  }
  if (out.length !== totalCodewords(version)) throw new Error('内部错误：码字总数不匹配');
  return out;
}

// ---------------------------------------------------------------- 矩阵

const MASK_FN: ((i: number, j: number) => boolean)[] = [
  (i, j) => (i + j) % 2 === 0,
  (i) => i % 2 === 0,
  (_i, j) => j % 3 === 0,
  (i, j) => (i + j) % 3 === 0,
  (i, j) => (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0,
  (i, j) => ((i * j) % 2) + ((i * j) % 3) === 0,
  (i, j) => (((i * j) % 2) + ((i * j) % 3)) % 2 === 0,
  (i, j) => (((i * j) % 3) + ((i + j) % 2)) % 2 === 0,
];

const G15 = 0x537;
const G15_MASK = 0x5412;
const G18 = 0x1f25;

function bchTypeInfo(data: number): number {
  let d = data << 10;
  for (let i = 4; i >= 0; i -= 1) if ((d >>> (i + 10)) & 1) d ^= G15 << i;
  return ((data << 10) | d) ^ G15_MASK;
}

function bchTypeNumber(version: number): number {
  let d = version << 12;
  for (let i = 5; i >= 0; i -= 1) if ((d >>> (i + 12)) & 1) d ^= G18 << i;
  return (version << 12) | d;
}

/** -1 = 空位；0/1 = 模块值 */
type Grid = Int8Array[];

function makeGrid(n: number): Grid {
  const g: Grid = new Array(n);
  for (let i = 0; i < n; i += 1) g[i] = new Int8Array(n).fill(-1);
  return g;
}

function placeFinder(g: Grid, row: number, col: number): void {
  const n = g.length;
  for (let r = -1; r <= 7; r += 1) {
    if (row + r < 0 || row + r >= n) continue;
    for (let c = -1; c <= 7; c += 1) {
      if (col + c < 0 || col + c >= n) continue;
      const dark =
        (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
        (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
        (r >= 2 && r <= 4 && c >= 2 && c <= 4);
      g[row + r][col + c] = dark ? 1 : 0;
    }
  }
}

function placeFunctionPatterns(g: Grid, version: number): void {
  const n = g.length;
  placeFinder(g, 0, 0);
  placeFinder(g, n - 7, 0);
  placeFinder(g, 0, n - 7);

  // 校正图形
  const pos = ALIGN_POS[version];
  for (const row of pos) {
    for (const col of pos) {
      if (g[row][col] !== -1) continue;
      for (let r = -2; r <= 2; r += 1) {
        for (let c = -2; c <= 2; c += 1) {
          const dark = r === -2 || r === 2 || c === -2 || c === 2 || (r === 0 && c === 0);
          g[row + r][col + c] = dark ? 1 : 0;
        }
      }
    }
  }

  // 定位图形
  for (let r = 8; r < n - 8; r += 1) if (g[r][6] === -1) g[r][6] = r % 2 === 0 ? 1 : 0;
  for (let c = 8; c < n - 8; c += 1) if (g[6][c] === -1) g[6][c] = c % 2 === 0 ? 1 : 0;

  // 预留格式信息区（先填 0，稍后写真实值）
  for (let i = 0; i < 9; i += 1) {
    if (g[8][i] === -1) g[8][i] = 0;
    if (g[i][8] === -1) g[i][8] = 0;
  }
  for (let i = 0; i < 8; i += 1) {
    if (g[8][n - 1 - i] === -1) g[8][n - 1 - i] = 0;
    if (g[n - 1 - i][8] === -1) g[n - 1 - i][8] = 0;
  }
  g[n - 8][8] = 1; // 固定黑模块

  // 版本信息区
  if (version >= 7) {
    for (let i = 0; i < 18; i += 1) {
      g[Math.floor(i / 3)][(i % 3) + n - 8 - 3] = 0;
      g[(i % 3) + n - 8 - 3][Math.floor(i / 3)] = 0;
    }
  }
}

function placeData(g: Grid, codewords: number[], mask: number): void {
  const n = g.length;
  const maskFn = MASK_FN[mask];
  // 数据区模块需要区分「功能图形」与「数据」，先记录功能图形位置
  const reserved = makeGrid(n);
  for (let r = 0; r < n; r += 1) for (let c = 0; c < n; c += 1) reserved[r][c] = g[r][c] === -1 ? 0 : 1;

  let byteIndex = 0;
  let bitIndex = 7;
  let row = n - 1;
  let inc = -1;

  for (let col = n - 1; col > 0; col -= 2) {
    if (col === 6) col -= 1;
    for (;;) {
      for (let c = 0; c < 2; c += 1) {
        const cc = col - c;
        if (reserved[row][cc]) continue;
        let dark = 0;
        if (byteIndex < codewords.length) dark = (codewords[byteIndex] >>> bitIndex) & 1;
        if (maskFn(row, cc)) dark ^= 1;
        g[row][cc] = dark;
        bitIndex -= 1;
        if (bitIndex === -1) {
          byteIndex += 1;
          bitIndex = 7;
        }
      }
      row += inc;
      if (row < 0 || row >= n) {
        row -= inc;
        inc = -inc;
        break;
      }
    }
  }
}

function writeFormatInfo(g: Grid, mask: number): void {
  const n = g.length;
  const bits = bchTypeInfo((0b01 << 3) | mask); // 纠错等级 L = 01
  for (let i = 0; i < 15; i += 1) {
    const bit = (bits >>> i) & 1 ? 1 : 0;
    if (i < 6) g[i][8] = bit;
    else if (i < 8) g[i + 1][8] = bit;
    else g[n - 15 + i][8] = bit;
  }
  for (let i = 0; i < 15; i += 1) {
    const bit = (bits >>> i) & 1 ? 1 : 0;
    if (i < 8) g[8][n - i - 1] = bit;
    else if (i < 9) g[8][15 - i] = bit;
    else g[8][15 - i - 1] = bit;
  }
  g[n - 8][8] = 1;
}

function writeVersionInfo(g: Grid, version: number): void {
  if (version < 7) return;
  const n = g.length;
  const bits = bchTypeNumber(version);
  for (let i = 0; i < 18; i += 1) {
    const bit = (bits >>> i) & 1 ? 1 : 0;
    g[Math.floor(i / 3)][(i % 3) + n - 8 - 3] = bit;
    g[(i % 3) + n - 8 - 3][Math.floor(i / 3)] = bit;
  }
}

function penalty(g: Grid): number {
  const n = g.length;
  let score = 0;

  // 规则 1：行/列连续同色 ≥5
  for (let i = 0; i < n; i += 1) {
    for (const horizontal of [true, false]) {
      let run = 1;
      let prev = horizontal ? g[i][0] : g[0][i];
      for (let j = 1; j < n; j += 1) {
        const cur = horizontal ? g[i][j] : g[j][i];
        if (cur === prev) run += 1;
        else {
          if (run >= 5) score += 3 + (run - 5);
          run = 1;
          prev = cur;
        }
      }
      if (run >= 5) score += 3 + (run - 5);
    }
  }

  // 规则 2：2×2 同色块
  for (let r = 0; r < n - 1; r += 1) {
    for (let c = 0; c < n - 1; c += 1) {
      const v = g[r][c];
      if (v === g[r + 1][c] && v === g[r][c + 1] && v === g[r + 1][c + 1]) score += 3;
    }
  }

  // 规则 3：类定位图形 1:1:3:1:1
  const P1 = [1, 0, 1, 1, 1, 0, 1];
  const at = (r: number, c: number, horizontal: boolean, k: number): number =>
    horizontal ? g[r][c + k] : g[r + k][c];
  for (let r = 0; r < n; r += 1) {
    for (let c = 0; c <= n - 7; c += 1) {
      for (const horizontal of [true, false]) {
        if (!horizontal && r > n - 7) continue;
        let hit = true;
        for (let k = 0; k < 7; k += 1) {
          if (at(r, c, horizontal, k) !== P1[k]) {
            hit = false;
            break;
          }
        }
        if (!hit) continue;
        const before = horizontal ? c - 1 : r - 1;
        const after = horizontal ? c + 7 : r + 7;
        const beforeClear = horizontal ? before < 0 || g[r][before] === 0 : before < 0 || g[before][c] === 0;
        const afterClear = horizontal ? after >= n || g[r][after] === 0 : after >= n || g[after][c] === 0;
        if (beforeClear || afterClear) score += 40;
      }
    }
  }

  // 规则 4：黑白比例偏置
  let dark = 0;
  for (let r = 0; r < n; r += 1) for (let c = 0; c < n; c += 1) if (g[r][c] === 1) dark += 1;
  const ratio = Math.abs((100 * dark) / (n * n) - 50) / 5;
  score += ratio * 10;

  return score;
}

export interface QrResult {
  version: number;
  mask: number;
  size: number;
  modules: boolean[][];
}

export function qrEncode(text: string): QrResult {
  const bytes = new TextEncoder().encode(text);
  const version = chooseVersion(bytes.length);
  const codewords = buildCodewords(bytes, version);
  const n = version * 4 + 17;

  let best: Grid | null = null;
  let bestMask = 0;
  let bestScore = Infinity;

  for (let mask = 0; mask < 8; mask += 1) {
    const g = makeGrid(n);
    placeFunctionPatterns(g, version);
    placeData(g, codewords, mask);
    writeFormatInfo(g, mask);
    writeVersionInfo(g, version);
    const score = penalty(g);
    if (score < bestScore) {
      bestScore = score;
      best = g;
      bestMask = mask;
    }
  }

  const grid = best!;
  const modules: boolean[][] = [];
  for (let r = 0; r < n; r += 1) {
    modules.push(Array.from({ length: n }, (_v, c) => grid[r][c] === 1));
  }
  return { version, mask: bestMask, size: n, modules };
}

export interface QrSvgOptions {
  /** 每个模块的边长（模块单位，默认 1） */
  scale?: number;
  /** 静默区宽度，模块数，标准为 4 */
  quiet?: number;
  dark?: string;
  light?: string;
  /** 无障碍标签 */
  label?: string;
}

/** 生成二维码 SVG 字符串。矩形按行合并成一个 path，体积小且矢量清晰。 */
export function qrSvg(text: string, options: QrSvgOptions = {}): string {
  const { scale = 1, quiet = 4, dark = '#000000', light = '#ffffff', label = '' } = options;
  const qr = qrEncode(text);
  const n = qr.size;
  const total = (n + quiet * 2) * scale;

  const parts: string[] = [];
  for (let r = 0; r < n; r += 1) {
    let c = 0;
    while (c < n) {
      if (!qr.modules[r][c]) {
        c += 1;
        continue;
      }
      let run = 1;
      while (c + run < n && qr.modules[r][c + run]) run += 1;
      const x = (c + quiet) * scale;
      const y = (r + quiet) * scale;
      parts.push(`M${x} ${y}h${run * scale}v${scale}h${-run * scale}z`);
      c += run;
    }
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${total}" height="${total}"`,
    ` shape-rendering="crispEdges" role="img" aria-label="${escapeAttr(label || text)}">`,
    `<rect width="${total}" height="${total}" fill="${light}"/>`,
    `<path d="${parts.join('')}" fill="${dark}"/>`,
    `</svg>`,
  ].join('');
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
