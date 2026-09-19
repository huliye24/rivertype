# RiverType CLI

从扫描件到成书的出版流水线。工作单元是一本书目录（含 `book.yaml`）。

```bash
pip install -e cli          # 或 pip install rivertype-cli
rivertype --help
```

## 六段流水线

```text
scans/*.pdf
  └─ rivertype render      -> pages/ + bands/ + manifest/pages.json（溯源清单）
        └─ rivertype transcribe  -> transcript/*.md（存疑标【存疑:…】）
              └─ rivertype verify -> verify/（放大裁片 + 核验清单）
                    └─ rivertype assemble -> manuscript/（章节 + 主题 + vivliostyle 配置）
                          └─ rivertype build -> output/*.epub / *.pdf
  （并行）rivertype collate --reference 通行本.md -> manuscript/校勘记.md
```

每段独立可跑、可断点续作：render 跳过已有清单、transcribe 跳过已有转录稿、verify 只统计未裁决条目。

## 快速开始

```bash
rivertype init mybook --title "金丹四百字解四种" --author "（清）刘一明 解注"
cd mybook
# 把扫描 PDF 放进 scans/
rivertype render
rivertype transcribe          # manual 引擎：生成 transcript/_queue.md 工作队列
#   人或 AI 编码代理逐带读 bands/*.png，写入 transcript/<band>.md
rivertype verify              # 生成存疑裁片，逐条裁决
rivertype assemble            # 编辑 manuscript/chapters/01-body.md 成正式章节
rivertype build               # 需要 npm i -g @vivliostyle/cli
```

## 转录引擎

`transcribe --engine`：

| 引擎 | 说明 | 依赖 |
|------|------|------|
| `manual`（默认） | 不调 API：生成工作队列，由人或 AI 编码代理读图转录 | 无 |
| `anthropic` | Claude 视觉转录 | `pip install rivertype-cli[anthropic]` |
| `openai` | GPT-4o 系视觉转录 | `pip install rivertype-cli[openai]` |
| `ollama` | 本地多模态模型（qwen2.5vl 等） | 本机 Ollama |

转录纪律内置于默认提示词：**照录、不径改；可疑之字标【存疑:…】；异文夹注一并照录。**
自定义提示词放 `prompt.txt`，在 book.yaml 指定 `transcribe.prompt_file`。

## book.yaml

```yaml
title: 金丹四百字解四种
author: （宋）张伯端 原著 ·（清）刘一明 解注
language: zh-Hans
size: A5
source_pdf: scans/书.pdf
render:   { dpi: 200, band_overlap: 0.08 }
transcribe: { engine: manual }
build:    { theme: guji-dark, format: epub }
collate:  { reference: 参照/通行本.md }
```

## 主题

内置 `guji-dark`（古卷·玄色：深色古卷、金色经文，源自文川院古籍转译工程）。
自定义主题：含 `style.css` 的目录，放书目录 `theme/<name>/`，或任意路径传给 `build.theme`。
