/**
 * RiverType Studio 排版服务（零依赖，仅用 Node 内置模块）
 *
 *   node backend/studio-service.mjs
 *   监听 http://localhost:3000 —— 与 vite.config.ts 里既有的 '/api' 代理目标一致。
 *
 * 为什么不用 express/puppeteer：
 *   这是审计结论的直接落实。仓库里原本有两条 PDF 链路，一条依赖 Go + chromedp，
 *   一条依赖未安装的 puppeteer，两条都跑不起来，而 preview.ts 的调用方一直在等一个
 *   不存在于 3000 端口的服务。本服务用 Node 内置 http 就能起，PDF 交给仓库已经在用的
 *   Vivliostyle CLI，于是「Web 导出」与「CLI 出版」共用同一个排版引擎。
 *
 * 路由分两层：
 *   Studio 层    /api/studio/{health,pdf,mobile}
 *   兼容层       /api/render、/api/export/{pdf,html}、/api/ai/render-scheme
 *                —— 让 legacy src/preview.ts 真正有服务可用，不改前端调用约定。
 */

import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import process from 'node:process';

const PORT = Number(process.env.RIVERTYPE_STUDIO_PORT || 3000);
const BODY_LIMIT = 96 * 1024 * 1024; // 96MB：整页图片以 data URL 内联时体积会偏大
const OUTPUT_DIR = resolve(process.cwd(), 'output', 'studio');

// ---------------------------------------------------------------- 工具

