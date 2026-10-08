# RiverType Studio 0.1 · 自动化验收报告

> 本文件由 `npm run studio:verify` 生成并同步。
> 验收现场（截图、PDF、页图、导出的工程目录）在 `studio-out/<时间戳>/`，该目录不入库。
>
> - 复现：`npm run build && npm run studio:verify`
> - 前提：全局安装 `@vivliostyle/cli`；Python 侧需 `pymupdf` 与 `opencv-python`（做 PDF 取证）

## 这一版验的是什么

不是「代码里看起来是这样」，而是三次独立取证：

| 取证层 | 手段 | 证明什么 |
| --- | --- | --- |
| 浏览器 | Playwright 驱动真实 Chrome，走真实 Studio 界面 | 三栏工作区、A4 画布、块结构、安全区标线、占位标注确实存在 |
| 成品 PDF | Vivliostyle 排版 → PyMuPDF 逐页检查 | 页数、210×297mm、文字层、嵌入字体、越界、页图 |
| 成品里的二维码 | OpenCV 对 300dpi 渲染页做**独立解码** | 自写 QR 编码器是对的——用别人的解码器读，而不是读回自己的数据结构 |

---

# 报告正文

- 生成时间：2026-10-08T10:29:28.076Z
- 环境：Node v22.22.2 · win32 x64
- 结果：**54/54 通过** · 全部通过

## A. 构建产物

| 检查项 | 结果 | 实测 |
| --- | --- | --- |
| dist/studio.html 存在 | PASS | Studio 入口已构建 |
| dist/index.html 存在 | PASS | legacy 入口已构建 |
| dist 中包含 Studio 资源 | PASS | 静态资源目录已生成 |

## B. 环境

| 检查项 | 结果 | 实测 |
| --- | --- | --- |
| 排版服务在线 | PASS | vivliostyle 11.3.3 |
| vite preview 就绪 | PASS | http://localhost:4173 已响应 |

## C. Studio 工作区

| 检查项 | 结果 | 实测 |
| --- | --- | --- |
| Studio 挂载成功 | PASS | window.__rivertypeStudioReady = true |
| 三栏结构完整 | PASS | {"left":1,"center":1,"right":1} |
| 演示项目已载入 | PASS | 文川 · 第一号：花开时节 · 2 页 |
| 必备块类型齐备 | PASS | 已覆盖：title、poem、body、image、caption、header、footer、nfc |
| 画布渲染出内容块 | PASS | 6 个块节点 |
| 正反面切换可用 | PASS | 每页单独渲染：1/1 |

## D. 版面与打印标线

| 检查项 | 结果 | 实测 |
| --- | --- | --- |
| 打印安全区/出血标线存在 | PASS | {"safe":1,"bleed":1,"center":1} |
| 两页均无溢出 | PASS | 正面（封面）: 0.00mm |
| 画布为 A4 实际比例 | PASS | 画布 130.2×184.1mm（未缩放基准） |
| 缺失素材显式标注 | PASS | 版面上 1 个可见占位框，项目登记 2 项占位素材 |
| 截图已产出 | PASS | 工作区 / 正面 / 背面 |

## E. 二维码备用入口

| 检查项 | 结果 | 实测 |
| --- | --- | --- |
| 版面生成二维码（结构） | PASS | viewBox 0 0 140 140，path 3312 字符 |
| 二维码指向 NFC 地址 | PASS | 目标 https://rivertype.press/wenchuan/01（真解码断言在 F2 用 OpenCV 对成品 PDF 执行） |

## F. PDF 成品（Vivliostyle）

| 检查项 | 结果 | 实测 |
| --- | --- | --- |
| 打印 HTML 自包含 | PASS | 15 KB，页面尺寸写死在 @page 中 |
| 打印 HTML 不含编辑辅助线 | PASS | 成品上不会印出标线 |
| PDF 生成成功 | PASS | 300.0 KB，引擎 vivliostyle 11.3.3 |

## F2. PDF 取证（PyMuPDF）

