#!/usr/bin/env python3
"""
RiverType Validator Test Suite
测试 tools/validator.py 的正确性

运行:python tools/validator_tests.py
"""

import sys
import tempfile
from pathlib import Path

# 不强制 stdout 包装,避免 PowerShell pipe 下 closed file 问题
# validator.py 内部已处理 Windows 输出编码

# 引入被测模块
sys.path.insert(0, str(Path(__file__).parent))
from validator import validate_file, parse_rt, ValidationResult


# ============================================================
# 测试用例
# ============================================================

VALID_RT = """---
title: 道德经·第一章
work_id: ddj-c01
author: 老子
dynasty: 春秋
editions:
  base: 王弼本
  collated:
    - 帛甲本
    - 河上公本
protocol: rtp/0.1
created: 2026-09-20
transliterator: 文川院 AI v1
---

<!-- @section: source -->
## 原文

> 上善若水。

<!-- @section: variants -->
## 异文

| 章·字 | 王弼 | 帛甲 |
|-------|------|------|
| 1.1   | 上   | 上   |
| 1.3   | 若   | 堇   |

@校勘 1.3 字形异文。

<!-- @section: annotation -->
## 校注

- **1.1 上**:@训诂 至极。

<!-- @section: vernacular -->
## 白话

> 最高的善像水一样。

<!-- @section: meta -->
## 元信息

- 协议:rtp/0.1
"""

MISSING_FRONTMATTER_RT = """---
title: 测试
---

<!-- @section: source -->
## 原文

> 测试。
"""

WRONG_PROTOCOL_RT = """---
title: 测试
work_id: test-01
author: 佚名
dynasty: 不详
editions:
  base: 测试本
  collated:
    - 测试本2
protocol: rtp/0.0
created: 2026-09-20
transliterator: 测试
---

<!-- @section: source -->
## 原文

> 测试。
"""

NO_SOURCE_RT = """---
title: 测试
work_id: test-01
author: 佚名
dynasty: 不详
editions:
  base: 测试本
  collated:
    - 测试本2
protocol: rtp/0.1
created: 2026-09-20
transliterator: 测试
---

<!-- @section: vernacular -->
## 白话

> 测试白话。
"""

WITH_CLASSICAL_WORD_RT = """---
title: 测试
work_id: test-classical
author: 佚名
dynasty: 不详
editions:
  base: 测试本
  collated:
    - 测试本2
protocol: rtp/0.1
created: 2026-09-20
transliterator: 测试
---

<!-- @section: source -->
## 原文

> 测试。

<!-- @section: vernacular -->
## 白话

> 最高的善,之如水也。

<!-- @section: meta -->
## 元信息
"""


def test_valid():
    """测试合规文件应通过"""
    with tempfile.NamedTemporaryFile(mode="w", suffix=".rt", delete=False, encoding="utf-8") as f:
        f.write(VALID_RT)
        path = Path(f.name)

    rc = validate_file(path)
    print(f"✅ test_valid: 退出码 {rc}", end=" ")
    assert rc == 0, "合规文件应该通过"
    print("PASSED")
    path.unlink()


def test_missing_frontmatter():
    """测试缺 frontmatter 字段应失败"""
    with tempfile.NamedTemporaryFile(mode="w", suffix=".rt", delete=False, encoding="utf-8") as f:
        f.write(MISSING_FRONTMATTER_RT)
        path = Path(f.name)

    rc = validate_file(path)
    print(f"❌ test_missing_frontmatter: 退出码 {rc}", end=" ")
    assert rc == 1, "缺 frontmatter 应失败"
    print("PASSED")
    path.unlink()


def test_wrong_protocol():
    """测试错误协议版本应失败"""
    with tempfile.NamedTemporaryFile(mode="w", suffix=".rt", delete=False, encoding="utf-8") as f:
        f.write(WRONG_PROTOCOL_RT)
        path = Path(f.name)

    rc = validate_file(path)
    print(f"❌ test_wrong_protocol: 退出码 {rc}", end=" ")
    assert rc == 1, "错误协议版本应失败"
    print("PASSED")
    path.unlink()


def test_no_source():
    """测试无 source 区段应失败"""
    with tempfile.NamedTemporaryFile(mode="w", suffix=".rt", delete=False, encoding="utf-8") as f:
        f.write(NO_SOURCE_RT)
        path = Path(f.name)

    rc = validate_file(path)
    print(f"❌ test_no_source: 退出码 {rc}", end=" ")
    assert rc == 1, "无 source 区段应失败"
    print("PASSED")
    path.unlink()


def test_classical_word_warning():
    """测试文言词应警告"""
    with tempfile.NamedTemporaryFile(mode="w", suffix=".rt", delete=False, encoding="utf-8") as f:
        f.write(WITH_CLASSICAL_WORD_RT)
        path = Path(f.name)

    rc = validate_file(path)
    print(f"⚠️ test_classical_word_warning: 退出码 {rc}", end=" ")
    # 应通过(只是 warning,不算 hard fail)
    assert rc == 0, "文言词是 warning,不应 hard fail"
    print("PASSED")
    path.unlink()


def test_parse_rt():
    """测试 parse_rt 基本功能"""
    with tempfile.NamedTemporaryFile(mode="w", suffix=".rt", delete=False, encoding="utf-8") as f:
        f.write(VALID_RT)
        path = Path(f.name)

    fm, body, sections = parse_rt(path)
    assert fm is not None, "应能解析 frontmatter"
    assert fm.get("title") == "道德经·第一章"
    assert fm.get("protocol") == "rtp/0.1"
    assert len(sections) == 5, f"应有 5 个区段,实际 {len(sections)}"
    section_names = [s[0] for s in sections]
    assert "source" in section_names
    assert "variants" in section_names
    print("[OK] test_parse_rt PASSED")
    path.unlink()


def run_all():
    print("=" * 60)
    print("🧪 RiverType Validator Test Suite")
    print("=" * 60)
    tests = [
        test_valid,
        test_missing_frontmatter,
        test_wrong_protocol,
        test_no_source,
        test_classical_word_warning,
        test_parse_rt,
    ]
    passed = 0
    failed = 0
    for t in tests:
        try:
            t()
            passed += 1
        except AssertionError as e:
            print(f"FAILED: {e}")
            failed += 1
        except Exception as e:
            print(f"ERROR: {e}")
            failed += 1

    print("=" * 60)
    print(f"📊 总览:{passed} 通过,{failed} 失败")
    print("=" * 60)
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(run_all())
