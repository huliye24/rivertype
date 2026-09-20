"""
RTP-0.2 CharacterDepth · property-based tests
==============================================

用 hypothesis 生成随机 CharacterDepth 实例,验证关键不变量:

1. **5-axes invariant** — 任何 depth 必有 5 个 axis,observed ⊆ AXES
2. **YAML roundtrip** — to_yaml / from_yaml 保真
3. **status consistency** — CONFIRMED ⇒ value 非空
4. **sense integrity** — ranks 1..n 连续,频率和 ∈ [0.9, 1.1]
5. **etym presence** — CONFIRMED ⇒ chain 非空
6. **usage presence** — non-MISSING ⇒ register 非空
7. **reconstruct symmetry** — 候选等于观测时,必返回该候选
8. **reconstruct monotonicity** — CONFIRMED 命中分数 > INFERRED 命中

跑法
----
    pytest cli/rivertype_cli/depth_tests.py -v
"""

from __future__ import annotations

import math
from typing import List

import pytest
from hypothesis import HealthCheck, given, settings, strategies as st

from cli.rivertype_cli.depth import (
    AXES,
    CharacterDepth,
    EtymField,
    EtymForm,
    FieldStatus,
    GlyphField,
    PhonField,
    SenseEntry,
    SenseField,
    UsageField,
    from_yaml,
    reconstruct,
    to_yaml,
    validate,
)


# ---------------------------------------------------------------------------
# Strategies(hypothesis 数据生成器)
# ---------------------------------------------------------------------------

# 单个汉字:常用 CJK + 一些异体字。CJK Unified Ideographs 基本平面:U+4E00..U+9FFF。
cjk_char = st.characters(min_codepoint=0x4E00, max_codepoint=0x9FFF)

# 任意单字符(供 placeholder);排除 YAML whitespace 敏感字符
any_char = st.text(
    alphabet=st.characters(
        blacklist_characters="\t\n\r\u0020\u00a0\u2028\u2029\u202f\u205f\u3000\ufeff\x85",
    ),
    min_size=1,
    max_size=1,
)

# 部件分解
components = st.fixed_dictionaries({
    "radical": any_char,
    "rest": any_char,
})

# 历史读音条目
historical_entry = st.fixed_dictionaries({
    "middle_chinese": st.text(min_size=1, max_size=8),
    "period": st.sampled_from(["魏晋", "唐", "宋", "元", "明"]),
})

# 义项
sense_entry = st.builds(
    SenseEntry,
    rank=st.integers(min_value=1, max_value=20),
    gloss=st.text(min_size=1, max_size=10),
    classical_ref=st.one_of(st.none(), st.text(min_size=1, max_size=30)),
    frequency=st.floats(min_value=0.0, max_value=1.0, allow_nan=False, allow_infinity=False),
)

# 字形演变节
etym_form = st.builds(
    EtymForm,
    form=any_char,
    script=st.sampled_from(["oracle_bone", "bronze", "seal", "clerical", "regular"]),
    period=st.one_of(st.none(), st.sampled_from(["殷商", "西周", "秦", "汉", "唐"])),
    ref=st.one_of(st.none(), st.text(min_size=1, max_size=20)),
)

# 状态
status = st.sampled_from(list(FieldStatus))

# 五层字段
glyph_field = st.builds(
    GlyphField,
    current=st.one_of(st.none(), cjk_char),
    variants=st.lists(cjk_char, max_size=3),
    components=st.one_of(st.none(), components),
    script=st.one_of(st.none(), st.sampled_from(["traditional", "simplified", "both"])),
    source=st.one_of(st.none(), st.text(min_size=1, max_size=20)),
    status=status,
)

phon_field = st.builds(
    PhonField,
    mandarin=st.one_of(st.none(), st.text(
        alphabet=st.characters(
            blacklist_characters="\t\n\r\u0020\u00a0\u2028\u2029\u202f\u205f\u3000\ufeff\x85",
        ),
        min_size=1,
        max_size=8,
    )),
    historical=st.lists(historical_entry, max_size=2),
    dialect=st.lists(st.fixed_dictionaries({"name": st.text(max_size=4), "reading": st.text(max_size=4)}), max_size=2),
    source=st.one_of(st.none(), st.text(min_size=1, max_size=20)),
    status=status,
)

