"""verify：存疑标记 -> 放大裁片 + 核验清单。

转录纪律要求可疑之字标【存疑:...】而不是留空或臆改。
verify 把所有标记集中起来：给每条存疑带生成放大图，
让人（或第二轮 VLM）对着高清图逐条裁决，把裁决写回核验清单。
这一步是 RiverType 区别于“识别一次就信”的 OCR 工具的地方。
"""

from __future__ import annotations

import re
from pathlib import Path

from PIL import Image

from .project import Project

FLAG = re.compile(r"【存疑[:：]?([^】]*)】")


def run_verify(project: Project, zoom: float = 2.0, second_pass: str | None = None) -> Path:
    transcripts = sorted(project.rel("transcript").glob("*.md"))
    transcripts = [t for t in transcripts if not t.name.startswith("_")]

    report: list[str] = [
        "# 核验清单（verify）",
        "",
        f"裁决方式：{'人工读裁片' if not second_pass else '引擎重读：' + second_pass}",
        "",
        "对每条存疑：读放大裁片 -> 把裁决写进对应转录稿（替换【存疑:...】），",
        "完成后将本条 [ ] 勾为 [x]。全部勾完后重跑 assemble。",
        "",
    ]

    flagged_bands = 0
    flagged_items = 0
    for t in transcripts:
        text = t.read_text(encoding="utf-8")
        marks = FLAG.findall(text)
        if not marks:
            continue
        band_img = project.rel("bands", t.stem + ".png")
        crop_rel = ""
        if band_img.exists():
            im = Image.open(band_img)
            big = im.resize((int(im.width * zoom), int(im.height * zoom)), Image.LANCZOS)
            out = project.rel("verify") / (t.stem + ".png")
            big.save(out)
            crop_rel = str(out.relative_to(project.root)).replace("\\", "/")

        flagged_bands += 1
        flagged_items += len(marks)
        report.append(f"## `{t.stem}`")
        if crop_rel:
            report.append(f"裁片：{crop_rel}（放大 {zoom}x）")
        for m in marks:
            report.append(f"- [ ] 【存疑:{m}】")
        report.append("")

    report_path = project.rel("verify", "verify.md")
    report_path.write_text("\n".join(report), encoding="utf-8")

    if flagged_bands == 0:
        print("verify：未发现存疑标记，可直接 assemble。")
    else:
        print(f"verify：{flagged_bands} 条转录稿 / {flagged_items} 处存疑 -> {report_path}")
    return report_path
