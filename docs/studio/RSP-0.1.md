# RSP 0.1 · RiverType Studio 项目格式

> 一份能在 git 里出 diff 的出版工程，而不是一堆导出的位图。

RSP（RiverType Studio Project）规定 RiverType Studio 的工作单元长什么样。
它的设计目标只有一个：**让「版式」成为可版本化的结构化数据，让「文字」保持可编辑。**

---

## 1. 三条纪律

1. **整页永不栅格化。** 版面上每一个字都是活文本节点。任何"把页面导成图再排版"的方案都不属于 RSP。
2. **正文存 Markdown。** 长文正文落在 `content/<块id>.md`，可以脱离 Studio、用任意编辑器修改。
3. **缺失素材必须显式登记。** 状态为 `placeholder` 的素材不会被伪造成图片，成品上会留下可见占位框。

---

## 2. 规范目录形式

```text
<name>/
├── project.json        结构化项目（唯一状态源）
├── content/<块id>.md    正文长文，纯 Markdown
├── assets/<文件名>      图片原件，按原始字节存放
└── README.txt          由 Studio 生成的格式说明
```

目录可以整包交给 git：`project.json` 出结构化 diff，`content/*.md` 出行级文本 diff，
`assets/` 出二进制。这是这套格式存在的全部理由。

---

## 3. 单文件 `.rtsz`

把上面的目录打包成一个 ZIP（store，不压缩），扩展名 `.rtsz`。

- 用系统解压工具打开，得到的就是第 2 节的目录。
- 在 Studio 里「保存 / 打开」用的就是这个单文件。
- 压缩方式为 store，所以出问题时 `unzip -l` 就能看清结构；
  读取端同时兼容 deflate，便于用普通压缩工具重新打包后读回。

---

## 4. project.json

```jsonc
{
  "rsp": "0.1",
  "meta": {
    "title": "文川",
    "issue": "第一号：花开时节",
    "author": "文川编辑部 编",
    "publisher": "文川（演示项目）",
    "date": "2026 年春",
    "language": "zh-Hans",
    "description": "……",
    "nfcUrl": "https://rivertype.press/wenchuan/01",
    "qrFallback": true
  },
  "print": {
    "size": "A4",
    "widthMm": 210,
    "heightMm": 297,
    "bleedMm": 3,     // 出血
    "safeMm": 12      // 安全区：自裁切边内缩
  },
  "pages": [
    {
      "id": "p1",
      "label": "正面（封面）",
      "side": "front",
      "background": "#ffffff",
      "blocks": [ /* 见第 5 节 */ ]
    }
  ],
  "assets": [
    {
      "id": "img…",
      "name": "cover-art.png",
      "mime": "image/png",
      "status": "placeholder",
      "missing": "封面艺术图未提供，请替换为经授权的原始图像"
    }
  ],
  "media": [
    {
      "id": "aud…",
      "kind": "audio",
      "title": "主题曲《花开时节》",
      "description": "",
      "src": "",
      "status": "placeholder",
      "missing": "音频尚未提供，需替换为已授权母带文件"
    }
  ]
}
```

字段规则：

| 字段 | 规则 |
| --- | --- |
| `rsp` | 恒为 `"0.1"`；不兼容变更时递增 |
| `print.size` | 固定 `"A4"`；`widthMm/heightMm` 冗余写出，便于校验 |
| `assets[].status` | `provided`（有字节）或 `placeholder`（无字节，必须填 `missing`） |
| `assets[].data` | 只在内存与导出 payload 中出现；落盘时二进制放到 `assets/` |
| `media[].kind` | `audio` \| `video`；仅用于移动版 |
| `media[].src` | 外部地址；`placeholder` 时为空，且不得填示例链接 |
| `meta.nfcUrl` | 必须是长期稳定 HTTPS 地址；为空时成品上会明确印出「未填写」 |

---

## 5. 内容块

