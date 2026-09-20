# RTP-0.2 · Braille-Depth Character Encoding (Draft RFC)

> Specification Version: **rtp/0.2-draft-braille-depth**
> Status: **DRAFT** — supersedes nothing; extends RTP-0.1
> Authors: huliye24, 文川院
> Date: 2026-09-20
> Tracking: 反思日志 `docs/reflections/2026-09-20-ai-native-software.md` §T-5

---

## 0. 摘要(One-liner)

把每个汉字当作 **product type** `CharacterDepth = (字形, 字音, 字义, 字源, 字用)`,
任何一层被污染(OCR 错位、异体字、缺上下文),由其余四层补回;识别 =
**多模态推断**,不是单通道模板匹配。这是盲文原理在语义层的类比。

---

## 1. 设计动机(Why depth)

RTP-0.1 把转译产物的**结构**标准化了:原文 / 异文 / 校注 / 白话 / 英文 各占一段。
但 **结构内部的对象(字)** 仍然被当作扁平字符串处理。

后果:

1. OCR 把 `道` 误识为 `遵`,校勘者无从发现,因为字符串相等性失败前没有更多信号。
2. 一个字在不同朝代有 5 个异体字(`后`/`後`/`㕭`/...),白话译里该用哪个没有依据。
3. AI 把 `道` 译成 "Way" / "Tao" / "Dao" / "the Way",每次不同,因为没有"字用"层的硬约束。
4. 异文表中两个版本都写"善",但其实是不同字(善 vs 譱),需要字源层才能识别。

**根因**:每个字只有一个观测通道(glyph)。识别只能在这一层做模板匹配。

盲文给我们的启发:**冗余 = 鲁棒**。一个 cell 6 个点位,错一两个还能读。
汉字层面同理:5 个维度,错一两个维度还能识。

---

## 2. 设计原则

1. **深度优先于扁平** — 一个字不是 string,是 tuple。
2. **冗余优先于压缩** — 信息论上,$d_k$ 越大,识别错误率指数下降。
3. **来源优先于猜测** — 每一层必须有显式 `source`(底本 / 工具 / 人工)。
4. **向后兼容** — RTP-0.2 文档必须能被 RTP-0.1 解析器读(rendering 退化为字符串)。
5. **渐进披露** — 五层可分次填,不必一次全填完。空层用 `null` + `source: inferred` 标记。

---

## 3. 核心抽象:`CharacterDepth`

### 3.1 类型签名

```haskell
data CharacterDepth = CharacterDepth
  { glyph    :: GlyphField      -- 字形:当前规范的视觉形式
  , phon     :: PhonField       -- 字音:现代普通话 + 至少一条历史读音
  , sense    :: SenseField      -- 字义:多义项的有序列表(按使用频次)
  , etym     :: EtymField       -- 字源:甲骨/金文/篆文/楷书的字形演变链
  , usage    :: UsageField      -- 字用:语域(典雅/通俗)、学科、避讳、特殊语义角色
  } deriving (Show, Eq)
```

### 3.2 投影与重建

识别场景下,我们只能观测到 $\le 5$ 个维度中的 $k$ 个。
定义**投影**:

$$\pi_i : \text{CharacterDepth} \to \text{Field}_i, \quad i \in \{\text{glyph, phon, sense, etym, usage}\}$$

给定观测 $(f_{i_1}, \dots, f_{i_k})$,识别是**条件重建**:

$$\hat{C} = \arg\max_{C \in \mathcal{D}} P(C \mid f_{i_1}, \dots, f_{i_k})$$

其中 $\mathcal{D}$ 是当前上下文的所有候选字。当 $k < 5$,剩余维度以先验 $P(C)$ 推断。
当 $k = 5$,五层一致 = 高置信度。

---

## 4. 五层字段规范

### 4.1 `glyph`(字形)

```yaml
glyph:
  current: 道                 # 当前规范字形
  variants:                   # 异体字列表(按使用频次降序)
    - 衜
    - 𢓘
  components:                 # 部件分解(供 OCR 校验)
    radical: 辶
    rest: 首
  script: traditional         # traditional | simplified | both
  source: rtp-base-edition
```

