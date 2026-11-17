# CUST-010 隔离 Markdown 文档草稿

- 模块：共用 Markdown 编辑器、文档预览
- 类型：缺陷修复
- 状态：已实现
- 首次提出、实施及最近更新：2026-11-16

## 原始需求和原生行为

`getSpecDraftStorageKey` 曾只取 URL 的 pathname。同一个项目中两个 Markdown 文件的正文都由 `document-content` 提供，实际文件在查询参数 `path`，导致跨文档误用缓存。离开有编辑改动的普通文档与打开时发现目标文档草稿是两个不同场景。

## 实际实现

局部修复键生成。已存在的文件按项目 ID 和规范化路径区分，首次保存前的页面 PRD 按项目、原型和稳定页面 ID 区分。旧 `document-content` 共用键无法证明归属，原样保留；旧 `docs/<资源>/content` 键的路径同时包含项目和资源，首次读取可安全迁移。页面编辑每次有效内容更新立即写入自己草稿，快速切页与刷新保留草稿；保存、放弃、忽略只作用于当前文档。普通文档保持离开保护，编辑器会独立提示恢复目标文档草稿。

## 关联路径

- `src/spec-template/MarkdownViewer.tsx`
- `src/spec-template/embeddedMarkdownDocument.ts`
- `src/spec-template/embeddedMarkdownDocument.test.ts`
- `src/spec-template/legacy-editing-boundary.test.ts`
- `src/spec-template/markdownDraftIdentity.ts`
- `src/spec-template/markdownDraftIdentity.test.ts`

## 实施与变更记录

- 2026-11-16：修正键、页面在同屏编辑器里的保存和退出，增加真实 URL 与保存请求的测试。未提交。

## 历史证据

源码基线 `45b7c6e` 的键使用 URL pathname；原生文档路径由 `document-content?path=...` 指定。

## 上游升级影响

检查上游 URL 及草稿身份变化，复测编辑器路由、刷新恢复、保存清理和普通文档离开保护。不要将无法证明归属的旧键复制到任一新文档。

## 启停与回退

无新增开关；回退相关函数与嵌入编辑改动后重建管理端。旧版不读取新版隔离键；无法确认归属的旧共用键没有被迁移或覆盖。已安全迁移的资源、或新键下的草稿需要回退时，按键中的项目和文档身份导出正文，再手动恢复，不能批量并入共用键。

## 验证与遗留

草稿身份、可信嵌入消息和既有编辑边界定向测试通过。53831 的隔离项目中，A、B 是两个已保存的文件，使用相同的 `/api/projects/page-prd-acceptance/document-content` 路径和不同的 `path`。实际浏览器确认 A 写入自己的完整文件路径键，直接切到 B 不弹离开保护，A 草稿保持且 B 打开自己的正文。B 自己的草稿写入其键，刷新后重进 B 提示加载本地缓存。

两页均有草稿时，B 和 A 分别只恢复各自标记。保存 A 返回 200 并写入 A 的原文件；B 的磁盘原文和草稿均保持。新缓存迁移测试验证可确认文件来源的旧键迁移，歧义共用键保持原样。

在 B 编辑器点击「放弃更改」并确认后，B 草稿键清除、编辑区退出、B 已保存正文不变；A 的更新继续可读。
