# Prompts · 标准化 Prompt 模板库

> 这些 Prompt 把"AI 如何按 RTP 转译"这件事**标准化**。
> 任何 AI(GPT、Claude、Gemini、本地模型)使用本库 Prompt,都应输出合规 `.rt` 文件。

---

## 使用方法

把下面 Prompt 中的 `<占位符>` 替换为你的实际内容,发送给任意 AI。要求 AI 输出 `.rt` 格式。然后用 `tools/validator.py` 校验。

---

## Prompt 索引

| 文件                     | 用途           | 适用阶段            |
|------------------------|--------------|-----------------|
| [`transcribe.md`](./transcribe.md)   | 转录原文         | Step 3 T-1     |
| [`punctuate.md`](./punctuate.md)    | 断句加标点       | Step 4 P-1     |
| [`collate.md`](./collate.md)       | 校勘异文         | Step 5 A-1     |
| [`annotate.md`](./annotate.md)     | 校注、训诂、字源    | Step 5 A-1     |
| [`vernacular.md`](./vernacular.md)  | 白话译          | Step 6 V-1     |
| [`english.md`](./english.md)      | 英译           | Step 6 V-1     |
| [`validate.md`](./validate.md)     | 校验输出是否合规    | Step 7 V-2     |
| [`full.md`](./full.md)          | 一键转译(全流程)   | 完整流水线         |

---

## 协议级 Prompt(任何区段都适用)

任何 Prompt 调用前,**必须先附上协议核心条款**:

```
你正在按 RiverType Transliteration Protocol (RTP) v0.1 输出内容。
请严格遵守以下结构:
1. YAML frontmatter 包含:title / work_id / author / dynasty / editions.base / editions.collated / protocol / created / transliterator
2. 区段用 <!-- @section: name --> 标记
3. 原文一字不改,包括异体字、避讳字
4. 任何判断给出依据(@xxx 标记)
5. 不要合并区段、不要省略区段、不要"美化"原文

完整规范:https://github.com/huliye24/rivertype/blob/main/docs/protocol/RTP-0.1.md
```

---

## 失败模式(已知 AI 错误)

### F-1 · AI 自动修正原文

**症状**:AI 看到"上善若水"会补出"上善若水,**水善利万物**"(实际第一章是四句,不是五句)。

**对策**:在 Prompt 中强调"原文一字不改,只标注不修正"。

### F-2 · AI 自创校注

**症状**:AI 给出"@王弼 此句含义深奥"——但王弼原注没说这话。

**对策**:要求 AI 引用必须给出**文献来源**(《老子注·第 X 章》)。

### F-3 · AI 跳过异文

**症状**:底本与参校本明明有异文(如"萬/万"),AI 写"诸本同"。

**对策**:在 `collate.md` Prompt 中强制要求"逐字比对"。

### F-4 · AI 把白话写成文言

**症状**:"最高的善,犹如水之性。"——这不是现代汉语。

**对策**:在 `vernacular.md` Prompt 中给"反例",要求 AI 避开。

### F-5 · AI 忽略 frontmatter

**症状**:AI 输出一大段,但开头没有 YAML。

**对策**:在 Prompt 中把 frontmatter 模板前置,要求 AI 严格按模板填空。

---

## 维护规则

- 任何 Prompt 修改必须经实测(GPT-5、Claude、Gemini 各跑一遍)
- 修改必须在 `CHANGELOG.md` 标注
- 反例必须保留——失败案例比成功案例更珍贵

---

## 引用

```bibtex
@software{rivertype-prompts,
  title  = {RiverType Standardized Prompts for AI Transliteration},
  author = {huliye24 and 文川院 contributors},
  year   = {2026},
  url    = {https://github.com/huliye24/rivertype/tree/main/docs/prompts}
}
```
