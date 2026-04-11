# -*- coding: utf-8 -*-
"""
RIVERTYPE SVG 标题生成器
自动生成具有设计感的视觉标题 SVG
"""

from typing import List, Dict, Any, Optional, Tuple
import svgwrite


class SVGTitleGenerator:
    """SVG 标题生成器"""

    def __init__(self, theme_colors: Dict[str, str]):
        self.colors = theme_colors
        self.background = theme_colors.get("background", "#0b0b0b")
        self.text_primary = theme_colors.get("text_primary", "#ffffff")
        self.accent = theme_colors.get("accent", "#9b1c31")
        self.border = theme_colors.get("border", "#333333")

    def generate_title_svg(
        self,
        title: str,
        subtitle: str = "",
        width: int = 800,
        height: int = 400,
        style: str = "geometric"
    ) -> str:
        """
        生成标题 SVG

        Args:
            title: 主标题
            subtitle: 副标题
            width: SVG 宽度
            height: SVG 高度
            style: 风格类型 (geometric, minimal, dramatic)

        Returns:
            SVG 字符串
        """
        if style == "geometric":
            return self._generate_geometric_style(title, subtitle, width, height)
        elif style == "minimal":
            return self._generate_minimal_style(title, subtitle, width, height)
        elif style == "dramatic":
            return self._generate_dramatic_style(title, subtitle, width, height)
        else:
            return self._generate_geometric_style(title, subtitle, width, height)

    def _generate_geometric_style(
        self, title: str, subtitle: str, width: int, height: int
    ) -> str:
        """几何风格标题"""
        dwg = svgwrite.Drawing(size=(width, height))

        # 背景
        dwg.add(dwg.rect(insert=(0, 0), size=(width, height), fill=self.background))

        # 装饰线条 - 左上角
        line_length = 120
        dwg.add(dwg.line(
            start=(40, 40),
            end=(40 + line_length, 40),
            stroke=self.accent,
            stroke_width=2
        ))
        dwg.add(dwg.line(
            start=(40, 40),
            end=(40, 40 + line_length),
            stroke=self.accent,
            stroke_width=2
        ))

        # 装饰线条 - 右下角
        dwg.add(dwg.line(
            start=(width - 40 - line_length, height - 40),
            end=(width - 40, height - 40),
            stroke=self.border,
            stroke_width=1
        ))
        dwg.add(dwg.line(
            start=(width - 40, height - 40 - line_length),
            end=(width - 40, height - 40),
            stroke=self.border,
            stroke_width=1
        ))

        # 背景几何装饰
        center_x = width / 2
        center_y = height / 2

        # 半透明圆形
        dwg.add(dwg.circle(
            center=(center_x, center_y),
            r=150,
            fill="none",
            stroke=self.border,
            stroke_width=1,
            opacity=0.3
        ))

        # 内圈
        dwg.add(dwg.circle(
            center=(center_x, center_y),
            r=100,
            fill="none",
            stroke=self.border,
            stroke_width=0.5,
            opacity=0.2
        ))

        # 主标题
        title_font_size = min(48, 600 / len(title))
        dwg.add(dwg.text(
            title.upper(),
            insert=(center_x, center_y - 20),
            font_family="Noto Serif SC, serif",
            font_size=title_font_size,
            fill=self.text_primary,
            text_anchor="middle",
            dominant_baseline="middle",
            letter_spacing="8"
        ))

        # 副标题
        if subtitle:
            dwg.add(dwg.text(
                subtitle,
                insert=(center_x, center_y + 40),
                font_family="Inter, sans-serif",
                font_size=14,
                fill=self.colors.get("text_secondary", "#888888"),
                text_anchor="middle",
                letter_spacing="4"
            ))

        # 底部装饰线
        dwg.add(dwg.line(
            start=(center_x - 100, center_y + 80),
            end=(center_x + 100, center_y + 80),
            stroke=self.accent,
            stroke_width=1,
            opacity=0.5
        ))

        return dwg.tostring()

    def _generate_minimal_style(
        self, title: str, subtitle: str, width: int, height: int
    ) -> str:
        """极简风格标题"""
        dwg = svgwrite.Drawing(size=(width, height))

        # 纯色背景
        dwg.add(dwg.rect(insert=(0, 0), size=(width, height), fill=self.background))

        center_x = width / 2
        center_y = height / 2

        # 主标题 - 居中大字
        title_font_size = min(56, 500 / len(title))
        dwg.add(dwg.text(
            title,
            insert=(center_x, center_y),
            font_family="Noto Serif SC, serif",
            font_size=title_font_size,
            fill=self.text_primary,
            text_anchor="middle",
            dominant_baseline="middle",
            letter_spacing="12"
        ))

        # 底部短线
        dwg.add(dwg.line(
            start=(center_x - 30, center_y + 60),
            end=(center_x + 30, center_y + 60),
            stroke=self.accent,
            stroke_width=2
        ))

        return dwg.tostring()

    def _generate_dramatic_style(
        self, title: str, subtitle: str, width: int, height: int
    ) -> str:
        """戏剧性风格标题"""
        dwg = svgwrite.Drawing(size=(width, height))

        # 渐变背景效果（用多个矩形模拟）
        for i in range(10):
            opacity = 0.1 * (10 - i) / 10
            offset = i * 5
            dwg.add(dwg.rect(
                insert=(offset, offset),
                size=(width - offset * 2, height - offset * 2),
                fill="none",
                stroke=self.accent,
                stroke_width=0.5,
                opacity=opacity * 0.3
            ))

        # 主背景
        dwg.add(dwg.rect(insert=(0, 0), size=(width, height), fill=self.background))

        center_x = width / 2
        center_y = height / 2

        # 装饰斜线
        for i in range(5):
            y_offset = i * 20 - 40
            dwg.add(dwg.line(
                start=(0, center_y + y_offset),
                end=(width, center_y + y_offset + 50),
                stroke=self.border,
                stroke_width=0.5,
                opacity=0.2
            ))

        # 主标题 - 分割效果
        title_parts = title.split()
        title_font_size = min(52, 450 / len(title))

        # 第一个词 - 强调
        if title_parts:
            first_word = title_parts[0]
            rest_words = " ".join(title_parts[1:]) if len(title_parts) > 1 else ""

            dwg.add(dwg.text(
                first_word.upper(),
                insert=(center_x, center_y - 10),
                font_family="Noto Serif SC, serif",
                font_size=title_font_size,
                fill=self.accent,
                text_anchor="middle",
                dominant_baseline="middle",
                letter_spacing="6"
            ))

            if rest_words:
                dwg.add(dwg.text(
                    rest_words.upper(),
                    insert=(center_x, center_y + 50),
                    font_family="Noto Serif SC, serif",
                    font_size=int(title_font_size * 0.7),
                    fill=self.text_primary,
                    text_anchor="middle",
                    dominant_baseline="middle",
                    letter_spacing="4"
                ))

        # 装饰点
        dot_y = center_y + 100
        for i in range(3):
            x_offset = (i - 1) * 20
            dwg.add(dwg.circle(
                center=(center_x + x_offset, dot_y),
                r=3 if i == 1 else 2,
                fill=self.accent if i == 1 else self.border
            ))

        return dwg.tostring()

    def generate_section_divider(self, width: int = 600, height: int = 60) -> str:
        """生成分隔线 SVG"""
        dwg = svgwrite.Drawing(size=(width, height))

        dwg.add(dwg.rect(insert=(0, 0), size=(width, height), fill=self.background))

        center_x = width / 2
        center_y = height / 2

        # 主线
        dwg.add(dwg.line(
            start=(0, center_y),
            end=(width, center_y),
            stroke=self.border,
            stroke_width=1
        ))

        # 中心装饰
        dwg.add(dwg.circle(
            center=(center_x, center_y),
            r=4,
            fill=self.accent
        ))

        return dwg.tostring()

    def generate_corner_decoration(
        self, corner: str = "top-left", size: int = 100
    ) -> str:
        """
        生成角落装饰

        Args:
            corner: 角落位置 (top-left, top-right, bottom-left, bottom-right)
            size: 装饰大小
        """
        dwg = svgwrite.Drawing(size=(size, size))

        if corner == "top-left":
            dwg.add(dwg.line(
                start=(0, 0),
                end=(size, 0),
                stroke=self.accent,
                stroke_width=2
            ))
            dwg.add(dwg.line(
                start=(0, 0),
                end=(0, size),
                stroke=self.accent,
                stroke_width=2
            ))
            dwg.add(dwg.line(
                start=(0, 0),
                end=(size * 0.6, size * 0.6),
                stroke=self.border,
                stroke_width=0.5
            ))

        elif corner == "top-right":
            dwg.add(dwg.line(
                start=(0, 0),
                end=(size, 0),
                stroke=self.accent,
                stroke_width=2
            ))
            dwg.add(dwg.line(
                start=(size, 0),
                end=(size, size),
                stroke=self.accent,
                stroke_width=2
            ))

        elif corner == "bottom-left":
            dwg.add(dwg.line(
                start=(0, size),
                end=(size, size),
                stroke=self.accent,
                stroke_width=2
            ))
            dwg.add(dwg.line(
                start=(0, 0),
                end=(0, size),
                stroke=self.accent,
                stroke_width=2
            ))

        elif corner == "bottom-right":
            dwg.add(dwg.line(
                start=(0, size),
                end=(size, size),
                stroke=self.accent,
                stroke_width=2
            ))
            dwg.add(dwg.line(
                start=(size, 0),
                end=(size, size),
                stroke=self.accent,
                stroke_width=2
            ))

        return dwg.tostring()


def create_svg_generator(theme_colors: Dict[str, str]) -> SVGTitleGenerator:
    """创建 SVG 生成器工厂函数"""
    return SVGTitleGenerator(theme_colors)
