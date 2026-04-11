# -*- coding: utf-8 -*-
"""
RIVERTYPE 导出系统
支持导出为 PDF、PNG、HTML 等格式
"""

import os
import asyncio
from typing import Optional, Union
from pathlib import Path
import tempfile
import shutil


class ExportSystem:
    """导出系统"""

    def __init__(self, playwright_browser=None):
        self.browser = playwright_browser
        self._playwright = None

    async def initialize(self):
        """初始化 Playwright"""
        if self._playwright is None:
            from playwright.async_api import async_playwright
            self._playwright = await async_playwright().start()
            self.browser = await self._playwright.chromium.launch()

    async def close(self):
        """关闭浏览器"""
        if self.browser:
            await self.browser.close()
        if self._playwright:
            await self._playwright.stop()

    async def export_html_to_pdf(
        self,
        html_content: str,
        output_path: str,
        viewport_width: int = 1200,
        viewport_height: int = 800,
        format: str = "pdf"
    ) -> str:
        """
        将 HTML 导出为 PDF 或 PNG

        Args:
            html_content: HTML 内容
            output_path: 输出文件路径
            viewport_width: 视口宽度
            viewport_height: 视口高度
            format: 输出格式 (pdf 或 png)

        Returns:
            输出文件路径
        """
        await self.initialize()

        # 创建临时 HTML 文件
        with tempfile.NamedTemporaryFile(mode='w', suffix='.html', delete=False, encoding='utf-8') as f:
            f.write(html_content)
            temp_html_path = f.name

        try:
            page = await self.browser.new_page(
                viewport={"width": viewport_width, "height": viewport_height}
            )

            # 加载 HTML
            await page.goto(f"file://{temp_html_path}")
            await page.wait_for_load_state("networkidle")

            # 等待内容渲染
            await asyncio.sleep(0.5)

            if format == "pdf":
                # 导出 PDF
                await page.pdf(
                    path=output_path,
                    format="A4",
                    print_background=True,
                    margin={"top": "20mm", "bottom": "20mm", "left": "15mm", "right": "15mm"}
                )
            elif format == "png":
                # 导出 PNG
                await page.screenshot(
                    path=output_path,
                    full_page=True,
                    type="png"
                )

            await page.close()

        finally:
            # 清理临时文件
            if os.path.exists(temp_html_path):
                os.unlink(temp_html_path)

        return output_path

    def export_with_weasyprint(
        self,
        html_content: str,
        output_path: str
    ) -> str:
        """
        使用 WeasyPrint 导出 PDF

        Args:
            html_content: HTML 内容
            output_path: 输出文件路径

        Returns:
            输出文件路径
        """
        try:
            from weasyprint import HTML, CSS

            HTML(string=html_content).write_pdf(output_path)
            return output_path
        except ImportError:
            raise RuntimeError("WeasyPrint 未安装，请使用 export_html_to_pdf 方法")

    async def export_batch(
        self,
        html_content: str,
        output_dir: str,
        formats: list = None
    ) -> dict:
        """
        批量导出多种格式

        Args:
            html_content: HTML 内容
            output_dir: 输出目录
            formats: 格式列表 ["pdf", "png"]

        Returns:
            导出结果字典
        """
        if formats is None:
            formats = ["pdf", "png"]

        results = {}

        for fmt in formats:
            if fmt == "pdf":
                output_path = os.path.join(output_dir, "output.pdf")
                results["pdf"] = await self.export_html_to_pdf(
                    html_content, output_path, format="pdf"
                )
            elif fmt == "png":
                output_path = os.path.join(output_dir, "output.png")
                results["png"] = await self.export_html_to_pdf(
                    html_content, output_path, format="png"
                )

        return results


# 同步版本导出器
class SyncExportSystem:
    """同步导出系统"""

    def __init__(self):
        self._playwright = None
        self._browser = None

    def _ensure_browser(self):
        """确保浏览器已启动"""
        if self._browser is None:
            from playwright.sync_api import sync_playwright
            self._playwright = sync_playwright().start()
            self._browser = self._playwright.chromium.launch()

    def export_html_to_pdf(
        self,
        html_content: str,
        output_path: str,
        viewport_width: int = 1200,
        viewport_height: int = 800
    ) -> str:
        """同步导出 PDF"""
        self._ensure_browser()

        # 创建临时 HTML 文件
        with tempfile.NamedTemporaryFile(
            mode='w', suffix='.html', delete=False, encoding='utf-8'
        ) as f:
            f.write(html_content)
            temp_html_path = f.name

        try:
            page = self._browser.new_page(
                viewport={"width": viewport_width, "height": viewport_height}
            )

            page.goto(f"file://{temp_html_path}")
            page.wait_for_load_state("networkidle")

            page.pdf(
                path=output_path,
                format="A4",
                print_background=True,
                margin={"top": "20mm", "bottom": "20mm", "left": "15mm", "right": "15mm"}
            )

            page.close()

        finally:
            if os.path.exists(temp_html_path):
                os.unlink(temp_html_path)

        return output_path

    def export_html_to_png(
        self,
        html_content: str,
        output_path: str,
        viewport_width: int = 1200,
        viewport_height: int = 800
    ) -> str:
        """同步导出 PNG"""
        self._ensure_browser()

        # 创建临时 HTML 文件
        with tempfile.NamedTemporaryFile(
            mode='w', suffix='.html', delete=False, encoding='utf-8'
        ) as f:
            f.write(html_content)
            temp_html_path = f.name

        try:
            page = self._browser.new_page(
                viewport={"width": viewport_width, "height": viewport_height}
            )

            page.goto(f"file://{temp_html_path}")
            page.wait_for_load_state("networkidle")

            page.screenshot(
                path=output_path,
                full_page=True,
                type="png"
            )

            page.close()

        finally:
            if os.path.exists(temp_html_path):
                os.unlink(temp_html_path)

        return output_path

    def close(self):
        """关闭浏览器"""
        if self._browser:
            self._browser.close()
        if self._playwright:
            self._playwright.stop()


# 导出工厂函数
def create_sync_exporter() -> SyncExportSystem:
    """创建同步导出器"""
    return SyncExportSystem()
