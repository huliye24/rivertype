# -*- coding: utf-8 -*-
"""
RIVERTYPE 桌面 GUI 主窗口
使用 Tkinter 构建，带 Markdown 编辑器和实时预览功能
"""

import tkinter as tk
from tkinter import ttk, filedialog, messagebox, scrolledtext
import threading
import os
import tempfile
import webbrowser
from typing import Optional, List

try:
    from rivertype.app.parser import MarkdownParser, ASTBuilder
    from rivertype.app.themes import get_theme, get_all_themes
    from rivertype.app.render import HTMLRenderer
    PARSER_AVAILABLE = True
except ImportError:
    PARSER_AVAILABLE = False


DEFAULT_MARKDOWN = """# 非均衡市场理论

## 前言

> 市场从来不是均衡的。真正的机会，存在于失衡的缝隙之中。

本文探讨非均衡状态下市场运作的深层逻辑，揭示传统经济学假设中的根本性缺陷。

## 核心观点

### 失衡常态

**市场均衡只是数学家的幻想。** 现实世界中，价格永远在波动，信息永远不对称，参与者永远在博弈。

### 机会窗口

在系统从一种失衡状态向另一种失衡状态转换的过程中，会出现短暂的机会窗口。

- 流动性错配期
- 信息不对称期
- 预期分歧期

### 策略框架

```
失衡 → 识别 → 布局 → 等待 → 收割
```

---

## 结论

非均衡市场理论不是预测工具，而是一种思维方式。它要求我们放弃对确定性的幻想，接受不确定性作为市场的本质特征。

**真正的赢家，是那些能在混沌中找到秩序的人。**
"""


