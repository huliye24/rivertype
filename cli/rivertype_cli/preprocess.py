"""preprocess：扫描本数学预处理（图像层，不调 OCR）。

借鉴 open-guji-cv 的六步流水线（s1~s6），做轻量 OpenCV 实现：
  s_bar   裁右侧扫描色卡条（自动检测）
  s_deskew   倾斜校正（Hough 估计旋转角 → affine 旋转）
  s_bin   二值化（Otsu 全局 + Sauvola 局部二选一/双出）

每一步独立、可关闭。输出到 pages/<stem>.{s_bar,s_deskew,s_bin}.png
以及 preprocessed/<stem>.png（默认链式应用的最终版）。

为什么是这一层：
  OCR 模型的古籍识别率低，问题不在模型，在输入图。色卡条、轻微倾斜、
  阴影都会让识别率掉一半。先把图像数学层固定下来，下游 OCR / 视觉 API /
  人眼校对都从同一张干净图开始。
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import cv2
import numpy as np

from .project import Project


def _imread(path: Path) -> np.ndarray:
    """OpenCV 在 Windows 长路径 / 中文路径下 imread 会失败，绕路用 imdecode。"""
    data = path.read_bytes()
    arr = np.frombuffer(data, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_GRAYSCALE)
    if img is None:
        raise SystemExit(f"无法读取 {path}")
    return img


def _imwrite(path: Path, img: np.ndarray) -> None:
    """OpenCV imwrite 在 Windows 长路径下也偶有 bug；走 imencode。"""
    ok, buf = cv2.imencode(".png", img)
    if not ok:
        raise SystemExit(f"无法编码 PNG 写入 {path}")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(buf.tobytes())


# ────────────────────────────────────────────────────────────────────────
#  s_bar: 裁右侧扫描色卡
# ────────────────────────────────────────────────────────────────────────

def detect_right_bar(img: np.ndarray, window: int = 50, jump_ratio: float = 1.6) -> int | None:
    """沿水平方向扫列均值，找色卡条的左边界。

    数学原理：古籍正文区列均值通常 130~180（米黄纸上浅墨），
    色卡条是彩色印刷（蓝/红/黄/黑块），灰度化后列均值会比正文区
    低 30~80 或高 30~80（取决于主导色）。我们用「列均值相对左半边
    中位数的偏差」做边缘检测——突变点即是色卡起点。

    返回裁剪宽度（保留前 N 列）；若未检测到突变，返回 None。
    """
    h, w = img.shape
    left_ref = float(np.median(img[:, : w // 2]))
    col_means = img.mean(axis=0)
    # 用一维中值滤波去掉单列噪点
    k = max(5, window // 4)
    smoothed = cv2.medianBlur(col_means.astype(np.float32).reshape(1, -1), k).ravel()
    diffs = np.abs(smoothed - left_ref)

    # 从右往左找第一个"突变剧烈"的列
    threshold = max(15.0, left_ref * 0.18)
    for x in range(int(w * 0.55), int(w * 0.95)):
        if diffs[x] > threshold and diffs[x] > diffs[x - 1] * jump_ratio:
            return x
    return None


def crop_bar(img: np.ndarray) -> tuple[np.ndarray, dict]:
    """裁右侧色卡条。返回 (裁后图, 元数据)。"""
    h, w = img.shape
    cut = detect_right_bar(img)
    meta = {"original_w": w, "cut_x": cut, "kept_ratio": (cut or w) / w}
    if cut is None:
        return img, meta
    return img[:, :cut], meta


# ────────────────────────────────────────────────────────────────────────
#  s_deskew: 倾斜校正
# ────────────────────────────────────────────────────────────────────────

def estimate_skew_angle(img: np.ndarray, min_angle: float = -15.0, max_angle: float = 15.0) -> float:
    """估计图像倾斜角（度）。

    数学原理：Canny 边 → HoughLinesP 找长直线 → 取近水平线的角度中位数。
    古籍印装时偶有 1~3° 倾斜；这是最便宜的估计法。
    """
    edges = cv2.Canny(img, 50, 150, apertureSize=3)
    min_len = max(50, img.shape[0] // 4)
    lines = cv2.HoughLinesP(
        edges, rho=1, theta=np.pi / 360, threshold=200,
        minLineLength=min_len, maxLineGap=10,
    )
    if lines is None:
        return 0.0
    angles = []
    for ln in lines:
        x1, y1, x2, y2 = ln[0]
        dx = x2 - x1
        if abs(dx) < 1:
            continue
        ang = float(np.degrees(np.arctan2(y2 - y1, dx)))
        if min_angle <= ang <= max_angle:
            angles.append(ang)
    if not angles:
        return 0.0
    # 中位数比均值鲁棒（防异常长斜线干扰）
    return float(np.median(angles))


def deskew(img: np.ndarray, angle: float | None = None) -> tuple[np.ndarray, dict]:
    """按 angle 旋转；白边填色（255）。angle=None 时自动估计。"""
    h, w = img.shape
    if angle is None:
        angle = estimate_skew_angle(img)
    if abs(angle) < 0.05:
        return img, {"angle": angle, "rotated": False}
    M = cv2.getRotationMatrix2D((w / 2, h / 2), angle, 1.0)
    rotated = cv2.warpAffine(img, M, (w, h), flags=cv2.INTER_CUBIC, borderValue=255)
    return rotated, {"angle": angle, "rotated": True}


# ────────────────────────────────────────────────────────────────────────
#  s_bin: 二值化
# ────────────────────────────────────────────────────────────────────────

def binarize_otsu(img: np.ndarray) -> np.ndarray:
    """全局 Otsu。快，但墨色不均时易断笔（小字）。"""
    _, b = cv2.threshold(img, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    return b


def binarize_sauvola(img: np.ndarray, window: int = 31, k: float = 0.2, R: float = 128.0) -> np.ndarray:
    """Sauvola 局部自适应二值化——对小字、阴影、古籍印装不均的页面友好。

    数学：阈值 T(x,y) = m(x,y) * [1 + k * (s(x,y)/R - 1)]
    其中 m/s 是 window 内均值/标准差。整页亮度变化时也能保住笔画。
    比 OpenCV 自适应阈值更稳，因为自适应阈值只取均值，忽略局部方差。
    """
    # 浮点均值与均值平方 → 用 boxFilter 快速算
    mean = cv2.boxFilter(img.astype(np.float32), -1, (window, window))
    sqmean = cv2.boxFilter((img.astype(np.float32)) ** 2, -1, (window, window))
    var = np.maximum(sqmean - mean ** 2, 0)
    std = np.sqrt(var)
    threshold = mean * (1.0 + k * (std / R - 1.0))
    return np.where(img.astype(np.float32) < threshold, 0, 255).astype(np.uint8)


def binarize(img: np.ndarray, method: str = "sauvola") -> np.ndarray:
    if method == "otsu":
        return binarize_otsu(img)
    if method == "sauvola":
        return binarize_sauvola(img)
    raise SystemExit(f"未知二值化方法：{method}（otsu / sauvola）")


# ────────────────────────────────────────────────────────────────────────
#  CLI
# ────────────────────────────────────────────────────────────────────────

def run_preprocess(
    project: Project,
    steps: list[str] | None = None,
    bin_method: str = "sauvola",
    binarize_only: bool = False,
    force: bool = False,
) -> dict:
    """流水线：pages/*.png -> preprocessed/*.png + 元数据 manifest/preprocess.json。

    steps: 默认 ['bar', 'deskew', 'bin']。binarize_only=True 时只跑 bin。
    """
    pages_dir = project.root / "pages"
    if not pages_dir.exists():
        raise SystemExit(f"未找到 {pages_dir}（请先 rivertype render）")

    out_dir = project.root / "preprocessed"
    out_dir.mkdir(exist_ok=True)
    meta_path = project.root / "manifest" / "preprocess.json"

    steps = steps or (["bin"] if binarize_only else ["bar", "deskew", "bin"])

    sources = sorted(pages_dir.glob("*.png"))
    if not sources:
        raise SystemExit(f"{pages_dir} 下无 PNG")

    summary = {"steps": steps, "bin_method": bin_method, "pages": {}}

    for src in sources:
        stem = src.stem
        final_path = out_dir / f"{stem}.png"
        if final_path.exists() and not force:
            print(f"  -- {stem}: 已存在，跳过")
            continue

        print(f"  -> {stem}")
        img = _imread(src)
        page_meta = {"original_size": list(img.shape)}

        if "bar" in steps:
            img, m = crop_bar(img)
            page_meta["bar"] = m

        if "deskew" in steps:
            img, m = deskew(img)
            page_meta["deskew"] = m

        if "bin" in steps:
            img = binarize(img, method=bin_method)
            page_meta["bin"] = bin_method

        _imwrite(final_path, img)
        page_meta["final_size"] = list(img.shape)
        summary["pages"][stem] = page_meta

    meta_path.parent.mkdir(parents=True, exist_ok=True)
    meta_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"preprocess 完成：{len(summary['pages'])} 页 -> {out_dir}")
    print(f"元数据 -> {meta_path}")
    return summary


def main(project_root: str, args: argparse.Namespace) -> None:
    project = Project.load(project_root)
    run_preprocess(
        project,
        steps=args.steps,
        bin_method=args.bin_method,
        binarize_only=args.binarize_only,
        force=args.force,
    )
