# -*- coding: utf-8 -*-
"""
RIVERTYPE - 主应用
带调试日志的完整导出功能测试
"""
import sys
import os
import json
from pathlib import Path

log_path = r"e:\Rivertype\.cursor\debug.log"

def write_log(msg, data=None):
    entry = {
        "id": f"diag_{int(__import__('time').time()*1000)}",
        "timestamp": int(__import__('time').time()*1000),
        "message": msg,
        "data": data or {}
    }
    try:
        with open(log_path, 'a', encoding='utf-8') as f:
            f.write(json.dumps(entry, ensure_ascii=False) + '\n')
    except:
        pass

write_log("app_start")

# 添加项目根目录到 Python 路径
current_file = Path(__file__).resolve()
project_root = current_file.parent.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

os.chdir(project_root)

from rivertype.app.models import RenderRequest, RenderResponse, ExportRequest, ExportResponse
from rivertype.app.parser import MarkdownParser, ASTBuilder
from rivertype.app.themes import get_theme
from rivertype.app.render import HTMLRenderer

write_log("imports_ok")

from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
import tempfile
import asyncio

app = FastAPI(
    title="RIVERTYPE",
    description="测试",
    version="0.1.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

parser = MarkdownParser()

@app.post("/export")
async def export_document(request: ExportRequest):
    write_log("export_request_received", {"format": str(request.format)})
    try:
        theme = get_theme(request.theme)
        if theme is None:
            raise HTTPException(status_code=400, detail=f"未知的主题: {request.theme}")

        write_log("parsing_markdown")
        blocks = parser.parse(request.markdown)
        blocks_dict = [
            {
                "type": b.type,
                "content": b.content,
                "level": b.level,
                "meta": b.meta
            }
            for b in blocks
        ]

        write_log("building_ast")
        ast_builder = ASTBuilder()
        ast = ast_builder.build_from_blocks(blocks_dict)

        write_log("rendering_html")
        renderer = HTMLRenderer(theme)
        html = renderer.render(ast, title="Test", metadata={})
        write_log("html_rendered", {"html_len": len(html)})

        output_dir = tempfile.mkdtemp(prefix="rivertype_")
        output_files = {}

        write_log("starting_export", {"format": request.format})

        async def do_export():
            from playwright.async_api import async_playwright

            async with async_playwright() as p:
                write_log("playwright_context_started")
                browser = await p.chromium.launch()
                write_log("browser_launched")
                page = await browser.new_page(viewport={"width": 1200, "height": 800})
                write_log("page_created")

                # 写入临时 HTML 文件
                temp_html = os.path.join(output_dir, "temp.html")
                with open(temp_html, 'w', encoding='utf-8') as f:
                    f.write(html)
                write_log("temp_html_written", {"path": temp_html})

                for fmt in request.format:
                    write_log("processing_format", {"fmt": fmt})
                    filename = f"document.{fmt}"
                    output_path = os.path.join(output_dir, filename)

                    if fmt == "pdf":
                        await page.pdf(
                            path=output_path,
                            format="A4",
                            print_background=True
                        )
                    elif fmt == "png":
                        await page.screenshot(
                            path=output_path,
                            full_page=True,
                            type="png"
                        )
                    write_log("format_done", {"fmt": fmt, "path": output_path})
                    output_files[fmt] = output_path

                await browser.close()
                write_log("browser_closed")

        await do_export()
        write_log("export_complete", {"files": list(output_files.keys())})

        return ExportResponse(
            success=True,
            files=output_files,
            message=f"成功导出 {len(output_files)} 个文件"
        )

    except Exception as e:
        import traceback
        write_log("export_error", {"error": str(e), "trace": traceback.format_exc()})
        raise HTTPException(status_code=500, detail=f"导出失败: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
