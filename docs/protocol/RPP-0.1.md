# RiverType Publishing Protocol · RPP-0.1

> 状态：草案。定义书项目和 Agent 与 CLI 的交接约定；单篇古籍转译结构见 [RTP-0.1](RTP-0.1.md)。

## 1. 单位与目标

RPP 的工作单位是一本书目录，标志为根目录中的 `book.yaml`。目标是让人、OCR 模型与编码 Agent 在任意阶段接手，并能追溯每条转录到扫描页。出版物是派生产物，原始扫描不被覆盖。

## 2. 标准目录

```text
book.yaml                 书目与构建配置
scans/                    原始 PDF；不可自动改写
pages/                    渲染后的整页 PNG
bands/                    OCR/视觉转录工作带
manifest/pages.json       页图、工作带与坐标映射
preprocessed/             可选的预处理页图
transcript/               逐带 Markdown 与 _queue.md
verify/                   存疑裁片与 verify.md
manuscript/chapters/      可编辑章节 Markdown
manuscript/style.css      排版主题
manuscript/vivliostyle.config.js
output/                   EPUB 或 PDF
```

`scans/` 为证据层；其余目录为可重建或可编辑的工作层。`manuscript/chapters/` 经人工编辑后不应被无意覆盖：再次执行 `assemble` 前应先备份或确认差异。

## 3. 阶段契约

| 阶段 | 命令 | 前置条件 | 必需产物 / 交接点 |
| --- | --- | --- | --- |
| 建书 | `rivertype init DIR --title TITLE` | 目录可创建 | `book.yaml` |
| 拆页 | `rivertype render DIR` | `scans/*.pdf` | `manifest/pages.json`、`pages/`、`bands/` |
| 预处理 | `rivertype preprocess DIR` | `pages/*.png` | `preprocessed/`、`manifest/preprocess.json` |
| 转录 | `rivertype transcribe DIR` | `manifest/pages.json` | `transcript/*.md` 或 `_queue.md` |
| 核验 | `rivertype verify DIR` | 转录稿 | `verify/verify.md` 与放大裁片 |
| 校勘 | `rivertype collate DIR --reference FILE` | 底本与参照本 | 校勘记草稿 |
| 组版 | `rivertype assemble DIR` | 转录稿 / 清单 | `manuscript/` |
| 构建 | `rivertype build DIR` | 排版工程、Vivliostyle | `output/*.epub` 或 `*.pdf` |
| 文本校验 | `rivertype validate FILE.rt` | RTP 文件 | 诊断文本；退出码 0/1/2 |

预处理当前提供可供人或 Agent 检查的辅助图；它尚未自动接入工作带转录。OCR 模型的输出必须按底本照录，并以 `【存疑:说明】` 保留不确定字。断句、白话译、异文取舍和章节编排均属于后续编辑判断。

## 4. Agent 可读接口

```bash
rivertype capabilities --json
rivertype status path/to/book --json
```

这两个命令输出单个 UTF-8 JSON 对象。`schema_version` 固定为 `rpp/0.1`；消费者应忽略未知字段。`status` 的 `artifacts` 记录已存在的文件数，`next_action` 仅是建议，不代替质量审查。普通阶段命令目前输出人类日志，自动化应依据退出码和约定产物判断结果。

## 5. 出版前的人工门槛

1. 对照 `manifest/pages.json` 和扫描图核对原文、缺页、错序及工作带重叠。
2. 裁决所有关键 `【存疑:…】`；保留无法裁决之处的说明。
3. 标明底本、参校本、整理责任与版本，不能把模型推断当作底本文字。
4. 编辑章节、目录、封面与样式，检查 EPUB 在实际阅读器中的图文尺寸和阅读顺序。
5. 记录原始来源的版权及授权状态，再决定是否发布。

## 6. 与 RTP 的关系

RPP 管一本书如何加工与交接；RTP 管一篇转译文本如何表达。逐带 OCR 稿 `.md` 不自动等同 RTP `.rt`。当编辑完成转译、校注和元信息后，可生成 `.rt` 并用 `rivertype validate` 检查结构。
