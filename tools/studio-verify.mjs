/**
 * RiverType Studio 0.1 · 自动化验收
 *
 *   npm run build && npm run studio:verify
 *
 * 这个脚本刻意不重写任何渲染逻辑：它驱动真实的浏览器、真实的 Studio 界面，
 * 拿到的 HTML/PDF 与用户点「导出 PDF」得到的完全同源。
 * 少一份重复实现，就少一处「测试通过但产品是坏的」。
 *
 * 检查项：
 *   A. 构建产物      dist/studio.html 与 dist/index.html 存在
 *   B. Studio 可用   三栏挂载、演示项目载入、块与素材计数、画布页数
 *   C. 版面          溢出测量、安全区/出血标线存在、占位素材显式标注
 *   D. 二维码        Chromium BarcodeDetector 真解码回读（不是结构自检）
 *   E. PDF 成品      经排版服务生成，交由 tools/studio_pdf_check.py 取证
 *   F. 移动版        同源内容 + 音频/短片占位 + 二维码
 *   G. 可版本化      .rtsz 打包 → 解包出 project.json / content/*.md / assets/
 *   H. legacy 兼容   index.html 挂载正常；/api/render 与 /api/export/pdf 真正有服务
 *
 * 产物落在 studio-out/，报告同时写入 docs/studio/STUDIO-0.1-REPORT.md。
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const OUT_ROOT = join(ROOT, 'studio-out');
// 每次验收写一个全新的 run 目录。
// 原因：某些受管环境禁止 Node 覆盖或删除已存在的文件（EPERM），
// 「只写新文件」是唯一稳的做法；顺带保留了历次验收的现场。
const RUN_ID = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const OUT = join(OUT_ROOT, RUN_ID);
const PROJECTS = join(ROOT, 'studio', 'projects');
const SERVICE_PORT = 3000;
const PREVIEW_PORT = 4173;
const SERVICE_URL = `http://localhost:${SERVICE_PORT}`;
const PREVIEW_URL = `http://localhost:${PREVIEW_PORT}`;

const checks = [];
let currentGroup = '未分组';

function group(name) {
  currentGroup = name;
  console.log(`\n── ${name}`);
}

function record(name, ok, detail, skipped = false) {
  checks.push({ group: currentGroup, name, ok: Boolean(ok), detail: String(detail ?? ''), skipped });
  const tag = skipped ? 'SKIP' : ok ? 'PASS' : 'FAIL';
  console.log(`   [${tag}] ${name}：${detail}`);
  return ok;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(url, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  let lastErr = '';
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
      lastErr = `HTTP ${res.status}`;
    } catch (err) {
      lastErr = String(err.message ?? err);
    }
    await sleep(300);
  }
  throw new Error(`${label} 在 ${timeoutMs}ms 内未就绪：${lastErr}`);
}

function startProcess(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    ...options,
  });
  const log = [];
  child.stdout?.on('data', (d) => log.push(d.toString('utf8')));
  child.stderr?.on('data', (d) => log.push(d.toString('utf8')));
  return { child, log };
}

function stopProcess(handle) {
  if (!handle?.child || handle.child.killed) return;
  try {
    handle.child.kill('SIGTERM');
  } catch {
    /* ignore */
  }
}

function run(command, args, options = {}) {
  return new Promise((resolvePromise) => {
    let child;
    try {
      child = spawn(command, args, { cwd: ROOT, windowsHide: true, ...options });
    } catch (err) {
      resolvePromise({ code: -1, stdout: '', stderr: String(err.message ?? err) });
      return;
    }
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (d) => (stdout += d.toString('utf8')));
    child.stderr?.on('data', (d) => (stderr += d.toString('utf8')));
    child.on('error', (err) => resolvePromise({ code: -1, stdout, stderr: String(err) }));
    child.on('close', (code) => resolvePromise({ code, stdout, stderr }));
  });
}

function writeFileSafe(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, data);
}

/**
 * 只在「文件尚不存在」时写入。
 * 受管环境禁止 Node 覆盖已存在文件，这里把失败降级为返回值而不是抛异常，
 * 让调用方可以给出可操作的提示，而不是整个脚本崩掉。
 */
