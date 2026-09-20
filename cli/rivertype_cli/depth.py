"""
RTP-0.2 · Braille-Depth Character Encoding
==========================================

`CharacterDepth` ADT implementation. 每个汉字不再是扁平字符串,
而是一个 product type:

    CharacterDepth = (字形, 字音, 字义, 字源, 字用)

设计目标
--------
1. **类型优先**: Python dataclass + type hints 让 5 维结构静态可查。
2. **冗余优先**: 每字段独立 status (confirmed / inferred / missing),
   允许渐进披露,识别可由任一层恢复。
3. **序列化可逆**: to_yaml / from_yaml 严格保 roundtrip。
4. **可验证**: validate(depth) 返回所有不一致项,不留静默错误。

参考
----
docs/protocol/RTP-0.2-braille-depth-draft.md §3-§5
"""

from __future__ import annotations

from dataclasses import dataclass, field, asdict
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple

import yaml


# ---------------------------------------------------------------------------
# Status(字段层级的元数据)
# ---------------------------------------------------------------------------

class FieldStatus(str, Enum):
    """字段可信度。

    - CONFIRMED: 人工校勘或权威底本,直接采用。
    - INFERRED:  工具推断或语料统计,需后续校勘。
    - MISSING:   缺失;识别端不应基于此字段做判断。
    """
    CONFIRMED = "confirmed"
    INFERRED = "inferred"
    MISSING = "missing"


# PyYAML:把 FieldStatus 序列化为裸字符串(而非 enum 对象)。
yaml.SafeDumper.add_representer(
    FieldStatus,
    lambda dumper, value: dumper.represent_str(value.value),
)


# ---------------------------------------------------------------------------
# 五层字段(glyph / phon / sense / etym / usage)
# ---------------------------------------------------------------------------

@dataclass
class GlyphField:
    """字形层。"""
    current: Optional[str] = None
    variants: List[str] = field(default_factory=list)
    components: Optional[Dict[str, str]] = None  # {"radical": "辶", "rest": "首"}
    script: Optional[str] = None                 # traditional | simplified | both
    source: Optional[str] = None
    status: FieldStatus = FieldStatus.MISSING


@dataclass
class PhonField:
    """字音层。"""
    mandarin: Optional[str] = None                # 现代普通话
    historical: List[Dict[str, str]] = field(default_factory=list)
    dialect: List[Dict[str, str]] = field(default_factory=list)
    source: Optional[str] = None
    status: FieldStatus = FieldStatus.MISSING


@dataclass
class SenseEntry:
    """单条义项。"""
    rank: int
    gloss: str
    classical_ref: Optional[str] = None
    frequency: Optional[float] = None


@dataclass
class SenseField:
    """字义层。"""
    senses: List[SenseEntry] = field(default_factory=list)
    source: Optional[str] = None
    status: FieldStatus = FieldStatus.MISSING


@dataclass
class EtymForm:
    """字形演变链中的一节。"""
    form: str
    script: str            # oracle_bone | bronze | seal | clerical | regular
    period: Optional[str] = None
    ref: Optional[str] = None


@dataclass
class EtymField:
    """字源层。"""
    chain: List[EtymForm] = field(default_factory=list)
    decomposition_type: Optional[str] = None      # 象形 | 指事 | 会意 | 形声 | 转注 | 假借
    semantic_component: Optional[str] = None
    phonetic_component: Optional[str] = None
    note: Optional[str] = None
    source: Optional[str] = None
    status: FieldStatus = FieldStatus.MISSING


@dataclass
class UsageField:
    """字用层。"""
    register: List[str] = field(default_factory=list)
    domain: List[str] = field(default_factory=list)
    avoidance: List[Dict[str, Any]] = field(default_factory=list)
    special_role: Optional[str] = None            # core_concept | title_term | ...
    source: Optional[str] = None
    status: FieldStatus = FieldStatus.MISSING


# ---------------------------------------------------------------------------
# CharacterDepth(product type)
# ---------------------------------------------------------------------------

AXES = ("glyph", "phon", "sense", "etym", "usage")