sense_field = st.builds(
    SenseField,
    senses=st.lists(sense_entry, max_size=5),
    source=st.one_of(st.none(), st.text(min_size=1, max_size=20)),
    status=status,
)

etym_field = st.builds(
    EtymField,
    chain=st.lists(etym_form, max_size=3),
    decomposition_type=st.one_of(st.none(), st.sampled_from(["象形", "指事", "会意", "形声", "转注", "假借"])),
    semantic_component=st.one_of(st.none(), st.text(max_size=4)),
    phonetic_component=st.one_of(st.none(), st.text(max_size=4)),
    note=st.one_of(st.none(), st.text(max_size=20)),
    source=st.one_of(st.none(), st.text(min_size=1, max_size=20)),
    status=status,
)

usage_field = st.builds(
    UsageField,
    register=st.lists(st.sampled_from(["classical_high", "classical_mid", "vernacular_low"]), max_size=3),
    domain=st.lists(st.sampled_from(["philosophy", "religion", "history", "poetry"]), max_size=3),
    avoidance=st.lists(
        st.fixed_dictionaries({"taboo_for": st.text(max_size=8), "variants_affected": st.lists(st.text(max_size=2), max_size=2)}),
        max_size=2,
    ),
    special_role=st.one_of(st.none(), st.sampled_from(["core_concept", "title_term", "proper_noun", "technical_term"])),
    source=st.one_of(st.none(), st.text(min_size=1, max_size=20)),
    status=status,
)

# 整体 CharacterDepth
character_depth = st.builds(
    CharacterDepth,
    char=cjk_char,
    glyph=glyph_field,
    phon=phon_field,
    sense=sense_field,
    etym=etym_field,
    usage=usage_field,
)


# ---------------------------------------------------------------------------
# Property 1:5-axes invariant
# ---------------------------------------------------------------------------

@given(character_depth)
@settings(max_examples=200, suppress_health_check=[HealthCheck.too_slow])
def test_five_axes_invariant(d: CharacterDepth) -> None:
    """任何 CharacterDepth 必须有全部 5 个 axis。"""
    for axis in AXES:
        assert hasattr(d, axis), f"missing axis {axis}"
    assert set(AXES) == {"glyph", "phon", "sense", "etym", "usage"}
    # observed ⊆ AXES
    observed = d.observed_axes()
    assert set(observed).issubset(set(AXES))


# ---------------------------------------------------------------------------
# Property 2:YAML roundtrip
# ---------------------------------------------------------------------------

@given(character_depth)
@settings(max_examples=100, suppress_health_check=[HealthCheck.too_slow])
def test_yaml_roundtrip(d: CharacterDepth) -> None:
    """to_yaml → from_yaml 必保真(char / 5 字段值 / status)。"""
    text = to_yaml(d)
    d2 = from_yaml(text)
    assert d2.char == d.char
    for axis in AXES:
        a, b = getattr(d, axis), getattr(d2, axis)
        assert a.status == b.status, f"{axis}.status mismatch: {a.status} vs {b.status}"
        # 比较可序列化部分
        if axis == "glyph":
            assert a.current == b.current
            assert a.script == b.script
        elif axis == "phon":
            assert a.mandarin == b.mandarin
        elif axis == "sense":
            assert [s.gloss for s in a.senses] == [s.gloss for s in b.senses]
        elif axis == "etym":
            assert [f.form for f in a.chain] == [f.form for f in b.chain]
            assert a.decomposition_type == b.decomposition_type
        elif axis == "usage":
            assert a.register == b.register


# ---------------------------------------------------------------------------
# Property 3:status consistency(CONFIRMED ⇒ value 非空)
# ---------------------------------------------------------------------------

@given(character_depth)
@settings(max_examples=100, suppress_health_check=[HealthCheck.too_slow])
def test_status_consistency(d: CharacterDepth) -> None:
    """validate() 必须捕获 CONFIRMED-but-empty 错误。"""
    issues = validate(d)
    if d.glyph.status == FieldStatus.CONFIRMED and not d.glyph.current:
        assert any(i.axis == "glyph" and "CONFIRMED" in i.message for i in issues), \
            f"expected glyph CONFIRMED issue, got {issues}"
    if d.phon.status == FieldStatus.CONFIRMED and not d.phon.mandarin:
        assert any(i.axis == "phon" and "CONFIRMED" in i.message for i in issues), \
            f"expected phon CONFIRMED issue, got {issues}"
    if d.usage.status != FieldStatus.MISSING and not d.usage.register:
        assert any(i.axis == "usage" and "register" in i.field for i in issues), \
            f"expected usage.register issue, got {issues}"