```jsonc
{
  "id": "b-foreword",
  "type": "body",
  "text": "",                                  // 外置到 content/<id>.md 后此处为空
  "contentFile": "content/b-foreword.md",
  "assetId": "",
  "alt": "",
  "placeholder": false,
  "placeholderNote": "",
  "hidden": false,
  "style": { /* 见下 */ }
}
```

### 块类型

| type | 用途 | 主要字段 |
| --- | --- | --- |
| `title` | 书名 / 篇名 | `text` |
| `poem` | 诗歌（按行断句） | `text`，每行一句 |
| `body` | 正文 | `text`（Markdown），落盘外置 |
| `image` | 图片 | `assetId`、`alt` |
| `caption` | 图注 / 说明 | `text` |
| `header` | 页眉 | `text` |
| `footer` | 页脚（自动贴页底） | `text` |
| `nfc` | NFC / 二维码占位块 | `text` + `meta.nfcUrl` |
| `rule` | 分隔线 | — |

### 版式属性

```jsonc
"style": {
  "align": "justify",        // left | center | right | justify
  "size": 10.5,              // pt
  "lineHeight": 1.85,
  "letterSpacing": 0,        // em
  "weight": 400,
  "color": "#1a1a1a",
  "font": "song",            // song | kai | hei | sans
  "marginTop": 0,            // mm
  "marginBottom": 4,         // mm
  "width": 100,              // 内容区宽度百分比
  "offsetX": 0,              // 水平微调 mm
  "vertical": false,         // 竖排
  "columns": 1,              // 分栏（正文）
  "opacity": 1,
  "fullBleed": false         // 图片铺满成品、忽略安全区
}
```

缺省值由块类型决定（见 `src/studio/model.ts` 的 `defaultStyle`），
`project.json` 只写需要偏离默认的项 —— 与 `book.yaml` 的约定一致。

---

## 6. 从 RSP 到成品

```text
project.json + content/*.md + assets/
        │
        │  src/studio/render.ts   —— 画布、PDF、移动版共用同一个渲染器
        ▼
   分页 HTML（@page size: 210mm 297mm; margin: 0；图片内联为 data URL，自包含）
        │
        ├── Vivliostyle CLI  →  output/*.pdf（页面数 = .page 元素数，可断言）
        └── 同一份内容        →  *-mobile.html（含音频 / 短片占位与二维码备用入口）
```

**页面尺寸写死在 CSS 里，不在命令参数里。** 于是「恰为 2 页 A4」是一条可被
`npm run studio:verify` 断言的事实，而不是一个需要祈祷的结果。

---

## 7. 与 RTP / RPP 的关系

RSP **不替代** RTP 或 RPP，也**不触碰**古籍溯源机制：

| 协议 | 管什么 | 工作单元 |
| --- | --- | --- |
| RTP | 一段古籍转译的文本结构 | `.rt` 文件 |
| RPP | 扫描 → 成书的目录与命令 | 书目录（含 `book.yaml`） |
| **RSP** | 一份**已定稿文本**的印刷版面 | Studio 项目目录 |

从 RTP 走到 RSP 的路径是「人已经校勘定稿」那一步之后的事：
Studio 负责让定稿的文字变成可印的版面，不参与考订、不改动原文、不产生新的版本判断。

---

## 8. 校验

`npm run studio:verify` 会实际断言：

- 页数与物理尺寸（210 × 297 mm，容差 0.5 mm）
- 存在文字层，且源文关键串全部命中（即文字可选中、未丢字）
- 嵌入字体清单（含中文字体）
- 图片按放置矩形反推的有效 DPI
- 内容未越界、未裁切
- 版面二维码在成品 PDF 上被独立解码器（OpenCV）回读且与 `meta.nfcUrl` 一致
- 保存 → 重开往返不丢信息

报告见 [STUDIO-0.1-REPORT.md](./STUDIO-0.1-REPORT.md)。
