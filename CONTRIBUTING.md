# Contributing · 协作规则

> 把"我想参与"这个念头,**变成一份可被遵守的协议**。

---

## 谁能参与?

任何人。但**质量等级**取决于你的训练背景:

| 等级 | 训练背景         | 能做的角色           |
|------|--------------|------------------|
| L1   | 古文献 / 古典学专业  | 立题、校勘、断句、校注    |
| L2   | 现代汉语母语       | 白话译、术语表         |
| L3   | 软件工程师        | 校验器、渲染器、CLI     |
| L4   | 设计师          | 主题、排版、视觉         |
| L5   | 任何学习者        | 反馈、提 issue、试用    |

等级不互斥。一人可以多等级。

---

## 三种贡献方式

### 1. 提 Issue

- 🐛 Bug:协议不符 / 校验报错 / 渲染问题
- 💡 Idea:协议改进建议 / 新增区段
- ❓ Question:如何使用 / 字段含义
- 📖 Counter-Evidence:发现协议失败案例

### 2. 提 PR

| 文件类型       | 路径                       | 审校要求              |
|------------|--------------------------|-------------------|
| 协议规范       | `docs/protocol/RTP-*.md` | 需 2 位 L1 review   |
| Prompt 模板  | `docs/prompts/*.md`     | 需 1 位 L1 + 1 位 L3 |
| 示例 `.rt`   | `examples/*.rt`         | 需 1 位 L1 + 1 位 L2 |
| 校验器代码      | `tools/validator.py`    | 需 1 位 L3         |
| 主题样式       | `themes/**/*.css`       | 需 1 位 L4         |

### 3. 协作项目

在 `08 索引/进行中项目.md` 立项,招募协作者。

---

## 协作流程

```text
1. 选书(在 Issues 用 [Project] 标签发起讨论)
2. 立项(在 docs/projects/ 建项目目录)
3. 认领角色(在项目 README 里 @ 自己)
4. 分头工作(各自 commit 到自己分支)
5. 互审(PR 触发 review)
6. 合并(协议版本号 +1)
```

---

## Commit 信息规范

```text
<类型>(<范围>): <简短说明>

类型:
  feat     新增协议区段、新增示例、新增主题
  fix      修复协议错误、修复校验器 bug
  docs     协议文档更新、反证区新增
  refactor 重构示例、重排结构
  counter  反证案例提交
  meta     元信息更新、frontmatter 修改
```

**示例**:

```text
feat(protocol): add @alt: section for variant annotations
docs(counter): add case C-6 (multi-version punctuation divergence)
fix(validator): handle Unicode escape in YAML frontmatter
```

---

## 质量门

任何 PR 合并前,需通过:

1. ✅ CI 校验器全部测试通过
2. ✅ 至少一位 review 通过(协议类需两位)
3. ✅ 反证区检查 — 本 PR 是否引入新失败模式?如果有,加入 `COUNTER-EVIDENCE.md`
4. ✅ 文档同步 — 如果改协议,`PROTOCOL-CHANGELOG.md` 必须更新

---

## 决策机制

协议 RFC 走 **共识治理**:

- 小修(typo、措辞):Maintainer 直接合并
- 中改(新增字段、新增区段):2 位 Maintainer 同意 + 7 天公示期
- 大改(版本号升级):3 位 Maintainer 同意 + 30 天公示期 + 学界评议

Maintainer 名单见 `MAINTAINERS.md`。

---

## 行为准则

- **尊重底本** — 任何版本的古籍都有它的学术合法性,不嘲笑任何版本
- **承认局限** — 转译永远是"近似",不是"原貌"。标注清楚是哪种近似
- **不抢功** — 转译是多人协作,每个角色都标注在 `meta` 区
- **不商业绑架** — 协议是 MIT,但用协议转译的具体古籍可能受版权约束(尤其现代整理本)

---

## 进入流程

- **想转译一部古籍**?发 issue 标题:`[Project] <书名> <卷次>`
- **想改进协议**?发 issue 标题:`[RFC] <改动简述>`
- **发现反证**?发 issue 标题:`[Counter-Evidence] <症状简述>`
- **想成为 Maintainer**?发 issue 标题:`[Maintainer Application] <你的名字>`

我们等你来。
