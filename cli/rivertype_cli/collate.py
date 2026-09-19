"""collate：底本转录稿 <-> 通行本参照 -> 校勘记。

校勘学的日常：把重刊本/影印本转录稿与通行本逐字对读，
记录异文。collate 用字符级 diff 找出全部差异点，
按「底本作 X / 参照作 Y + 上下文」生成校勘记骨架，
人只做裁决（判字、定是非、存疑），不做发现。
"""

from __future__ import annotations

import difflib
import re
from pathlib import Path

from .project import Project

MARKDOWN_NOISE = re.compile(r"<!--.*?-->|^#.*$|^\s*[-*>]\s|\[\d+\]|!\[.*?\]\(.*?\)", re.M)


def _read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _clean(text: str) -> str:
    text = MARKDOWN_NOISE.sub("", text)
    # 去掉校记/版本说明等非正文区（从“版本说明”“校记”标题起截断）
    for stop in ("版本说明", "校记"):
        idx = text.find(stop)
        if idx != -1:
            text = text[:idx]
    return re.sub(r"\s+", "", text)


def run_collate(project: Project, reference: str | None = None,
                base: str | None = None) -> Path:
    cfg = project.config.get("collate", {})
    ref_path = Path(reference or cfg.get("reference") or "")
    if not ref_path.exists():
        raise SystemExit("未找到通行本参照文件（--reference 或 book.yaml collate.reference）")

    base_path = Path(base) if base else project.rel("manuscript", "chapters")
    if base_path.is_dir():
        mds = sorted(base_path.glob("*.md"))
        base_text = "\n".join(_read_text(m) for m in mds)
    else:
        base_text = _read_text(base_path)

    a = _clean(base_text)   # 底本（本项目的转录稿）
    b = _clean(_read_text(ref_path))  # 参照（通行本等）

    sm = difflib.SequenceMatcher(None, a, b, autojunk=False)
    entries: list[str] = []
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal":
            continue
        ctx_a = a[max(0, i1 - 8):i1]
        ctx_b = a[i2:i2 + 8]
        base_seg = a[i1:i2]
        ref_seg = b[j1:j2]
        label = {"replace": "异文", "delete": "底本多", "insert": "底本缺"}.get(tag, tag)
        entries.append(
            f"- [ ] **{label}** ｜ 底本作「{base_seg or '∅'}」，参照作「{ref_seg or '∅'}」"
            f" ｜ 上下文：…{ctx_a}［{base_seg or '∅'}］{ctx_b}…"
        )

    report = [
        "# 校勘记（collate）",
        "",
        f"- 底本：本项目 manuscript（{len(a)} 字）",
        f"- 参照：{ref_path}（{len(b)} 字）",
        f"- 差异点：{len(entries)} 处（自动发现，需人工裁决）",
        "",
        *entries,
    ]
    out = project.rel("manuscript", "校勘记.md")
    out.write_text("\n".join(report) + "\n", encoding="utf-8")
    print(f"collate：{len(entries)} 处差异 -> {out}")
    return out
