# Prompt · validate(校验输出)

> 用途:校验 AI 输出的 `.rt` 文件是否符合 RTP 协议。

---

## Prompt 模板

```text
你正在校验一份 .rt 文件是否符合 RiverType Transliteration Protocol (RTP) v0.1。

# 待校验文件

<粘贴 .rt 文件内容>

# 校验清单(逐项检查)

## 1. Frontmatter

- [ ] YAML frontmatter 存在
- [ ] 必需字段齐全:title, work_id, author, dynasty, editions.base, editions.collated, protocol, created, transliterator
- [ ] protocol 字段值 = "rtp/0.1"
- [ ] work_id 唯一(小写、连字符)

## 2. 区段结构

- [ ] 至少存在 `<!-- @section: source -->` 区段
- [ ] 区段顺序:source → punctuation → variants → annotation → vernacular → english → meta
- [ ] 所有引用 `@xxx` 标记语法正确

## 3. 异文表

- [ ] 异文表列名与 frontmatter `editions.collated` 完全一致
- [ ] 行号格式 `<章>.<字>`
- [ ] 每个异文都有 `@校勘` 说明

## 4. 校注

- [ ] 行号格式 `<章>.<字>` 与 source 区对应
- [ ] 每条校注都有 `@类型` 标记(@校勘/@音注/@训诂/@字源/@出注)
- [ ] 引用必须给文献出处

## 5. 白话

- [ ] 无文言词(之/乎/者/也/矣/焉)
- [ ] 无翻译腔
- [ ] 关键术语首次出现时保留原字

# 输出格式

```text
# 校验报告

## 通过项
- ✅ <通过项>

## 失败项
- ❌ <失败项 + 具体位置 + 修复建议>

## 警告项
- ⚠️ <警告项 + 原因>

## 总结
- 通过率: <X/Y>
- 建议:<是否可以发布 / 需要修改 / 需要重做>
```

# 反例

❌ 不给具体位置的失败报告:"校注有问题" —— 必须指明哪一条
❌ 把 warning 当 error:"建议修改"算成 fail —— 区分 soft / hard 失败

# 硬失败(必须修复才能发布)

- frontmatter 缺必需字段
- source 区不存在
- 异文表列名与 frontmatter 不一致
- protocol 字段值非 `rtp/0.1`

# 软失败(可发布但建议修复)

- 校注行号错位
- 引用未给文献出处
- 白话含文言词
```

---

## 实测案例

### 输入(假设有错的 .rt)

```markdown
---
title: 道德经·第一章
work_id: ddj-c01
protocol: rtp/0.1
---

<!-- @section: source -->
## 原文

> 上善若水。
```

### 输出

```text
# 校验报告

## 通过项
- ✅ frontmatter 存在
- ✅ protocol = rtp/0.1
- ✅ source 区存在

## 失败项
- ❌ frontmatter 缺必需字段:author, dynasty, editions.base, editions.collated, created, transliterator
- ❌ 无 punctuation、variants、annotation、vernacular 区段(可选但推荐)

## 警告项
- ⚠️ source 区只有一句,可能不完整

## 总结
- 通过率: 3/7 必查项
- 建议:必须重做,补充 frontmatter 必需字段和推荐区段。
```
