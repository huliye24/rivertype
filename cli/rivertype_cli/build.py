"""build：manuscript -> EPUB / PDF（vivliostyle）。

主题解析顺序：
    1. 绝对/相对路径（含 style.css 的目录）
    2. 书目录下的 theme/
    3. CLI 内置主题（rivertype_cli/themes/<name>/）

build 不做自己的排版引擎：CJK 书排版的正确工具是 vivliostyle，
RiverType 负责的是把工程文件组装好、把主题规范好。
"""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

from .project import Project

THEMES = Path(__file__).parent / "themes"


def resolve_theme(theme: str | None, project: Project | None = None) -> Path:
    if not theme:
        return THEMES / "guji-dark"
    p = Path(theme)
    if p.is_absolute() and p.exists():
        return p
    local = project.rel("theme", theme)
    if local.exists():
        return local
    bundled = THEMES / theme
    if bundled.exists():
        return bundled
    if (p.parent / "style.css").exists():
        return p
    raise SystemExit(f"未找到主题：{theme}（内置主题：{', '.join(sorted(x.name for x in THEMES.iterdir()))}）")


def run_build(project: Project, regenerate_config: bool = False) -> Path:
    manuscript = project.rel("manuscript")
    if not (manuscript / "vivliostyle.config.js").exists() or regenerate_config:
        from .assemble import run_assemble
        run_assemble(project)

    if shutil.which("vivliostyle") is None:
        raise SystemExit("未找到 vivliostyle CLI。安装：npm install -g @vivliostyle/cli")

    fmt = project.build_cfg.get("format", "epub")
    print(f"build（{fmt}，主题 {project.build_cfg.get('theme', 'guji-dark')}）...")
    # Windows 下 npm 全局命令是 vivliostyle.cmd，必须用 which 解析出的全路径
    exe = shutil.which("vivliostyle") or "vivliostyle"
    result = subprocess.run(
        [exe, "build"],
        cwd=manuscript,
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    if result.returncode != 0:
        print(result.stdout[-2000:])
        print(result.stderr[-2000:])
        raise SystemExit("vivliostyle build 失败")

    outputs = sorted((project.rel("output")).glob("*"))
    for o in outputs:
        print(f"  成品：{o}")
    return project.rel("output")