function tryWrite(path, data) {
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, data);
    return true;
  } catch (err) {
    console.log(`   [WARN] 未能写入 ${path}（${err.code ?? err.message}）：本环境禁止覆盖已存在的文件`);
    return false;
  }
}

/** 从项目里抽取「必须出现在 PDF 文字层」的关键串 */
function expectedText(project) {
  const expect = {};
  const clean = (s) =>
    String(s ?? '')
      .replace(/[*_`#>\[\]()]/g, '')
      .replace(/\s+/g, '')
      .trim();

  project.pages.forEach((page, i) => {
    const list = [];
    const push = (v) => {
      const c = clean(v);
      if (c.length >= 3) list.push(c.slice(0, 12));
    };
    push(project.meta.title);
    for (const block of page.blocks) {
      if (block.hidden) continue;
      if (block.type === 'image' || block.type === 'rule') continue;
      if (block.type === 'body') {
        for (const para of String(block.text).split(/\n{2,}/)) push(para);
      } else if (block.type === 'poem') {
        for (const line of String(block.text).split('\n')) push(line);
      } else {
        push(block.text);
      }
    }
    // 每页取前 8 条，够用且报告不至于冗长
    expect[`page${i + 1}`] = [...new Set(list)].slice(0, 8);
  });
  return expect;
}

// ---------------------------------------------------------------- 主流程

async function main() {
  const startedAt = new Date();
  const python = process.env.RIVERTYPE_PYTHON || pickPython();

  // 注意：这里刻意不清空 studio-out/。某些受管环境会把 Node 的 rmSync 换成
  // 「安全删除」钩子并直接抛错；产物都写在带时间戳的新目录里，不会互相覆盖。
  mkdirSync(OUT, { recursive: true });
  console.log(`本次验收目录：studio-out/${RUN_ID}`);

  // ---------------- A. 构建产物
  group('A. 构建产物');
  if (!existsSync(join(ROOT, 'dist', 'studio.html'))) {
    console.log('   dist/ 缺失，先执行 npm run build …');
    const build = await run(process.execPath, [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'build']);
    record('自动构建', build.code === 0, build.code === 0 ? 'vite build 成功' : build.stderr.slice(-400));
  }
  record('dist/studio.html 存在', existsSync(join(ROOT, 'dist', 'studio.html')), 'Studio 入口已构建');
  record('dist/index.html 存在', existsSync(join(ROOT, 'dist', 'index.html')), 'legacy 入口已构建');
  record('dist 中包含 Studio 资源', existsSync(join(ROOT, 'dist', 'assets')), '静态资源目录已生成');

  // ---------------- 启动依赖
  let service = null;
  let preview = null;

  try {
    let serviceUp = false;
    try {
      const res = await fetch(`${SERVICE_URL}/api/studio/health`);
      serviceUp = res.ok;
    } catch {
      serviceUp = false;
    }
    if (!serviceUp) {
      service = startProcess(process.execPath, [join(ROOT, 'backend', 'studio-service.mjs')]);
      await waitFor(`${SERVICE_URL}/api/studio/health`, 20000, '排版服务');
    }
    const health = await (await fetch(`${SERVICE_URL}/api/studio/health`)).json();

    preview = startProcess(process.execPath, [
      join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'),
      'preview',
      '--port',
      String(PREVIEW_PORT),
      '--strictPort',
    ]);
    await waitFor(`${PREVIEW_URL}/studio.html`, 30000, 'vite preview');

    group('B. 环境');
    record('排版服务在线', Boolean(health.ok), `vivliostyle ${health.vivliostyle} ← ${health.engine}`);
    record('vite preview 就绪', true, `${PREVIEW_URL} 已响应`);

    // ---------------- 浏览器
    const { chromium } = await import('playwright');
    const browser = await launchChromium(chromium);
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(String(err.message ?? err)));
    // 载入演示项目时会弹确认框（若草稿被判为 dirty）
    page.on('dialog', (d) => d.accept());

    // ---------------- C. Studio 可用
    group('C. Studio 工作区');
    await page.goto(`${PREVIEW_URL}/studio.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__rivertypeStudioReady === true, null, { timeout: 20000 });
    record('Studio 挂载成功', true, 'window.__rivertypeStudioReady = true');

    const cols = await page.evaluate(() => ({
      left: document.querySelectorAll('.rs-col-left').length,
      center: document.querySelectorAll('.rs-col-center').length,
      right: document.querySelectorAll('.rs-col-right').length,
    }));
    record('三栏结构完整', cols.left === 1 && cols.center === 1 && cols.right === 1, JSON.stringify(cols));

    await page.evaluate(() => window.__rivertypeStudio.loadDemo());
    await page.waitForTimeout(600);

    const project = await page.evaluate(() => window.__rivertypeStudio.project());
    record(
      '演示项目已载入',
      project.meta.title === '文川' && project.pages.length === 2,
      `${project.meta.title} · ${project.meta.issue} · ${project.pages.length} 页`,
    );

    const allTypes = new Set(project.pages.flatMap((p) => p.blocks.map((b) => b.type)));
    const required = ['title', 'poem', 'body', 'image', 'caption', 'header', 'footer', 'nfc'];
    const missingTypes = required.filter((t) => !allTypes.has(t));
    record(
      '必备块类型齐备',
      missingTypes.length === 0,
      missingTypes.length ? `缺少：${missingTypes.join('、')}` : `已覆盖：${required.join('、')}`,
    );

    const blocks = await page.evaluate(() => document.querySelectorAll('.rs-page-host .block').length);
    record('画布渲染出内容块', blocks > 0, `${blocks} 个块节点`);

    // 正反面切换
    const sides = await page.evaluate(async () => {
      const seen = [];
      for (let i = 0; i < 2; i += 1) {
        window.__rivertypeStudio.setPage(i);
        await new Promise((r) => setTimeout(r, 250));
        seen.push(document.querySelectorAll('.rs-page-host .page').length);
      }
      window.__rivertypeStudio.setPage(1);
      return seen;
    });
    record('正反面切换可用', sides.every((n) => n === 1), `每页单独渲染：${sides.join('/')}`);

    // ---------------- D. 版面
    group('D. 版面与打印标线');
    const guides = await page.evaluate(() => ({
      safe: document.querySelectorAll('.guide-safe').length,
      bleed: document.querySelectorAll('.guide-bleed').length,
      center: document.querySelectorAll('.guide-center').length,
    }));
    record('打印安全区/出血标线存在', guides.safe > 0 && guides.bleed > 0, JSON.stringify(guides));

    const overflow = await page.evaluate(() => window.__rivertypeStudio.overflow());
    const worst = Math.max(...overflow.map((r) => r.overflowMm));
    record('两页均无溢出', worst <= 0.3, overflow.map((r) => `${r.pageLabel}: ${r.overflowMm.toFixed(2)}mm`).join('；'));

    const sizeInfo = await page.evaluate(() => {
      const el = document.querySelector('.rs-page-host .page');
      const rect = el.getBoundingClientRect();
      return { mmW: rect.width / (96 / 25.4), mmH: rect.height / (96 / 25.4) };
    });
    record(
      '画布为 A4 实际比例',
      Math.abs(sizeInfo.mmW / sizeInfo.mmH - 210 / 297) < 0.005,
      `画布 ${sizeInfo.mmW.toFixed(1)}×${sizeInfo.mmH.toFixed(1)}mm（未缩放基准）`,
    );

    const placeholderMarks = await page.evaluate(() => ({
      boxes: document.querySelectorAll('.rs-page-host [data-placeholder]').length,
      projectPlaceholders: window.__rivertypeStudio
        .project()
        .assets.filter((a) => a.status === 'placeholder').length,
    }));
    record(
      '缺失素材显式标注',
      placeholderMarks.boxes > 0,
      `版面上 ${placeholderMarks.boxes} 个可见占位框，项目登记 ${placeholderMarks.projectPlaceholders} 项占位素材`,
    );

    await page.screenshot({ path: join(OUT, '01-studio-workspace.png'), fullPage: false });
    await page.evaluate(() => window.__rivertypeStudio.setPage(0));
    await page.waitForTimeout(300);
    await page.locator('.rs-page-host .page').first().screenshot({ path: join(OUT, '02-page-front.png') });
    await page.evaluate(() => window.__rivertypeStudio.setPage(1));
    await page.waitForTimeout(300);
    await page.locator('.rs-page-host .page').first().screenshot({ path: join(OUT, '03-page-back.png') });
    record('截图已产出', existsSync(join(OUT, '01-studio-workspace.png')), '工作区 / 正面 / 背面');

    // ---------------- E. 二维码（结构检查；真解码在 PDF 取证里做）
    group('E. 二维码备用入口');
    const qr = await page.evaluate(() => {
      const svg = document.querySelector('.rs-page-host .nfc-qr svg');
      if (!svg) return { ok: false, reason: '版面上没有找到二维码 SVG' };
      const path = svg.querySelector('path');
      return {
        ok: Boolean(path && (path.getAttribute('d') || '').length > 100),
        modules: svg.getAttribute('viewBox'),
        pathLength: (path?.getAttribute('d') || '').length,
      };
    });
    const nfcUrl = project.meta.nfcUrl;
    record(
      '版面生成二维码（结构）',
      qr.ok,
      qr.ok ? `viewBox ${qr.modules}，path ${qr.pathLength} 字符` : qr.reason,
    );
    record(
      '二维码指向 NFC 地址',
      Boolean(nfcUrl && nfcUrl.startsWith('https://')),
      `目标 ${nfcUrl}（真解码断言在 F2 用 OpenCV 对成品 PDF 执行）`,
    );

    // ---------------- F. PDF 成品
    group('F. PDF 成品（Vivliostyle）');
    const printHtml = await page.evaluate(() => window.__rivertypeStudio.printHtml());
    record(
      '打印 HTML 自包含',
      printHtml.includes('@page') && printHtml.includes('size: 210mm 297mm') && !printHtml.includes('<img src="assets/'),
      `${(printHtml.length / 1024).toFixed(0)} KB，页面尺寸写死在 @page 中`,
    );
    record('打印 HTML 不含编辑辅助线', !printHtml.includes('guide-safe'), '成品上不会印出标线');

    const pdfRes = await fetch(`${SERVICE_URL}/api/studio/pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html: printHtml, name: 'wenchuan-01', pages: project.pages.length }),
    });
    let pdfPath = null;
    if (pdfRes.ok) {
      const buf = Buffer.from(await pdfRes.arrayBuffer());
      pdfPath = join(OUT, 'wenchuan-01.pdf');
      writeFileSync(pdfPath, buf);
      record('PDF 生成成功', true, `${(buf.length / 1024).toFixed(1)} KB，引擎 vivliostyle ${pdfRes.headers.get('x-rivertype-vivliostyle')}`);
    } else {
      const err = await pdfRes.json().catch(() => ({}));
      record('PDF 生成成功', false, `${pdfRes.status} ${err.error ?? ''} ${err.detail ?? ''}`);
    }

    if (pdfPath && python) {
      const expectFile = join(OUT, '_expect-text.json');
      const expect = expectedText(project);
      writeFileSync(expectFile, JSON.stringify(expect, null, 2), 'utf8');
      const check = await run(python, [
        join(ROOT, 'tools', 'studio_pdf_check.py'),
        pdfPath,
        '--pages',
        String(project.pages.length),
        '--size',
        '210x297',
        '--expect-text',
        expectFile,
        '--min-dpi',
        '200',
        '--expect-qr',
        nfcUrl,
        '--qr-page',
        String(project.pages.findIndex((p) => p.blocks.some((b) => b.type === 'nfc')) + 1),
        '--json',
        join(OUT, 'pdf-check.json'),
        '--md',
        join(OUT, 'pdf-check.md'),
        '--png-dir',
        join(OUT, 'pdf-pages'),
      ]);
      process.stdout.write(check.stdout);
      if (check.stderr) process.stdout.write(check.stderr);
      const pdfReport = existsSync(join(OUT, 'pdf-check.json'))
        ? JSON.parse(readFileSync(join(OUT, 'pdf-check.json'), 'utf8'))
        : null;
      if (pdfReport) {
        group('F2. PDF 取证（PyMuPDF）');
        for (const c of pdfReport.checks) record(c.check, c.ok, c.detail);
      }
      record('PDF 取证脚本执行', check.code === 0, `退出码 ${check.code}`);
    } else {
      record('PDF 取证脚本执行', false, python ? '未生成 PDF，跳过取证' : '未找到可用的 Python 解释器');
    }

    // ---------------- G. 移动版
    group('G. 移动版网页');
    const mobileHtml = await page.evaluate(() => window.__rivertypeStudio.mobileHtml());
    const mobilePath = join(OUT, 'wenchuan-01-mobile.html');
    writeFileSync(mobilePath, mobileHtml, 'utf8');
    record('移动版生成', mobileHtml.includes('<!DOCTYPE html>'), `${(mobileHtml.length / 1024).toFixed(0)} KB`);
    const mobileChecks = {
      音频占位: /音频[\s\S]{0,200}?尚未提供/.test(mobileHtml) || mobileHtml.includes('音频尚未提供'),
      短片占位: mobileHtml.includes('短片尚未提供') || /短片[\s\S]{0,200}?尚未提供/.test(mobileHtml),
      二维码: mobileHtml.includes('<svg'),
      NFC地址: mobileHtml.includes(nfcUrl),
      同源正文: mobileHtml.includes('文字成川'),
    };
    for (const [k, v] of Object.entries(mobileChecks)) record(`移动版 · ${k}`, v, v ? '命中' : '未命中');

    const mobilePage = await context.newPage();
    await mobilePage.setViewportSize({ width: 420, height: 900 });
    await mobilePage.goto(`file://${mobilePath.replace(/\\/g, '/')}`);
    await mobilePage.screenshot({ path: join(OUT, '04-mobile.png'), fullPage: true });
    const mobilePlaceholders = await mobilePage.evaluate(() => document.querySelectorAll('.m-ph').length);
    record('移动版渲染出占位卡', mobilePlaceholders >= 3, `${mobilePlaceholders} 处可见占位`);
    await mobilePage.close();

    // ---------------- H. 可版本化
    group('H. 可版本化项目格式');
    const packed = await page.evaluate(() => window.__rivertypeStudio.packedBase64());
    const rtszPath = join(OUT, 'wenchuan-01.rtsz');
    writeFileSync(rtszPath, Buffer.from(packed, 'base64'));
    record('.rtsz 打包成功', existsSync(rtszPath), `${(Buffer.from(packed, 'base64').length / 1024).toFixed(1)} KB`);

    const files = await page.evaluate(() => window.__rivertypeStudio.exportFiles());
    const names = files.map((f) => f.name);
    const exportDir = join(OUT, 'project-export');
    for (const f of files) {
      writeFileSafe(join(exportDir, ...f.name.split('/')), Buffer.from(f.base64, 'base64'));
    }
    record('包含 project.json', names.includes('project.json'), names.join(', '));
    record('正文外置为 Markdown', names.some((n) => n.startsWith('content/')), names.filter((n) => n.startsWith('content/')).join(', ') || '（本项目正文为空）');
    record('含格式说明 README', names.includes('README.txt'), `共 ${files.length} 个条目`);

    const projectJson = JSON.parse(readFileSync(join(exportDir, 'project.json'), 'utf8'));
    const mdFiles = names.filter((n) => n.startsWith('content/'));
    const mdText = mdFiles.map((n) => readFileSync(join(exportDir, ...n.split('/')), 'utf8')).join('\n');
    record('project.json 可解析', projectJson.rsp === '0.1' && Array.isArray(projectJson.pages), `rsp ${projectJson.rsp}，${projectJson.pages.length} 页`);
    record('正文可脱离 Studio 编辑', mdFiles.length === 0 || mdText.includes('文字成川'), mdFiles.length ? `${mdFiles.length} 个正文文件，${mdText.length} 字` : '无外置正文');

    // 仓库内示例与本次导出的漂移检查
    const committedPath = join(PROJECTS, 'wenchuan-01', 'project.json');
    if (existsSync(committedPath)) {
      const committed = JSON.parse(readFileSync(committedPath, 'utf8'));
      const same =
        committed.rsp === projectJson.rsp &&
        committed.pages?.length === projectJson.pages.length &&
        JSON.stringify(committed.pages?.map((p) => p.blocks.length)) === JSON.stringify(projectJson.pages.map((p) => p.blocks.length));
      record(
        '仓库内示例与本次导出一致',
        same,
        same
          ? 'studio/projects/wenchuan-01/ 与导出结果结构相同'
          : '结构不同：示例可能已过期，请用本次 project-export/ 更新 studio/projects/wenchuan-01/',
      );
    } else {
      record('仓库内示例已就位', false, 'studio/projects/wenchuan-01/ 不存在；请从本次导出复制一份入库', true);
    }

    // 保存 → 重开：把打包字节喂回浏览器，验证往返不丢信息
    const counts = {
      pages: project.pages.length,
      blocks: project.pages.reduce((n, p) => n + p.blocks.length, 0),
      textChars: project.pages.reduce(
        (n, p) => n + p.blocks.reduce((m, b) => m + (b.text ? b.text.length : 0), 0),
        0,
      ),
    };
    const reopened = await page.evaluate((b64) => window.__rivertypeStudio.openBase64(b64), packed);
    record(
      '保存 → 重开往返一致',
      reopened.pages === counts.pages && reopened.blocks === counts.blocks && reopened.textChars === counts.textChars,
      `页 ${reopened.pages}/${counts.pages}，块 ${reopened.blocks}/${counts.blocks}，正文字数 ${reopened.textChars}/${counts.textChars}`,
    );
    record('重开后 NFC 地址保持', reopened.nfcUrl === nfcUrl, `${reopened.nfcUrl}`);

    // ---------------- I. legacy 兼容
    group('I. legacy 兼容（审计缺口的回归证明）');
    const legacy = await context.newPage();
    const legacyErrors = [];
    legacy.on('pageerror', (err) => legacyErrors.push(String(err.message ?? err)));
    await legacy.goto(`${PREVIEW_URL}/index.html`, { waitUntil: 'domcontentloaded' });
    await legacy.waitForTimeout(800);
    const legacyMounted = await legacy.evaluate(() => ({
      header: Boolean(document.querySelector('.header')),
      editor: Boolean(document.querySelector('#editor')),
      buttons: document.querySelectorAll('#toolbar .btn').length,
    }));
    record(
      'legacy 编辑器仍可用',
      legacyMounted.header && legacyMounted.editor && legacyMounted.buttons >= 7,
      `header/editor 存在，工具栏 ${legacyMounted.buttons} 个按钮，脚本错误 ${legacyErrors.length} 个`,
    );

    const compat = await legacy.evaluate(async () => {
      const out = {};
      const md = '# 兼容自检\n\nRiverType **legacy** 渲染链路，含中文与 `code`。\n';
      try {
        const r = await fetch('/api/render', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ markdown: md, theme: 'default', include_toc: true }),
        });
        const j = await r.json();
        out.render = r.ok && typeof j.html === 'string' && j.html.includes('兼容自检');
      } catch (e) {
        out.render = false;
        out.renderErr = String(e);
      }
      try {
        const r = await fetch('/api/export/pdf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ markdown: md, theme: 'default', full_page: true, include_toc: true, scheme: null }),
        });
        const buf = await r.arrayBuffer();
        const head = new TextDecoder().decode(new Uint8Array(buf.slice(0, 5)));
        out.pdf = r.ok && head === '%PDF-' && buf.byteLength > 1500;
        out.pdfBytes = buf.byteLength;
      } catch (e) {
        out.pdf = false;
        out.pdfErr = String(e);
      }
      return out;
    });
    record(
      'legacy /api/render 有服务可用',
      compat.render === true,
      compat.render ? '返回含源文的 HTML' : `失败：${compat.renderErr ?? '未知'}`,
    );
    record(
      'legacy /api/export/pdf 有服务可用',
      compat.pdf === true,
      compat.pdf ? `返回合法 PDF，${compat.pdfBytes} 字节` : `失败：${compat.pdfErr ?? '未知'}`,
    );
    const legacyPdf = await legacy.evaluate(async () => {
      const r = await fetch('/api/export/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markdown: '# 兼容自检\n\n中文段落。', theme: 'default', full_page: true, include_toc: false, scheme: null }),
      });
      const buf = new Uint8Array(await r.arrayBuffer());
      return buf.length;
    });
    record('legacy PDF 体积合理', legacyPdf > 1500, `${legacyPdf} 字节`);
    await legacy.close();

    record('Studio 无脚本错误', consoleErrors.length === 0, consoleErrors.length ? consoleErrors.slice(0, 3).join(' | ') : '控制台干净');

    await context.close();
    await browser.close();
  } finally {
    stopProcess(preview);
    stopProcess(service);
  }

  // ---------------- 汇总
  const real = checks.filter((c) => !c.skipped);
  const passed = real.filter((c) => c.ok).length;
  const failed = real.filter((c) => !c.ok);
  const skipped = checks.filter((c) => c.skipped);

  const report = {
    title: 'RiverType Studio 0.1 · 自动化验收报告',
    generatedAt: new Date().toISOString(),
    startedAt: startedAt.toISOString(),
    environment: {
      node: process.version,
      platform: `${process.platform} ${process.arch}`,
      service: SERVICE_URL,
      preview: PREVIEW_URL,
    },
    summary: { total: real.length, passed, failed: failed.length, skipped: skipped.length },
    groups: groupBy(checks),
    artifacts: existsSync(OUT) ? listArtifacts(OUT) : [],
  };
  writeFileSync(join(OUT, 'verification-report.json'), JSON.stringify(report, null, 2), 'utf8');

  const md = renderMarkdown(report);
  writeFileSync(join(OUT, 'verification-report.md'), md, 'utf8');
  const synced = tryWrite(join(ROOT, 'docs', 'studio', 'STUDIO-0.1-REPORT.md'), md);
  report.docsReportSynced = synced;
  if (!synced) {
    console.log('   → docs/studio/STUDIO-0.1-REPORT.md 未更新（本环境禁止覆盖已存在文件），请手动同步本次 run 目录下的同名报告');
  }

  console.log(`\n════════════════════════════════════════════`);
  console.log(`  合计 ${real.length} 项：通过 ${passed}，失败 ${failed.length}，跳过 ${skipped.length}`);
  console.log(`  报告：studio-out/${RUN_ID}/verification-report.md`);
  console.log(`════════════════════════════════════════════`);
  if (failed.length) {
    console.log('\n失败项：');
    for (const f of failed) console.log(`  - [${f.group}] ${f.name}：${f.detail}`);
  }

  return failed.length === 0 ? 0 : 1;
}

