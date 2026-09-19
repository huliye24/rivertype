#!/usr/bin/env python3
"""
RiverType Transliteration Protocol (RTP) Validator
版本:rtp/0.1

校验 .rt 文件是否符合 RTP-0.1 规范。

用法:
    python tools/validator.py <path/to/file.rt>
    python tools/validator.py <path/to/dir>  # 校验目录下所有 .rt
    python tools/validator.py --strict examples/  # 严格模式

退出码:
    0 — 通过
    1 — 失败(硬错误)
    2 — 警告(软错误,但通过)
"""

import sys
import os
import io
import re
from pathlib import Path
from typing import List, Tuple, Dict, Optional

# 强制 UTF-8 输出(Windows GBK 环境)
if sys.platform == "win32":
    try:
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")
    except Exception:
        pass


# ============================================================
# RTP-0.1 常量定义
# ============================================================

PROTOCOL_VERSION = "rtp/0.1"

REQUIRED_FRONTMATTER = [
    "title", "work_id", "author", "dynasty",
    "editions", "protocol", "created", "transliterator",
]

REQUIRED_SECTIONS = ["source"]
RECOMMENDED_SECTIONS = ["punctuation", "variants", "annotation", "vernacular", "meta"]
OPTIONAL_SECTIONS = ["english"]

SECTION_ORDER = [
    "source", "punctuation", "variants",
    "annotation", "vernacular", "english", "meta",
]

ANNOTATION_TYPES = ["@校勘", "@音注", "@训诂", "@字源", "@出注"]


# ============================================================
# 解析 .rt 文件
# ============================================================

def parse_rt(path: Path) -> Tuple[Optional[Dict], str, List[Tuple[str, str, int]]]:
    """
    解析 .rt 文件,返回 (frontmatter_dict, body, sections_list)
    sections_list: [(section_name, content, start_line), ...]
    """
    try:
        text = path.read_text(encoding="utf-8")
    except UnicodeDecodeError as e:
        return None, "", []
    except Exception as e:
        print(f"[ERROR] Cannot read {path}: {e}", file=sys.stderr)
        return None, "", []

    # 解析 frontmatter
    fm_match = re.match(r"^---\s*\n(.*?)\n---\s*\n(.*)$", text, re.DOTALL)
    if not fm_match:
        return None, text, []

    fm_raw = fm_match.group(1)
    body = fm_match.group(2)

    # 简易 YAML 解析(支持嵌套 + list,基于缩进)
    fm = {}
    current_top = None
    current_nested = None
    in_list = False
    list_key = None

    for line in fm_raw.split("\n"):
        if not line.strip():
            continue
        # 顶层键(无缩进)
        if not line.startswith(" ") and ":" in line:
            key, _, value = line.partition(":")
            key = key.strip()
            value = value.strip()
            current_top = key
            current_nested = None
            in_list = False
            list_key = None
            if value == "" or value is None:
                fm[key] = {}
                current_nested = fm[key]
            else:
                fm[key] = value.strip('"').strip("'")
        # 嵌套键(2 空格缩进)
        elif line.startswith("  ") and not line.startswith("    ") and ":" in line:
            key, _, value = line.partition(":")
            key = key.strip()
            value = value.strip()
            if current_top and isinstance(fm.get(current_top), dict):
                if value == "" or value is None:
                    fm[current_top][key] = []
                    in_list = True
                    list_key = key
                else:
                    fm[current_top][key] = value.strip('"').strip("'")
                    in_list = False
                    list_key = None
                current_nested = fm[current_top]
        # 列表项(4 空格缩进)
        elif line.startswith("    - ") or line.startswith("  - "):
            item = re.sub(r"^\s*-\s*", "", line).strip()
            if current_top and list_key:
                if not isinstance(fm[current_top].get(list_key), list):
                    fm[current_top][list_key] = []
                fm[current_top][list_key].append(item.strip('"').strip("'"))

    # 解析 sections
    sections = []
    current_section = None
    current_content = []
    current_start_line = 0
    lines = body.split("\n")
    fm_end_line = text[:text.find(body)].count("\n") + 1

    for i, line in enumerate(lines, start=1):
        actual_line = fm_end_line + i
        m = re.match(r"<!--\s*@section:\s*(\w+)\s*-->", line)
        if m:
            if current_section:
                sections.append((current_section, "\n".join(current_content), current_start_line))
            current_section = m.group(1)
            current_content = []
            current_start_line = actual_line
        else:
            if current_section:
                current_content.append(line)

    if current_section:
        sections.append((current_section, "\n".join(current_content), current_start_line))

    return fm, body, sections


# ============================================================
# 校验项
# ============================================================

