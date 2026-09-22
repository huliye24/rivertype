# RiverType 品牌与界面资产

以原有「龙行于河」标志为唯一识别核心，扩展为横版、头像、应用图标和社交封面。品牌气质取自古籍、朱砂印色、墨色与水纹，但界面优先保证阅读与操作的清晰度。

## 资产

| 文件 | 尺寸 | 用途 |
| --- | --- | --- |
| `assets/github-header.png` | 1600 × 480 | GitHub README 顶图、宽屏横幅 |
| `assets/lockup-dark.png` | 1600 × 440 | 深色背景横版品牌组合 |
| `assets/lockup-light.png` | 1600 × 440 | 浅色背景横版品牌组合 |
| `assets/social-card.png` | 1200 × 630 | 社交分享预览图 |
| `assets/avatar.png` | 1024 × 1024 | 社交头像、仓库组织头像 |
| `assets/app-icon.png` | 512 × 512 | 应用与文档图标 |
| 同名 `.svg` | 同上 | 可缩放排版源文件 |
| `assets/river-texture.png` | 原生尺寸 | 横幅背景纹理 |

SVG 内嵌原始位图标志，并非纯路径矢量。这样可保持原龙纹不被重新描摹或改形。需要印刷级纯矢量时，应另行人工描摹、校对并征得品牌方确认。

## 基础规范

- 墨色 `#111715`：主背景和深色 UI；纸色 `#F8F5ED`：阅读背景。
- 朱砂 `#8F101C`：主操作与强调；古金 `#B4975D`：装饰线与小面积强调。
- 正文 `#202B28`，次级文字 `#66736D`；长篇正文避免使用朱砂或金色。
- 图标四周至少保留其直径的 12% 留白；横版组合至少保留标志直径的 15% 外边距。
- 不拉伸、不旋转、不重绘龙纹；不要在复杂照片上直接叠加没有衬底的标志。
- 深色和浅色横版的文字均与背景成组使用，不建议拆去背景后直接复用。

## UI 套件

打开 [showcase.html](showcase.html) 查看导航、按钮、卡片、状态、输入框与出版流程示例。`ui.css` 提供可直接复用的设计 token 和组件样式。界面样例是设计展示，不代表 CLI 已提供 Web 应用。

## 再生成

在仓库根目录运行 `node brand/build-assets.mjs` 重建 SVG。PNG 是从同名 SVG 渲染导出。原标志来自 `logo/logo.jpg`，不要在资产脚本中替换成 AI 猜测版。

横幅背景使用内置图像生成工具制作，提示词为：

> Wide cinematic 3:1 abstract field inspired by classical Chinese book arts: near-black ink ground, restrained deep cinnabar red, aged gold fine river currents flowing horizontally across the lower third, subtle paper grain and engraved-line texture, generous uncluttered negative space in the center and upper half. No dragon, no circular emblem, no characters, no letters, no words, no watermark.
