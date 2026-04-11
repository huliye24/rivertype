# -*- coding: utf-8 -*-
"""
RIVERTYPE 数据模型
定义请求和响应的数据结构
"""

from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any


class RenderRequest(BaseModel):
    """渲染请求"""
    markdown: str = Field(..., description="Markdown 文本内容")
    theme: str = Field(default="rongjing", description="主题 ID")
    title: Optional[str] = Field(None, description="文档标题")
    style: str = Field(default="geometric", description="SVG 标题风格")


class RenderResponse(BaseModel):
    """渲染响应"""
    html: str = Field(..., description="生成的 HTML 内容")
    theme: str = Field(..., description="使用的主题")
    title: Optional[str] = Field(None, description="文档标题")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="文档元数据")


class ExportRequest(BaseModel):
    """导出请求"""
    markdown: str = Field(..., description="Markdown 文本内容")
    theme: str = Field(default="rongjing", description="主题 ID")
    format: List[str] = Field(default=["pdf"], description="导出格式列表")
    title: Optional[str] = Field(None, description="文档标题")


class ExportResponse(BaseModel):
    """导出响应"""
    success: bool = Field(..., description="是否成功")
    files: Dict[str, str] = Field(default_factory=dict, description="输出文件路径")
    message: Optional[str] = Field(None, description="消息")


class ThemeInfo(BaseModel):
    """主题信息"""
    id: str
    name: str
    description: str


class ThemeListResponse(BaseModel):
    """主题列表响应"""
    themes: List[ThemeInfo]


class HealthResponse(BaseModel):
    """健康检查响应"""
    status: str
    version: str
    message: str
