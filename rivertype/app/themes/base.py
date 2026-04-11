# -*- coding: utf-8 -*-
"""
RIVERTYPE 主题系统
定义和管理视觉风格主题
"""

from typing import Dict, Any, List, Optional
from dataclasses import dataclass, field
from enum import Enum


class ThemeType(Enum):
    """主题类型枚举"""
    RONGJING = "rongjing"           # 荣景文川风
    LIVING_TRUE = "living_ture"     # Living Ture 风
    NOIR_RESEARCH = "noir_research" # Noir Research 风


@dataclass
class ThemeColors:
    """主题颜色配置"""
    background: str = "#0b0b0b"      # 主背景色
    background_secondary: str = "#141414"  # 次级背景色
    text_primary: str = "#ffffff"    # 主文字色
    text_secondary: str = "#a0a0a0"  # 次级文字色
    accent: str = "#9b1c31"          # 强调色
    accent_secondary: str = "#c41e3a"  # 次级强调色
    border: str = "#2a2a2a"          # 边框色
    quote_background: str = "#1a1a1a"  # 引用块背景

    def to_dict(self) -> Dict[str, str]:
        return {
            "background": self.background,
            "background_secondary": self.background_secondary,
            "text_primary": self.text_primary,
            "text_secondary": self.text_secondary,
            "accent": self.accent,
            "accent_secondary": self.accent_secondary,
            "border": self.border,
            "quote_background": self.quote_background
        }


@dataclass
class ThemeTypography:
    """主题排版配置"""
    font_family_main: str = "Noto Serif SC, serif"
    font_family_display: str = "Noto Serif SC, serif"
    font_family_code: str = "JetBrains Mono, monospace"
    font_size_base: str = "16px"
    font_size_small: str = "14px"
    font_size_large: str = "18px"
    line_height: float = 1.8
    letter_spacing: str = "0.02em"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "font_family_main": self.font_family_main,
            "font_family_display": self.font_family_display,
            "font_family_code": self.font_family_code,
            "font_size_base": self.font_size_base,
            "font_size_small": self.font_size_small,
            "font_size_large": self.font_size_large,
            "line_height": self.line_height,
            "letter_spacing": self.letter_spacing
        }


@dataclass
class ThemeSpacing:
    """主题间距配置"""
    page_padding: str = "60px"
    section_margin: str = "40px"
    paragraph_margin: str = "24px"
    quote_padding: str = "32px"
    heading_margin: str = "48px"

    def to_dict(self) -> Dict[str, str]:
        return {
            "page_padding": self.page_padding,
            "section_margin": self.section_margin,
            "paragraph_margin": self.paragraph_margin,
            "quote_padding": self.quote_padding,
            "heading_margin": self.heading_margin
        }


@dataclass
class ThemeDecorations:
    """主题装饰配置"""
    show_lines: bool = True          # 显示装饰线条
    line_color: str = "#333333"       # 线条颜色
    show_shadows: bool = True        # 显示阴影
    show_borders: bool = True        # 显示边框
    border_radius: str = "4px"       # 圆角
    animation_enabled: bool = True   # 启用动画

    def to_dict(self) -> Dict[str, Any]:
        return {
            "show_lines": self.show_lines,
            "line_color": self.line_color,
            "show_shadows": self.show_shadows,
            "show_borders": self.show_borders,
            "border_radius": self.border_radius,
            "animation_enabled": self.animation_enabled
        }


@dataclass
class Theme:
    """完整主题配置"""
    id: str
    name: str
    description: str
    theme_type: ThemeType
    colors: ThemeColors = field(default_factory=ThemeColors)
    typography: ThemeTypography = field(default_factory=ThemeTypography)
    spacing: ThemeSpacing = field(default_factory=ThemeSpacing)
    decorations: ThemeDecorations = field(default_factory=ThemeDecorations)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "theme_type": self.theme_type.value,
            "colors": self.colors.to_dict(),
            "typography": self.typography.to_dict(),
            "spacing": self.spacing.to_dict(),
            "decorations": self.decorations.to_dict()
        }

    def to_css_variables(self) -> str:
        """转换为 CSS 变量"""
        css_vars = ":root {\n"
        for key, value in self.colors.to_dict().items():
            css_vars += f"    --color-{key}: {value};\n"
        for key, value in self.typography.to_dict().items():
            css_vars += f"    --font-{key}: {value};\n"
        for key, value in self.spacing.to_dict().items():
            css_vars += f"    --spacing-{key}: {value};\n"
        for key, value in self.decorations.to_dict().items():
            if isinstance(value, bool):
                css_vars += f"    --decor-{key}: {'1' if value else '0'};\n"
            else:
                css_vars += f"    --decor-{key}: {value};\n"
        css_vars += "}"
        return css_vars