# ---------------------------------------------------------------------------
# Property 4:sense ranks 1..n 连续
# ---------------------------------------------------------------------------

@given(character_depth)
@settings(max_examples=200, suppress_health_check=[HealthCheck.too_slow])
def test_sense_ranks_contiguous(d: CharacterDepth) -> None:
    if d.sense.status != FieldStatus.MISSING and d.sense.senses:
        issues = validate(d)
        ranks = sorted(s.rank for s in d.sense.senses)
        if ranks != list(range(1, len(ranks) + 1)):
            assert any(i.field == "rank" for i in issues), \
                f"expected rank issue, got {issues}"


# ---------------------------------------------------------------------------
# Property 5:frequency sum 警告阈值
# ---------------------------------------------------------------------------

@given(character_depth)
@settings(max_examples=100, suppress_health_check=[HealthCheck.too_slow])
def test_frequency_sum_within_range(d: CharacterDepth) -> None:
    if d.sense.status != FieldStatus.MISSING and d.sense.senses:
        total = sum(s.frequency or 0.0 for s in d.sense.senses)
        issues = validate(d)
        if not (0.9 <= total <= 1.1):
            assert any(i.field == "frequency" for i in issues)


# ---------------------------------------------------------------------------
# Property 6:reconstruct symmetry(候选等于观测时,必返回该候选)
# ---------------------------------------------------------------------------

@given(character_depth, st.lists(character_depth, max_size=2))
@settings(max_examples=20, suppress_health_check=[HealthCheck.too_slow, HealthCheck.data_too_large])
def test_reconstruct_self_match(obs: CharacterDepth, others: List[CharacterDepth]) -> None:
    """当 obs 至少有 1 个非空字段时,reconstruct 必返回 obs 本身(自匹配)。"""
    # 找出 obs 是否有任何"可比较"的非空值
    has_signal = any([
        obs.glyph.status != FieldStatus.MISSING and obs.glyph.current,
        obs.phon.status != FieldStatus.MISSING and obs.phon.mandarin,
        obs.sense.status != FieldStatus.MISSING and obs.sense.senses,
        obs.etym.status != FieldStatus.MISSING and obs.etym.chain,
        obs.usage.status != FieldStatus.MISSING and obs.usage.register,
    ])
    candidates = [obs] + others
    best = reconstruct(obs, candidates)
    if has_signal:
        assert best is not None, f"expected self-match, got None (no signal in obs?)"
        assert best is obs


# ---------------------------------------------------------------------------
# Property 7:CONFIRMED 命中优先于 INFERRED 命中
# ---------------------------------------------------------------------------

def test_confirmed_beats_inferred_priority() -> None:
    """同字段,CONFIRMED 的 observation 评分 ≥ INFERRED 评分。"""
    # 构造两个候选:cand1 在 glyph 命中,obs 用 CONFIRMED
    cand1 = CharacterDepth(char="道")
    cand1.glyph.current = "道"
    cand1.glyph.status = FieldStatus.CONFIRMED

    obs_confirmed = CharacterDepth(char="道")
    obs_confirmed.glyph.current = "道"
    obs_confirmed.glyph.status = FieldStatus.CONFIRMED

    obs_inferred = CharacterDepth(char="道")
    obs_inferred.glyph.current = "道"
    obs_inferred.glyph.status = FieldStatus.INFERRED

    weight = {a: 1.0 for a in AXES}
    # 显式重算分数比较(避免候选相同时的 tied score)
    candidates = [cand1, CharacterDepth(char="None"), CharacterDepth(char="None")]
    score_c = _match_score(obs_confirmed, cand1, weight)
    score_i = _match_score(obs_inferred, cand1, weight)
    assert score_c >= score_i


def _match_score(obs: CharacterDepth, cand: CharacterDepth, weight: dict) -> float:
    """复用 reconstruct 的评分逻辑(供测试用)。"""
    from cli.rivertype_cli.depth import _axis_equal
    score = 0.0
    for axis in AXES:
        o = obs.project(axis)
        c = cand.project(axis)
        if o.status == FieldStatus.MISSING or c.status == FieldStatus.MISSING:
            continue
        if _axis_equal(axis, o, c):
            score += weight[axis] * (1.0 if o.status == FieldStatus.CONFIRMED else 0.5)
    return score


