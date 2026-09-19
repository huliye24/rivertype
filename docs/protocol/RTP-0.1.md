# RiverType Transliteration Protocol

> Specification Version: **rtp/0.1** (Draft)
> Status: Draft RFC — comments welcome via Issues
> Authors: huliye24, 文川院

---

## 1. 设计动机

中国古籍的现代化转译,目前没有结构化标准。当 AI 把《道德经》翻译成现代汉语时,每次输出都不同:

- 断句位置不一致
- 校注详略不一致
- 异文标注不一致
- 底本依据不一致

**这导致转译产物无法对比、无法拼接、无法被学术复用。**

RTP(RiverType Transliteration Protocol)用一份结构化标记语言,把这些维度**显式化为可校验的区段**。

---

## 2. 设计原则

1. **协议优先于引擎** — 不绑定任何 AI / 工具。
2. **结构优先于字数** — 哪怕只转译一段,结构合规就有资产价值。
3. **底本优先于改写** — 原文一字不改。
4. **异文优先于定本** — 凡有参校本,必须保留异文。
5. **人机协同优先于 AI 自动** — 协议是 AI 与人类校勘者之间的合约。

---

## 3. 文件结构

一个 `.rt` 文件 = YAML frontmatter + Markdown body,body 内用 `<!-- @section: name -->` 划区。

```text
┌──────────────────────────────────────┐
│ YAML frontmatter                     │
│ (书名、作者、底本、参校本、协议版本)        │
├──────────────────────────────────────┤
│ Markdown body                        │
│   <!-- @section: source -->          │
│   ## 原文                             │
│   ...                                │
│   <!-- @section: variants -->        │
│   ## 异文                             │
│   ...                                │
│   <!-- @section: annotation -->      │
│   ## 校注                             │
│   ...                                │
│   <!-- @section: vernacular -->      │
│   ## 白话                             │
│   ...                                │
└──────────────────────────────────────┘
```

---

## 4. Frontmatter(强制字段)

```yaml
---
title: 道德经·第一章           # 必需:书名+卷次
work_id: ddj-c01              # 必需:唯一标识
author: 老子                   # 必需
dynasty: 春秋                 # 必需
editions:                     # 必需
  base: 王弼本(魏晋)          # 底本
  collated:                   # 参校本列表
    - 马王堆帛书甲本(西汉)
    - 河上公注本(汉)
protocol: rtp/0.1             # 必需:协议版本
created: 2026-09-20           # 必需:ISO 8601
transliterator: 文川院 AI v1  # 必需:转译引擎名
---
```

### 可选字段

```yaml
license: CC-BY-4.0
source_uri: https://ctext.org/dao-de-jing
translator:                    # 人类校勘者
  classical_to_modern: 张三
  to_english: Ames & Hall
notes: 第一章以帛甲本为底本校录
```

---

## 5. 区段(Required / Optional)

| 区段            | 必需性 | 说明                                  |
|---------------|------|-------------------------------------|
| `source`      | 必需   | 古籍原文(逐字保留,不改)                       |
| `variants`    | 推荐   | 异文对比表(底本 vs 参校)                     |
| `punctuation` | 推荐   | 现代标点断句与依据                          |
| `annotation`  | 推荐   | 校注(训诂、字源、音义、出处)                   |
| `vernacular`  | 推荐   | 现代汉语白话译                            |
| `english`     | 可选   | 英文译                                 |
| `meta`        | 推荐   | 转译元信息(协议版本、引擎、转译日期、校验结果)           |

每节用 HTML 注释作为锚:

```markdown
<!-- @section: source -->
## 原文
...
```

---

## 6. 异文表(Variants)规范

```markdown
<!-- @section: variants -->
## 异文

| 章·字 | 帛甲 | 王弼 | 河上公 | 傅奕 |
|-------|------|------|--------|------|
| 1.1   | 上   | 上   | 上     | 上   |
| 1.2   | 善   | 善   | 善     | 善   |
| 1.9   | 万   | 万   | 万     | 萬   |
```

- 列名必须是参校本简称(在 frontmatter `editions.collated` 中有定义)
- 行号格式:`章.字序`,从 `1.1` 开始
- 异文后必须接 `@校勘` 注解,说明异文类型(字形、通假、繁简、讹误等)

---

## 7. 校注(Annotation)规范

每条校注用列表项:

```markdown
- **1.1 上**:@王弼 "上"者,至极之名。@河上公 "上",大也。
```

- `**章.字 汉字**` 作为定位锚
- 注解内容前用 `@校勘者/版本` 标注来源
- 多种注解类型可叠加:@校勘、@音注、@训诂、@字源、@异文、@出注

---

## 8. 校验规则(Validator 必查项)

1. ✅ YAML frontmatter 包含所有必需字段
2. ✅ `protocol` 字段值与本规范一致(`rtp/0.1`)
3. ✅ `source` 区段存在
4. ✅ 异文表中的列名都在 `editions.collated` 中
5. ✅ 校注中的所有 `章.字` 引用都在 `source` 中存在
6. ✅ 区段顺序:`source → punctuation → variants → annotation → vernacular → english → meta`

详细校验逻辑见 `tools/validator.py`(v0.2 即将提供)。

---

## 9. 协议版本政策

- `0.x`:草案,可能小修。鼓励在生产中试用。
- `1.0`:稳定,字段和区段不再做破坏性修改。新增字段向后兼容。
- `1.x`:扩展(多语种、文献类型扩展)。

当前版本:`rtp/0.1` (Draft RFC)。

---

## 10. 引用

```bibtex
@software{rtp2026,
  title  = {RiverType Transliteration Protocol (RTP) v0.1},
  author = {huliye24 and 文川院 contributors},
  year   = {2026},
  url    = {https://github.com/huliye24/rivertype/blob/main/docs/protocol/RTP-0.1.md}
}
```
