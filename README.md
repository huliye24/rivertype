# RiverType

去中心化的 Markdown 排版出版工具。用户数据完全归用户所有，本地运行，无需联网。

[English](README_en.md) | 简体中文

## 核心价值

AI 时代的内容创作工具 - 数据自主、设计优美、快速迭代

## 理念

- **去中心化** - 本地优先，数据归用户所有
- **Web 界面** - 比传统 GUI 更现代、更美观
- **排版与内容分离** - Markdown 负责内容，CSS/模板负责样式

## 功能

### 核心功能

- **Markdown 编辑器** - 实时编辑与预览
- **多主题支持** - 多种预设主题，一键切换
- **导出能力**
  - HTML 导出（独立文件）
  - HTML 内联样式导出
  - PDF 导出
- **目录提取** - 自动提取文章结构

### 设计原则

1. **内容与样式分离** - 同一 Markdown，不同主题 = 不同视觉风格
2. **本地优先** - 文件存储在用户指定目录，完全可控
3. **离线可用** - 无需联网即可使用全部功能
4. **快速迭代** - Web 前端便于快速更新和优化

## 技术栈

| 模块 | 技术 |
|------|------|
| 前端 | TypeScript + Vite |
| Markdown 解析 | markdown-it |
| PDF 导出 | WeasyPrint / 浏览器打印 |
| 后端 API | FastAPI（可选） |

## 快速开始

### 前端（纯前端模式）

```bash
# 直接打开 index.html 即可使用
# 或使用本地服务器
npx serve .
```

### 后端（完整功能）

```bash
cd backend
pip install -r requirements.txt
python main.py
# 服务运行在 http://127.0.0.1:8000
```

## API 端点

| 端点 | 方法 | 功能 |
|------|------|------|
| `/api/render` | POST | Markdown + 主题 → HTML |
| `/api/render/preview` | POST | 快速预览 |
| `/api/render/extract-toc` | POST | 提取目录结构 |
| `/api/export/html` | POST | 导出独立 HTML |
| `/api/export/html-inline` | POST | 导出内联样式 HTML |
| `/api/export/pdf` | POST | 导出 PDF |
| `/api/themes` | GET | 获取主题列表 |
| `/api/themes/{name}` | GET | 获取主题详情 |
| `/api/health` | GET | 健康检查 |

## 项目结构

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

## License

MIT License - 详见 [LICENSE](LICENSE)