class ThemeRegistry:
    """主题注册表 - 管理所有可用主题"""

    def __init__(self):
        self._themes: Dict[str, Theme] = {}
        self._register_builtin_themes()

    def _register_builtin_themes(self):
        """注册内置主题"""
        self.register(Theme(
            id="rongjing",
            name="荣景文川",
            description="黑色背景、大留白、东方感、红色点缀、像未来文明手册",
            theme_type=ThemeType.RONGJING,
            colors=ThemeColors(
                background="#0b0b0b",
                background_secondary="#141414",
                text_primary="#e8e8e8",
                text_secondary="#888888",
                accent="#c41e3a",
                accent_secondary="#ff4757",
                border="#2a2a2a",
                quote_background="#1a1a1a"
            ),
            typography=ThemeTypography(
                font_family_main="Noto Serif SC, Source Han Serif SC, serif",
                font_family_display="Noto Serif SC, Source Han Serif SC, serif",
                letter_spacing="0.05em"
            ),
            spacing=ThemeSpacing(
                page_padding="80px",
                section_margin="60px",
                paragraph_margin="32px"
            ),
            decorations=ThemeDecorations(
                show_lines=True,
                line_color="#3a3a3a",
                show_shadows=False
            )
        ))

        self.register(Theme(
            id="living_ture",
            name="Living Ture",
            description="深黑 + 霓虹红、杂志封面感、夜色、欲望、危险感",
            theme_type=ThemeType.LIVING_TRUE,
            colors=ThemeColors(
                background="#0a0a0a",
                background_secondary="#111111",
                text_primary="#ffffff",
                text_secondary="#cccccc",
                accent="#ff1744",
                accent_secondary="#ff5252",
                border="#222222",
                quote_background="#151515"
            ),
            typography=ThemeTypography(
                font_family_main="Inter, -apple-system, sans-serif",
                font_family_display="Inter, -apple-system, sans-serif",
                letter_spacing="0.01em",
                line_height=1.6
            ),
            spacing=ThemeSpacing(
                page_padding="48px",
                section_margin="32px"
            ),
            decorations=ThemeDecorations(
                show_lines=True,
                line_color="#ff1744",
                show_shadows=True,
                animation_enabled=True
            )
        ))

        self.register(Theme(
            id="noir_research",
            name="Noir Research",
            description="高级研究报告风格、深灰、银白、适合理论与论文",
            theme_type=ThemeType.NOIR_RESEARCH,
            colors=ThemeColors(
                background="#1a1a1a",
                background_secondary="#242424",
                text_primary="#e0e0e0",
                text_secondary="#a0a0a0",
                accent="#607d8b",
                accent_secondary="#90a4ae",
                border="#333333",
                quote_background="#202020"
            ),
            typography=ThemeTypography(
                font_family_main="IBM Plex Serif, Georgia, serif",
                font_family_display="IBM Plex Sans, sans-serif",
                font_size_base="15px",
                line_height=1.85
            ),
            spacing=ThemeSpacing(
                page_padding="72px",
                section_margin="48px",
                paragraph_margin="28px"
            ),
            decorations=ThemeDecorations(
                show_lines=False,
                show_shadows=False,
                show_borders=True,
                border_radius="2px"
            )
        ))

    def register(self, theme: Theme):
        """注册主题"""
        self._themes[theme.id] = theme

    def get(self, theme_id: str) -> Optional[Theme]:
        """获取主题"""
        return self._themes.get(theme_id)

    def list_themes(self) -> List[Theme]:
        """列出所有主题"""
        return list(self._themes.values())

    def get_theme_info(self) -> List[Dict[str, str]]:
        """获取主题列表信息"""
        return [
            {"id": t.id, "name": t.name, "description": t.description}
            for t in self._themes.values()
        ]


# 全局主题注册表
registry = ThemeRegistry()


def get_theme(theme_id: str) -> Optional[Theme]:
    """获取指定主题"""
    return registry.get(theme_id)


def get_all_themes() -> List[Theme]:
    """获取所有主题"""
    return registry.list_themes()


def get_theme_css_variables(theme_id: str) -> str:
    """获取主题的 CSS 变量"""
    theme = registry.get(theme_id)
    if theme:
        return theme.to_css_variables()
    return ""