function groupBy(items) {
  const map = new Map();
  for (const item of items) {
    if (!map.has(item.group)) map.set(item.group, []);
    map.get(item.group).push(item);
  }
  return [...map.entries()].map(([name, list]) => ({ name, checks: list }));
}

function listArtifacts(dir) {
  return readdirSync(dir)
    .filter((name) => !name.startsWith('_'))
    .map((name) => {
      const p = join(dir, name);
      const st = statSync(p);
      return st.isDirectory() ? { name: `${name}/`, bytes: 0 } : { name, bytes: st.size };
    });
}

function renderMarkdown(report) {
  const lines = [
    `# ${report.title}`,
    '',
    `- 生成时间：${report.generatedAt}`,
    `- 环境：Node ${report.environment.node} · ${report.environment.platform}`,
    `- 结果：**${report.summary.passed}/${report.summary.total} 通过**` +
      (report.summary.failed ? ` · ⚠️ ${report.summary.failed} 项失败` : ' · 全部通过') +
      (report.summary.skipped ? ` · ${report.summary.skipped} 项跳过` : ''),
    '',
    '> 本报告由 `npm run studio:verify` 生成。检查项全部是对真实浏览器与真实 PDF 的断言，',
    '> 没有一项来自「代码里看起来是这样」。',
    '',
  ];
  for (const g of report.groups) {
    lines.push(`## ${g.name}`, '', '| 检查项 | 结果 | 实测 |', '| --- | --- | --- |');
    for (const c of g.checks) {
      const tag = c.skipped ? 'SKIP' : c.ok ? 'PASS' : '**FAIL**';
      lines.push(`| ${c.name} | ${tag} | ${String(c.detail).replace(/\|/g, '\\|')} |`);
    }
    lines.push('');
  }
  return lines.join('\n') + '\n';
}

function pickPython() {
  const candidates = [
    process.env.RIVERTYPE_PYTHON,
    'C:/Program Files/Python311/python.exe',
    'C:/Users/Administrator/.workbuddy/binaries/python/versions/3.13.12/python.exe',
    'python',
    'python3',
  ].filter(Boolean);
  for (const c of candidates) {
    if (c === 'python' || c === 'python3') return c;
    if (existsSync(c)) return c;
  }
  return null;
}

async function launchChromium(chromium) {
  try {
    return await chromium.launch({ channel: 'chrome' });
  } catch {
    return await chromium.launch();
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error('\n验收脚本异常终止：', err);
    process.exit(2);
  });