**校验**: `components` 必须能从 `current` 解构出来(部件查表)。
**不允许**: 异体字出现在 `current` 字段(那是 `variants` 的事)。

### 4.2 `phon`(字音)

```yaml
phon:
  mandarin: dào              # 现代普通话(必填)
  historical:                  # 至少一条历史读音
    - middle_chinese: dauX    # 中古音(《廣韻》系统)
      period: 魏晋-唐
    - old_chinese: *kˤuʔ     # 上古音(Baxter-Sagart 拟音)
      period: 春秋-西汉
  dialect:                     # 可选:方言读音(用于方言文献)
    - name: 吴语
      reading: dɔ
  source: middle-chinese-dictionary + baxter-sagart-2014
```

**校验**: 至少一条 `historical`(否则 `usage.vernacular_register: classical` 标记警告)。
**不允许**: 写方言读音而不标方言名。

### 4.3 `sense`(字义)

```yaml
sense:
  senses:                      # 多义项,按使用频次降序
    - rank: 1
      gloss: 路,途径            # 现代汉语简释
      classical_ref: 道,所行道也。(《说文解字》)
      frequency: 0.35          # 语料库相对频次(0-1)
    - rank: 2
      gloss: 道理,规律
      classical_ref: 道生一。(《道德经》第42章)
      frequency: 0.40
    - rank: 3
      gloss: 主张,学说
      classical_ref: 吾道一以贯之。(《论语·里仁》)
      frequency: 0.15
    - rank: 4
      gloss: 说,讲
      frequency: 0.05
    - rank: 5
      gloss: 道教,道教的事物
      frequency: 0.05
  source: shuowen-jiezi + ctext-corpus
```

**校验**: `sense.frequency` 之和应在 $[0.9, 1.1]$(允许语料误差)。
**不允许**: 没有 `classical_ref` 的义项(经典文献引用是硬锚)。

### 4.4 `etym`(字源)

```yaml
etym:
  chain:                       # 字形演变链(由古至今)
    - form: 𢓘
      script: oracle_bone
      period: 殷商
      ref: 合集 6057
    - form: 首+辶(分置)
      script: bronze
      period: 西周
      ref: 毛公鼎
    - form: 道
      script: seal
      period: 秦
      ref: 说文解字
    - form: 道
      script: clerical
      period: 汉
    - form: 道
      script: regular
      period: 唐-今
  decomposition:               # 字源分解(六书)
    type: 形声                  # 象形 | 指事 | 会意 | 形声 | 转注 | 假借
    semantic: 首(頭也)
    phonetic: 首(音首)
    note: "本義為'所行道',引申為'道理'。"
  source: jiaguwen-heji + shuowen-jiezu
```

**校验**: `chain` 至少包含 2 个阶段(否则标 `incomplete`)。
**不允许**: `decomposition.type` 与 `semantic` 矛盾(如 type=形声 但 semantic 为纯象形)。

### 4.5 `usage`(字用)

```yaml
usage:
  register:                    # 语域(可多选)
    - classical_high            # 高古(先秦两汉)
    - classical_mid             # 中古(魏晋唐宋)
    - vernacular_low            # 白话(宋元以降)
  domain:                      # 学科 / 主题领域
    - philosophy                # 哲学
    - religion                  # 宗教(道教)
  avoidance:                   # 避讳(用于断代/校勘)
    - taboo_for: 唐太宗李世民  # 因避讳改字/缺笔
      variants_affected: []
  special_role: core_concept   # core_concept | title_term | proper_noun | technical_term
  source: inferred-from-corpus + manual-curation
```

**校验**: `register` 至少一项。
**关键作用**: 这一层是**翻译约束的硬源**。例如 `usage.domain: philosophy` + `special_role: core_concept`
意味着转译为英文时 `道` 应保留为 `Dao` 或 `Tao`,不能意译为 `Way`。

---

## 5. 序列化:`.rt` 文件中的 `<!-- @section: characters_depth -->` 区段

RTP-0.2 在 RTP-0.1 的区段列表中**追加**一个新区段(向后兼容):