/** 在 PATH 上解析可执行文件，兼容 Windows 的 .cmd/.exe 后缀。 */
function resolveExecutable(name) {
  const exts = process.platform === 'win32' ? ['.cmd', '.exe', '.bat', '.ps1', ''] : [''];
  for (const dir of (process.env.PATH || '').split(delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      const candidate = join(dir, name + ext);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

function run(command, args, options = {}) {
  return new Promise((resolvePromise) => {
    let child;
    try {
      child = spawn(command, args, { ...options, shell: false, windowsHide: true });
    } catch (err) {
      // Windows 上 Node 无法直接 spawn .cmd/.bat（EINVAL），这里兜住而不是让进程崩掉
      resolvePromise({ code: -1, stdout: '', stderr: String((err && err.message) || err) });
      return;
    }
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (d) => {
      stdout += d.toString('utf8');
      if (stdout.length > 40000) stdout = stdout.slice(-40000);
    });
    child.stderr?.on('data', (d) => {
      stderr += d.toString('utf8');
      if (stderr.length > 40000) stderr = stderr.slice(-40000);
    });
    child.on('error', (err) => resolvePromise({ code: -1, stdout, stderr: String(err) }));
    child.on('close', (code) => resolvePromise({ code, stdout, stderr }));
  });
}

let cachedEngine = null;

/**
 * 定位 Vivliostyle。
 *
 * 优先走「node <cli.js>」而不是 spawn vivliostyle.cmd：
 *   - Windows 上 Node ≥20 出于安全修复禁止直接 spawn .cmd（EINVAL）
 *   - 少一层 shell，参数不会被重新解析，路径含空格也不会出事
 */
function findVivliostyleJs() {
  const override = process.env.RIVERTYPE_VIVLIOSTYLE_JS;
  if (override && existsSync(override)) return override;

  const candidates = [];
  const bin = resolveExecutable('vivliostyle');
  if (bin) {
    const dir = dirname(bin);
    // npm 全局布局：bin 与 node_modules 同级
    candidates.push(join(dir, 'node_modules', '@vivliostyle', 'cli', 'dist', 'cli.js'));
    // 类 Unix 布局：bin 在 <prefix>/bin
    candidates.push(join(dir, '..', 'lib', 'node_modules', '@vivliostyle', 'cli', 'dist', 'cli.js'));
  }
  if (process.env.APPDATA) {
    candidates.push(join(process.env.APPDATA, 'npm', 'node_modules', '@vivliostyle', 'cli', 'dist', 'cli.js'));
  }
  for (const candidate of candidates) if (existsSync(candidate)) return candidate;
  return null;
}

async function vivliostyleInfo() {
  if (cachedEngine) return cachedEngine;

  const jsPath = findVivliostyleJs();
  if (jsPath) {
    const out = await run(process.execPath, [jsPath, '--version']);
    const version =
      (out.stdout.match(/cli:\s*([\d.]+)/) || [])[1] || out.stdout.trim().split('\n')[0] || 'unknown';
    cachedEngine = { exe: process.execPath, prefixArgs: [jsPath], version, display: jsPath, ok: true };
    return cachedEngine;
  }

  const bin = resolveExecutable('vivliostyle');
  if (bin) {
    const out = await run(bin, ['--version'], { shell: true });
    const version = (out.stdout.match(/cli:\s*([\d.]+)/) || [])[1] || 'unknown';
    cachedEngine = { exe: bin, prefixArgs: [], version, display: bin, ok: true, shell: true };
    return cachedEngine;
  }

  cachedEngine = { exe: null, prefixArgs: [], version: null, display: null, ok: false };
  return cachedEngine;
}

function sendJson(res, status, payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': body.length });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolvePromise, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > BODY_LIMIT) {
        reject(new ServiceError(413, '请求体过大', `超过 ${(BODY_LIMIT / 1024 / 1024) | 0}MB 上限`, '请压缩内联图片，或减少单页图片数量'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolvePromise(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

class ServiceError extends Error {
  constructor(status, error, detail, hint) {
    super(error);
    this.status = status;
    this.error = error;
    this.detail = detail;
    this.hint = hint;
  }
}

async function readJson(req) {
  const raw = await readBody(req);
  if (!raw.length) return {};
  try {
    return JSON.parse(raw.toString('utf8'));
  } catch (err) {
    throw new ServiceError(400, '请求体不是合法 JSON', String(err.message), '检查 Content-Type 与 JSON 转义');
  }
}

function safeName(name, fallback = 'document') {
  const cleaned = String(name || '')
    .replace(/[\\/:*?"<>|\s]+/g, '_')
    .slice(0, 80);
  return cleaned || fallback;
}

// ---------------------------------------------------------------- PDF

/** 交给 Vivliostyle 生成 PDF；页面尺寸由 HTML 里的 @page 规则决定。 */
async function buildPdf(html, name) {
  const engine = await vivliostyleInfo();
  if (!engine.ok) {
    throw new ServiceError(
      503,
      '未找到 vivliostyle CLI',
      'PATH 上没有 vivliostyle，也没有找到 @vivliostyle/cli 的 dist/cli.js',
      'npm install -g @vivliostyle/cli（也可用 RIVERTYPE_VIVLIOSTYLE_JS 指定 cli.js 绝对路径）',
    );
  }
  if (typeof html !== 'string' || !html.includes('</html>')) {
    throw new ServiceError(400, '缺少可排版的 HTML', '请求体里没有完整的 HTML 文档', '由 Studio 的 printDocument() 生成后提交');
  }

  const workdir = mkdtempSync(join(tmpdir(), 'rivertype-studio-'));
  const entry = join(workdir, 'entry.html');
  const outFile = join(workdir, 'out.pdf');
  try {
    writeFileSync(entry, html, 'utf8');
    const args = [...engine.prefixArgs, 'build', entry, '-o', outFile];
    const result = await run(engine.exe, args, { cwd: workdir, shell: Boolean(engine.shell) });
    if (result.code !== 0 || !existsSync(outFile)) {
      throw new ServiceError(
        500,
        'vivliostyle 排版失败',
        (result.stderr || result.stdout || `退出码 ${result.code}`).slice(-1200),
        '常见原因：HTML 未闭合、@page 尺寸非法、字体缺失。可用 npm run studio:verify 复现',
      );
    }
    const pdf = readFileSync(outFile);
    return { pdf, bytes: pdf.length, vivliostyle: engine.version, name };
  } finally {
    try {
      rmSync(workdir, { recursive: true, force: true });
    } catch {
      /* 临时目录清理失败不影响响应 */
    }
  }
}

// ---------------------------------------------------------------- 兼容层的最小 Markdown

/**
 * legacy /api/render 用的极简 Markdown 子集：
 * 标题、段落、粗斜体、行内代码、围栏代码、引用、无序/有序列表、分隔线、链接。
 *
 * 说明：这是兼容层的降级实现，不是完整 CommonMark。前端 preview.ts 在
 * 后端不可用时本来就会退回客户端 marked 渲染，因此这里只保证「够用 + 可预期」。
 */
function markdownToHtml(md) {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = (s) =>
    esc(s)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  const lines = String(md ?? '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let buffer = [];
  let listType = null;
  let inFence = false;
  let fence = [];

  const flushParagraph = () => {
    if (!buffer.length) return;
    out.push(`<p>${buffer.map(inline).join('<br />')}</p>`);
    buffer = [];
  };
  const closeList = () => {
    if (listType) {
      out.push(`</${listType}>`);
      listType = null;
    }
  };

  for (const line of lines) {
    if (/^```/.test(line.trim())) {
      if (inFence) {
        out.push(`<pre><code>${esc(fence.join('\n'))}</code></pre>`);
        fence = [];
        inFence = false;
      } else {
        flushParagraph();
        closeList();
        inFence = true;
      }
      continue;
    }
    if (inFence) {
      fence.push(line);
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flushParagraph();
      closeList();
      const level = heading[1].length;
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }
    if (/^\s*(---+|\*\*\*+)\s*$/.test(line)) {
      flushParagraph();
      closeList();
      out.push('<hr />');
      continue;
    }
    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      flushParagraph();
      closeList();
      out.push(`<blockquote><p>${inline(quote[1])}</p></blockquote>`);
      continue;
    }
    const ul = line.match(/^\s*[-*+]\s+(.*)$/);
    const ol = line.match(/^\s*\d+\.\s+(.*)$/);
    if (ul || ol) {
      flushParagraph();
      const want = ul ? 'ul' : 'ol';
      if (listType !== want) {
        closeList();
        out.push(`<${want}>`);
        listType = want;
      }
      out.push(`<li>${inline((ul || ol)[1])}</li>`);
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      closeList();
      continue;
    }
    buffer.push(line);
  }
  if (inFence) out.push(`<pre><code>${esc(fence.join('\n'))}</code></pre>`);
  flushParagraph();
  closeList();
  return out.join('\n');
}

const LEGACY_THEME = {
  default: 'body{font-family:-apple-system,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif;line-height:1.7;max-width:820px;margin:0 auto;padding:2.5rem;color:#222}',
  github: 'body{font-family:-apple-system,"Segoe UI",Roboto,"PingFang SC",sans-serif;line-height:1.65;max-width:820px;margin:0 auto;padding:2.5rem;color:#333}',
  minimal: 'body{font-family:Georgia,STSong,serif;line-height:1.85;max-width:720px;margin:0 auto;padding:2.5rem;color:#333}',
};

function legacyHtml(markdown, theme, scheme) {
  const schemeCss = scheme && typeof scheme.css === 'string' ? scheme.css : '';
  const base =
    schemeCss ||
    LEGACY_THEME[theme] ||
    LEGACY_THEME.default;
  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8" /><style>
code{background:#f4f2ef;padding:.15em .4em;border-radius:3px}
pre{background:#f4f2ef;padding:1rem;overflow:auto;border-radius:6px}
blockquote{border-left:3px solid #ddd;margin:.8em 0;padding-left:1rem;color:#666}
table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:.4rem}
${base}
</style></head><body>${markdownToHtml(markdown)}</body></html>`;
}

// ---------------------------------------------------------------- 路由

const ROUTES = {
  'GET /api/studio/health': async (_req, res) => {
    const engine = await vivliostyleInfo();
    sendJson(res, 200, {
      ok: true,
      service: 'rivertype-studio-service',
      vivliostyle: engine.version,
      engine: engine.display,
      pdfReady: engine.ok,
      cwd: process.cwd(),
    });
  },

  'POST /api/studio/pdf': async (req, res) => {
    const body = await readJson(req);
    const name = safeName(body.name, 'studio');
    const { pdf, bytes, vivliostyle } = await buildPdf(body.html, name);
    res.writeHead(200, {
      'Content-Type': 'application/pdf',
      'Content-Length': pdf.length,
      'X-Rivertype-Pages': String(body.pages ?? ''),
      'X-Rivertype-Vivliostyle': vivliostyle || '',
      'X-Rivertype-Bytes': String(bytes),
    });
    res.end(pdf);
  },

  'POST /api/studio/mobile': async (req, res) => {
    const body = await readJson(req);
    const name = safeName(body.name, 'studio');
    mkdirSync(OUTPUT_DIR, { recursive: true });
    const target = writeWithFallback(join(OUTPUT_DIR, `${name}-mobile.html`), String(body.html ?? ''));
    sendJson(res, 200, { ok: true, path: target, bytes: statSync(target).size });
  },

  // ---------------- 兼容层：让 legacy preview.ts 有服务可用 ----------------

  'POST /api/render': async (req, res) => {
    const body = await readJson(req);
    const html = markdownToHtml(body.markdown);
    sendJson(res, 200, { html, metadata: { renderer: 'studio-service/minimal-markdown' } });
  },

  'POST /api/ai/render-scheme': async (req, res) => {
    const body = await readJson(req);
    const text = legacyHtml(body.markdown, 'default', body.scheme);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(text);
  },

  'POST /api/export/html': async (req, res) => {
    const body = await readJson(req);
    const text = legacyHtml(body.markdown, body.theme, body.scheme);
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': 'attachment; filename="document.html"',
    });
    res.end(text);
  },

  'POST /api/export/pdf': async (req, res) => {
    const body = await readJson(req);
    const html = legacyHtml(body.markdown, body.theme, body.scheme);
    const { pdf, bytes } = await buildPdf(html, 'document');
    res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Length': pdf.length, 'X-Rivertype-Bytes': String(bytes) });
    res.end(pdf);
  },
};

/**
 * 写文件，遇到「不允许覆盖已存在文件」的环境时自动换一个带时间戳的名字。
 * 受管环境里 fs.writeFile 覆盖已存在文件会抛 EPERM；与其让导出失败，
 * 不如另存一份并如实把最终路径回报给调用方。
 */
function writeWithFallback(target, content) {
  try {
    writeFileSync(target, content, 'utf8');
    return target;
  } catch (err) {
    if (err && err.code === 'EPERM' && existsSync(target)) {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const alt = target.replace(/\.html$/, `-${stamp}.html`);
      writeFileSync(alt, content, 'utf8');
      return alt;
    }
    throw err;
  }
}

const ALLOW_ORIGIN = '*';

const server = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', ALLOW_ORIGIN);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || '/', `http://localhost:${PORT}`);
  const key = `${req.method} ${url.pathname}`;
  const handler = ROUTES[key];

  if (!handler) {
    // 明确指出历史缺口：/export/pdf 从来不是 /api/export/pdf 的对端
    const hint =
      url.pathname === '/export/pdf'
        ? '注意：这是 backend/pdf-service.js 的旧路由（无 /api 前缀、3001 端口）。前端调用的是 /api/export/pdf。'
        : undefined;
    sendJson(res, 404, { error: '没有这个路由', detail: key, hint });
    return;
  }

  try {
    await handler(req, res);
  } catch (err) {
    if (err instanceof ServiceError) {
      sendJson(res, err.status, { error: err.error, detail: err.detail, hint: err.hint });
    } else {
      sendJson(res, 500, { error: '服务内部错误', detail: String(err && err.message ? err.message : err) });
    }
  }
});

server.listen(PORT, () => {
  console.log(`[rivertype-studio] 监听 http://localhost:${PORT}`);
  vivliostyleInfo()
    .then((engine) => {
      if (engine.ok) console.log(`[rivertype-studio] 排版引擎：vivliostyle ${engine.version} ← ${engine.display}`);
      else console.log('[rivertype-studio] 未找到 vivliostyle：npm install -g @vivliostyle/cli');
    })
    .catch((err) => console.log(`[rivertype-studio] 引擎探测失败：${err}`));
});
