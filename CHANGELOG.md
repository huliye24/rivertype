# Changelog

> 项目的演化史。每次变更,在此留下痕迹。

---

## [Unreleased] · 方向重塑

### Changed · BREAKING

仓库从"Markdown 排版出版工具"重塑为"**中国古籍现代化转译协议与工具**"。

- **新定位**:核心价值从"AI 时代的内容创作工具"改为"AI 时代的古籍转译协议"
- **新协议**:RTP(RiverType Transliteration Protocol) v0.1
- **新文件格式**:`.rt`(Rivertype Source)
- **新架构**:协议层 / Prompt 层 / 工具层三层

### Added

- 协议规范 `docs/protocol/RTP-0.1.md`
- 概念词典 `docs/GLOSSARY.md`
- 反证区 `docs/protocol/COUNTER-EVIDENCE.md`
- 工作流 `WORKFLOW.md`
- 协作规则 `CONTRIBUTING.md`(完整重写)
- 路线图 `ROADMAP.md`
- Prompt 模板库 `docs/prompts/`(8 个 Prompt)
- 校验器 `tools/validator.py`
- 校验器测试 `tools/validator_tests.py`
- 示例 `examples/道德经-第一章.rt`
- 示例 `examples/黄帝内经-上古天真论.rt`

### Removed

- 原 Markdown 出版工具的定位描述(保留技术栈)

### Preserved

- 原前端 / 后端 / 渲染引擎代码(继续支撑工具层)
- MIT 许可证
- `huliye24` GitHub 账户关联

---

## [0.0.x] · 原始阶段(Markdown 排版工具)

> 此前的版本以 Markdown 编辑 + HTML/PDF 导出为核心。
> 代码与基础架构已保留,作为新方向的"工具层"基座。

(详细历史见 git log)
