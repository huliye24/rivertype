# -*- coding: utf-8 -*-
"""
RIVERTYPE AST 构建器
用于构建和操作文档抽象语法树
"""

from typing import List, Dict, Any, Optional, Union
from dataclasses import dataclass, field
from enum import Enum


class NodeType(Enum):
    """节点类型枚举"""
    DOCUMENT = "document"
    HEADING = "heading"
    PARAGRAPH = "paragraph"
    QUOTE = "quote"
    CODE = "code"
    LIST = "list"
    LIST_ITEM = "list_item"
    DIVIDER = "divider"
    IMAGE = "image"
    TEXT = "text"
    STRONG = "strong"
    EMPHASIS = "emphasis"


@dataclass
class ASTNode:
    """AST 节点"""
    node_type: NodeType
    content: str = ""
    level: int = 0  # 标题层级
    children: List['ASTNode'] = field(default_factory=list)
    attributes: Dict[str, Any] = field(default_factory=dict)
    position: Dict[str, int] = field(default_factory=dict)  # 行号信息

    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        return {
            "type": self.node_type.value,
            "content": self.content,
            "level": self.level,
            "children": [c.to_dict() for c in self.children],
            "attributes": self.attributes,
            "position": self.position
        }

    @property
    def is_block(self) -> bool:
        """是否为块级元素"""
        return self.node_type in [
            NodeType.DOCUMENT, NodeType.HEADING, NodeType.PARAGRAPH,
            NodeType.QUOTE, NodeType.CODE, NodeType.LIST, NodeType.DIVIDER
        ]


class ASTBuilder:
    """AST 构建器 - 将解析的块转换为 AST"""

    def __init__(self):
        self.root: Optional[ASTNode] = None

    def build_from_blocks(self, blocks: List[Dict[str, Any]]) -> ASTNode:
        """
        从块列表构建 AST

        Args:
            blocks: markdown_parser 解析出的块列表（可以是字典或 Block 对象）

        Returns:
            根节点
        """
        self.root = ASTNode(node_type=NodeType.DOCUMENT)

        for idx, block in enumerate(blocks):
            node = self._block_to_node(block, idx)
            if node:
                self.root.children.append(node)

        return self.root

    def _block_to_node(self, block: Dict[str, Any], index: int) -> Optional[ASTNode]:
        """将单个块转换为 AST 节点"""
        # 支持字典或 Block 对象
        block_type = block.get("type", "paragraph") if hasattr(block, 'get') else getattr(block, 'type', 'paragraph')
        content = block.get("content", "") if hasattr(block, 'get') else getattr(block, 'content', '')
        level = block.get("level", 0) if hasattr(block, 'get') else getattr(block, 'level', 0)
        meta = block.get("meta", {}) if hasattr(block, 'get') else getattr(block, 'meta', {})

        node_type_map = {
            "heading": NodeType.HEADING,
            "paragraph": NodeType.PARAGRAPH,
            "quote": NodeType.QUOTE,
            "code": NodeType.CODE,
            "list": NodeType.LIST,
            "divider": NodeType.DIVIDER,
        }

        node_type = node_type_map.get(block_type, NodeType.PARAGRAPH)

        node = ASTNode(
            node_type=node_type,
            content=content,
            level=level,
            position={"start": index, "end": index}
        )

        # 处理特殊类型的子节点
        if block_type == "list":
            items = meta.get("items", [])
            for item_text in items:
                item_node = ASTNode(
                    node_type=NodeType.LIST_ITEM,
                    content=item_text
                )
                # 解析列表项内的内联格式
                item_node.children = self._parse_inline_content(item_text)
                node.children.append(item_node)

        # 处理段落中的内联格式
        elif block_type in ["paragraph", "quote"]:
            node.children = self._parse_inline_content(content)

        # 设置属性
        node.attributes = meta

        return node

    def _parse_inline_content(self, text: str) -> List[ASTNode]:
        """解析内联内容（粗体、斜体等）"""
        import re
        children = []
        remaining = text

        # 匹配粗体 **text** 或 __text__
        pattern = r'\*\*(.+?)\*\*|__(.+?)__'

        last_end = 0
        for match in re.finditer(pattern, remaining):
            # 添加匹配前的纯文本
            if match.start() > last_end:
                text_node = ASTNode(
                    node_type=NodeType.TEXT,
                    content=remaining[last_end:match.start()]
                )
                children.append(text_node)

            # 添加粗体节点
            bold_text = match.group(1) or match.group(2)
            bold_node = ASTNode(
                node_type=NodeType.STRONG,
                content=bold_text
            )
            children.append(bold_node)

            last_end = match.end()

        # 添加剩余文本
        if last_end < len(remaining):
            text_node = ASTNode(
                node_type=NodeType.TEXT,
                content=remaining[last_end:]
            )
            children.append(text_node)

        # 如果没有匹配，返回纯文本节点
        if not children:
            children.append(ASTNode(node_type=NodeType.TEXT, content=text))

        return children

    def find_heading(self, level: int = 1) -> Optional[ASTNode]:
        """查找指定层级的标题"""
        return self._find_node(self.root, NodeType.HEADING, level)

    def _find_node(self, node: ASTNode, node_type: NodeType, level: int = 0) -> Optional[ASTNode]:
        """递归查找节点"""
        if node.node_type == node_type and (level == 0 or node.level == level):
            return node

        for child in node.children:
            found = self._find_node(child, node_type, level)
            if found:
                return found

        return None

    def get_all_headings(self) -> List[ASTNode]:
        """获取所有标题节点"""
        headings = []
        self._collect_nodes(self.root, NodeType.HEADING, headings)
        return headings

    def _collect_nodes(self, node: ASTNode, node_type: NodeType, results: List[ASTNode]):
        """递归收集指定类型的节点"""
        if node.node_type == node_type:
            results.append(node)

        for child in node.children:
            self._collect_nodes(child, node_type, results)

    def to_json(self) -> Dict[str, Any]:
        """导出为 JSON 格式"""
        if self.root:
            return self.root.to_dict()
        return {}
