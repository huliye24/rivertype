"""RiverType CLI — 从扫描件到成书的出版流水线。

流水线六段（每段独立可跑、可断点续作）：
    render     扫描 PDF -> 整页图 + 半页工作带 + 溯源清单
    transcribe 工作带 -> 带存疑标记的转录初稿（多引擎，manual 为人机协作队列）
    verify     存疑标记 -> 放大裁片 + 核验清单
    assemble   转录稿 -> manuscript/（章节 + 主题样式 + vivliostyle 配置）
    build      manuscript -> EPUB / PDF（vivliostyle）
    collate    底本稿 <-> 通行本 -> 校勘记
"""

__version__ = "0.1.0"
