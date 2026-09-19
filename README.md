# RiverType · 古籍现代化转译协议与工具

> **一条河,字字皆舟。**
> 中国古籍需要被现代人读懂。AI 每次转译,标准都不同。
> 我们定义一个**协议**,让所有转译都遵循同一结构。

[English](./README_en.md) | [协议规范](./docs/protocol/RTP-0.1.md) | [书目录规范](./SPEC.md) | [CLI 工具](./cli/README.md) | [Prompt 库](./docs/prompts/) | [示例](./examples/)

---

## 这个项目已经做了什么?

这不是从零开始的项目。这是从已有的工程基础**加上协议层**的升级。

仓库里已有:

- **[`SPEC.md`](./SPEC.md)** — 书目录格式规范 v1(从扫描件到成书)
- **[`cli/`](./cli/README.md)** — 六段流水线 CLI(render / transcribe / verify / collate / assemble / build)
- **[`examples/guji-book/`](./examples/guji-book/)** — 完整实战模板(金丹四百字解四种)
- **[`cli/rivertype_cli/themes/guji-dark/`](./cli/rivertype_cli/themes/guji-dark/)** — 内置主题(古卷·玄色)

**新增的协议层**(`docs/protocol/RTP-0.1.md` + `docs/prompts/` + `tools/validator.py`):

让"转录稿(transcript/*.md)"这一步从自由文本升级为**结构化协议**。
让 AI 跨次转译的输出**可对齐、可校验、可拼接**。

---

## 这件事为什么重要

中国有几十万件古籍——经史子集、佛道医卜、农工兵商。它们是文明的底层档案。

今天,把它们转译成现代汉语、英文、白话,几乎都靠 AI。但现状是:

- **同一个文本**,换一家 AI 重新转译,**断句不同、校注不同、版本标注不同**;
- **同一段原文**,A 模型的"白话译"和 B 模型完全无法对比;
- **校勘、异文、字源、训诂**,AI 经常混淆或漏掉;
- **学术规范**——底本、参校本、断句依据——**没有任何 AI 自觉遵守**。

**这不是 AI 不够强的问题。这是缺协议的问题。**

就像 Markdown 解决了"富文本的纯文本语法"问题,
Rivertype 要解决"**古籍转译的结构化协议**"问题。

---

## 协议:RiverType Transliteration Protocol (RTP)

后缀:`.rt`(Rivertype Source)。

一份合规的 `.rt` 文件,必须包含以下区段(节选,不强制):

| 区段            | 标记                       | 说明                       |
|---------------|--------------------------|--------------------------|
| Frontmatter   | YAML frontmatter         | 元信息(书名、作者、底本、转译引擎等)    |
| `source`      | `<!-- @section: source -->` | 古籍原文(逐字保留)              |
| `punctuation` | `<!-- @section: punctuation -->` | 现代标点断句与依据              |
| `variants`    | `<!-- @section: variants -->` | 异文对比表(底本 vs 参校)         |
| `annotation`  | `<!-- @section: annotation -->` | 校注、训诂、字源、音义             |
| `vernacular`  | `<!-- @section: vernacular -->` | 现代汉语白话译                 |
| `english`     | `<!-- @section: english -->` | 英文译(可扩展至其他语种)          |
| `meta`        | `<!-- @section: meta -->` | 转译元信息(协议版本、引擎、时间)       |

完整规范见 [`docs/protocol/RTP-0.1.md`](./docs/protocol/RTP-0.1.md)。

---

## 三层架构

```text
                    ┌─────────────────────────────────┐
                    │   RTP · 协议层(What to output)  │
                    │   .rt 文件格式 + 校验器           │
                    └─────────────────────────────────┘
                                     │
                                     ▼
                    ┌─────────────────────────────────┐
                    │  Prompts · 提示词层(How to ask) │
                    │  docs/prompts/transcribe.md ... │
                    └─────────────────────────────────┘
                                     │
                                     ▼
                    ┌─────────────────────────────────┐
                    │   Tools · 工具层(Where to show) │
                    │  Markdown 渲染 + 古籍主题 + 导出   │
                    └─────────────────────────────────┘
```

- **协议层**:任何 AI(GPT、Claude、Gemini、本地模型)按照 RTP 输出,结果可对比、可校验、可拼接。
- **提示词层**:标准化 Prompt 模板,让 AI 知道"按 RTP 转译"。
- **工具层**:沿用原 Rivertype 渲染引擎,扩展古籍专用主题(宋体、夹注、宣纸、竖排)。

---

## 一键上手

### 1. 看示例

```bash
examples/
├── 道德经-第一章.rt         # 哲学·道家
└── 黄帝内经-上古天真论.rt    # 医家·中医经典
```

### 2. 让 AI 按 RTP 转译你的古籍

打开 `docs/prompts/transcribe.md`,把原文贴进去,发送给任意 AI。
要求 AI 输出 `.rt` 格式。然后用 `tools/validator.py` 校验。

### 3. 渲染成可发布的读物

```bash
# 把 .rt 渲染为带古籍主题的 HTML
npx rivertype render examples/道德经-第一章.rt --theme guji

# 导出为 EPUB(竖排、宋体、双行夹注)
npx rivertype export epub examples/道德经-第一章.rt --theme guji
```

---

## 核心承诺

1. **协议优先于引擎** — 不绑定任何 AI / 任何工具。
2. **结构优先于字数** — 哪怕只转译一段,只要结构正确,就具备资产价值。
3. **底本优先于改写** — 原文一字不改;白话译断章在前、解释在后。
4. **异文优先于定本** — 凡有参校本的,必须保留异文对比。
5. **人机协同优先于 AI 自动** — 协议是 AI 与人类校勘者之间的合约。

---

## 路线图

- **v0.1(当前)** — RTP 协议定义 + 两份示例 + Prompt 模板。
- **v0.2** — 校验器(命令行)+ 古籍主题(宋体竖排、夹注、宣纸)。
- **v0.3** — AI Prompt 一键套用(浏览器插件 / CLI 工具)。
- **v1.0** — 协议 RFC,广邀校勘学者、AI 研究者、古籍机构共同审议。
- **v1.x** — 多语种转译(英文、日文、藏文、梵文)、大模型对齐评测。

详见 [`ROADMAP.md`](./ROADMAP.md)。

---

## 这不是一个普通工具

这不是一个 Markdown 编辑器。
这不是一个 EPUB 排版器。
这是一份**协议**。

它要回答的问题是:

> **当一个 AI 把《道德经》转译给现代人时,如何保证它与另一个 AI、另一个人类校勘者、另一个时代的电子版本,说的是同一件结构化的事?**

我们不打算用工具垄断这件事。我们打算用**协议**让所有愿意参与这件事的 AI、人、机构,都能对齐。

---

## 许可证

MIT License — 见 [LICENSE](./LICENSE)。

## 引用

```bibtex
@software{rivertype2026,
  title  = {RiverType: A Protocol for AI-Based Classical Chinese Text Transliteration},
  author = {huliye24 and contributors},
  year   = {2026},
  url    = {https://github.com/huliye24/rivertype}
}
```
