# Prompt · english(英译)

> 用途:把古籍原文(或白话译)译为英文。

---

## Prompt 模板

```text
你正在按 RiverType Transliteration Protocol (RTP) v0.1 把一段中国古籍译为英文。

# 任务

为以下原文(及白话译)生成 `english` 区段。

# 原文(source)

<粘贴 source 区段>

# 白话译(vernacular)

<粘贴 vernacular 区段,如尚未译,可仅用 source 区段>

# 英译原则

1. **逐句对应** — 不增不减
2. **保留术语原字** — "道" 译 "Tao" 或 "Way",并在首次出现时附拼音 `dào`
3. **不强行押韵** — 经文不是诗,押韵会失真
4. **参考传统译本** — Ames & Hall、Waley、Legge 的翻译可参考,但不照搬

# 关键术语表(强制使用)

| 中文  | 拼音    | 英文                | 备注                    |
|-----|-------|-------------------|-----------------------|
| 道   | dào   | the Tao / Way     | 宇宙之本源,核心术语           |
| 德   | dé    | Te / virtue       | 道在物中之显化               |
| 无   | wú    | non-being / Wu    |                       |
| 有   | yǒu   | being / You       |                       |
| 仁   | rén   | jen / ren / humanity |                       |
| 义   | yì    | yi / righteousness |                       |
| 礼   | lǐ    | li / ritual       |                       |
| 智   | zhì   | zhi / wisdom      |                       |

# 输出格式

```markdown
<!-- @section: english -->
## English

> <逐句翻译>
```

# 反例

❌ "The highest good is like water." —— 这不是"最高的善",原文是"上善"
❌ "Tao can be Taoed, but it's not the eternal Tao." —— 不自然
❌ 全文用 "the Way" 不用 "Tao" —— 失去术语辨识

# 校验清单

- [ ] 关键术语保留原字 + 拼音
- [ ] 逐句对应原文
- [ ] 无现代英语流行语("epic"、"legendary")
- [ ] 不强行押韵
```

---

## 实测案例

### 输入

```
> 道可道,非常道;名可名,非常名。
```

### 输出(参考 Ames & Hall 风格)

```markdown
<!-- @section: english -->
## English

> The Tao (dào) that can be spoken is not the eternal Tao (dào);
> The name (míng) that can be named is not the eternal name (míng).
```

注意:

- "道"保留 "Tao" + 拼音
- 关键术语首次出现注音
- 不强行押韵
- 逐句对应

---

## 失败案例

### F-1 · 过度归化

**症状**:把"道"译成 "God"、"Lord"——失去原术语。

**修正**:术语表约束,首次出现必须用拼音。

### F-2 · 过度异化

**症状**:全文用拼音,英文读者读不懂。

**修正**:Prompt 给出平衡方案:"术语用拼音 + 释义;其余正常英文"。

### F-3 · 押韵强行

**症状**:为了让押韵,改字意译。

**修正**:Prompt 强调"押韵不是目标,准确是目标"。
