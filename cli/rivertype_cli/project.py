"""book.yaml 项目模型与目录约定。"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

import yaml

BOOK_FILE = "book.yaml"

DEFAULT_BOOK = {
    "title": "未命名书",
    "author": "",
    "language": "zh-Hans",
    "size": "A5",
    "description": "",
    "source_pdf": "",
    "render": {"dpi": 200, "band_overlap": 0.08},
    "transcribe": {"engine": "manual", "model": "", "prompt_file": ""},
    "build": {"theme": "guji-dark", "format": "epub", "output": ""},
    "collate": {"reference": ""},
}


class ProjectError(Exception):
    pass


@dataclass
class Project:
    """一本书 = 一个目录。所有命令都以此为工作单元。"""

    root: Path
    config: dict = field(default_factory=dict)

    # ---------- 构造 ----------

    @classmethod
    def load(cls, root: str | Path) -> "Project":
        root = Path(root).resolve()
        book = root / BOOK_FILE
        if not book.exists():
            raise ProjectError(f"未找到 {book}（请在书目录内运行，或先用 rivertype init 创建）")
        cfg = yaml.safe_load(book.read_text(encoding="utf-8")) or {}
        merged = _deep_merge(DEFAULT_BOOK, cfg)
        return cls(root=root, config=merged)

    @classmethod
    def create(cls, root: str | Path, title: str, author: str = "", **kwargs) -> "Project":
        root = Path(root).resolve()
        if root.exists() and BOOK_FILE in os.listdir(root):
            raise ProjectError(f"{root} 已是书项目（存在 {BOOK_FILE}）")
        cfg = _deep_merge(DEFAULT_BOOK, {"title": title, "author": author, **kwargs})
        for key in ("description", "source_pdf"):
            if not cfg.get(key):
                cfg.pop(key, None)
        for sec in ("render", "transcribe", "build", "collate"):
            for k, v in list(cfg[sec].items()):
                if v in ("", None):
                    del cfg[sec][k]
        p = cls(root=root, config=cfg)
        p.ensure_dirs()
        (root / BOOK_FILE).write_text(
            yaml.safe_dump(cfg, allow_unicode=True, sort_keys=False), encoding="utf-8"
        )
        return p

    # ---------- 目录 ----------

    def ensure_dirs(self) -> None:
        for sub in ("scans", "pages", "bands", "transcript", "verify", "manuscript", "output"):
            (self.root / sub).mkdir(parents=True, exist_ok=True)
        (self.root / "manuscript" / "chapters").mkdir(parents=True, exist_ok=True)

    @property
    def manifest(self) -> Path:
        return self.root / "manifest" / "pages.json"

    def rel(self, *parts: str) -> Path:
        return self.root.joinpath(*parts)

    # ---------- 便捷读取 ----------

    @property
    def title(self) -> str:
        return self.config.get("title", "未命名书")

    @property
    def render_cfg(self) -> dict:
        return self.config.get("render", {})

    @property
    def transcribe_cfg(self) -> dict:
        return self.config.get("transcribe", {})

    @property
    def build_cfg(self) -> dict:
        return self.config.get("build", {})

    def save(self) -> None:
        (self.root / BOOK_FILE).write_text(
            yaml.safe_dump(self.config, allow_unicode=True, sort_keys=False), encoding="utf-8"
        )


def _deep_merge(base: dict, override: dict) -> dict:
    out = {**base}
    for k, v in (override or {}).items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _deep_merge(out[k], v)
        else:
            out[k] = v
    return out
