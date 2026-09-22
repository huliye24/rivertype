"""rivertype 命令行入口。"""

from __future__ import annotations

import argparse
import json
import sys

from . import __version__
from .project import Project


def _utf8_console() -> None:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="rivertype",
        description="RiverType — 从扫描件到成书的出版流水线。工作单元是一本书目录（含 book.yaml）。",
    )
    p.add_argument("--version", action="version", version=f"rivertype {__version__}")
    sub = p.add_subparsers(dest="command", required=True)

    g = sub.add_parser("init", help="创建新书项目目录")
    g.add_argument("path")
    g.add_argument("--title", required=True)
    g.add_argument("--author", default="")

    g = sub.add_parser("render", help="扫描 PDF -> 整页图 + 工作带 + 溯源清单")
    g.add_argument("project", nargs="?", default=".")
    g.add_argument("--dpi", type=int, default=None)

    g = sub.add_parser("transcribe", help="工作带 -> 转录初稿（manual 为人机协作队列）")
    g.add_argument("project", nargs="?", default=".")
    g.add_argument("--engine", choices=["manual", "anthropic", "openai", "ollama"], default=None)
    g.add_argument("--force", action="store_true", help="重做已存在的转录")
    g.add_argument("--only", default=None, help="只处理文件名含此子串的工作带")

    g = sub.add_parser("verify", help="存疑标记 -> 放大裁片 + 核验清单")
    g.add_argument("project", nargs="?", default=".")
    g.add_argument("--zoom", type=float, default=2.0)

    g = sub.add_parser("assemble", help="转录稿 -> manuscript 排版工程")
    g.add_argument("project", nargs="?", default=".")

    g = sub.add_parser("build", help="manuscript -> EPUB / PDF")
    g.add_argument("project", nargs="?", default=".")
    g.add_argument("--regen-config", action="store_true", help="重新生成 vivliostyle 配置")

    g = sub.add_parser("collate", help="底本 <-> 通行本 -> 校勘记")
    g.add_argument("project", nargs="?", default=".")
    g.add_argument("--reference", default=None, help="通行本文本（md/txt）")
    g.add_argument("--base", default=None, help="底本文本，默认 manuscript/chapters/")

    g = sub.add_parser("validate", help="校验 .rt 文件是否符合 RTP-0.1 协议")
    g.add_argument("target", help=".rt 文件或包含 .rt 的目录")
    g.add_argument("--strict", action="store_true", help="严格模式：警告也返回非零退出码")

    g = sub.add_parser("preprocess", help="扫描页图像预处理（裁色卡、纠斜、二值化）")
    g.add_argument("project", nargs="?", default=".")
    g.add_argument("--steps", nargs="+", choices=["bar", "deskew", "bin"], default=None)
    g.add_argument("--bin-method", choices=["sauvola", "otsu"], default="sauvola")
    g.add_argument("--force", action="store_true")

    g = sub.add_parser("status", help="查询书项目与各阶段产物，供 Agent 判断下一步")
    g.add_argument("project", nargs="?", default=".")
    g.add_argument("--json", action="store_true", help="输出稳定的 JSON 对象")

    g = sub.add_parser("capabilities", help="列出 CLI 协议、命令和机器接口")
    g.add_argument("--json", action="store_true", help="输出稳定的 JSON 对象")

    return p


def main(argv: list[str] | None = None) -> None:
    _utf8_console()
    args = build_parser().parse_args(argv)

    if args.command == "init":
        project = Project.create(args.path, title=args.title, author=args.author)
        print(f"书项目已创建：{project.root}")
        print("下一步：把 PDF 放入 scans/，然后 rivertype render")
        return

    if args.command == "validate":
        from .validate import run_validate
        from pathlib import Path
        rc = run_validate(Path(args.target), strict=args.strict)
        sys.exit(rc)

    if args.command == "capabilities":
        from .status import capabilities
        payload = capabilities()
        print(json.dumps(payload, ensure_ascii=False, indent=2) if args.json else
              "RiverType: " + ", ".join(payload["commands"]))
        return

    project = Project.load(args.project)

    if args.command == "status":
        from .status import project_status
        payload = project_status(project)
        print(json.dumps(payload, ensure_ascii=False, indent=2) if args.json else
              f"{payload['title']} · 下一步：{payload['next_action']}")
        return

    if args.command == "render":
        from .render import run_render
        run_render(project, dpi=args.dpi)
    elif args.command == "preprocess":
        from .preprocess import run_preprocess
        run_preprocess(project, steps=args.steps, bin_method=args.bin_method, force=args.force)
    elif args.command == "transcribe":
        from .transcribe import run_transcribe
        run_transcribe(project, engine=args.engine, force=args.force, only=args.only)
    elif args.command == "verify":
        from .verify import run_verify
        run_verify(project, zoom=args.zoom)
    elif args.command == "assemble":
        from .assemble import run_assemble
        run_assemble(project)
    elif args.command == "build":
        from .build import run_build
        run_build(project, regenerate_config=args.regen_config)
    elif args.command == "collate":
        from .collate import run_collate
        run_collate(project, reference=args.reference, base=args.base)


if __name__ == "__main__":
    main()
