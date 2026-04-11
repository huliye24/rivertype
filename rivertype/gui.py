# -*- coding: utf-8 -*-
r"""
RIVERTYPE 未来出版引擎
桌面 GUI 入口 - 使用 Tkinter 构建本地桌面应用

使用方法：
    cd e:\Rivertype
    python -m rivertype.gui
    或
    python rivertype/gui.py
"""

import sys
import os
from pathlib import Path


def get_project_root():
    """获取项目根目录"""
    current_file = Path(__file__).resolve()
    project_root = current_file.parent.parent
    return project_root


def setup_paths():
    """设置 Python 路径"""
    project_root = get_project_root()
    if str(project_root) not in sys.path:
        sys.path.insert(0, str(project_root))
    os.chdir(project_root)


def main():
    """主函数 - 启动 RIVERTYPE 桌面应用"""
    setup_paths()

    try:
        from rivertype.gui.app import RivertypeApp
        app = RivertypeApp()
        app.run()
    except ImportError as e:
        print(f"导入错误: {e}")
        print("请确保已安装所有依赖: pip install -r requirements.txt")
        input("\n按 Enter 键退出...")
    except Exception as e:
        print(f"启动失败: {e}")
        import traceback
        traceback.print_exc()
        input("\n按 Enter 键退出...")


if __name__ == "__main__":
    main()
