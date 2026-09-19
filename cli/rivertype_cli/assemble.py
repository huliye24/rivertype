"""assemble：转录稿 -> manuscript/（可直接交给 vivliostyle 的排版工程）。

产出：
    manuscript/chapters/00-cover.md     封面（书目元数据生成）
    manuscript/chapters/01-body.md      全部转录稿按带序合并（带溯源注释）
    manuscript/chapters/99-colophon.md  版本说明（含自动汇总的存疑/校记骨架）
    manuscript/style.css                主题样式（build 时也可再取）
    manuscript/vivliostyle.config.js    排版配置

01-body.md 是“母稿坯”，不是成品章节：段一级的编目（序/卷/章/跋）
由人或 AI 编辑完成。保留带溯源注释，任何一句都能追回扫描图坐标。
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path

from . import __version__
from .project import Project

COVER_MD = """---
title: {title}
author: {author}
language: {language}
---

<div class="cover">

# {title}

## {author}

〔 简体横排本 〕

</div>
"""

COLOPHON_MD = """# 版本说明

<div class="colophon">

<p class="colophon-line">**书名**：{title}</p>
<p class="colophon-line">**著者**：{author}</p>
<p class="colophon-line">**底本**：{source}</p>
<p class="colophon-line">**整理**：RiverType 流水线（视觉转录 + 存疑核验）</p>

</div>

## 校记

<!-- assemble 已把核验清单中的未裁决存疑汇总在此；裁决后请改写为正式校记 -->

{flags}
"""


def run_assemble(project: Project) -> Path:
    project.ensure_dirs()
    chapters = project.rel("manuscript", "chapters")

    # 封面
    (chapters / "00-cover.md").write_text(COVER_MD.format(
        title=project.title,
        author=project.config.get("author", "") or "",
        language=project.config.get("language", "zh-Hans"),
    ), encoding="utf-8")

    # 正文坯：transcript/*.md 按 manifest 带序合并
    body = _merge_transcripts(project)
    if body:
        (chapters / "01-body.md").write_text(body, encoding="utf-8")

    # 版本说明 + 校记坯
    (chapters / "99-colophon.md").write_text(COLOPHON_MD.format(
        title=project.title,
        author=project.config.get("author", "") or "",
        source=project.config.get("source_pdf", "") or "扫描件",
        flags=_flag_summary(project),
    ), encoding="utf-8")

    # 主题样式 + vivliostyle 配置
    _copy_theme_css(project)
    _write_vivliostyle_config(project)

    print(f"assemble 完成 -> manuscript/（{len(list(chapters.glob('*.md')))} 章节）")
    print("下一步：把 01-body.md 编辑成正式章节结构，然后 rivertype build")
    return chapters


def _merge_transcripts(project: Project) -> str:
    manifest_path = project.manifest
    parts: list[str] = []
    if manifest_path.exists():
        data = json.loads(manifest_path.read_text(encoding="utf-8"))
        for book in data["books"]:
            for page in book["pages"]:
                for band in page["bands"]:
                    t = project.rel("transcript", Path(band["image"]).stem + ".md")
                    if t.exists():
                        text = t.read_text(encoding="utf-8").strip()
                        parts.append(f"<!-- band:{band['key']} page:{page['page']} -->\n{text}\n")
    else:
        for t in sorted(project.rel("transcript").glob("*.md")):
            if t.name.startswith("_"):
                continue
            parts.append(f"<!-- band:{t.stem} -->\n" + t.read_text(encoding="utf-8").strip() + "\n")
    return "\n".join(parts)


def _flag_summary(project: Project) -> str:
    verify_md = project.rel("verify", "verify.md")
    if not verify_md.exists():
        return "（无核验清单：先跑 rivertype verify）"
    items = [ln for ln in verify_md.read_text(encoding="utf-8").splitlines()
             if ln.strip().startswith("- [ ]")]
    if not items:
        return "（核验清单已全部裁决）"
    return "\n".join(items)


def _copy_theme_css(project: Project) -> None:
    from .build import resolve_theme

    src = resolve_theme(project.build_cfg.get("theme", "guji-dark"), project) / "style.css"
    dst = project.rel("manuscript", "style.css")
    if src.exists():
        shutil.copy(src, dst)
    else:
        if not dst.exists():
            dst.write_text("/* TODO: 选择主题，或补一份 style.css */\n", encoding="utf-8")


def _write_vivliostyle_config(project: Project) -> None:
    chapters_dir = project.rel("manuscript", "chapters")
    entries = sorted(p.name for p in chapters_dir.glob("*.md"))
    fmt = project.build_cfg.get("format", "epub")
    out_name = project.build_cfg.get("output") or f"{project.title}.{fmt}"
    ext = "epub" if fmt == "epub" else "pdf"

    js = f"""// 由 rivertype assemble 生成 — {project.title}
// 用 ESM 导出（export default），在 CommonJS 与 "type": "module" 仓库内都能被 vivliostyle 加载
export default {{
    title: {json.dumps(project.title, ensure_ascii=False)},
    author: {json.dumps(project.config.get("author", ""), ensure_ascii=False)},
    language: {json.dumps(project.config.get("language", "zh-Hans"), ensure_ascii=False)},
    size: {json.dumps(project.config.get("size", "A5"), ensure_ascii=False)},
    entry: [
{chr(10).join(f'        {{ rel: "contents", path: "chapters/{e}" }},' for e in entries)}
    ],
    output: [
        {{
            path: "../output/{Path(out_name).stem}.{ext}",
            format: "{ext}",
            theme: {{ source: "style.css" }}
        }}
    ]
}};
"""
    (project.rel("manuscript", "vivliostyle.config.js")).write_text(js, encoding="utf-8")