class ValidationResult:
    def __init__(self):
        self.passed = []
        self.failed = []
        self.warnings = []

    def ok(self, msg):
        self.passed.append(msg)

    def fail(self, msg):
        self.failed.append(msg)

    def warn(self, msg):
        self.warnings.append(msg)

    def has_hard_fail(self) -> bool:
        return len(self.failed) > 0

    def report(self) -> str:
        out = []
        out.append("# 校验报告")
        out.append("")
        out.append("## 通过项")
        for p in self.passed:
            out.append(f"- ✅ {p}")
        out.append("")
        out.append("## 失败项")
        if not self.failed:
            out.append("(无)")
        for f in self.failed:
            out.append(f"- [FAIL] {f}")
        out.append("")
        out.append("## 警告项")
        if not self.warnings:
            out.append("(无)")
        for w in self.warnings:
            out.append(f"- [WARN] {w}")
        out.append("")
        out.append("## 总结")
        total = len(self.passed) + len(self.failed)
        rate = (len(self.passed) / total * 100) if total > 0 else 0
        out.append(f"- 通过率:{len(self.passed)}/{total} ({rate:.0f}%)")
        out.append(f"- 建议:{'可发布' if not self.has_hard_fail() else '需要修复'}")
        return "\n".join(out)


def validate_frontmatter(fm: Dict, result: ValidationResult):
    """校验 frontmatter"""
    if fm is None:
        result.fail("Frontmatter 缺失")
        return

    for field in REQUIRED_FRONTMATTER:
        if field not in fm or fm[field] is None:
            result.fail(f"Frontmatter 缺必需字段:{field}")

    if fm.get("protocol") != PROTOCOL_VERSION:
        result.fail(f"protocol 字段应为 '{PROTOCOL_VERSION}',实际为 '{fm.get('protocol')}'")

    if fm.get("work_id"):
        if not re.match(r"^[a-z0-9-]+$", fm["work_id"]):
            result.warn(f"work_id 建议使用小写字母和连字符: {fm['work_id']}")

    if fm.get("editions"):
        if not isinstance(fm.get("editions"), dict):
            if not isinstance(fm["editions"], str):
                result.warn("editions 字段建议使用嵌套结构")
        elif not fm["editions"]:
            result.warn("editions 字段为空,无法做异文对比")

    result.ok("Frontmatter 校验完成")


def validate_sections(sections: List[Tuple[str, str, int]], result: ValidationResult):
    """校验 section 结构"""
    section_names = [s[0] for s in sections]

    for req in REQUIRED_SECTIONS:
        if req not in section_names:
            result.fail(f"缺少必需区段:{req}")

    # 区段顺序
    prev_idx = -1
    for name in section_names:
        if name in SECTION_ORDER:
            idx = SECTION_ORDER.index(name)
            if idx < prev_idx:
                result.warn(f"区段顺序错位:{name} 应在 {[s for s in section_names if s != name and s in SECTION_ORDER]} 之后")
            prev_idx = max(prev_idx, idx)

    # 推荐区段
    for rec in RECOMMENDED_SECTIONS:
        if rec not in section_names:
            result.warn(f"建议添加区段:{rec}")

    if sections:
        result.ok("Section 结构校验完成")


def validate_variants(sections: List[Tuple[str, str, int]], fm: Dict, result: ValidationResult):
    """校验 variants 区段"""
    variants_section = next((s for s in sections if s[0] == "variants"), None)
    if not variants_section:
        return  # 推荐项,已有 warning

    content = variants_section[1]

    # 检查表格存在
    if "|" not in content:
        result.warn("variants 区段无表格")
        return

    # 提取表头(只解析真正的表头行,跳过分隔行 ---)
    lines = content.split("\n")
    header_line = None
    for line in lines:
        # 跳过分隔行(只含 |、-、空格、数字)
        stripped = re.sub(r"[\|\-\s]", "", line)
        if not stripped:
            continue
        # 找到第一个真正的表头(包含中文/英文文本)
        if "|" in line and not re.match(r"^\|[\s\-:|]+\|$", line):
            header_line = line
            break

    if not header_line:
        result.warn("variants 区段表格格式异常")
        return

    # 解析表头单元格
    raw_cells = [c.strip() for c in header_line.strip().strip("|").split("|")]
    # 过滤空
    headers = [c for c in raw_cells if c]

    # 检查列名与 frontmatter 一致
    if isinstance(fm.get("editions"), dict):
        collated = fm["editions"].get("collated", [])
    else:
        collated = []

    # 取 base + collated,生成所有可能的简称形式
    editions_full = []
    editions_short = []
    if isinstance(fm.get("editions"), dict):
        base = fm["editions"].get("base")
        collated = fm["editions"].get("collated", [])

        if base:
            # 提取主名(去括号备注)
            main = base.split("(")[0].strip()
            editions_full.append(main)
            # 简称:去 "本"、"注"、"刊本" 等后缀
            short = re.sub(r"(本|注|刊本|藏本)$", "", main)
            if short != main:
                editions_short.append(short)

        if collated:
            for c in collated:
                if c:
                    main = c.split("(")[0].strip()
                    editions_full.append(main)
                    short = re.sub(r"(本|注|刊本|藏本)$", "", main)
                    if short != main:
                        editions_short.append(short)

    valid_names = set(editions_full) | set(editions_short)

    for header in headers[1:]:  # 跳过章·字列
        if header and header not in valid_names:
            result.warn(f"variants 表列名 '{header}' 不在 frontmatter editions 中 (期望: {sorted(valid_names)})")

    # 检查行号格式
    row_pattern = re.compile(r"\|\s*(\d+)\.(\d+)\s*\|")
    if not row_pattern.search(content):
        result.warn("variants 表未发现标准行号格式 (X.Y)")

    result.ok("variants 区段校验完成")