| 检查项 | 结果 | 实测 |
| --- | --- | --- |
| 页面数量 | PASS | 实际 2 页，期望 2 页 |
| 页面尺寸 210×297mm | PASS | p1: 210.0×297.0mm✓；p2: 210.0×297.0mm✓ |
| 存在文字层（可选中） | PASS | p1: 93 字；p2: 374 字 |
| 源文关键串齐全 | PASS | 全部命中 |
| 字体清单 | PASS | STSong（宋体）＋ Microsoft YaHei（黑体）＋ Arial，均已子集嵌入 |
| 内容图片有效 DPI ≥ 200 | PASS | 本成品无内容位图（占位框与二维码均为矢量） |
| 页面底色图层已识别 | PASS | Chromium 将页面背景压成整页位图：p1、p2 各 596×842px。仅背景受影响，文字与矢量图形不受影响 |
| 内容未越界（无裁切） | PASS | 全部内容在页面内 |
| 页图渲染（150dpi） | PASS | page-01.png / page-02.png，1241×1754 |
| 二维码为矢量图形 | PASS | 第 2 页找到 888 条子路径的填充路径，21.5×21.5mm |
| 二维码解码回读（OpenCV） | PASS | 第 2 页 300dpi 渲染后解码得到「https://rivertype.press/wenchuan/01」，与期望一致 |
| PDF 取证脚本执行 | PASS | 退出码 0 |

### 关于「页面底色图层」

Chromium 打印时会把页面背景（含 CSS 渐变）压成一张与页面等大的位图。
这是浏览器行为，不是本项目的排版方式。需要分清的是：

- **背景**被栅格化（96dpi，纯色与条纹，印刷上无影响）；
- **文字**是矢量、可选中、可检索；
- **二维码**是 888 条子路径的矢量路径，印刷上无限清晰。

若做真正的胶印，纸色应来自纸张本身而不是 PDF 底色；这一点在 RSP-0.1 的边界说明中已写明。

## G. 移动版网页

| 检查项 | 结果 | 实测 |
| --- | --- | --- |
| 移动版生成 | PASS | 8 KB |
| 移动版 · 音频占位 | PASS | 命中 |
| 移动版 · 短片占位 | PASS | 命中 |
| 移动版 · 二维码 | PASS | 命中 |
| 移动版 · NFC地址 | PASS | 命中 |
| 移动版 · 同源正文 | PASS | 命中 |
| 移动版渲染出占位卡 | PASS | 4 处可见占位 |

## H. 可版本化项目格式

| 检查项 | 结果 | 实测 |
| --- | --- | --- |
| .rtsz 打包成功 | PASS | 14.2 KB |
| 包含 project.json | PASS | project.json, content/b-foreword.md, README.txt |
| 正文外置为 Markdown | PASS | content/b-foreword.md |
| 含格式说明 README | PASS | 共 3 个条目 |
| project.json 可解析 | PASS | rsp 0.1，2 页 |
| 正文可脱离 Studio 编辑 | PASS | 1 个正文文件，152 字 |
| 仓库内示例与本次导出一致 | PASS | studio/projects/wenchuan-01/ 与导出结果结构相同 |
| 保存 → 重开往返一致 | PASS | 页 2/2，块 15/15，正文字数 315/315 |
| 重开后 NFC 地址保持 | PASS | https://rivertype.press/wenchuan/01 |

## I. legacy 兼容（审计缺口的回归证明）

| 检查项 | 结果 | 实测 |
| --- | --- | --- |
| legacy 编辑器仍可用 | PASS | header/editor 存在，工具栏 7 个按钮，脚本错误 0 个 |
| legacy /api/render 有服务可用 | PASS | 返回含源文的 HTML |
| legacy /api/export/pdf 有服务可用 | PASS | 返回合法 PDF，39723 字节 |
| legacy PDF 体积合理 | PASS | 18002 字节 |
| Studio 无脚本错误 | PASS | 控制台干净 |

---

## 已知边界（不在本期验收范围）

| 事项 | 说明 |
| --- | --- |
| 演示 NFC 地址 | `https://rivertype.press/wenchuan/01` 是**演示地址**，写入真实 NFC 标签前必须替换。版面上已印出这句提醒。 |
| 素材占位 | 封面艺术图、内页插画、主题曲、纪录短片均为显式占位，未使用任何替代素材。 |
| A3 / 多页杂志 | 按 issue 约定，A4 验收通过后再评估。 |
| 图片裁切、字体网格、AI 排版建议 | P2/P3，本期未实现；撤销/恢复已实现（Ctrl+Z / Ctrl+Shift+Z）。 |