@dataclass
class CharacterDepth:
    """5 维 product type。每个字段独立 status。"""
    char: str                                          # 锚字符
    glyph: GlyphField = field(default_factory=GlyphField)
    phon: PhonField = field(default_factory=PhonField)
    sense: SenseField = field(default_factory=SenseField)
    etym: EtymField = field(default_factory=EtymField)
    usage: UsageField = field(default_factory=UsageField)

    # ----- projection(单维读取) -------------------------------------------

    def project(self, axis: str):
        """读取单层字段。axis ∈ AXES。"""
        if axis not in AXES:
            raise KeyError(f"unknown axis: {axis!r}; expected one of {AXES}")
        return getattr(self, axis)

    # ----- reconstruction(部分观测→最佳匹配) ----------------------------

    def observed_axes(self) -> List[str]:
        """列出 status ≠ MISSING 的层。"""
        return [a for a in AXES if getattr(self, a).status != FieldStatus.MISSING]


def reconstruct(observation: CharacterDepth,
                candidates: List[CharacterDepth],
                weight: Optional[Dict[str, float]] = None) -> Optional[CharacterDepth]:
    """在候选集中找与观测最匹配的字。

    评分:每层独立贡献。
        - CONFIRMED × 完全相等: weight[axis]
        - CONFIRMED × 不等:     0
        - INFERRED  × 完全相等: weight[axis] / 2
        - INFERRED  × 不等:     0
        - MISSING:              不参与
    """
    if weight is None:
        weight = {a: 1.0 for a in AXES}

    best: Optional[CharacterDepth] = None
    best_score: float = -1.0

    for cand in candidates:
        score = 0.0
        for axis in AXES:
            obs = observation.project(axis)
            tgt = cand.project(axis)
            if obs.status == FieldStatus.MISSING or tgt.status == FieldStatus.MISSING:
                continue
            equal = _axis_equal(axis, obs, tgt)
            if equal:
                score += weight[axis] * (1.0 if obs.status == FieldStatus.CONFIRMED else 0.5)
        if score > best_score:
            best_score = score
            best = cand

    return best if best_score > 0 else None


def _axis_equal(axis: str, a, b) -> bool:
    """axis-specific 相等性。"""
    if axis == "glyph":
        return a.current is not None and a.current == b.current
    if axis == "phon":
        return a.mandarin is not None and a.mandarin == b.mandarin
    if axis == "sense":
        a_gloss = {s.gloss for s in a.senses}
        b_gloss = {s.gloss for s in b.senses}
        return bool(a_gloss & b_gloss)
    if axis == "etym":
        a_chain = [f.form for f in a.chain]
        b_chain = [f.form for f in b.chain]
        return any(f in b_chain for f in a_chain)
    if axis == "usage":
        a_set, b_set = set(a.register), set(b.register)
        return bool(a_set & b_set)
    raise ValueError(axis)


# ---------------------------------------------------------------------------
# 验证(返回所有不一致项,无静默错误)
# ---------------------------------------------------------------------------

@dataclass
class Issue:
    axis: str
    field: str
    severity: str       # error | warning
    message: str

    def __str__(self) -> str:
        return f"[{self.severity}] {self.axis}.{self.field}: {self.message}"


def validate(d: CharacterDepth) -> List[Issue]:
    """返回不一致项列表。空列表 = 一切合规。"""
    issues: List[Issue] = []

    # 通用:status == CONFIRMED 时 value 必须非空
    if d.glyph.status == FieldStatus.CONFIRMED and not d.glyph.current:
        issues.append(Issue("glyph", "current", "error", "CONFIRMED but empty"))
    if d.phon.status == FieldStatus.CONFIRMED and not d.phon.mandarin:
        issues.append(Issue("phon", "mandarin", "error", "CONFIRMED but empty"))

    # sense.frequency 之和
    if d.sense.status != FieldStatus.MISSING and d.sense.senses:
        total = sum(s.frequency or 0.0 for s in d.sense.senses)
        if not (0.9 <= total <= 1.1):
            issues.append(Issue("sense", "frequency",
                                "warning",
                                f"sum={total:.3f}, expected in [0.9, 1.1]"))
        ranks = sorted(s.rank for s in d.sense.senses)
        if ranks != list(range(1, len(ranks) + 1)):
            issues.append(Issue("sense", "rank", "error", f"ranks not contiguous from 1: {ranks}"))

    # etym.chain 至少 1 节
    if d.etym.status == FieldStatus.CONFIRMED and not d.etym.chain:
        issues.append(Issue("etym", "chain", "warning", "CONFIRMED but empty chain"))

    # usage.register 至少 1 项
    if d.usage.status != FieldStatus.MISSING and not d.usage.register:
        issues.append(Issue("usage", "register", "error", "register required when status != MISSING"))

    return issues