```markdown
<!-- @section: characters_depth -->
## 深度字表

### 道

<!-- @depth:entry · char=道 -->

\`\`\`yaml
glyph: ...
phon: ...
sense: ...
etym: ...
usage: ...
\`\`\`

### 德
...
```

**校验**:
- `characters_depth` 区段位置应在 `source` 之后、`variants` 之前(解析器知道顺序但不强拒其他位置)
- 每个 `<!-- @depth:entry · char=X -->` 锚必须指向 `source` 区段中出现过的字
- 字段值缺失时用 `null` + `field_status: { field: status }` 显式声明

```yaml
glyph:
  current: 道
  status: confirmed            # confirmed | inferred | missing
phon:
  mandarin: dào
  status: confirmed
sense:
  status: inferred             # 尚未校勘
etym:
  status: missing              # 缺失,需后续补
usage:
  status: inferred
```

---

## 6. 信息论基础:为什么 depth 真的有用

### 6.1 信道模型

设字符集 $\mathcal{C} = \{C_1, \dots, C_N\}$(实际约 10^4 个常用汉字 + 2×10^4 个异体)。
设观测是 $k$ 层字段。

观测到的 $(f_{i_1}, \dots, f_{i_k})$ 通过信道 $\text{Channel}_k$ 传输:
**每一层独立被错误污染**(OCR 错字、注音误记、义项混淆等)。

设单层误识率为 $p$,则 $k$ 层全部错误的概率(假设独立)为 $p^k$。

| 层数 $k$ | 单层误识 $p=0.05$ | $p=0.10$ | $p=0.20$ |
|----------|-------------------|----------|----------|
| 1 (扁平)  | 5.00%             | 10.00%   | 20.00%   |
| 2         | 0.25%             | 1.00%    | 4.00%    |
| 3         | 0.0125%           | 0.10%    | 0.80%    |
| 5 (本规范)| 3.1 × 10⁻⁶%       | 0.001%   | 0.032%   |

这是**指数收益**——5 层即便各层 20% 噪声,综合错误率仍 < 0.04%。

### 6.2 冗余 vs 容量的权衡

每加一层都增加**存储成本** $H(\text{Field}_i)$(香农熵)。
$RTP-0.2$ 在每字约 5 × 200 字节 ≈ 1 KB。
《道德经》5000 字 → 全书 depth 表 ≈ 5 MB(可接受, EPUB 体积仍轻)。

但**不是所有字都需要 5 层**——`usage.status: inferred` 时,`usage` 字段可压缩为 0 字节。
渐进披露保证:成本可控,价值随深度递增。

---

## 7. 类型论基础:为什么是 product type

```haskell
CharacterDepth = GlyphField × PhonField × SenseField × EtymField × UsageField
```

这是笛卡尔积。每层独立,但通过同一字符 ID 关联。
**关键性质**:projection + reconstruction 唯一(给定 5 层,字唯一)。

### 7.1 Dependent extension

更精细地,某些层依赖另一些层:

```haskell
SenseField : DepCharacter → Type
-- 义项依赖 usage.domain 与 etymology.chain
-- 例如: usage.domain = philosophy 时,sense 应有 "道理" 而非 "路"
```

RTP-0.2-draft **不强制**这种 dependent 类型(留待 v0.3)。

### 7.2 范畴论视角

字 = 范畴 $\mathcal{C}_{\text{char}}$ 中的对象 morphism
识别 = 同构检索(在 $\mathcal{C}_{\text{char}}$ 中寻找与观测同构的对象)
五层 = 五个 index category,识别是 limit/pullback

这一层留作理论附录(§11 草拟)。

---

## 8. 迁移策略:从 RTP-0.1 升级

### 8.1 前向兼容(RTP-0.1 → 0.2)

- 旧 `.rt` 文件**无需修改**,RTP-0.2 解析器会跳过缺失的 `characters_depth` 区段
- 新解析器在 `characters_depth` 缺失时,自动从 `source` 区段生成 `glyph.current` + 其他 `null` 字段
- Validator 警告:`characters_depth missing` (warn, not error)

### 8.2 向后兼容(RTP-0.2 → 0.1)

- RTP-0.2 解析器在写出 0.1 格式时,把 `characters_depth` 区段折叠为
  `<!-- @compat: rtp-0.1 -->` + `<!-- @section: annotation -->` 的传统校注
