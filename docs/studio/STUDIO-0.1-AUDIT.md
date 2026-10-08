# RiverType Studio 0.1 · 审计与最小集成方案

> 对应 issue #1 的 P0 第 1 条：**先审计，勿直接判定失效**。
> 审计对象：Web 前端、backend、CLI 接口、构建脚本、当前测试。
> 审计基线：`main` @ `f69255c`（本次开发分支 `studio-0.1` 的起点）。

---

## 0. 一句话结论

`src/preview.ts` 的 `/api/export/pdf` 与 `backend/pdf-service.js` 的 `/export/pdf`
**从来就没有接上过**——二者端口、路径、请求体形状三处全部不一致。
`preview.ts` 真正的对端是 Go 后端 `backend/main.go` 的 `handleExportPDF`。

因此这不是"被改坏的失效路由"，而是**仓库里并存着两条互不相识的 PDF 链路**。
Studio 不复用其中任何一条，而是接上 CLI 已经在用的同一条引擎：Vivliostyle。

---

## 1. 审计范围与方法

| 层 | 审计对象 | 方法 |
| --- | --- | --- |
| Web | `src/*.ts`（app / editor / preview / toolbar / ai-design / config）、`index.html`、`src/styles/main.css` | 逐文件通读，抽取全部 `fetch()` 调用点 |
| backend | `backend/pdf-service.js`（Node）、`backend/main.go`（Go/gin） | 抽取监听端口、路由表、请求体结构 |
| CLI | `cli/rivertype_cli/{assemble,build}.py` | 通读产物契约与 vivliostyle 调用方式 |
| 构建 | `package.json`、`vite.config.ts`、`tsconfig.json`、`Dockerfile`、`docker-compose.yml` | 抽取脚本、代理、输出目录 |
| 测试 | `cli/tests/`、`cli/rivertype_cli/*_tests.py`、`.github/workflows/validate.yml` | 实际运行 |

---

## 2. 现状盘点

### 2.1 Web 前端（Vite + TypeScript）

```text
index.html → src/main.ts → src/app.ts
                              ├── Editor      纯 textarea 包装（无富文本）
                              ├── Preview     fetch 后端，失败降级 marked + DOMPurify
                              ├── Toolbar     7 个按钮
                              └── AIDesign    AI 生成配色方案 / 设计图
```

前端发出的全部请求（`grep fetch(`）：

| 调用点 | 路径 | 请求体 | 期待响应 |
| --- | --- | --- | --- |
| `preview.ts:70` | `POST /api/render` | `{markdown, theme, include_toc}` | JSON `{html}` |
| `preview.ts:27` | `POST /api/ai/render-scheme` | `{markdown, scheme}` | **text**（HTML 片段） |
| `preview.ts:109` | `POST /api/export/html` | `{markdown, theme, full_page, include_toc, scheme}` | blob |
| `preview.ts:138` | `POST /api/export/pdf` | `{markdown, theme, full_page, include_toc, scheme}` | blob（PDF） |
| `ai-design.ts:312` | `POST /api/ai/generate-schemes` | `{description, context, base_prompt}` | JSON |
| `ai-design.ts:376` | `POST /api/ai/generate-design-image` | `{description}` | JSON |
| `ai-design.ts:468` | `POST /api/ai/analyze-design-image` | `{image_base64, design_type}` | JSON |

已发现的两处代码偏差：

1. `src/config.ts` 导出 `API_BASE = '/api'`，但 `src/preview.ts:3` **另起一份** `const API_BASE = '/api'`，
   没有 import 配置。数值一致，暂无功能影响，但属于重复定义。
2. `vite.config.ts` 声明 `publicDir: 'public'`，仓库中**不存在** `public/` 目录。
   Vite 不会因此报错（缺失即视为空），但这是一处悬空配置。

### 2.2 backend · 两个互不相识的服务

