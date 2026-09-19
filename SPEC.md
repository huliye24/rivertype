# RiverType Spec · 书目录格式规范 v1

RiverType 把「从扫描件到成书」固定为一种可复现的工程格式。本规范定义这个格式的全部要素：书目录、book.yaml、溯源清单、转录稿纪律、核验流程、校勘记。

设计目标：

1. **可复现**——同样的输入 + 同样的命令，得到同样的中间产物和成品
2. **可溯源**——成书里任何一句话都能追回扫描件上的坐标
3. **可协作**——人、AI 编码代理、视觉模型可以在任何环节互换接手
4. **零成本起步**——不申请任何 API key 也能跑完全流程（manual 引擎）

---

## 1. 书目录

一本书 = 一个目录。所有命令的工作单元都是它，判断标志是根下有 `book.yaml`。

```text
mybook/
├── book.yaml        书目配置（必需，唯一的状态源）
├── scans/           底本扫描 PDF          —— 证据层，永不修改
├── pages/           render 产出的整页 PNG —— 第一层派生物
├── bands/           上下半页工作带 PNG    —— 转录最小工作单元
├── manifest/        pages.json 溯源清单
├── transcript/      转录稿（一工作带一个 .md）
│   └── _queue.md    工作队列（manual 引擎生成）
├── verify/          存疑放大裁片 + verify.md 核验清单
├── manuscript/      组装后的排版工程
│   ├── chapters/    章节 Markdown（00-cover、01-body、99-colophon …）
│   ├── style.css    主题样式（assemble 复制）
│   └── vivliostyle.config.js
├── theme/           （可选）书私有的自定义主题
├── output/          成品 EPUB / PDF
```

层与层的依赖是单向的：`scans → pages → bands → transcript → manuscript → output`。任何派生层都可以整目录删除后由上游重新生成，`scans/` 是唯一不可再生的原始证据。

## 2. book.yaml

```yaml
title: 金丹四百字解四种
author: （宋）张伯端 原著 ·（清）刘一明 解注
language: zh-Hans
size: A5
description: 可选的一句话描述
source_pdf: scans/底本.pdf

render:
  dpi: 200            # 整页渲染精度
  band_overlap: 0.08  # 上下半带重叠比例，防跨带断行丢字

transcribe:
  engine: manual      # manual | anthropic | openai | ollama
  model: ""           # 覆盖引擎默认模型
  prompt_file: ""     # 自定义转录提示词

build:
  theme: guji-dark    # 内置主题名 / theme/ 下目录 / 含 style.css 的路径
  format: epub        # epub | pdf
  output: ""          # 成品文件名，默认取 title

collate:
  reference: ""       # 通行本/参照本 md 路径，填了才能跑 collate
```

规则：

- 缺省字段一律回退到 CLI 内置默认值；`book.yaml` 只写需要偏离默认的项
- `book.yaml` 是人工可读可编辑的唯一状态源——不用隐藏数据库、不写锁文件
- 各阶段断点续作靠目录内容判断（transcript 已存在的跳过、verify 只统计未裁决条目），不靠额外状态文件

## 3. manifest/pages.json · 溯源清单

`render` 的产物，是 bands 与 pages 之间唯一的位置凭证：

```json
{
  "version": 1,
  "dpi": 200,
  "zoom": 2.7778,
  "books": [
    {
      "pdf": "scans/底本.pdf",
      "pages": [
        {
          "page": 1,
          "image": "pages/底本_p01.png",
          "size": [1414, 2000],
          "bands": [
            { "key": "p01_a", "image": "bands/底本_p01_a.png", "bbox": [0, 0, 1414, 1080] },
            { "key": "p01_b", "image": "bands/底本_p01_b.png", "bbox": [0, 920, 1414, 2000] }
          ]
        }
      ]
    }
  ]
}
```

要点：