def validate_annotations(sections: List[Tuple[str, str, int]], result: ValidationResult):
    """校验 annotation 区段"""
    anno_section = next((s for s in sections if s[0] == "annotation"), None)
    if not anno_section:
        return

    content = anno_section[1]

    # 检查是否有 @ 类型标记
    has_any_type = any(t in content for t in ANNOTATION_TYPES)
    if not has_any_type:
        result.warn("annotation 区段未发现任何 @校勘/@音注/@训诂/@字源/@出注 标记")

    # 检查行号格式
    row_pattern = re.compile(r"\*\*\s*(\d+)\.(\d+)")
    if not row_pattern.search(content):
        result.warn("annotation 未发现标准行号格式 (**X.Y 字)")

    result.ok("annotation 区段校验完成")


def validate_vernacular(sections: List[Tuple[str, str, int]], result: ValidationResult):
    """校验 vernacular 区段"""
    vern_section = next((s for s in sections if s[0] == "vernacular"), None)
    if not vern_section:
        return

    content = vern_section[1]

    # 检查文言词(白话应避免)
    classical_words = ["之", "乎", "者", "也", "矣", "焉", "其"]
    for word in classical_words:
        # 排除作为术语引用的情况
        pattern = rf"\b{word}\b"
        if re.search(pattern, content):
            # 但允许在引用块外(如 @xxx)使用
            # 简单实现:只看引用块 > 内
            lines_in_quote = [l for l in content.split("\n") if l.strip().startswith(">")]
            quote_content = "\n".join(lines_in_quote)
            if re.search(pattern, quote_content):
                result.warn(f"vernacular 区段疑似含文言词 '{word}',建议检查是否应替换")

    # 检查翻译腔
    translationese = ["在某种意义上", "在某种程度上", "具有某种", "令人感到", "给人以"]
    for phrase in translationese:
        if phrase in content:
            result.warn(f"vernacular 区段疑似翻译腔: '{phrase}'")

    result.ok("vernacular 区段校验完成")


# ============================================================
# 主流程
# ============================================================

def validate_file(path: Path, strict: bool = False) -> int:
    """校验单个 .rt 文件,返回退出码"""
    print(f"\n{'='*60}")
    print(f"📄 校验: {path}")
    print('='*60)

    if not path.exists():
        print(f"[ERROR] 文件不存在: {path}", file=sys.stderr)
        return 1

    fm, body, sections = parse_rt(path)
    result = ValidationResult()

    validate_frontmatter(fm, result)
    validate_sections(sections, result)
    validate_variants(sections, fm, result)
    validate_annotations(sections, result)
    validate_vernacular(sections, result)

    print(result.report())

    if result.has_hard_fail():
        return 1
    elif strict and result.warnings:
        return 2
    return 0


def validate_directory(dir_path: Path, strict: bool = False) -> int:
    """校验目录下所有 .rt 文件"""
    rt_files = list(dir_path.rglob("*.rt"))
    if not rt_files:
        print(f"[WARN] 目录下未发现 .rt 文件: {dir_path}", file=sys.stderr)
        return 1

    print(f"📂 发现 {len(rt_files)} 个 .rt 文件")

    failed = 0
    warned = 0
    for f in rt_files:
        rc = validate_file(f, strict=strict)
        if rc == 1:
            failed += 1
        elif rc == 2:
            warned += 1

    print(f"\n{'='*60}")
    print(f"📊 总览:{len(rt_files)} 个文件,{failed} 失败,{warned} 警告")
    print('='*60)

    return 1 if failed > 0 else 0


def main():
    if len(sys.argv) < 2:
        print("用法:python tools/validator.py <path/to/file.rt>")
        print("     python tools/validator.py <path/to/dir>")
        print("     python tools/validator.py --strict <path>")
        sys.exit(1)

    strict = "--strict" in sys.argv
    args = [a for a in sys.argv[1:] if not a.startswith("--")]

    target = Path(args[0])
    if not target.exists():
        print(f"[ERROR] 路径不存在: {target}", file=sys.stderr)
        sys.exit(1)

    if target.is_dir():
        rc = validate_directory(target, strict=strict)
    else:
        rc = validate_file(target, strict=strict)

    sys.exit(rc)


if __name__ == "__main__":
    main()