```text
                        vite dev server :5173
                               │  proxy '/api' → http://localhost:3000
                               ▼
        ┌──────────────────────────────────────────────┐
        │  A. backend/main.go   (Go · gin)             │
        │     监听 :3000                               │
        │     POST /api/render                         │
        │     POST /api/export/pdf    ← body=markdown  │
        │     POST /api/export/html                    │
        │     POST /api/ai/*                           │
        │     引擎：chromedp 无头 Chromium             │
        └──────────────────────────────────────────────┘

             （没有任何东西指向 3001）
        ┌──────────────────────────────────────────────┐
        │  B. backend/pdf-service.js   (Node/Express)  │
        │     监听 :3001                               │
        │     POST /export/pdf      ← body=html        │
        │     引擎：puppeteer                          │
        └──────────────────────────────────────────────┘
```

### 2.3 关键结论：`/api/export/pdf` ↔ `/export/pdf` 的真实关系

| 维度 | `preview.ts` 期待 | Go `main.go` | Node `pdf-service.js` |
| --- | --- | --- | --- |
| 端口 | 经 vite 代理 → `:3000` | `:3000` ✅ | `:3001` ❌ |
| 路径 | `/api/export/pdf` | `/api/export/pdf` ✅ | `/export/pdf` ❌（缺 `/api` 前缀） |
| 请求体 | `{markdown, theme, full_page, include_toc, scheme}` | `RenderRequest` 同名字段 ✅ | `{html, options}` ❌ |
| 依赖 | — | Go + chromedp | express + **puppeteer（未安装）** |

三条判据全部指向同一结论：

> **`preview.ts` 的 PDF 出口对应 Go 后端 `handleExportPDF`，不是 `pdf-service.js`。**
> `pdf-service.js` 是一个孤立的、从未被接入的早期微服务原型。

旁证：`docker-compose.yml` 只构建根 `Dockerfile`，全文未出现 3001；
`backend/package.json` 的 `start` 脚本写的是 `node main.go`（Node 跑 Go 源码，本身即不可执行）。
两处都说明 `pdf-service.js` 不在任何一条主链路上。

### 2.4 两条既有链路为什么都不能直接拿来给 Studio 用

| 链路 | 阻塞点 |
| --- | --- |
| Go 后端 | 需 Go 工具链；chromedp 首次运行要拉 Chromium；语义按 Markdown 设计，不理解"页 / 出血 / 安全区 / 恰 2 页" |
| Node `pdf-service.js` | puppeteer 未在仓库安装；写死 `format:'A4'` + 20px 页边距，无法保证 210×297mm 与无溢出 |

### 2.5 CLI：仓库里已经有一条成熟的 PDF 引擎

`cli/rivertype_cli/build.py` 已经用 **Vivliostyle** 做 CJK 书排版：

```python
exe = shutil.which("vivliostyle")      # Windows 下解析 vivliostyle.cmd
subprocess.run([exe, "build"], cwd=manuscript, ...)
```

本机实测：`vivliostyle 11.3.3 (core 2.45.1)` 已全局可用。
`assemble.py` 负责把工程组装成 `vivliostyle.config.js`，`build.py` 只调用、不重写排版引擎。

**结论：Studio 的 PDF 应与 CLI 共用 Vivliostyle，而不是引入第三条链路。**

### 2.6 构建脚本与测试基线

| 项 | 审计结果 |
| --- | --- |
| `npm run build` | `tsc && vite build`，源文件完整时可跑 |
| `npm run typecheck` | `tsc --noEmit`，`strict` + `noUnusedLocals` + `noUnusedParameters` 全开 |
| 根 `package.json` | 仅 `marked` / `dompurify` / `typescript` / `vite`；**无后端依赖** |
| CLI 测试 | 实跑 **13 passed**（`cli/tests/` 3 个 + `cli/rivertype_cli/*_tests.py`） |
| CI | `.github/workflows/validate.yml` 校验 `tools/validator.py` 与 `examples/*.rt` |

---

## 3. 最小集成方案

### 3.1 决策

1. **Studio 作为 Web 的第二个入口**，不改动 legacy 编辑器。
   新增 `studio.html` + `src/studio/main.ts`；`/` 仍是原 Markdown 编辑器。
   理由：issue 要求"在 Web 添加 Studio 工作区"，而非替换；两个入口互不回归。