- 相邻半带刻意重叠（`band_overlap`），保证跨带一行完整出现在至少一个带里
- `bbox` 是整页坐标系内的 `[x0, y0, x1, y1]`，永远可以从 `pages/` 整页图复原裁片
- 多个 PDF 可以共存于一个书目录（合册、附录件），manifest 用 `books` 数组容纳

## 4. transcript/ · 转录稿纪律

一工作带一个 Markdown 文件，文件名 = 带 PNG 的 stem：

```text
bands/底本_p03_a.png  →  transcript/底本_p03_a.md
```

转录纪律（CLI 默认提示词即按此写成，manual 队列与视觉模型共用）：

1. **照录、不径改**——底本原文一字不易。明显讹字、避讳字、俗体字一律照录，改动属于校勘阶段的事
2. **可疑之字标【存疑：说明】**——凡看不清、认不准、两可之处，写在原文位置，内嵌说明。例如：`真土擒【存疑：此字左旁漫漶，形近「摛」】真铅`
3. **异文夹注一并照录**——底本自带的括注、小字旁注原样保留，不并入正文
4. **连续段落**——被带边界切断的文句不重录、不补省略号；band 重叠区已保证完整性
5. **残缺标注**——页首/页尾物理残缺处写【页首残缺】/【页尾残缺】
6. **只输出文本**——不加评论、不加翻译、不加"整理者按"

转录稿正文之前可以写 YAML front matter（引擎、模型、转录人、时间），assemble 会忽略它。

`transcript/_queue.md` 是 manual 引擎生成的工作队列：每个带一个 `- [ ]` 条目。人或 AI 编码代理逐条领取：读带图 → 写转录稿 → 勾掉条目。这个设计让转录天然成为一个人机协作的任务清单，而不是一次性的 API 调用。

## 5. verify/ · 存疑核验

`verify` 扫描全部转录稿中的【存疑：…】标记：

- 每处存疑生成对应带图的放大裁片（默认 2×）→ `verify/<带stem>.png`
- 汇总生成 `verify/verify.md` 核验清单，每条存疑一个 `- [ ]` 条目

裁决流程：对照放大裁片确认原文 → 回转录稿把【存疑：…】替换为定稿文字 → 勾掉清单条目。全部裁决后，`assemble` 的校记坯会显示「核验清单已全部裁决」。

原则：**存疑是资产，不是瑕疵。** 一条转录稿带着显式的存疑标记，比一份看起来干净的错误转录稿有价值得多——前者可核验，后者污染下游。

## 6. manuscript/ · 排版工程

`assemble` 把 transcript 按 manifest 带序合并为 `chapters/01-body.md`（母稿坯）：

- 每带正文前写一行溯源注释：`<!-- band:p03_a page:3 -->`
- 注释是人和 AI 编辑的结构锚点，编辑分章、分段、加标题时以它对位；成品渲染时它是合法 HTML 注释，不进入正文
- 同时生成 `00-cover.md`（书目元数据）与 `99-colophon.md`（版本说明 + 校记坯）
- 主题 style.css 复制入 manuscript；vivliostyle 配置以 ESM 形式生成

`01-body.md` 是母稿坯，不是成品章节。段一级的编目——序、卷、篇、章、跋——由人或 AI 编辑完成。这是流水线中唯一不强求自动化的环节，也是编辑的判断力所在。

## 7. 校勘记

`collate --reference 通行本.md` 把底本转录稿与通行本逐字比对（difflib 字级 opcodes），产出 `manuscript/校勘记.md`：

- 异文：`底本作「X」，通行本作「Y」`
- 底本多字：`通行本无「X」`
- 底本缺字：`通行本有「X」，底本无`
- 每条附上下文句，便于人工判断

校勘记是初稿：取舍权在整理者。它与 verify 清单共同构成一份古籍整理的学术凭据。

## 8. 版本

- 本规范版本：v1（随 RiverType CLI 0.1.x）
- `manifest` 带 `"version": 1` 字段，未来不兼容变更递增
