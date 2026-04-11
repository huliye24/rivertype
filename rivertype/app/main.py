# -*- coding: utf-8 -*-
"""
RIVERTYPE - 未来出版引擎
FastAPI 主应用入口点
"""

import sys
import os
from pathlib import Path

# 添加项目根目录到 Python 路径
current_file = Path(__file__).resolve()
project_root = current_file.parent.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

# 设置工作目录
os.chdir(project_root)

from rivertype.app.models import (
    RenderRequest, RenderResponse,
    ExportRequest, ExportResponse,
    ThemeListResponse, ThemeInfo,
    HealthResponse
)
from rivertype.app.parser import MarkdownParser, ASTBuilder, Block
from rivertype.app.themes import get_theme, get_all_themes, ThemeRegistry
from rivertype.app.render import HTMLRenderer, SyncExportSystem

from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import tempfile
import traceback
import asyncio


# 创建 FastAPI 应用
app = FastAPI(
    title="RIVERTYPE",
    description="将 Markdown、思想与叙事，转化为具有视觉美学的未来出版引擎",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS 配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 静态文件目录
current_dir = Path(__file__).parent
static_dir = current_dir / "static"
static_dir.mkdir(exist_ok=True)


# 初始化组件
parser = MarkdownParser()
registry = ThemeRegistry()
exporter = None


def get_exporter():
    """获取导出器（延迟初始化）"""
    global exporter
    if exporter is None:
        exporter = SyncExportSystem()
    return exporter


# ========== API 路由 ==========

@app.get("/", response_class=HTMLResponse)
async def root():
    """主页 - 返回 Web UI"""
    ui_path = static_dir / "index.html"
    if ui_path.exists():
        with open(ui_path, "r", encoding="utf-8") as f:
            return f.read()
    return """
    <html>
        <head><title>RIVERTYPE</title></head>
        <body style="background:#0b0b0b;color:#e8e8e8;padding:40px;font-family:sans-serif;">
            <h1>RIVERTYPE</h1>
            <p>未来出版引擎</p>
            <p><a href="/docs" style="color:#c41e3a;">访问 API 文档</a></p>
        </body>
    </html>
    """


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """健康检查"""
    return HealthResponse(
        status="ok",
        version="0.1.0",
        message="RIVERTYPE 运行正常"
    )


@app.get("/themes", response_model=ThemeListResponse)
async def list_themes():
    """获取所有可用主题"""
    themes = get_all_themes()
    return ThemeListResponse(
        themes=[
            ThemeInfo(
                id=t.id,
                name=t.name,
                description=t.description
            )
            for t in themes
        ]
    )


@app.post("/render", response_model=RenderResponse)
async def render_document(request: RenderRequest):
    """渲染 Markdown 文档为 HTML"""
    theme = get_theme(request.theme)
    if theme is None:
        raise HTTPException(status_code=400, detail=f"未知的主题: {request.theme}")

    try:
        # 解析 Markdown 为 Block 列表
        blocks = parser.parse(request.markdown)
        
        # 转换为字典格式
        blocks_dict = [
            {
                "type": b.type,
                "content": b.content,
                "level": b.level,
                "meta": b.meta
            }
            for b in blocks
        ]
        
        # 构建 AST
        ast_builder = ASTBuilder()
        ast = ast_builder.build_from_blocks(blocks_dict)

        # 获取标题
        title = request.title
        if not title:
            title = parser.extract_title(blocks)

        # 获取元数据
        metadata = parser.extract_metadata(request.markdown)

        # 渲染 HTML
        renderer = HTMLRenderer(theme)
        html = renderer.render(ast, title=title, metadata=metadata)

        return RenderResponse(
            html=html,
            theme=request.theme,
            title=title,
            metadata=metadata
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"渲染失败: {str(e)}\n{traceback.format_exc()}")


@app.post("/export")
async def export_document(request: ExportRequest):
    """导出 Markdown 文档为 PDF/PNG"""
    theme = get_theme(request.theme)
    if theme is None:
        raise HTTPException(status_code=400, detail=f"未知的主题: {request.theme}")

    try:
        # 解析 Markdown
        blocks = parser.parse(request.markdown)
        
        # 转换为字典格式
        blocks_dict = [
            {
                "type": b.type,
                "content": b.content,
                "level": b.level,
                "meta": b.meta
            }
            for b in blocks
        ]
        
        # 构建 AST
        ast_builder = ASTBuilder()
        ast = ast_builder.build_from_blocks(blocks_dict)

        # 获取标题
        title = request.title
        if not title:
            title = parser.extract_title(blocks)

        # 获取元数据
        metadata = parser.extract_metadata(request.markdown)

        # 渲染 HTML
        renderer = HTMLRenderer(theme)
        html = renderer.render(ast, title=title, metadata=metadata)

        # 创建输出目录
        output_dir = tempfile.mkdtemp(prefix="rivertype_")

        # 写入临时 HTML 文件
        temp_html = os.path.join(output_dir, "temp.html")
        with open(temp_html, 'w', encoding='utf-8') as f:
            f.write(html)

        # 使用线程池执行同步的 Playwright 操作
        def do_export_sync():
            from playwright.sync_api import sync_playwright
            
            output_files = {}
            with sync_playwright() as p:
                browser = p.chromium.launch()
                page = browser.new_page(viewport={"width": 1200, "height": 800})
                
                page.goto(f"file:///{temp_html.replace(chr(92), '/')}")
                page.wait_for_load_state("networkidle")
                
                for fmt in request.format:
                    filename = f"document.{fmt}"
                    output_path = os.path.join(output_dir, filename)
                    
                    if fmt == "pdf":
                        page.pdf(
                            path=output_path,
                            format="A4",
                            print_background=True,
                            margin={"top": "20mm", "bottom": "20mm", "left": "15mm", "right": "15mm"}
                        )
                    elif fmt == "png":
                        page.screenshot(
                            path=output_path,
                            full_page=True,
                            type="png"
                        )
                    
                    output_files[fmt] = output_path
                
                browser.close()
            return output_files

        # 在线程池中运行（避免 asyncio 子进程问题）
        output_files = await asyncio.get_event_loop().run_in_executor(None, do_export_sync)

        return ExportResponse(
            success=True,
            files=output_files,
            message=f"成功导出 {len(output_files)} 个文件"
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"导出失败: {str(e)}\n{traceback.format_exc()}")


@app.get("/preview")
async def preview_document(
    markdown: str,
    theme: str = "rongjing",
    title: str = None
):
    """实时预览 Markdown 渲染结果"""
    theme_obj = get_theme(theme)
    if theme_obj is None:
        raise HTTPException(status_code=400, detail=f"未知的主题: {theme}")

    try:
        blocks = parser.parse(markdown)
        
        blocks_dict = [
            {
                "type": b.type,
                "content": b.content,
                "level": b.level,
                "meta": b.meta
            }
            for b in blocks
        ]
        
        ast_builder = ASTBuilder()
        ast = ast_builder.build_from_blocks(blocks_dict)

        doc_title = title
        if not doc_title:
            doc_title = parser.extract_title(blocks)

        metadata = parser.extract_metadata(markdown)
        renderer = HTMLRenderer(theme_obj)
        html = renderer.render(ast, title=doc_title, metadata=metadata)

        return HTMLResponse(content=html)

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"预览失败: {str(e)}")


# 挂载静态文件
app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")


if __name__ == "__main__":
    import uvicorn
    import webbrowser
    import threading

    def open_browser():
        webbrowser.open("http://127.0.0.1:8000")

    print("=" * 50)
    print("RIVERTYPE - 未来出版引擎")
    print("=" * 50)
    print("请访问: http://127.0.0.1:8000")
    print("API 文档: http://127.0.0.1:8000/docs")
    print("=" * 50)
    
    threading.Timer(1.5, open_browser).start()
    uvicorn.run(app, host="0.0.0.0", port=8000)