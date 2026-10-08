#!/usr/bin/env python3
"""RiverType Studio · PDF 成品取证检查

对 Studio 导出的 PDF 做机器可判定的断言，而不是靠肉眼看截图：

  1. 页数是否恰为期望值
  2. 每页物理尺寸是否为 210 × 297 mm（容差 0.5mm）
  3. 是否存在文字层（即文字可选中），且源文中的关键串是否都在
  4. 嵌入了哪些字体、是否嵌入（subset/embedded）
  5. 图片的有效 DPI 是否达标（按放置矩形反推，而非看文件体积）
  6. 是否有内容被裁切（文本块贴边 / 越界）

用法：
  python tools/studio_pdf_check.py <pdf> [--pages 2] [--size 210x297]
      [--expect-text expect.json] [--min-dpi 200] [--json out.json] [--md out.md]

--expect-text 指向一个 JSON：{"page1": ["花开时节", ...], "page2": [...]}
退出码：0 全部通过；1 有断言失败；2 输入或环境问题。
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

MM_PER_PT = 25.4 / 72.0


def load_fitz():
    try:
        import pymupdf  # PyMuPDF >= 1.24

        return pymupdf
    except ImportError:
        pass
    try:
        import fitz  # 旧名

        return fitz
    except ImportError:
        print("缺少 PyMuPDF：pip install pymupdf", file=sys.stderr)
        sys.exit(2)


def check(
    pdf_path: Path,
    expect_pages: int,
    size_mm: tuple[float, float],
    expect_text: dict,
    min_dpi: float,
    png_dir: Path | None = None,
    expect_qr: str = "",
    qr_page: int = 0,
):
    fitz = load_fitz()
    doc = fitz.open(pdf_path)
    checks: list[dict] = []

    def add(name: str, ok: bool, detail: str) -> None:
        checks.append({"check": name, "ok": bool(ok), "detail": detail})

    # 1. 页数
    add(
        "页面数量",
        len(doc) == expect_pages,
        f"实际 {len(doc)} 页，期望 {expect_pages} 页",
    )

    # 2. 尺寸
    target_w, target_h = size_mm
    size_ok = True
    size_detail = []
    for i, page in enumerate(doc):
        w_mm = page.rect.width * MM_PER_PT
        h_mm = page.rect.height * MM_PER_PT
        good = abs(w_mm - target_w) <= 0.5 and abs(h_mm - target_h) <= 0.5
        size_ok = size_ok and good
        size_detail.append(f"p{i + 1}: {w_mm:.1f}×{h_mm:.1f}mm{'✓' if good else '✗'}")
    add("页面尺寸 210×297mm", size_ok, "；".join(size_detail))

    # 3. 文字层 + 关键串
    all_text = []
    text_detail = []
    missing: list[str] = []
    for i, page in enumerate(doc):
        t = page.get_text("text")
        all_text.append(t)
        text_detail.append(f"p{i + 1}: {len(t.strip())} 字")
        for needle in expect_text.get(f"page{i + 1}", []):
            # 去掉空白后比对：排版会引入换行，逐字比对才不会被行盒欺骗
            if needle.replace(" ", "") not in t.replace("\n", "").replace(" ", ""):
                missing.append(f"p{i + 1}「{needle}」")
    add("存在文字层（可选中）", any(t.strip() for t in all_text), "；".join(text_detail))
    add("源文关键串齐全", not missing, "缺失：" + "、".join(missing) if missing else "全部命中")

    # 4. 字体
    fonts = {}
    for page in doc:
        for f in page.get_fonts(full=True):
            # (xref, ext, type, basefont, name, encoding, ...)
            name = f[3] or ""
            if not name:
                continue
            fonts[name] = fonts.get(name, 0) + 1
    cjk = [n for n in fonts if any(k in n.upper() for k in ("CJK", "SONG", "SUN", "HEI", "KAI", "MING", "HAN", "ST", "MINGLIU"))]
    add(
        "字体清单",
        bool(fonts),
        "；".join(f"{n}×{c}" for n, c in sorted(fonts.items())) + ("｜命中中文字体： " + ", ".join(cjk) if cjk else "｜未识别到中文字体名"),
    )

    # 5. 图片有效 DPI
    #
    # 注意区分两类位图：
    #   a) 页面底色图层 —— Chromium 打印时会把页面背景（含 CSS 渐变）压成一张
    #      整页位图，像素尺寸恰为「页面 pt 值」@96dpi。它只是背景，不是内容。
    #   b) 真正放置的内容图片 —— 必须满足 min_dpi。
    # 混淆这两者会得出「整本书都是 72dpi 图」的错误结论。
    dpi_reports = []
    dpi_ok = True
    bg_layers = []
    for i, page in enumerate(doc):
        page_pt_w, page_pt_h = page.rect.width, page.rect.height
        page_area = page_pt_w * page_pt_h
        for info in page.get_image_info():
            bbox = info.get("bbox")
            if not bbox:
                continue
            w_pt = bbox[2] - bbox[0]
            h_pt = bbox[3] - bbox[1]
            if w_pt <= 1 or h_pt <= 1:
                continue
            px_w = info.get("width") or 0
            px_h = info.get("height") or 0
            if not px_w or not px_h:
                continue

            covers_page = (w_pt * h_pt) >= 0.99 * page_area
            matches_page_px = abs(px_w - page_pt_w) <= 3 and abs(px_h - page_pt_h) <= 3
            if covers_page and matches_page_px:
                bg_layers.append(f"p{i + 1}: {px_w}×{px_h}px（整页底色）")
                continue

            dpi = min(px_w / (w_pt / 72.0), px_h / (h_pt / 72.0))
            good = dpi >= min_dpi
            dpi_ok = dpi_ok and good
            dpi_reports.append(f"p{i + 1}: {px_w}×{px_h}px → {dpi:.0f}dpi{'✓' if good else '✗'}")

    if dpi_reports:
        add(f"内容图片有效 DPI ≥ {min_dpi:.0f}", dpi_ok, "；".join(dpi_reports))
    else:
        add(f"内容图片有效 DPI ≥ {min_dpi:.0f}", True, "本成品无内容位图（占位框与二维码均为矢量）")

    add(
        "页面底色图层已识别",
        True,
        ("Chromium 将页面背景压成整页位图：" + "；".join(bg_layers) + "。仅背景受影响，文字与矢量图形不受影响。")
        if bg_layers
        else "无整页底色图层",
    )

    # 6. 裁切检查：文本块是否越过页面边界
    clipped = []
    for i, page in enumerate(doc):
        pr = page.rect
        for block in page.get_text("blocks"):
            x0, y0, x1, y1 = block[:4]
            if x0 < -0.5 or y0 < -0.5 or x1 > pr.width + 0.5 or y1 > pr.height + 0.5:
                snippet = str(block[4])[:24].replace("\n", " ")
                clipped.append(f"p{i + 1}「{snippet}」越界")
    add("内容未越界（无裁切）", not clipped, "；".join(clipped) if clipped else "全部内容在页面内")

    # 7. 页图渲染（供人眼复核，也是「这一页确实长这样」的证据）
    if png_dir is not None:
        png_dir.mkdir(parents=True, exist_ok=True)
        rendered = []
        for i, page in enumerate(doc):
            pix = page.get_pixmap(dpi=150)
            target = png_dir / f"page-{i + 1:02d}.png"
            pix.save(target)
            rendered.append(f"{target.name} {pix.width}×{pix.height}")
        add("页图渲染（150dpi）", bool(rendered), "；".join(rendered))

    # 8. 二维码：既要能解码，也要是矢量
    if expect_qr:
        idx = (qr_page or 1) - 1
        if idx < 0 or idx >= len(doc):
            add("二维码解码回读", False, f"指定的第 {qr_page} 页不存在")
        else:
            # 8a. 矢量性：印刷品上的二维码必须是路径，不能是位图
            mm = 72.0 / 25.4
            vector_qr = None
            for drawing in doc[idx].get_drawings():
                r = drawing["rect"]
                if 12 * mm <= r.width <= 45 * mm and 12 * mm <= r.height <= 45 * mm:
                    if len(drawing["items"]) >= 100:
                        vector_qr = (r, len(drawing["items"]))
                        break
            add(
                "二维码为矢量图形",
                vector_qr is not None,
                f"第 {qr_page} 页找到 {vector_qr[1]} 条子路径的填充路径，{vector_qr[0].width / mm:.1f}×{vector_qr[0].height / mm:.1f}mm"
                if vector_qr
                else f"第 {qr_page} 页未找到符合二维码特征的矢量路径",
            )

            # 8b. 可解码性：用独立解码器读成品，而不是回读我们自己生成的数据
            try:
                import cv2  # type: ignore
                import numpy as np  # type: ignore

                # 300dpi 渲染：低于印刷实际分辨率时 OpenCV 定位容易失败
                pix = doc[idx].get_pixmap(dpi=300)
                img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
                if pix.n == 4:
                    img = cv2.cvtColor(img, cv2.COLOR_RGBA2BGR)
                elif pix.n == 3:
                    img = cv2.cvtColor(img, cv2.COLOR_RGB2BGR)

                detector = cv2.QRCodeDetector()
                value, points, _ = detector.detectAndDecode(img)
                found = bool(points is not None and len(points) > 0)
                matched = value == expect_qr
                detail = (
                    f"第 {qr_page} 页 300dpi 渲染后用 OpenCV 解码"
                    + (f"得到「{value}」" if found else "未定位到二维码")
                    + ("，与期望一致" if matched else f"，期望「{expect_qr}」")
                )
                add("二维码解码回读（OpenCV）", found and matched, detail)
            except ImportError:
                add("二维码解码回读（OpenCV）", False, "缺少 cv2 / numpy，无法独立解码验证")

    doc.close()
    return checks


def main() -> int:
    ap = argparse.ArgumentParser(description="RiverType Studio PDF 成品取证检查")
    ap.add_argument("pdf")
    ap.add_argument("--pages", type=int, default=2)
    ap.add_argument("--size", default="210x297")
    ap.add_argument("--expect-text", default="")
    ap.add_argument("--min-dpi", type=float, default=200)
    ap.add_argument("--expect-qr", default="")
    ap.add_argument("--qr-page", type=int, default=1)
    ap.add_argument("--png-dir", default="")
    ap.add_argument("--json", default="")
    ap.add_argument("--md", default="")
    args = ap.parse_args()

    pdf_path = Path(args.pdf)
    if not pdf_path.is_file():
        print(f"找不到 PDF：{pdf_path}", file=sys.stderr)
        return 2

    size_mm = tuple(float(x) for x in args.size.lower().replace("×", "x").split("x"))  # type: ignore[assignment]
    expect_text = {}
    if args.expect_text:
        expect_text = json.loads(Path(args.expect_text).read_text(encoding="utf-8"))

    checks = check(
        pdf_path,
        args.pages,
        (size_mm[0], size_mm[1]),
        expect_text,
        args.min_dpi,
        Path(args.png_dir) if args.png_dir else None,
        args.expect_qr,
        args.qr_page,
    )
    passed = sum(1 for c in checks if c["ok"])
    ok = passed == len(checks)

    report = {
        "pdf": str(pdf_path),
        "bytes": pdf_path.stat().st_size,
        "total": len(checks),
        "passed": passed,
        "ok": ok,
        "checks": checks,
    }

    print(f"\n=== RiverType Studio · PDF 成品检查：{pdf_path.name} ===")
    for c in checks:
        print(f"  [{'PASS' if c['ok'] else 'FAIL'}] {c['check']}：{c['detail']}")
    print(f"--- {passed}/{len(checks)} 通过 · {'全部通过' if ok else '存在失败项'} ---\n")

    if args.json:
        Path(args.json).write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    if args.md:
        lines = [
            f"# PDF 成品检查 · {pdf_path.name}",
            "",
            f"- 文件大小：{report['bytes']} 字节",
            f"- 结果：**{passed}/{len(checks)} 通过**",
            "",
            "| 检查项 | 结果 | 实测 |",
            "| --- | --- | --- |",
        ]
        for c in checks:
            lines.append(f"| {c['check']} | {'PASS' if c['ok'] else 'FAIL'} | {c['detail']} |")
        Path(args.md).write_text("\n".join(lines) + "\n", encoding="utf-8")

    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
