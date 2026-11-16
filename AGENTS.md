# AGENTS.md

This is the standalone Axhub Make publishing repository.

- Use `pnpm` for this repository's development, tests, and release scripts.
- Do not force `pnpm` in published runtime or generated client projects. User environments may be Windows, may not have Git, and may not have pnpm; prefer `npm`/`npx`-safe flows outside development-only docs or scripts.
- Keep `vendor/` committed; it contains required vendor artifacts for standalone builds.
- Do not commit local runtime data, build outputs, caches, or generated project metadata.
- Under `client/.axhub/make/`, keep only `client.json`, `axhub.config.json`, `README.md`, and the template seed `sidebar-tree.json` in Git.

## 本地二次开发

- 开发前查阅 [改造索引](docs/customizations/README.md)、相关档案及 [上游基线](docs/customizations/UPSTREAM.md)，对照基线源码、当前实现和未提交差异，优先复用原生模块、接口和数据结构。保留用户已有改动。涉及 `client/` 时继续遵循该目录的规则。
- 新需求与原设计冲突时，说明原生行为、取舍和局部修改的可行性。涉及核心架构、公共契约或升级成本时说明影响。现有机制无法合理满足需求时再考虑独立方案，超出授权范围前先与用户确认。
- 改变功能、业务规则、交互、配置语义、接口或数据结构的本地改造必须登记。后续修复优先更新已有档案，新事项使用下一个未使用的 `CUST-xxx` 编号。纯格式、无语义的机械维护和原样上游同步按索引中的边界处理。
- 开发后对照实际差异更新档案和索引，执行相关测试及登记检查。在交付中说明编号、实际结果、验证和兼容风险。计划、代码证据和验收结果分别记录。
- 上游升级按基线文档评估文件变动与行为冲突。提交、推送、合并、变基、重置及覆盖须有明确授权。
