# -*- coding: utf-8 -*-
"""
RIVERTYPE - 未来出版引擎
入口点文件

使用方法：
    cd e:\Rivertype
    python -m rivertype.run
    或
    python rivertype/run.py
    或
    uvicorn rivertype.app.main:app --reload --host 0.0.0.0 --port 8000
"""

import sys
import os
from pathlib import Path

# 获取项目根目录 (rivertype 的上一级)
current_file = Path(__file__).resolve()
project_root = current_file.parent.parent  # rivertype/run.py -> rivertype -> 项目根目录

# 添加项目根目录到 Python 路径
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

# 设置工作目录
os.chdir(project_root)


def main():
    """主函数 - 启动 RIVERTYPE 服务"""
    import uvicorn
    import webbrowser
    import threading

    def open_browser():
        """延迟打开浏览器"""
        webbrowser.open("http://127.0.0.1:8000")

    print("=" * 60)
    print("  RIVERTYPE - 未来出版引擎")
    print("  将 Markdown 转化为具有视觉美学的出版作品")
    print("=" * 60)
    print()
    print("  本地访问: http://127.0.0.1:8000")
    print("  API 文档: http://127.0.0.1:8000/docs")
    print()
    print("  按 Ctrl+C 停止服务")
    print("=" * 60)

    # 延迟 1.5 秒打开浏览器
    threading.Timer(1.5, open_browser).start()

    # 启动服务
    uvicorn.run(
        "rivertype.app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )


if __name__ == "__main__":
    main()