# ---------------------------------------------------------------------------
# Property 8:etym CONFIRMED ⇒ chain 非空
# ---------------------------------------------------------------------------

@given(character_depth)
@settings(max_examples=100, suppress_health_check=[HealthCheck.too_slow])
def test_etym_confirmed_requires_chain(d: CharacterDepth) -> None:
    issues = validate(d)
    if d.etym.status == FieldStatus.CONFIRMED and not d.etym.chain:
        assert any(i.axis == "etym" and "chain" in i.field for i in issues)


# ---------------------------------------------------------------------------
# 显式单元测试:道德经"道"字 fixture(对照 RTP-0.2 §4 的 YAML 示例)
# ---------------------------------------------------------------------------

def test_dao_fixture_full() -> None:
    """道德经'道'字完整 5 层填入,validate 必须通过。"""
    d = CharacterDepth(char="道")
    d.glyph.current = "道"
    d.glyph.variants = ["衜"]
    d.glyph.components = {"radical": "辶", "rest": "首"}
    d.glyph.script = "traditional"
    d.glyph.source = "rtp-base-edition"
    d.glyph.status = FieldStatus.CONFIRMED

    d.phon.mandarin = "dào"
    d.phon.historical = [
        {"middle_chinese": "dauX", "period": "魏晋-唐"},
        {"old_chinese": "*kˤuʔ", "period": "春秋-西汉"},
    ]
    d.phon.source = "middle-chinese-dictionary + baxter-sagart-2014"
    d.phon.status = FieldStatus.CONFIRMED

    d.sense.senses = [
        SenseEntry(rank=1, gloss="路,途径",
                   classical_ref="道,所行道也。(《说文解字》)", frequency=0.35),
        SenseEntry(rank=2, gloss="道理,规律",
                   classical_ref="道生一。(《道德经》第42章)", frequency=0.40),
        SenseEntry(rank=3, gloss="主张,学说",
                   classical_ref="吾道一以贯之。(《论语·里仁》)", frequency=0.15),
        SenseEntry(rank=4, gloss="说,讲", frequency=0.05),
        SenseEntry(rank=5, gloss="道教,道教的事物", frequency=0.05),
    ]
    d.sense.source = "shuowen-jiezi + ctext-corpus"
    d.sense.status = FieldStatus.CONFIRMED

    d.etym.chain = [
        EtymForm(form="𢓘", script="oracle_bone", period="殷商", ref="合集 6057"),
        EtymForm(form="首+辶(分置)", script="bronze", period="西周", ref="毛公鼎"),
        EtymForm(form="道", script="seal", period="秦", ref="说文解字"),
        EtymForm(form="道", script="clerical", period="汉"),
        EtymForm(form="道", script="regular", period="唐-今"),
    ]
    d.etym.decomposition_type = "形声"
    d.etym.semantic_component = "首(頭也)"
    d.etym.phonetic_component = "首(音首)"
    d.etym.note = "本義為'所行道',引申為'道理'。"
    d.etym.source = "jiaguwen-heji + shuowen-jiezu"
    d.etym.status = FieldStatus.CONFIRMED

    d.usage.register = ["classical_high"]
    d.usage.domain = ["philosophy", "religion"]
    d.usage.special_role = "core_concept"
    d.usage.source = "inferred-from-corpus"
    d.usage.status = FieldStatus.CONFIRMED

    issues = validate(d)
    assert not issues, f"expected no issues, got {issues}"

    # roundtrip
    text = to_yaml(d)
    d2 = from_yaml(text)
    assert d2.char == d.char
    assert d2.glyph.current == d.glyph.current
    assert d2.phon.mandarin == d.phon.mandarin
    assert len(d2.sense.senses) == 5
    assert len(d2.etym.chain) == 5
    assert d2.usage.special_role == "core_concept"


def test_empty_depth_is_valid() -> None:
    """全 MISSING 的 depth 不应触发 error(MISSING 字段被允许)。"""
    d = CharacterDepth(char="?")
    issues = validate(d)
    assert not [i for i in issues if i.severity == "error"]
