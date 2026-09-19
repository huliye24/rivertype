"""render：扫描 PDF -> 整页 PNG + 半页工作带 + 溯源清单。

工作带（band）是转录的工作单元：竖排书页纵向一切为二（带重叠），
单带文字量适中，适合人读、也适合 VLM 读。每带的 bbox 记入清单，
后续 verify 的放大裁片、collate 的段落溯源都从这里取坐标。
"""

from __future__ import annotations

import json
from pathlib import Path

from .project import Project


def run_render(project: Project, dpi: int | None = None) -> Path:
    import fitz  # PyMuPDF
    from PIL import Image

    cfg = project.render_cfg
    dpi = dpi or int(cfg.get("dpi", 200))
    overlap = float(cfg.get("band_overlap", 0.08))

    pdf_path = project.config.get("source_pdf") or ""
    candidates = [project.rel(pdf_path)] if pdf_path else sorted(project.rel("scans").glob("*.pdf"))
    pdfs = [p for p in candidates if p.exists()]
    if not pdfs:
        raise SystemExit("未找到源 PDF：请在 book.yaml 填 source_pdf，或将 PDF 放入 scans/")

    zoom = dpi / 72.0
    manifest = {"dpi": dpi, "zoom": zoom, "books": []}

    for pdf in pdfs:
        doc = fitz.open(pdf)
        stem = pdf.stem
        book_entry = {"pdf": pdf.name, "pages": []}
        print(f"  [{stem}] {doc.page_count} 页")

        for i, page in enumerate(doc, start=1):
            pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom))
            page_img = project.rel("pages") / f"{stem}_p{i:02d}.png"
            pix.save(page_img)

            im = Image.open(page_img)
            w, h = im.size
            half = h // 2
            ov = int(h * overlap)
            bands = []
            for key, (y0, y1) in (("a", (0, half + ov)), ("b", (half - ov, h))):
                crop = im.crop((0, y0, w, y1))
                band_img = project.rel("bands") / f"{stem}_p{i:02d}_{key}.png"
                crop.save(band_img)
                bands.append({
                    "key": f"p{i:02d}_{key}",
                    "image": str(band_img.relative_to(project.root)).replace("\\", "/"),
                    "bbox": [0, y0, w, y1],
                })
            book_entry["pages"].append({
                "page": i,
                "image": str(page_img.relative_to(project.root)).replace("\\", "/"),
                "size": [w, h],
                "bands": bands,
            })
        doc.close()
        manifest["books"].append(book_entry)

    project.manifest.parent.mkdir(exist_ok=True)
    project.manifest.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    total = sum(len(b["pages"]) for b in manifest["books"])
    print(f"render 完成：{len(manifest['books'])} 个文件 / {total} 页 / {total * 2} 工作带 -> manifest/pages.json")
    return project.manifest
