# guji-book · 古籍转译书模板

RiverType 古籍转译流水线的书目录模板。复制这个目录、把扫描 PDF 放进 `scans/`，就是一本书工程的起点。

## 目录约定

```text
guji-book/
├── book.yaml        书目配置（标题、著者、引擎、主题、输出格式）
├── scans/           底本扫描 PDF（原始证据层，永不修改）
├── pages/           render 产出的整页 PNG
├── bands/           render 切出的上下半页工作带（转录的最小工作单元）
├── manifest/        pages.json 溯源清单（每带记录页面与坐标）
├── transcript/      转录稿，一工作带一个 .md（存疑处标【存疑：…】）
├── verify/          存疑放大裁片 + 核验清单
├── manuscript/      组装后的排版工程（章节、样式、vivliostyle 配置）
└── output/          成品 EPUB / PDF
```

## 用法

```bash
cp -r examples/guji-book mybook && cd mybook
# 把扫描 PDF 放入 scans/，改 book.yaml 里的 source_pdf

pip install -e cli
rivertype render                 # PDF -> 整页图 + 工作带 + 溯源清单
rivertype transcribe             # 生成 transcript/_queue.md 工作队列
#   人或 AI 编码代理逐带读 bands/*.png，写入 transcript/<带名>.md
rivertype verify                 # 存疑处生成放大裁片，逐条裁决
rivertype assemble               # 合并成 manuscript/ 排版工程
#   编辑 manuscript/chapters/01-body.md 成正式章节结构
rivertype build                  # 需要 npm i -g @vivliostyle/cli
```

## 转录纪律（默认提示词内置）

1. **照录、不径改**——底本原文一字不易，明显讹字也照录，另记校勘
2. **可疑之字标【存疑：说明】**——核验阶段生成放大裁片逐条裁决
3. **异文夹注一并照录**——底本原有括注、旁注原样保留
4. 每条转录稿都通过溯源注释绑定回扫描件坐标，任何一句都能追回原图

## 首次实战

本模板的配置取自首个完整实战：刘一明《金丹四百字解》四种合册（11 页扫描件 → EPUB），主题 `guji-dark` 即在该工程中定型。
