<p align="center">
  <img src="brand/assets/github-header.png" alt="RiverType · 古籍转译与出版协议" width="100%" />
</p>

# RiverType · AI 原生古籍出版协议与 CLI

> 一条河，字字皆舟。

RiverType 把中国古籍从扫描底本转成可核验、可编辑、可出版的 EPUB。它提供两层约定：**RTP** 规定一段古籍转译的结构，**RPP** 规定一本书的文件目录、阶段产物与 Agent 调用方式。CLI 执行 OCR 辅助、存疑核验、校勘、二次排版和构建。

[出版流程协议 RPP](docs/protocol/RPP-0.1.md) · [转译文本协议 RTP](docs/protocol/RTP-0.1.md) · [书目录规范](SPEC.md) · [CLI 说明](cli/README.md) · [示例书](examples/guji-book/)

[品牌标志与 UI 组件](brand/README.md)

## 当前能力

| 阶段 | CLI | 输入 → 产物 |
| --- | --- | --- |
| 建书 | `init` | 书目 → `book.yaml` 与目录 |
| 扫描拆页 | `render` | PDF → `pages/`、`bands/`、`manifest/pages.json` |
| 图像预处理 | `preprocess` | 页图 → `preprocessed/`（可选） |
| OCR / 视觉转录 | `transcribe` | 工作带 → `transcript/*.md` 或人工队列 |
| 存疑核验 | `verify` | 标记 → 放大裁片与核验清单 |
| 文本校勘 | `collate` | 底本与参照本 → 校勘记草稿 |
| 二次排版 | `assemble` | 转录稿 → `manuscript/` 与 Vivliostyle 工程 |
| 出版构建 | `build` | 排版工程 → EPUB / PDF |
| 协议校验 | `validate` | `.rt` → RTP 诊断与退出码 |

`transcribe` 支持人工队列、Anthropic、OpenAI 和本地 Ollama 视觉模型。AI 的识别结果只是待核稿；底本图像、存疑标记和校勘记录始终保留。`preprocess` 是可选图像辅助，目前不会自动替换 `transcribe` 所读的工作带。

## 快速开始

环境：Python 3.10+；构建 EPUB / PDF 还需 Node.js 与 Vivliostyle CLI。

```bash
python -m pip install -e ./cli
npm install -g @vivliostyle/cli

rivertype capabilities --json
rivertype init mybook --title "道德经" --author "老子"
# 将合法可处理的扫描 PDF 放入 mybook/scans/
rivertype render mybook
rivertype transcribe mybook --engine manual
rivertype status mybook --json
```

人工或 Agent 按 `transcript/_queue.md` 逐带读取 `bands/*.png`，把照录文本写入同名 `.md`；随后运行：

```bash
rivertype verify mybook
rivertype assemble mybook
# 编辑 mybook/manuscript/chapters/01-body.md 的章节结构、书名页与校记
rivertype build mybook
```

视觉模型需另装相应可选依赖，例如 `python -m pip install -e './cli[openai]'`；图像预处理需 `python -m pip install -e './cli[preprocess]'`。使用模型前须配置对应服务的凭据或本地 Ollama。完整参数见 `rivertype --help` 与 [CLI 说明](cli/README.md)。

## Agent 接口

`rivertype capabilities --json` 返回支持的命令、协议版本和格式；`rivertype status <book> --json` 返回阶段产物数量与建议的 `next_action`。二者输出 UTF-8 JSON，适合作为 Agent 的发现与续作入口。其他命令以退出码表示成功或失败，产物落在书目录，暂不承诺机器可解析的标准输出。

```text
book.yaml → scans/ → pages/ + bands/ → transcript/ → verify/
                                             ↓
                                manuscript/ → output/*.epub
```

一本书是一个含 `book.yaml` 的目录。`scans/` 保存原始证据；`manifest/pages.json` 记录页图与工作带坐标；`transcript/` 保存逐带照录与存疑；`manuscript/` 是可二次编辑的排版工程。详见 [RPP-0.1](docs/protocol/RPP-0.1.md)。

## 仓库结构

```text
cli/                  Python CLI、内置主题与测试
docs/protocol/        RTP 文本协议、RPP 出版流程协议
docs/prompts/         分步转译提示词
examples/             .rt 示例与书项目模板
logo/                 RiverType 标志
themes/               外置主题示例
SPEC.md               书目录与溯源规范
output/               本地生成物（Git 忽略）
```

仓库还保留 Web、Go 与 TypeScript 早期原型；当前维护的出版主线是 `cli/`。项目仍处于协议草案阶段，古籍识别、校勘结论和出版质量需要人工复核。

## 协议与贡献

- [RTP-0.1](docs/protocol/RTP-0.1.md)：单篇 `.rt` 的原文、断句、异文、校注、白话译等区段。
- [RPP-0.1](docs/protocol/RPP-0.1.md)：从底本扫描到 EPUB 的目录、命令与 Agent 交接规则。
- [设计说明](DESIGN.md) · [路线图](ROADMAP.md) · [贡献指南](CONTRIBUTING.md)

CLI 包元数据当前声明 MIT；正式许可证文本尚待仓库维护者确认并加入。
