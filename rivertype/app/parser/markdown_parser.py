# -*- coding: utf-8 -*-
"""
RIVERTYPE Markdown 解析器
将 Markdown 文本解析为结构化的 AST
"""

from typing import List, Dict, Any, Optional
from dataclasses import dataclass, field
from markdown_it import MarkdownIt
from markdown_it.common.utils import escapeHtml
import re


@dataclass
class Block:
    """文档块基类"""
    type: str
    content: str
    level: int = 0  # 用于标题层级
    meta: Dict[str, Any] = field(default_factory=dict)


class MarkdownParser:
    """Markdown 解析器 - 将 Markdown 转换为结构化 AST"""

    def __init__(self):
        self.md = MarkdownIt("commonmark", {"typographer": True, "html": True})
        self.md.enable(['table', 'strikethrough'])

    def parse(self, markdown_text: str) -> List[Block]:
        """
        解析 Markdown 文本为块列表

        Args:
            markdown_text: Markdown 格式的文本

        Returns:
            Block 列表，每个 Block 包含 type, content, level 等信息
        """
        blocks = []
        lines = markdown_text.split('\n')
        i = 0

        while i < len(lines):
            line = lines[i]

            # 跳过空行但保留段落分隔
            if not line.strip():
                i += 1
                continue

            # 解析标题 (# ## ###)
            if line.startswith('#'):
                title_match = re.match(r'^(#{1,6})\s+(.+)$', line)
                if title_match:
                    level = len(title_match.group(1))
                    text = title_match.group(2).strip()
                    blocks.append(Block(
                        type="heading",
                        content=text,
                        level=level,
                        meta={"original": line}
                    ))
                    i += 1
                    continue

            # 解析引用 (> )
            if line.startswith('>'):
                quote_lines = []
                while i < len(lines) and lines[i].startswith('>'):
                    quote_text = lines[i][1:].strip()
                    if quote_text:
                        quote_lines.append(quote_text)
                    i += 1
                blocks.append(Block(
                    type="quote",
                    content=' '.join(quote_lines),
                    meta={"lines": len(quote_lines)}
                ))
                continue

            # 解析代码块 (```)
            if line.strip().startswith('```'):
                code_lines = []
                i += 1
                while i < len(lines) and not lines[i].strip().startswith('```'):
                    code_lines.append(lines[i])
                    i += 1
                lang = line.strip()[3:] if len(line.strip()) > 3 else ""
                blocks.append(Block(
                    type="code",
                    content='\n'.join(code_lines),
                    meta={"language": lang}
                ))
                i += 1
                continue

            # 解析列表 (- * 1.)
            if re.match(r'^[\-\*]\s', line) or re.match(r'^\d+\.\s', line):
                list_items = []
                while i < len(lines) and (re.match(r'^[\-\*]\s', lines[i]) or re.match(r'^\d+\.\s', lines[i])):
                    item_text = re.sub(r'^[\-\*]\s', '', lines[i])
                    item_text = re.sub(r'^\d+\.\s', '', item_text)
                    list_items.append(item_text.strip())
                    i += 1
                blocks.append(Block(
                    type="list",
                    content='\n'.join(list_items),
                    meta={"items": list_items, "ordered": bool(re.match(r'^\d', lines[i-1]))}
                ))
                continue

            # 解析分隔线 (--- *** ___)
            if re.match(r'^[\-\*_]{3,}$', line.strip()):
                blocks.append(Block(type="divider", content=""))
                i += 1
                continue

            # 解析段落
            para_lines = []
            while i < len(lines) and lines[i].strip() and not lines[i].startswith('#'):
                para_lines.append(lines[i])
                i += 1
            if para_lines:
                para_text = ' '.join(para_lines)
                # 检测重点文本 (**text** 或 __text__)
                is_highlight = bool(re.search(r'\*\*|__', para_text))
                blocks.append(Block(
                    type="paragraph",
                    content=para_text,
                    meta={"highlight": is_highlight}
                ))

        return blocks

    def parse_to_dict(self, markdown_text: str) -> List[Dict[str, Any]]:
        """解析为字典格式，便于 JSON 序列化"""
        blocks = self.parse(markdown_text)
        return [
            {
                "type": b.type,
                "content": b.content,
                "level": b.level,
                "meta": b.meta
            }
            for b in blocks
        ]

    def extract_title(self, blocks: List[Block]) -> Optional[str]:
        """提取文档主标题"""
        for block in blocks:
            if block.type == "heading" and block.level == 1:
                return block.content
        return None

    def extract_metadata(self, markdown_text: str) -> Dict[str, Any]:
        """提取文档元数据"""
        metadata = {
            "has_title": False,
            "title_level": None,
            "quote_count": 0,
            "code_blocks": 0,
            "word_count": 0
        }

        blocks = self.parse(markdown_text)

        for block in blocks:
            if block.type == "heading" and block.level == 1:
                metadata["has_title"] = True
                metadata["title"] = block.content
                metadata["title_level"] = 1
            elif block.type == "quote":
                metadata["quote_count"] += 1
            elif block.type == "code":
                metadata["code_blocks"] += 1

        # 计算字数
        text = re.sub(r'[#*>`\[\]!]', '', markdown_text)
        metadata["word_count"] = len(text.split())

        return metadata
