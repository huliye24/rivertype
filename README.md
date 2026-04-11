# RIVERTYPE - 未来出版引擎

**将 Markdown、思想与叙事，转化为具有视觉美学的未来出版作品。**

---

## 核心理念

> Markdown 是骨架，SVG 是皮肤，主题系统是灵魂。

RIVERTYPE 致力于将 AI 回答、理论、宣言、研究成果和世界观转化为具有视觉表现力的作品，以杂志、艺术海报、未来手册的风格呈现文本。

---

## 安装与运行

### 1. 安装依赖

```bash
cd e:\Rivertype
pip install -r requirements.txt
playwright install
```

### 2. 启动桌面应用（推荐）

打开 PyCharm，直接运行以下命令即可启动桌面版本：

```bash
python rivertype/gui.py
```

或使用模块方式运行：

```bash
python -m rivertype.gui
```

### 3. 启动 Web 服务（可选）

如果你更习惯使用浏览器界面，可以启动 Web 版本：

```bash
python rivertype/run.py
```

然后访问 http://127.0.0.1:8000

---

## 桌面应用功能

### 主要功能

- **Markdown 编辑器** - 左侧实时编辑，支持语法高亮提示
- **实时预览** - 渲染后在浏览器中打开预览效果
- **主题切换** - 支持 3 种内置主题（荣景 / Living Ture / Noir Research）
- **文件操作** - 新建、打开、保存 Markdown 文件
- **导出 PDF** - 将文档导出为高质量 PDF
- **导出 HTML** - 导出独立可查看的 HTML 文件

### 快捷键

| 快捷键 | 功能 |
|--------|------|
| Ctrl + R | 渲染预览 |
| Ctrl + S | 保存文件 |
| Ctrl + O | 打开文件 |

---

## 项目结构

```
rivertype/
├── __init__.py           # 包初始化
├── gui.py                # 桌面应用入口 ← 【新增】
├── run.py                # Web 服务入口
└── app/
    ├── main.py          # FastAPI 主应用
    ├── models.py         # 数据模型
    ├── parser/          # Markdown 解析器
    │   ├── markdown_parser.py
    │   └── ast_builder.py
    ├── themes/          # 主题系统
    │   └── base.py
    ├── render/          # 渲染与导出
    │   ├── html_renderer.py
    │   ├── svg_generator.py
    │   └── pdf_export.py
    ├── templates/       # HTML 模板
    │   ├── rongjing.html
    │   ├── living_ture.html
    │   └── noir_research.html
    └── static/          # 静态资源
        └── index.html
├── examples/            # 示例文件
└── output/              # 输出目录
```

---

## 主题预览

| 主题 | 风格 | 特点 |
|------|------|------|
| **rongjing** | 东方美学 | 黑色背景、大留白、红色点缀、像未来文明手册 |
| **living_ture** | 霓虹风格 | 深黑+霓虹红、杂志封面感、夜色、欲望、危险感 |
| **noir_research** | 研究报告 | 深灰银白、高级学术风格、适合理论与论文 |

---

## API 接口（Web 模式）

服务启动后，可访问 API 文档: http://127.0.0.1:8000/docs

| 接口 | 方法 | 说明 |
|------|------|------|
| `/` | GET | 主页 Web UI |
| `/render` | POST | 渲染 Markdown 为 HTML |
| `/export` | POST | 导出为 PDF/PNG |
| `/themes` | GET | 获取可用主题列表 |
| `/health` | GET | 健康检查 |

---

## 技术架构

```
Markdown ──▶ Parser ──▶ AST ──▶ Theme Engine ──▶ HTML + SVG ──▶ PDF / PNG / Desktop
   │           │        │          │              │              │
   ▼           ▼        ▼          ▼              ▼              ▼
 [输入]     [解析层]  [结构层]   [样式层]       [输出层]       [交付层]
```

---

## 技术栈

- **桌面应用**: Tkinter (Python 内置)
- **Web 框架**: FastAPI + Uvicorn
- **Markdown 解析**: markdown-it-py
- **模板引擎**: Jinja2
- **SVG 生成**: svgwrite
- **PDF 导出**: Playwright / WeasyPrint
- **数据验证**: Pydantic

---

## 未来路线图

- **Phase 1**: 完善桌面应用 UI 和预览体验
- **Phase 2**: AI 风格自动检测
- **Phase 3**: 插件生态 (Adobe, Figma, Obsidian)

---

## 许可证

MIT License
