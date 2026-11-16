# AGENTS.md

This is the standalone Axhub Make publishing repository.

- Use `pnpm` for this repository's development, tests, and release scripts.
- Do not force `pnpm` in published runtime or generated client projects. User environments may be Windows, may not have Git, and may not have pnpm; prefer `npm`/`npx`-safe flows outside development-only docs or scripts.
- Keep `vendor/` committed; it contains required vendor artifacts for standalone builds.
- Do not commit local runtime data, build outputs, caches, or generated project metadata.
- Under `client/.axhub/make/`, keep only `client.json`, `axhub.config.json`, `README.md`, and the template seed `sidebar-tree.json` in Git.

## 本地二次开发

- 涉及本地二次改造或上游升级时，开始评估、设计方案或实施前，必须打开并遵守 [二次改造规范](docs/customizations/POLICY.md)。实施后按规范完成验证和登记。