- 五层字段降维为单字符串 `字·音·义` 形式
- 信息有损但保留主结构

### 8.3 共存工具

- `tools/depth_extract.py` — 从 0.1 提取 → 0.2
- `tools/depth_flatten.py` — 0.2 折叠 → 0.1
- `tools/depth_validate.py` — 0.2 字段完整性与一致性

---

## 9. Open Questions(留给 v0.3)

1. **`sense.frequency` 的来源**:语料库 vs 人工标注 vs 共享 embedding?
2. **`usage.avoidance` 的强制性**:避讳算硬约束还是软信号?
3. **异体字 → glyph 的多对一**:同一 depth 多种字形合法吗?
4. **机器可读 vs 人可读**:YAML 在 1KB/字 时是否仍可读?
5. **跨协议**:是否能与 CBETA(佛典)、CTEXT(道藏)互转?
6. **`etym.chain` 的中间环节**:小篆→隶书的过渡如何记?

---

## 10. 实现里程碑

| 阶段 | 目标 | 工具 / 文件 |
|------|------|-------------|
| v0.2-alpha | 单字验证 | `tools/depth_extract.py` + 1 个示例字 |
| v0.2-beta  | 一章验证 | 道德经第一章完整 depth 表(81 字) |
| v0.2-rc    | 一书验证 | 道德经全书(5000+ 字) |
| v0.2-final | 跨书验证 | 至少 3 部经典,每部 ≥ 1 卷 |
| v1.0       | 协议冻结   | 五层字段全部稳定 + validator v1.0 |

---

## 11. 附录 A:范畴论骨架(草拟)

定义范畴 $\mathcal{C}_{\text{depth}}$:

- 对象: $\text{CharacterDepth}$ 的实例
- 态射: $f : C_1 \to C_2$ 当且仅当存在维度 $i$ 使得 $\pi_i(C_1) = \pi_i(C_2)$(至少一层共享)
- 复合: 通过共享维度的传递性
- 恒等: 同一深度实例

识别问题 = 在 $\mathcal{C}_{\text{depth}}$ 中**找极限**:
给定观测 $\{(i_k, f_{i_k})\}_{k=1}^{m}$,构造 cone → 极限 = 最佳匹配字符。

(细节留待 v0.3 附录 B。)

---

## 12. 附录 B:每日实践挂钩

| 层 | 每日练习 | 工具 | 产出 |
|----|---------|------|------|
| 数学 (类型论) | HoTT Chapter 1 习题 | Lean 4 / Agda | `tools/types/character_depth.lean` |
| 物理 (信息论) | Toy 信道容量计算 | Python + numpy | `tools/info/capacity.py` |
| 代码 (ADT)    | 5 字段 + property test | hypothesis | `cli/rivertype_cli/depth.py` |
| 反思 (周日)   | 写周志 | markdown | `docs/reflections/YYYY-MM-DD-week.md` |

---

## 13. 引用与延伸阅读

### 数学
- HoTT (Homotopy Type Theory), Univalent Foundations Program, 2013
- Bartosz Milewski, *Category Theory for Programmers*, 2019

### 物理 / 信息论
- C. E. Shannon, *A Mathematical Theory of Communication*, 1948
- David MacKay, *Information Theory, Inference, and Learning Algorithms*, 2003

### 字符学
- 李学勤主编,《字源》(共 3 册), 天津古籍出版社, 2012
- 白川静,《字統》, 中文版 2015
- 漢語大字典編輯委員會,《漢語大字典》(第二版), 2010

### 协议 / 标准
- Unicode Standard Annex #38, *Unicode Han Database*
- CBETA 通用格式规范, v1.0

### 项目内部
- `docs/protocol/RTP-0.1.md` — 上游协议
- `docs/reflections/2026-09-20-ai-native-software.md` — 反思日志(本草案的来由)
- `docs/GLOSSARY.md` §六 — 转译会话术语

---

## 14. 版本

```
rtp/0.2-draft-braille-depth · 2026-09-20 · DRAFT
```

下次审阅: 2026-09-27(待周日反思日志归并)
