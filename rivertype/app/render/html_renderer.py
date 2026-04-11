# -*- coding: utf-8 -*-
"""
RIVERTYPE HTML 渲染器
将 AST 和主题转换为完整的 HTML 页面
"""

from typing import Dict, Any, List, Optional
from pathlib import Path
import os
from jinja2 import Environment, FileSystemLoader, select_autoescape
from ..parser.ast_builder import ASTBuilder, ASTNode, NodeType
from ..themes.base import Theme
from .svg_generator import SVGTitleGenerator


class HTMLRenderer:
    """HTML 渲染器"""

    def __init__(self, theme: Theme, template_dir: Optional[str] = None):
        self.theme = theme
        self.svg_generator = SVGTitleGenerator(theme.colors.to_dict())

        if template_dir is None:
            # 默认模板目录
            current_dir = Path(__file__).parent.parent
            template_dir = current_dir / "templates"

        self.template_dir = str(template_dir)
        self.env = Environment(
            loader=FileSystemLoader(self.template_dir),
            autoescape=select_autoescape(['html', 'xml'])
        )

        # 注册主题过滤器
        self.env.filters['to_css'] = self._to_css_filter

    def _to_css_filter(self, value: Any) -> str:
        """Jinja2 过滤器：将值转换为 CSS"""
        if isinstance(value, bool):
            return "1" if value else "0"
        return str(value)

    def render(self, ast: ASTBuilder, title: str = "", metadata: Optional[Dict] = None) -> str:
        """
        渲染完整的 HTML 页面

        Args:
            ast: AST 构建器实例
            title: 文档标题
            metadata: 额外元数据

        Returns:
            HTML 字符串
        """
        template = self.env.get_template(f"{self.theme.id}.html")

        # 获取标题 SVG
        if title:
            title_svg = self.svg_generator.generate_title_svg(
                title=title,
                width=800,
                height=300,
                style="geometric"
            )
        else:
            title_svg = ""

        # 处理内容节点
        content_html = self._render_nodes(ast.children if ast else [])

        # 获取 CSS 变量
        css_variables = self.theme.to_css_variables()

        # 获取主题样式
        theme_css = self._get_theme_css()

        context = {
            "title": title or "RIVERTYPE",
            "title_svg": title_svg,
            "content": content_html,
            "css_variables": css_variables,
            "theme_css": theme_css,
            "theme_name": self.theme.name,
            "metadata": metadata or {}
        }

        return template.render(**context)

    def _render_nodes(self, nodes: List[ASTNode]) -> str:
        """渲染节点列表为 HTML"""
        html_parts = []

        for node in nodes:
            html_parts.append(self._render_node(node))

        return "\n".join(html_parts)

    def _render_node(self, node: ASTNode) -> str:
        """渲染单个节点为 HTML"""
        if node.node_type == NodeType.HEADING:
            return self._render_heading(node)
        elif node.node_type == NodeType.PARAGRAPH:
            return self._render_paragraph(node)
        elif node.node_type == NodeType.QUOTE:
            return self._render_quote(node)
        elif node.node_type == NodeType.CODE:
            return self._render_code(node)
        elif node.node_type == NodeType.LIST:
            return self._render_list(node)
        elif node.node_type == NodeType.DIVIDER:
            return self._render_divider(node)
        else:
            return f"<p>{self._escape_html(node.content)}</p>"

    def _render_heading(self, node: ASTNode) -> str:
        """渲染标题"""
        level = node.level
        tag = f"h{level}"
        text = self._render_inline_nodes(node.children)

        classes = f"heading heading-{level}"

        # 主标题特殊处理
        if level == 1:
            classes += " main-title"
            # 添加 SVG 装饰
            svg_decorator = self.svg_generator.generate_section_divider(200, 20)
            return f'<{tag} class="{classes}">{text}</{tag}><div class="title-decorator">{svg_decorator}</div>'

        return f'<{tag} class="{classes}">{text}</{tag}>'

    def _render_paragraph(self, node: ASTNode) -> str:
        """渲染段落"""
        content = self._render_inline_nodes(node.children)

        # 检测是否为重要段落
        is_important = node.attributes.get("highlight", False)
        class_name = "paragraph important" if is_important else "paragraph"

        return f'<p class="{class_name}">{content}</p>'

    def _render_quote(self, node: ASTNode) -> str:
        """渲染引用块"""
        content = self._render_inline_nodes(node.children)
        lines = node.attributes.get("lines", 1)

        svg_quote = self._generate_quote_decoration()

        return f'''
<blockquote class="quote" data-lines="{lines}">
    <div class="quote-decoration">{svg_quote}</div>
    <div class="quote-content">{content}</div>
</blockquote>'''

    def _render_code(self, node: ASTNode) -> str:
        """渲染代码块"""
        code = self._escape_html(node.content)
        lang = node.attributes.get("language", "")

        if lang:
            return f'''
<pre class="code-block" data-language="{lang}">
    <code class="language-{lang}">{code}</code>
</pre>'''
        else:
            return f'<pre class="code-block"><code>{code}</code></pre>'

    def _render_list(self, node: ASTNode) -> str:
        """渲染列表"""
        is_ordered = node.attributes.get("ordered", False)
        tag = "ol" if is_ordered else "ul"

        items_html = []
        for item in node.children:
            item_content = self._render_inline_nodes(item.children)
            items_html.append(f"<li>{item_content}</li>")

        return f'<{tag} class="list">{chr(10).join(items_html)}</{tag}>'

    def _render_divider(self, node: ASTNode) -> str:
        """渲染分隔线"""
        svg_divider = self.svg_generator.generate_section_divider(300, 30)
        return f'<div class="divider">{svg_divider}</div>'

    def _render_inline_nodes(self, nodes: List[ASTNode]) -> str:
        """渲染内联节点"""
        parts = []
        for node in nodes:
            if node.node_type == NodeType.TEXT:
                parts.append(self._escape_html(node.content))
            elif node.node_type == NodeType.STRONG:
                parts.append(f"<strong>{self._escape_html(node.content)}</strong>")
            elif node.node_type == NodeType.EMPHASIS:
                parts.append(f"<em>{self._escape_html(node.content)}</em>")
            else:
                parts.append(self._escape_html(node.content))

        return "".join(parts)

    def _escape_html(self, text: str) -> str:
        """转义 HTML 特殊字符"""
        return (
            text.replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace('"', "&quot;")
            .replace("'", "&#39;")
        )

    def _generate_quote_decoration(self) -> str:
        """生成引用装饰 SVG"""
        return self.svg_generator.generate_corner_decoration("top-left", 40)

    def _get_theme_css(self) -> str:
        """获取主题特定 CSS"""
        theme_id = self.theme.id

        base_css = f'''
/* {self.theme.name} 主题样式 */
body {{
    background-color: {self.theme.colors.background};
    color: {self.theme.colors.text_primary};
    font-family: {self.theme.typography.font_family_main};
    line-height: {self.theme.typography.line_height};
    letter-spacing: {self.theme.typography.letter_spacing};
}}

.heading-1 {{
    font-size: 2.5rem;
    margin-top: 2rem;
    margin-bottom: 1rem;
    color: {self.theme.colors.text_primary};
}}

.heading-1.main-title {{
    font-size: 3rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: {self.theme.colors.accent};
}}

.heading-2 {{
    font-size: 1.8rem;
    margin-top: 1.8rem;
    margin-bottom: 0.8rem;
}}

.heading-3 {{
    font-size: 1.4rem;
    margin-top: 1.5rem;
    margin-bottom: 0.6rem;
}}

.paragraph {{
    margin-bottom: 1.5rem;
    color: {self.theme.colors.text_primary};
}}

.paragraph.important {{
    color: {self.theme.colors.accent};
    font-weight: 500;
}}

.quote {{
    background: {self.theme.colors.quote_background};
    border-left: 3px solid {self.theme.colors.accent};
    padding: 1.5rem 2rem;
    margin: 2rem 0;
    position: relative;
}}

.quote-content {{
    font-style: italic;
    color: {self.theme.colors.text_secondary};
}}

.code-block {{
    background: {self.theme.colors.background_secondary};
    border: 1px solid {self.theme.colors.border};
    border-radius: {self.theme.decorations.border_radius};
    padding: 1rem;
    overflow-x: auto;
    margin: 1.5rem 0;
}}

.list {{
    margin: 1.5rem 0;
    padding-left: 2rem;
}}

.list li {{
    margin-bottom: 0.5rem;
    color: {self.theme.colors.text_primary};
}}

.divider {{
    text-align: center;
    margin: 3rem 0;
}}

.title-decorator {{
    margin-bottom: 2rem;
}}
'''

        # 荣景主题特殊样式
        if theme_id == "rongjing":
            base_css += f'''
.heading-1.main-title {{
    font-family: {self.theme.typography.font_family_display};
    border-bottom: 1px solid {self.theme.colors.border};
    padding-bottom: 1rem;
}}
'''

        # Living Ture 主题特殊样式
        elif theme_id == "living_ture":
            base_css += f'''
.heading-1.main-title {{
    text-shadow: 0 0 20px {self.theme.colors.accent};
}}

.quote {{
    box-shadow: 0 0 10px rgba(255, 23, 68, 0.1);
}}
'''

        return base_css

    def render_to_file(self, ast: ASTBuilder, output_path: str, title: str = "") -> str:
        """渲染并保存到文件"""
        html = self.render(ast, title)
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(html)
        return output_path
