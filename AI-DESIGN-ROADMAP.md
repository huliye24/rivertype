# 图片驱动的 AI 设计方案 - 技术路线图

## 核心思路

用 Gemini 生成「设计示意图」作为预览，再用 Vision 分析提取设计规范，最后生成可应用的 CSS。用户的体验从「看参数列表」变成「看效果图」。

## 现状对比

```
现有流程:
用户描述 → GPT-4o 直接生成 CSS 参数 → 用户选择应用

新流程:
用户描述 → Gemini 生成设计图 → 用户看图选方案 → Vision 提取 CSS → 应用
```

---

## Phase 1：后端集成

### 1.1 新增两个 API 端点

#### POST /api/ai/generate-design-image

- **输入**: `{ description: string, style_hints?: string }`
- **输出**: `{ image_base64: string, design_notes: string }`
- **功能**: 调用 Gemini 图片生成，生成一张「排版设计示意图」

#### POST /api/ai/analyze-design-image

- **输入**: `{ image_base64: string, design_type: "dark" | "light" | "mixed" }`
- **输出**: `{ colors: {...}, typography: {...}, css: string }`
- **功能**: 调用 Gemini Vision 分析图片，提取设计规范并生成 CSS

### 1.2 技术选型

| 组件 | 选型 | 理由 |
|------|------|------|
| 图片生成模型 | `gemini-3.1-flash-image-preview` | 2025年10月发布，支持2K分辨率，文本渲染准确，支持对话式编辑 |
| 图片分析模型 | `gemini-2.0-flash` (Vision) | 已有的向量引擎 API 路径，继续复用 |
| SDK | `google.golang.org/genai` | Google 官方 Go SDK |
| API | REST via Google AI API | 简单直接，不引入额外依赖 |

### 1.3 关键 Prompt 设计

#### 生成设计图 Prompt（设计示意图）

```
创建一个 Markdown 文章排版设计示意图。
要求：
- 包含标题、正文段落、代码块、引用块、表格等元素的视觉展示
- 展示清晰的字体层次（标题、正文、代码）
- 配色要协调，背景与文字对比度要适合阅读
- 文字不需要完全可读，但风格方向要清晰表达
- 宽高比 16:9，分辨率 1K
- 不要生成中文内容，用英文 placeholder 文字即可
- 设计要现代、美观、有特色，不能是平庸的默认样式
```

#### 分析设计图 Prompt（提取设计规范）

```
分析这张设计示意图，提取排版设计规范。

请提取并返回严格 JSON 格式：
{
  "colors": {
    "background": "#RRGGBB",
    "text": "#RRGGBB",
    "heading": "#RRGGBB",
    "link": "#RRGGBB",
    "code_bg": "#RRGGBB",
    "blockquote_border": "#RRGGBB",
    "table_border": "#RRGGBB"
  },
  "typography": {
    "heading_font": "CSS font-family string",
    "body_font": "CSS font-family string",
    "code_font": "CSS font-family string",
    "base_size": "16px",
    "line_height": "1.8"
  },
  "spacing": {
    "paragraph_margin": "1em 0",
    "section_margin": "1.5em 0"
  }
}

注意：
- 只返回 JSON，不要有任何解释文字
- 颜色值必须是有效的 #RRGGBB 格式
- font-family 必须是真实存在的字体
```

---

## Phase 2：前端 UI 增强

### 2.1 界面布局变化

```
┌─────────────────────────────────────────────┐
│  AI 设计                                      │
├─────────────────────────────────────────────┤
│  [文字描述输入]  [🎨 生成设计图]  [💡 纯文字生成] │
│                                              │
│  ─────── 设计图模式 ───────                   │
│  ┌────────────────────────────────────────┐  │
│  │                                        │  │
│  │     [生成的 3 张设计示意图]               │  │
│  │                                        │  │
│  └────────────────────────────────────────┘  │
│  [应用此设计] [微调] [重新生成]               │
│                                              │
│  ─────── 方案列表 ───────（复用现有）          │
│  ┌─ 方案1 ─┐ ┌─ 方案2 ─┐ ┌─ 方案3 ─┐       │
│  │ 颜色展示│ │ 颜色展示│ │ 颜色展示│        │
│  │ 应用    │ │ 应用    │ │ 应用    │        │
│  └─────────┘ └─────────┘ └─────────┘        │
└─────────────────────────────────────────────┘
```

### 2.2 新增交互流程

1. **生成设计图**：点击后调用 `generate-design-image`，生成 3 张不同风格的设计图
2. **预览设计**：点击某张图，弹出大图预览
3. **分析提取**：点击「应用此设计」，调用 `analyze-design-image`，分析图中的配色、字体等
4. **微调生成**：点击「微调」，用自然语言描述修改意见，生成新图

---

## Phase 3：后端 CSS 生成逻辑增强

### 3.1 复用现有编译逻辑

`compileSchemeCSS` 函数已经很完善，分析结果直接复用该函数生成最终 CSS。

### 3.2 新增 Gemini 调用代码

```go
// 伪代码结构
func callGeminiImageGeneration(ctx context.Context, prompt string) (string, error) {
    // 使用 google.golang.org/genai
    // 调用 gemini-3.1-flash-image-preview
    // 返回 base64 图片
}

func callGeminiVisionAnalysis(ctx context.Context, imageBase64 string) (DesignTokens, error) {
    // 使用 google.golang.org/genai
    // 调用 gemini-2.0-flash
    // 传入分析和提取 prompt
    // 返回结构化的设计规范
}
```

---

## Phase 4：整合与优化

### 4.1 两套模式并行

| 模式 | 触发条件 | 流程 |
|------|---------|------|
| **图片模式** | 用户点击「生成设计图」 | 生成图 → 分析图 → 展示方案 |
| **文字模式** | 用户点击「纯文字生成」 | GPT-4o 直接生成方案（现有逻辑） |

### 4.2 可选增强：对话式迭代

利用 Gemini 的多轮对话能力，用户可以在图上直接「指指点点」说「这个颜色换成蓝色」「这个字体换衬线体」，Gemini 会更新图片。这需要：
- 建立 chat session
- 传入上一轮的 image_base64
- 用户用自然语言提修改意见

---

## 风险评估

| 风险 | 影响 | 缓解方案 |
|------|------|---------|
| Gemini 文字渲染不完美 | 生成的设计图可能有乱码文字 | prompt 强调用英文 placeholder，用抽象线条代替具体文字 |
| Vision 提取颜色有偏差 | CSS 和预期有差距 | 提供手动微调功能，或用多模态模型同时生成图片+设计规范 |
| API 成本 | 图片生成比纯文字贵 | 限制生成图片尺寸（1K），缓存已生成的图片 |
| 图片生成失败 | 端点返回错误 | 提供回退：自动切换到纯文字模式 |

---

## 实施优先级建议

### P0（必须）
- Phase 1.1 (generate-design-image 端点)
- Phase 1.2 (analyze-design-image 端点)
- Phase 2 (前端展示设计图 + 基础交互)

### P1（重要）
- Phase 3 (CSS 生成复用)
- Phase 4 (两套模式并行 + 错误回退)

### P2（可选）
- 对话式微调（多轮 chat session）
