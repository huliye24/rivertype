# 项目索引

> 30 秒看懂这个项目所有文件。

---

## 入口文件

| 文件                                | 用途              |
|-----------------------------------|-----------------|
| [README.md](./README.md)         | 项目门面(5 分钟读懂)  |
| [WORKFLOW.md](./WORKFLOW.md)     | 完整转译工作流        |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | 协作规则(如何参与)    |
| [DESIGN.md](./DESIGN.md)         | 架构设计            |
| [ROADMAP.md](./ROADMAP.md)       | 路线图             |
| [CHANGELOG.md](./CHANGELOG.md)   | 变更日志            |
| [SPEC.md](./SPEC.md)             | **书目录格式规范 v1**(从扫描件到成书) |
| [INDEX.md](./INDEX.md)           | 项目索引            |

## CLI 工具(`cli/`)

| 文件                          | 用途           |
|-----------------------------|--------------|
| [cli/README.md](./cli/README.md) | CLI 工具使用文档 |

六段流水线:`render → transcribe → verify → collate → assemble → build`

---

## 协议(`docs/protocol/`)

| 文件                                            | 用途          |
|-----------------------------------------------|-------------|
| [RTP-0.1.md](./docs/protocol/RTP-0.1.md)     | 协议核心规范     |
| [COUNTER-EVIDENCE.md](./docs/protocol/COUNTER-EVIDENCE.md) | 反证区       |

## Prompt 库(`docs/prompts/`)

| 文件                                       | 用途       |
|------------------------------------------|----------|
| [README.md](./prompts/README.md)   | Prompt 索引 |
| [transcribe.md](./prompts/transcribe.md)  | 转录原文     |
| [punctuate.md](./prompts/punctuate.md)   | 断句       |
| [collate.md](./prompts/collate.md)      | 校勘异文     |
| [annotate.md](./prompts/annotate.md)     | 校注       |
| [vernacular.md](./prompts/vernacular.md)  | 白话译      |
| [english.md](./prompts/english.md)      | 英译       |
| [translate-philosophical.md](./prompts/translate-philosophical.md) | 现代英语哲学 → 现代汉语(扩展) |
| [validate.md](./prompts/validate.md)     | 校验       |
| [full.md](./prompts/full.md)          | 一键转译全流程  |

## 反思与设计日志(`docs/reflections/`)

| 文件                                       | 用途       |
|------------------------------------------|----------|
| [2026-09-20-ai-native-software.md](./reflections/2026-09-20-ai-native-software.md) | 一次会话的默会知识 → Rivertype 协议的内化候选 |

## 其他文档

| 文件                                       | 用途          |
|------------------------------------------|-------------|
| [docs/GLOSSARY.md](./docs/GLOSSARY.md)   | 概念词典(术语精确定义) |

---

## 示例(`examples/`)

| 文件                                              | 类型       |
|-------------------------------------------------|----------|
| [道德经-第一章.rt](./examples/道德经-第一章.rt)         | 哲学·道家    |
| [黄帝内经-上古天真论.rt](./examples/黄帝内经-上古天真论.rt)  | 医家·中医经典  |

---

## 工具(`tools/`)

| 文件                                    | 用途      |
|---------------------------------------|---------|
| [validator.py](./tools/validator.py) | RTP 校验器 |
| [validator_tests.py](./tools/validator_tests.py) | 校验器测试套件 |

---

## 主题(`themes/guji/`)

(待添加 — v0.2)

| 文件                                  | 用途      |
|-------------------------------------|---------|
| style.css(规划) | 古籍排版样式 |
| theme.json(规划) | 主题配置   |

---

## 协议速查

```text
┌──────────────────────────────────────┐
│ YAML frontmatter (元信息)              │
│  title / work_id / author / dynasty / │
│  editions.base / editions.collated / │
│  protocol / created / transliterator   │
├──────────────────────────────────────┤
│ <!-- @section: source -->   原文        │
│ <!-- @section: punctuation --> 断句   │
│ <!-- @section: variants -->   异文表    │
│ <!-- @section: annotation --> 校注    │
│ <!-- @section: vernacular --> 白话    │
│ <!-- @section: english -->    英译     │
│ <!-- @section: meta -->       元信息   │
└──────────────────────────────────────┘
```

---

## 快速命令

```bash
# 校验单个 .rt 文件
python tools/validator.py examples/道德经-第一章.rt

# 校验目录所有 .rt
python tools/validator.py examples/

# 校验器测试
python tools/validator_tests.py

# 严格模式
python tools/validator.py --strict examples/
```

---

## 下一步

- 想转译一部古籍?→ 发 issue:`[Project] <书名> <卷次>`
- 想改协议?→ 发 issue:`[RFC] <改动>`
- 想参与维护?→ 发 issue:`[Maintainer Application]`

我们等你。
