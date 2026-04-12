# RIVERTYPE 产品方案

## 项目定位

去中心化的 Markdown 排版出版工具。用户数据完全归用户所有，本地运行，无需联网。

**核心价值：** AI 时代的内容创作工具，数据自主、设计优美、快速迭代。

## 核心理念

- **去中心化** - 本地优先，数据归用户所有
- **Web 界面** - 比传统 GUI 更现代、更美观
- **排版与内容分离** - Markdown 负责内容，CSS/模板负责样式

## 产品本质

将 AI 输出的 Markdown 转换为精美的视觉排版设计。

```
Markdown 内容 + 主题样式 = 精美出版物
```

## 技术架构

```
┌─────────────────────────────────────────────────┐
│                   前端 (Web)                     │
│         Markdown 编辑器 + 实时预览 + 导出          │
└─────────────────┬───────────────────────────────┘
                  │ REST API
┌─────────────────▼───────────────────────────────┐
│                 后端 (Python)                    │
│  ┌─────────────┐  ┌──────────────────────────┐  │
│  │  文件管理   │  │      排版引擎            │  │
│  │ - 打开/保存 │  │ - Markdown 解析          │  │
│  │ - 项目结构  │  │ - 样式映射               │  │
│  └─────────────┘  │ - 主题系统               │  │
│                   │ - 响应式布局             │  │
│                   └──────────────────────────┘  │
│  ┌─────────────┐  ┌──────────────────────────┐  │
│  │  导出模块   │  │      AI 集成 (可选)       │  │
│  │ - PDF       │  │ - 本地 Ollama            │  │
│  │ - HTML      │  │ - Markdown 优化          │  │
│  │ - EPUB      │  │ - 格式转换               │  │
│  └─────────────┘  └──────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

## 技术选型

| 模块 | 推荐方案 |
|------|----------|
| Web 服务 | FastAPI（轻量、异步） |
| Markdown 解析 | mistune / markdown-it |
| PDF 导出 | WeasyPrint / pdfkit |
| 模板引擎 | Jinja2（主题系统） |
| 静态文件服务 | 内置 HTTP 服务器 |
| AI 集成 | Ollama（本地 LLM） |

## 核心功能

### 1. 文件管理
- 打开/保存本地 Markdown 文件
- 项目文件夹结构管理
- 自动保存

### 2. 排版引擎
- Markdown 解析渲染
- 主题切换系统
- 响应式布局
- 实时预览

### 3. 导出模块
- HTML 导出
- PDF 导出
- EPUB 导出（可选）

### 4. AI 集成（可选）
- 本地 Ollama 支持
- Markdown 内容优化
- 格式转换建议

## 设计原则

1. **内容与样式分离** - 同一 Markdown，不同主题 = 不同视觉风格
2. **本地优先** - 文件存储在用户指定目录，完全可控
3. **离线可用** - 无需联网即可使用全部功能
4. **快速迭代** - Web 前端便于快速更新和优化

## 已实现功能

### 纯净模式（无 AI）

#### API 端点

| 端点 | 方法 | 功能 |
|------|------|------|
| `/api/render` | POST | Markdown + 主题 → HTML |
| `/api/render/preview` | POST | 快速预览（仅 HTML 片段） |
| `/api/render/extract-toc` | POST | 提取目录结构 |
| `/api/export/html` | POST | 导出独立 HTML |
| `/api/export/html-inline` | POST | 导出内联样式 HTML |
| `/api/export/pdf` | POST | 导出 PDF |
| `/api/themes` | GET | 获取主题列表 |
| `/api/themes/{name}` | GET | 获取主题详情 |
| `/api/health` | GET | 健康检查 |

#### 项目结构

```
backend/
├── main.py                 # FastAPI 入口
├── requirements.txt        # 依赖
├── routers/
│   ├── render.py           # 渲染 API
│   ├── export.py           # 导出 API
│   └── themes.py           # 主题 API
├── services/
│   ├── markdown.py         # Markdown 解析
│   ├── theme.py            # 主题管理
│   └── pdf.py              # PDF 生成
└── templates/
    └── default/
        ├── theme.json      # 主题配置
        └── article.html    # 文章模板
```

#### 启动方式

```bash
cd backend
pip install -r requirements.txt
python main.py
# 服务运行在 http://127.0.0.1:8000
```