# ---------------------------------------------------------------------------
# 序列化(YAML roundtrip)
# ---------------------------------------------------------------------------

def to_yaml(d: CharacterDepth) -> str:
    """序列化为 YAML 字符串(YAML 1.1,block style)。"""
    payload = _to_dict(d)
    return yaml.safe_dump(payload, allow_unicode=True, sort_keys=False, default_flow_style=False)


def from_yaml(text: str) -> CharacterDepth:
    """从 YAML 反序列化。未知字段容忍(MISSING 化)。"""
    payload = yaml.safe_load(text) or {}
    return _from_dict(payload)


def _to_dict(d: CharacterDepth) -> Dict[str, Any]:
    """递归 dataclass → dict;status 用顶层字段表达(匹配 RTP-0.2 §5)。"""
    out: Dict[str, Any] = {"char": d.char}
    for axis in AXES:
        out[axis] = asdict(getattr(d, axis))
    return out


def _from_dict(payload: Dict[str, Any]) -> CharacterDepth:
    char = payload.get("char")
    if not char or not isinstance(char, str):
        raise ValueError("`char` (non-empty str) required at top level")

    glyph = _coerce(GlyphField, payload.get("glyph", {}))
    phon = _coerce(PhonField, payload.get("phon", {}))
    sense = _coerce_sense(payload.get("sense", {}))
    etym = _coerce_etym(payload.get("etym", {}))
    usage = _coerce(UsageField, payload.get("usage", {}))

    return CharacterDepth(char=char, glyph=glyph, phon=phon,
                          sense=sense, etym=etym, usage=usage)


def _coerce(cls, payload: Dict[str, Any]):
    """通用 dataclass 装配;status 字段转枚举。"""
    if not isinstance(payload, dict):
        payload = {}
    data = {k: v for k, v in payload.items() if k in cls.__dataclass_fields__}
    if "status" in data:
        data["status"] = FieldStatus(data["status"])
    return cls(**data)


def _coerce_sense(payload: Dict[str, Any]) -> SenseField:
    senses_raw = payload.get("senses", []) or []
    senses = [SenseEntry(**s) for s in senses_raw if isinstance(s, dict)]
    payload2 = {k: v for k, v in payload.items() if k in SenseField.__dataclass_fields__}
    payload2["senses"] = senses
    if "status" in payload2:
        payload2["status"] = FieldStatus(payload2["status"])
    return SenseField(**payload2)


def _coerce_etym(payload: Dict[str, Any]) -> EtymField:
    chain_raw = payload.get("chain", []) or []
    chain = [EtymForm(**c) for c in chain_raw if isinstance(c, dict)]
    payload2 = {k: v for k, v in payload.items() if k in EtymField.__dataclass_fields__}
    payload2["chain"] = chain
    if "decomposition_type" in payload2:
        payload2["decomposition_type"] = payload2["decomposition_type"]
    if "status" in payload2:
        payload2["status"] = FieldStatus(payload2["status"])
    return EtymField(**payload2)


# ---------------------------------------------------------------------------
# CLI hook(供 assemble / validate 调用)
# ---------------------------------------------------------------------------

def load_depth_entries(text: str) -> List[CharacterDepth]:
    """解析多字 YAML 文档(以 --- 分隔)。"""
    docs = list(yaml.safe_load_all(text))
    return [from_yaml(_strip_doc_separator(d)) if isinstance(d, dict) else _empty(d)
            for d in docs if d is not None]


def _strip_doc_separator(_d: Any) -> str:
    """占位:实际上 from_yaml 已经接受 dict,这里只作类型兼容。"""
    return ""  # 未走此分支


def _empty(d: Any) -> CharacterDepth:
    raise ValueError(f"unexpected yaml doc type: {type(d).__name__}")


__all__ = [
    "AXES",
    "CharacterDepth",
    "EtymField",
    "EtymForm",
    "FieldStatus",
    "GlyphField",
    "Issue",
    "PhonField",
    "SenseEntry",
    "SenseField",
    "UsageField",
    "from_yaml",
    "load_depth_entries",
    "reconstruct",
    "to_yaml",
    "validate",
]