2. **新增 `backend/studio-service.mjs`（Node ESM，监听 `:3000`）作为唯一服务端**，
   与 `vite.config.ts` 既有代理目标一致，不新增端口。
   它同时提供：
   - **兼容层**：`/api/render`、`/api/export/html`、`/api/export/pdf`、`/api/ai/render-scheme`
     —— 让 legacy `preview.ts` 真正有服务可用（补上历史缺口，不修改前端调用约定）
   - **Studio 层**：`/api/studio/pdf`、`/api/studio/mobile`、`/api/studio/verify`、`/api/studio/health`
3. **PDF 引擎 = Vivliostyle CLI**，与 `cli` 同源。
4. **`backend/pdf-service.js` 保持不动**，仅在本文档标注其真实地位（孤立原型），
   留待维护者决定保留或删除。不改它，避免引入无收益的回归面。

### 3.2 数据流

```text
浏览器 Studio
  │  项目内存模型 (RSP 0.1)
  ├── 本地：编辑 / 保存 .rtsz / 重开 / 图片导入   ← 无服务也能用
  │
  └─ POST /api/studio/pdf  { project, options }
        │
        ▼
  backend/studio-service.mjs
        │  1. project → 分页 HTML + 打印 CSS（@page 210mm 297mm, margin 0）
        │  2. 写临时工程目录
        │  3. vivliostyle build entry.html -o out.pdf
        ▼
     PDF（恰好 2 页 · A4 竖版）
```

### 3.3 归档格式 RSP 0.1

```text
project.json        结构化：页面、内容块、版式属性、素材登记表
content/<id>.md     长文正文（纯 Markdown，可脱离 Studio 单独编辑）
assets/<file>       图片原件（二进制）
```

打包为单文件 `.rtsz`（ZIP，仅 store 不压缩，**零依赖**实现）。
导出 ZIP 后可解压直接入 git：JSON 出 diff、Markdown 出文本 diff、assets 出二进制。

**硬性纪律**：整页永不栅格化。画布上的每一个字都是活文本节点。

### 3.4 显式契约（对应验收条款）

| 验收条款 | 落地方式 |
| --- | --- |
| 恰为 2 页 210×297 mm | CSS `@page{size:210mm 297mm;margin:0}` + 两个 `.page` 容器，页数由 `verify` 断言 |
| 中文正常 | 打印 CSS 指定 `Noto Serif CJK SC / Source Han Serif / SimSun` 回退栈 |
| 文字可选中 | 全程活文本；`verify` 抽取 PDF 文本层并匹配到源文 |
| 图片清晰 | 图片以原始字节嵌入，不二次编码；DPI 由物理尺寸反推校验 |
| 内容无溢出 | `verify` 在 Chromium 中测量每个块的 `scrollHeight` vs 页内容高 |
| 出错明确提示 | 服务端返回结构化 `{error, detail, hint}`，前端渲染为可读面板 |
| 无 AI key 可用 | Studio 核心路径零 AI 调用 |
| 不伪造素材 | 素材登记表 `status: placeholder`，占位块在画布/PDF/移动版三处都渲染可见占位框 |

---

## 4. 不做的事（显式边界）

- 不动 `cli/`（RTP/RPP 溯源机制、EPUB/PDF 既有链路）——验收要求"不回归"。
- 不改 `backend/pdf-service.js`、`backend/main.go`。
- 不引入需要联网的运行时依赖（QR 编码器自实现；ZIP 读写自实现）。
- 不把 Studio 接到任何云服务；`npm install` 仅补 `playwright` 作为 devDependency 用于验收。

---

## 5. 风险登记

| 风险 | 等级 | 处置 |
| --- | --- | --- |
| Vivliostyle 需 Node 环境，纯静态部署下不可用 | 中 | 前端提供"浏览器打印"降级路径，并在 UI 明示当前走的是哪条路径 |
| 中文字体在无 CJK 字体的机器上回退 | 中 | 字体栈 + `verify` 检查嵌入字体名，报告实际命中字体 |
| 自实现 QR 编码器正确性 | 中 | 用 Chromium `BarcodeDetector` 真解码回读校验，而非只做结构检查 |
| Studio 入口与 legacy 入口样式互相污染 | 低 | Studio 使用独立 CSS，不改 `src/styles/main.css` |
