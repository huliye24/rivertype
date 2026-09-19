# Design · 架构设计

## 一句话定位

**RiverType = 协议(P) + Prompt(P) + 工具(T)** 的三层系统,
让任何 AI 转译中国古籍,都遵循同一结构。

---

## 设计哲学

### 1. 协议先于引擎

我们不打算做一个"AI 转译工具"。我们打算做一个**协议**,让所有 AI、所有工具、所有人类校勘者都能对齐。

类比:

- Markdown 不是某个编辑器发明的,而是 CommonMark 协议
- HTTP 不是某个浏览器发明的,而是 RFC 协议
- **RTP 也不是某个 AI 发明的,而是一份协议**

### 2. 结构先于字数

哪怕只转译一段,只要结构合规,就有资产价值。

这意味着:**先建结构,再填血肉**。

### 3. 底本先于改写

原文一字不改。白话译断章在前、解释在后。

**校注、白话、英译,都是"附属于原文"的。原文是主,译文是从。**

### 4. 反证先于肯定

每个理论必须有反证区。每个协议必须有失败案例。

详见 `docs/protocol/COUNTER-EVIDENCE.md`。

---

## 三层架构详解

### Layer 1 · 协议层(RTP)

**职责**:定义转译产物的结构。

**核心概念**:

- **区段(Section)**:`<!-- @section: name -->` 标记的内容块
- **校注标记**:`@校勘` / `@音注` / `@训诂` / `@字源` / `@出注`
- **异文表**:Markdown 表格,行号 `章.字`
- **Frontmatter**:YAML 元信息

**保证**:

- 任何 AI 输出按 RTP,可被校验器验证
- 任何 `.rt` 文件可被任何工具解析

### Layer 2 · Prompt 层

**职责**:让 AI 知道"按 RTP 转译"。

**核心 Prompt**(见 `docs/prompts/`):

| Prompt       | 输入              | 输出          |
|--------------|-----------------|-------------|
| transcribe   | 原始资料            | source 区    |
| punctuate    | source          | punctuation |
| collate      | 多版本原文           | variants    |
| annotate     | source          | annotation  |
| vernacular   | source          | vernacular  |
| english      | source + 术语表    | english     |
| validate     | .rt 文件          | 校验报告       |
| full         | 原始资料 + 元信息      | 完整 .rt     |

**保证**:

- 不同 AI 用同一 Prompt,产出结构可对齐
- Prompt 有反例,避免常见 AI 错误

### Layer 3 · 工具层

**职责**:把 `.rt` 渲染为可发布的读物。

**技术栈**(沿用):

- 前端:TypeScript + Vite
- Markdown 解析:markdown-it
- PDF 导出:WeasyPrint
- 后端:FastAPI / Go(可选)

**新增能力**:

- 古籍主题(`themes/guji/`):宋体、夹注、宣纸、竖排
- `.rt` 解析器(扩展现有 Markdown 解析)
- 校验器命令行工具
- CLI:rt init / validate / render / publish

---

## 数据流

```text
原始资料(扫描件/OCR/电子文本)
    ↓
Prompt transcribe
    ↓
AI 输出 .rt (source 区)
    ↓
人工校验 + 修订
    ↓
Prompt punctuate / collate / annotate / vernacular / english
    ↓
AI 输出 .rt (全部区段)
    ↓
tools/validator.py 校验
    ↓
tools/render.py 渲染(可选主题)
    ↓
HTML / PDF / EPUB
    ↓
发布 + 资产化
```

---

## 与仓库内已有 SPEC 的关系

仓库已有一份 **[SPEC.md](./SPEC.md)** — 书目录格式规范 v1,定义了从"扫描件到成书"的工程格式:

```text
scans/*.pdf
  → render        (扫描件 → 整页图 → 工作带 → 溯源清单)
  → transcribe    (工作带 → 转录稿 .md)
  → verify        (存疑裁片 + 核验清单)
  → assemble      (章节 + 主题 + vivliostyle 配置)
  → build         (EPUB / PDF)
```

**SPEC 是工程层,RTP 是内容层。** 两者的关系:

| 层        | 文件                     | 抽象          |
|----------|------------------------|-------------|
| **工程层** | SPEC.md                | 目录、文件、流程    |
| **内容层** | RTP-0.1.md             | 转录稿的结构、字段、标记 |

`transcript/*.md` 是工程层和内容层的交界面:

- 工程层保证:`transcript/*.md` 一工作带一个文件,可溯源
- 内容层保证:每个 `transcript/*.md` 内部遵循 RTP 结构(可被校验)

**RTP 不是替代 SPEC,而是为 SPEC 的 `transcript` 步骤提供"内容协议"。**

---

## 与类似项目的差异

| 项目        | 类型     | 差异                       |
|-----------|--------|--------------------------|
| 识典古籍      | 数据    | 我们是协议,他们是数据库              |
| CTEXT     | 检索    | 我们是转译结构,他们提供原文             |
| Wenku8    | 出版    | 我们是开源协议,他们有版权约束           |
| OpenAI    | 通用 AI | 我们专注于古籍,有领域协议              |
| Notion AI | 笔记 AI | 我们跨工具,他们是封闭产品              |

**核心差异**:RTP 是一个**协议**,不是一个产品。任何人都可以基于 RTP 实现自己的产品。

---

## 边界

**协议做**:

- 定义结构(区段、字段、标记)
- 定义校验规则
- 提供 Prompt 模板
- 提供示例

**协议不做**:

- 转译原文(那是 AI + 校勘者的工作)
- 出版发行(那是工具的事)
- 持有版权(古籍原文本身可能受现代整理本版权约束)
- 评判哪个译本更好(那是学界的事)

---

## 演化路径

```text
v0.1 协议框架(当前)
  ↓
v0.2 校验器 + 主题
  ↓
v0.3 CLI + 批量
  ↓
v1.0 协议 RFC + 学界评议
  ↓
v1.x 多语种 + 对齐评测 + 跨类型扩展
```

详见 `ROADMAP.md`。

---

## 维护者

见 `MAINTAINERS.md`(待建立)。

---

## 引用

设计文档引用本协议时:

```bibtex
@software{rivertype-design,
  title  = {RiverType: Design of a Protocol for AI-Based Classical Chinese Transliteration},
  author = {huliye24 and 文川院 contributors},
  year   = {2026},
  url    = {https://github.com/huliye24/rivertype/blob/main/DESIGN.md}
}
```