class RivertypeApp:
    """RIVERTYPE 桌面应用主窗口"""

    WINDOW_MIN_WIDTH = 1400
    WINDOW_MIN_HEIGHT = 900

    def __init__(self):
        self.root = tk.Tk()
        self.root.title("RIVERTYPE - 未来出版引擎")
        self.root.minsize(self.WINDOW_MIN_WIDTH, self.WINDOW_MIN_HEIGHT)

        # 主题色
        self.bg_dark = "#0a0a0a"
        self.bg_panel = "#111111"
        self.bg_header = "#181818"
        self.bg_hover = "#242424"
        self.border_color = "#2a2a2a"
        self.text_primary = "#e0e0e0"
        self.text_secondary = "#707070"
        self.text_muted = "#505050"
        self.accent = "#c41e3a"
        self.accent_hover = "#e02244"
        self.white = "#ffffff"

        # 核心组件
        self.parser: Optional[MarkdownParser] = None
        self.renderer: Optional[HTMLRenderer] = None
        self.current_theme_id = tk.StringVar(value="rongjing")
        self.themes: List = []
        self.current_file: Optional[str] = None

        # 预览路径
        self.preview_html_path = os.path.join(tempfile.gettempdir(), "rivertype_preview.html")

        # 字体大小
        self.font_size = tk.IntVar(value=13)

        self._render_timer = None

        self._create_ui()
        self._init_backend()
        self._load_themes()

    def _create_btn(self, parent, text, command, is_primary=False):
        """创建统一风格的按钮"""
        bg = self.accent if is_primary else self.bg_header
        fg = self.white if is_primary else self.text_primary
        active_bg = self.accent_hover if is_primary else self.bg_hover
        active_fg = self.white

        btn = tk.Button(
            parent, text=text,
            command=command,
            bg=bg, fg=fg,
            activebackground=active_bg, activeforeground=active_fg,
            relief=tk.FLAT,
            padx=16, pady=6,
            font=("Microsoft YaHei UI", 9, "bold" if is_primary else "normal"),
            cursor="hand2",
            borderwidth=0,
            highlightthickness=0
        )
        return btn

    def _create_ui(self):
        """创建用户界面"""
        # 主容器
        main_container = tk.Frame(self.root, bg=self.bg_dark)
        main_container.pack(fill=tk.BOTH, expand=True)

        # ========== 顶部标题栏 ==========
        self._create_header(main_container)

        # ========== 主内容区 ==========
        content_frame = tk.Frame(main_container, bg=self.bg_dark)
        content_frame.pack(fill=tk.BOTH, expand=True, padx=24, pady=(0, 24))

        self._create_editor_panel(content_frame)
        self._create_preview_panel(content_frame)

        # ========== 状态栏 ==========
        self._create_statusbar(main_container)

    def _create_header(self, parent):
        """创建顶部标题栏"""
        header = tk.Frame(parent, bg=self.bg_header, height=56)
        header.pack(fill=tk.X)
        header.pack_propagate(False)

        # 顶部红色细线
        top_line = tk.Frame(header, bg=self.accent, height=2)
        top_line.pack(fill=tk.X, anchor="n")

        # 左侧 Logo 区域
        logo_frame = tk.Frame(header, bg=self.bg_header)
        logo_frame.pack(side=tk.LEFT, padx=24, pady=0)

        # RIVERTYPE - 红色大写英文字母
        logo = tk.Label(
            logo_frame,
            text="RIVERTYPE",
            font=("Arial", 22, "bold"),
            fg=self.accent,
            bg=self.bg_header,
            cursor="hand2"
        )
        logo.pack(side=tk.LEFT, pady=6)

        # 未来出版引擎 - 白色小字在右侧
        subtitle = tk.Label(
            logo_frame,
            text="未来出版引擎",
            font=("Microsoft YaHei UI", 10),
            fg=self.white,
            bg=self.bg_header
        )
        subtitle.pack(side=tk.LEFT, padx=(16, 0), anchor="c", pady=8)

        # 中间区域 - 空隙
        center = tk.Frame(header, bg=self.bg_header)
        center.pack(side=tk.LEFT, expand=True)

        # 右侧按钮区
        btn_frame = tk.Frame(header, bg=self.bg_header)
        btn_frame.pack(side=tk.RIGHT, padx=20, pady=8)

        # 主题选择
        theme_label = tk.Label(
            btn_frame, text="主题:",
            bg=self.bg_header, fg=self.text_secondary,
            font=("Microsoft YaHei UI", 9)
        )
        theme_label.pack(side=tk.LEFT, padx=(0, 6), anchor="c", pady=6)

        # 主题下拉框样式
        style = ttk.Style()
        style.theme_use('clam')
        style.configure(
            "Custom.TCombobox",
            fieldbackground=self.bg_panel,
            background=self.bg_header,
            foreground=self.text_primary,
            bordercolor=self.border_color,
            lightcolor=self.bg_header,
            darkcolor=self.bg_header
        )
        style.map(
            "Custom.TCombobox",
            fieldbackground=[('readonly', self.bg_panel)],
            selectbackground=[('readonly', self.bg_header)],
            selectforeground=[('readonly', self.text_primary)]
        )

        self.theme_combo = ttk.Combobox(
            btn_frame,
            textvariable=self.current_theme_id,
            values=[],
            width=12,
            state="readonly",
            font=("Microsoft YaHei UI", 9),
            style="Custom.TCombobox"
        )
        self.theme_combo.pack(side=tk.LEFT, padx=2, anchor="c", pady=6)
        self.theme_combo.bind("<<ComboboxSelected>>", self._on_theme_changed)

        # 分隔线
        sep = tk.Frame(btn_frame, bg=self.border_color, width=1, height=28)
        sep.pack(side=tk.LEFT, padx=14)

        # 文件操作按钮组
        file_btn_frame = tk.Frame(btn_frame, bg=self.bg_header)
        file_btn_frame.pack(side=tk.LEFT)

        self._create_btn(file_btn_frame, "新建", self._new_file).pack(side=tk.LEFT, padx=1)
        self._create_btn(file_btn_frame, "打开", self._open_file).pack(side=tk.LEFT, padx=1)
        self._create_btn(file_btn_frame, "保存", self._save_file).pack(side=tk.LEFT, padx=1)

        # 分隔线
        sep2 = tk.Frame(btn_frame, bg=self.border_color, width=1, height=28)
        sep2.pack(side=tk.LEFT, padx=14)

        # 导出按钮组
        export_btn_frame = tk.Frame(btn_frame, bg=self.bg_header)
        export_btn_frame.pack(side=tk.LEFT)

        self._create_btn(export_btn_frame, "动画预览", self._on_render, is_primary=True).pack(side=tk.LEFT, padx=1)
        self._create_btn(export_btn_frame, "导出 PDF", self._on_export_pdf, is_primary=True).pack(side=tk.LEFT, padx=1)
        self._create_btn(export_btn_frame, "导出 HTML", self._on_export_html, is_primary=True).pack(side=tk.LEFT, padx=1)

    def _create_editor_panel(self, parent):
        """创建左侧编辑器面板"""
        # 编辑器容器
        editor_frame = tk.Frame(parent, bg=self.bg_panel, bd=1, relief=tk.FLAT,
                               highlightbackground=self.border_color, highlightthickness=1)
        editor_frame.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=(0, 20))

        # 面板标题栏
        header = tk.Frame(editor_frame, bg=self.bg_header)
        header.pack(fill=tk.X)
        header.configure(height=38)

        tk.Label(
            header, text="MARKDOWN 编辑器",
            font=("Microsoft YaHei UI", 10, "bold"),
            fg=self.text_secondary, bg=self.bg_header
        ).pack(side=tk.LEFT, padx=18, pady=10)

        tk.Label(
            header, text="支持完整的 Markdown 语法",
            font=("Microsoft YaHei UI", 8),
            fg=self.text_muted, bg=self.bg_header
        ).pack(side=tk.RIGHT, padx=18, pady=10)

        # 编辑器
        self.editor = scrolledtext.ScrolledText(
            editor_frame,
            bg="#0d0d0d",
            fg=self.text_primary,
            insertbackground=self.accent,
            selectbackground=self.accent,
            selectforeground=self.white,
            font=("Consolas", self.font_size.get()),
            relief=tk.FLAT,
            wrap=tk.WORD,
            padx=20,
            pady=16,
            undo=True
        )
        self.editor.pack(fill=tk.BOTH, expand=True)

        # Tab 插入空格
        self.editor.bind("<Tab>", lambda e: self._insert_spaces(4))

        # 加载示例
        self._load_sample()

    def _create_preview_panel(self, parent):
        """创建右侧预览面板"""
        # 预览容器
        preview_frame = tk.Frame(parent, bg=self.bg_panel, bd=1, relief=tk.FLAT,
                                 highlightbackground=self.border_color, highlightthickness=1)
        preview_frame.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=(0, 0))

        # 面板标题栏
        header = tk.Frame(preview_frame, bg=self.bg_header)
        header.pack(fill=tk.X)
        header.configure(height=38)

        tk.Label(
            header, text="实时预览",
            font=("Microsoft YaHei UI", 10, "bold"),
            fg=self.text_secondary, bg=self.bg_header
        ).pack(side=tk.LEFT, padx=18, pady=10)

        # 预览提示
        self.preview_hint = tk.Label(
            header,
            text="",
            font=("Microsoft YaHei UI", 8),
            fg=self.accent, bg=self.bg_header
        )
        self.preview_hint.pack(side=tk.RIGHT, padx=18, pady=10)

        # 预览 iframe 容器
        self.preview_container = tk.Frame(preview_frame, bg=self.bg_panel)
        self.preview_container.pack(fill=tk.BOTH, expand=True, padx=8, pady=8)

        # 预览说明
        hint_frame = tk.Frame(preview_frame, bg=self.bg_dark)
        hint_frame.pack(fill=tk.X, padx=8, pady=(0, 8))

        hint_text = """📌 操作提示
• Ctrl+R: 渲染预览
• Ctrl+O: 打开文件
• Ctrl+S: 保存文件
• Ctrl+Shift+H: 导出 HTML"""

        tk.Label(
            hint_frame,
            text=hint_text,
            font=("Microsoft YaHei UI", 8),
            fg=self.text_muted, bg=self.bg_dark,
            justify=tk.LEFT, anchor="w", padx=12, pady=10
        ).pack()

    def _create_statusbar(self, parent):
        """创建状态栏"""
        statusbar = tk.Frame(parent, bg=self.bg_dark, height=26)
        statusbar.pack(fill=tk.X, side=tk.BOTTOM, pady=(10, 0))
        statusbar.pack_propagate(False)

        self.status_text = tk.Label(
            statusbar, text="就绪",
            font=("Segoe UI", 8),
            fg=self.text_muted, bg=self.bg_dark
        )
        self.status_text.pack(side=tk.LEFT, padx=16, anchor="c", fill="y", expand=True)

        # 字符统计
        self.char_count_label = tk.Label(
            statusbar, text="0 字符",
            font=("Segoe UI", 8),
            fg=self.text_muted, bg=self.bg_dark
        )
        self.char_count_label.pack(side=tk.RIGHT, padx=16, anchor="c")

        self._line_count_label = tk.Label(
            statusbar, text="0 行",
            font=("Segoe UI", 8),
            fg=self.text_muted, bg=self.bg_dark
        )
        self._line_count_label.pack(side=tk.RIGHT, padx=(16, 0), anchor="c")

        # 绑定事件
        self.editor.bind("<KeyRelease>", self._update_counts)
        self.root.bind("<Control-r>", lambda e: self._on_render())
        self.root.bind("<Control-o>", lambda e: self._open_file())
        self.root.bind("<Control-s>", lambda e: self._save_file())
        self.root.bind("<Control-Shift-H>", lambda e: self._on_export_html())

    def _insert_spaces(self, num: int):
        """插入空格"""
        self.editor.insert(tk.INSERT, " " * num)
        return "break"

    def _update_counts(self, event=None):
        """更新统计"""
        content = self.editor.get("1.0", tk.END)
        char_count = len(content) - 1
        line_count = int(self.editor.index(tk.END).split(".")[0]) - 1

        if hasattr(self, 'char_count_label'):
            self.char_count_label.config(text=f"{char_count} 字符")
        if hasattr(self, '_line_count_label'):
            self._line_count_label.config(text=f"{line_count} 行")

        # 防抖渲染
        if self._render_timer:
            self.root.after_cancel(self._render_timer)
        self._render_timer = self.root.after(1500, self._on_render)

    def _init_backend(self):
        """初始化后端"""
        def _init():
            if PARSER_AVAILABLE:
                try:
                    self.parser = MarkdownParser()
                    self.renderer = HTMLRenderer(get_theme(self.current_theme_id.get()))
                    self.root.after(0, lambda: self._set_status("后端组件已就绪"))
                except Exception as e:
                    self.root.after(0, lambda: self._set_status(f"后端初始化失败: {e}"))
            else:
                self.root.after(0, lambda: self._set_status("后端组件不可用"))

        threading.Thread(target=_init, daemon=True).start()

    def _load_themes(self):
        """加载主题"""
        try:
            if PARSER_AVAILABLE:
                themes = get_all_themes()
                self.themes = themes
                theme_names = [t.get("name", t.get("id", "unknown")) for t in themes]
                if theme_names:
                    self.theme_combo["values"] = theme_names
        except Exception as e:
            print(f"加载主题失败: {e}")

    def _on_theme_changed(self, event=None):
        """主题切换"""
        try:
            theme_name = self.current_theme_id.get()
            theme = get_theme(theme_name)
            if theme and self.renderer:
                self.renderer = HTMLRenderer(theme)
                self._on_render()
                self._set_status(f"已切换主题: {theme_name}")
        except Exception as e:
            self._set_status(f"切换主题失败: {e}")

    def _on_render(self, event=None):
        """渲染 Markdown"""
        if not PARSER_AVAILABLE or not self.parser:
            self._set_status("后端组件未就绪")
            return

        try:
            markdown = self.editor.get("1.0", tk.END).strip()
            if not markdown:
                self._set_status("请输入内容")
                self.preview_hint.config(text="请输入 Markdown 内容")
                return

            self._set_status("正在渲染...")
            self.preview_hint.config(text="渲染中...")

            # 解析
            blocks = self.parser.parse(markdown)
            blocks_dict = [
                {"type": b.type, "content": b.content, "level": b.level, "meta": b.meta}
                for b in blocks
            ]

            # 构建 AST
            ast = ASTBuilder().build_from_blocks(blocks_dict)

            # 标题
            title = markdown.split("\n")[0].lstrip("# ").strip()

            # 渲染
            html = self.renderer.render(ast, title=title)

            # 保存预览
            with open(self.preview_html_path, "w", encoding="utf-8") as f:
                f.write(html)

            # 打开预览
            webbrowser.open(f"file:///{self.preview_html_path}")

            self._set_status("渲染完成")
            self.preview_hint.config(text="✓ 渲染完成")

        except Exception as e:
            self._set_status(f"渲染错误: {e}")
            self.preview_hint.config(text="✗ 渲染失败")

    def _on_export_pdf(self):
        """导出 PDF"""
        file_path = filedialog.asksaveasfilename(
            defaultextension=".pdf",
            filetypes=[("PDF 文件", "*.pdf"), ("所有文件", "*.*")],
            initialdir=os.path.expanduser("~")
        )
        if not file_path:
            return

        self._set_status("正在导出 PDF...")

        def _export():
            try:
                markdown = self.editor.get("1.0", tk.END).strip()
                blocks = self.parser.parse(markdown)
                blocks_dict = [
                    {"type": b.type, "content": b.content, "level": b.level, "meta": b.meta}
                    for b in blocks
                ]

                ast = ASTBuilder().build_from_blocks(blocks_dict)
                title = markdown.split("\n")[0].lstrip("# ").strip()
                html = self.renderer.render(ast, title=title)

                html_path = file_path.replace(".pdf", ".html")
                with open(html_path, "w", encoding="utf-8") as f:
                    f.write(html)

                webbrowser.open(f"file:///{html_path}")
                self.root.after(0, lambda: self._set_status(f"已导出: {os.path.basename(file_path)}"))

            except Exception as e:
                self.root.after(0, lambda: self._set_status(f"导出失败: {e}"))

        threading.Thread(target=_export, daemon=True).start()

    def _on_export_html(self):
        """导出 HTML"""
        file_path = filedialog.asksaveasfilename(
            defaultextension=".html",
            filetypes=[("HTML 文件", "*.html"), ("所有文件", "*.*")],
            initialdir=os.path.expanduser("~")
        )
        if not file_path:
            return

        self._set_status("正在导出 HTML...")

        try:
            markdown = self.editor.get("1.0", tk.END).strip()
            blocks = self.parser.parse(markdown)
            blocks_dict = [
                {"type": b.type, "content": b.content, "level": b.level, "meta": b.meta}
                for b in blocks
            ]

            ast = ASTBuilder().build_from_blocks(blocks_dict)
            title = markdown.split("\n")[0].lstrip("# ").strip()
            html = self.renderer.render(ast, title=title)

            with open(file_path, "w", encoding="utf-8") as f:
                f.write(html)

            webbrowser.open(f"file:///{file_path}")
            self._set_status(f"已导出: {os.path.basename(file_path)}")

        except Exception as e:
            self._set_status(f"导出失败: {e}")

    def _load_sample(self):
        """加载示例"""
        self.editor.delete("1.0", tk.END)
        self.editor.insert("1.0", DEFAULT_MARKDOWN)

    def _new_file(self):
        """新建文件"""
        self.editor.delete("1.0", tk.END)
        self.current_file = None
        self._set_status("新建文件")

    def _open_file(self):
        """打开文件"""
        file_path = filedialog.askopenfilename(
            filetypes=[("Markdown 文件", "*.md"), ("所有文件", "*.*")],
            initialdir=os.path.expanduser("~")
        )
        if file_path:
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    content = f.read()
                self.editor.delete("1.0", tk.END)
                self.editor.insert("1.0", content)
                self.current_file = file_path
                self._set_status(f"已打开: {os.path.basename(file_path)}")
                self.root.after(300, self._on_render)
            except Exception as e:
                messagebox.showerror("错误", f"打开文件失败: {e}")

    def _save_file(self):
        """保存文件"""
        file_path = filedialog.asksaveasfilename(
            defaultextension=".md",
            filetypes=[("Markdown 文件", "*.md"), ("所有文件", "*.*")],
            initialdir=os.path.dirname(self.current_file) if self.current_file else os.path.expanduser("~")
        )
        if file_path:
            try:
                content = self.editor.get("1.0", tk.END)
                with open(file_path, "w", encoding="utf-8") as f:
                    f.write(content)
                self.current_file = file_path
                self._set_status(f"已保存: {os.path.basename(file_path)}")
            except Exception as e:
                messagebox.showerror("错误", f"保存文件失败: {e}")

    def _set_status(self, message: str):
        """设置状态"""
        self.status_text.config(text=message)

    def run(self):
        """启动应用"""
        # 居中显示
        self.root.update_idletasks()
        width = self.root.winfo_width()
        height = self.root.winfo_height()
        if width < 100:
            width = self.WINDOW_MIN_WIDTH
            height = self.WINDOW_MIN_HEIGHT
        x = (self.root.winfo_screenwidth() // 2) - (width // 2)
        y = (self.root.winfo_screenheight() // 2) - (height // 2)
        self.root.geometry(f"{width}x{height}+{x}+{y}")

        self.root.mainloop()


def main():
    app = RivertypeApp()
    app.run()


if __name__ == "__main__":
    main()
