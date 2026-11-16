# CUST-007 按当前页复制原型批注提示词

- 模块：原型批注、预览工具栏
- 类型：修改
- 状态：已实现，浏览器剪贴板待验收
- 首次提出日期：2026-11-16
- 首次实施日期：2026-11-16
- 最近更新日期：2026-11-16

## 原始需求和原生行为

用户逐页验收同一原型，希望将不同页面的修改任务分别复制到不同 AI 对话并行处理。范围是用于改原型的 Commentary（原型批注），说明标注和需求文档属于其他入口。

本地保存仍按原型共用一份批注文件。原型内部页面通过 `buildInternalPrototypeCommentPageScope` 生成 `prototypes/<原型 ID>::page::<页面 ID>`。上游基线 `45b7c6e6c197f242f3595806966ddec377cfdfbe` 的 `buildDefaultCopyPrompt` 读取整个原型的持久化记录。有当前页编辑器内存数据时，它保留其他页记录，由内存数据替代当前页记录。没有内存数据时，它使用整个原型的持久化记录。分屏工具栏另有一层两侧提示词合并。当前相关源码与基线的行为一致。既有页面树改造在同一预览文件中加工路由信息。

采用 P4 局部修改原生实现。P0 可复用已有页面范围、复制和分屏单侧入口，但单侧入口目前仍调用全原型生成器。P1 未发现现成的复制范围参数。`buildHostCopyPrompt` 是 P2 扩展点，当前返回已拼好的文本，结构化上下文缺少完整的持久化批注及附件清单。P3 在外层自行读取并重组批注会重复页面识别、实时编辑摘要和附件关联。将可选范围放到现有生成入口，在渲染前过滤，改动更集中。现有存储可以支撑该范围，无需 P5 调整架构。

## 实际实现

用户回复「按建议执行」后实施以下改造。

1. 单屏的批注工具栏和保存提示入口使用「复制当前页批注」。分屏复用现有两侧复制入口，以用户点击的一侧为目标，保存提示引导从对应一侧复制。
2. 手动复制请求携带明确的当前页范围，通过预览编辑器接口及跨预览窗口消息传递给批注生成器。生成器沿用实际预览的页面标识，在格式化前按范围选取记录，合并当前页的实际内存改动和已保存记录。对同一记录复用已有标识去重，以最新编辑为准。附件和截图随对应记录，校验页面归属。跳过已删除、已完成和仍在执行的记录，失败记录可重试。无记录时提示「当前页没有待处理批注」。
3. 多页原型中，旧记录缺少页面标识且无法唯一归属时跳过。单页原型可沿用现有资源级范围和可确认归属的旧记录。提示词明确写入原型、页面标识或页面链接，以及本次批注明细。若执行方补读共享批注文件，也以该页面和本次条目为范围。
4. 范围只由用户触发的手动复制入口显式传入。原有 `getCopyPromptText()` 无参数行为，以及直接发给 AI、单条 AI 执行、分屏直接执行和其消息回退继续沿用原生路径。复制文档批注、语音处理、共享发布和其他 AI 入口沿用各自路径。剪贴板、宿主与预览间的消息继续复用现有能力。
5. 共用批注文件和项目源码存在并行写入边界。页面筛选能隔离任务输入，两个对话修改同一个组件、样式文件，或各自写回共享批注文件时仍可能有覆盖。此项按独立的页面任务输入验收，反馈实际冲突点，现有存储键、状态协议及并行执行机制保持原样。

## 关联路径

- `src/index/components/content/PresentationToolbar.tsx`
- `src/index/components/content/PresentationToolbar.test.ts`
- `src/index/components/content/ContentAreaView.tsx`
- `src/index/components/content/ContentAreaView.source.test.ts`
- `src/index/app/index-page/useIndexPagePreviewActions.tsx`
- `src/index/app/index-page/useIndexPagePreviewActions.test.ts`
- `src/index/app/index-page/previewActions.helpers.ts`
- `src/dev-template/index.tsx`
- `src/dev-template/editorModeManager.ts`
- `src/dev-template/webEditorV2Integration.ts`
- `vendor/axhub-commentary/src/web-editor-types.ts`
- `vendor/axhub-commentary/src/core/editor/index.ts`
- `vendor/axhub-commentary/src/core/editor/contracts.ts`
- `vendor/axhub-commentary/src/core/editor/persistence.ts`
- `vendor/axhub-commentary/src/core/editor/summaries.ts`
- `vendor/axhub-commentary/dist/index.js`
- `vendor/axhub-commentary/dist/index.mjs`
- `scripts/build-commentary-vendor.mjs`
- `src/vendor/axhub-commentary/current-page-copy-prompt.test.ts`

涉及的生成文件包括 vendor 包在 `vendor/axhub-commentary/dist/` 的运行入口，以及 `dist/admin/` 中的管理端和预览资源。生成文件从源头重建。

## 实施与变更记录

- 2026-11-16。建档，对照基线与当前本地运行入口，确定局部修改候选范围、流程影响与验收项。改造涉及 AI 任务输入，按 [二次改造规范](../POLICY.md) 的 AI 工作流审批要求，实施需用户明确授权。
- 2026-11-16。用户授权实施，并明确无需回归测试「直接发给 AI」。加入手动复制的 `current-page` 参数，完成页面范围过滤、分屏入口及批注组件重建。

## 历史证据

- 需求来源为本 Codex 会话中逐页验收、并行复制批注，以及复评和按规范准备的请求。方案档案未提交。
- 源码证据为 `summaries.ts` 的 `buildDefaultCopyPrompt`、`useIndexPagePreviewActions.tsx` 的 `collectPrototypePrompt` 和 `collectSplitPrototypePrompts`，以及 `src/dev-template/index.tsx` 的 `AXHUB_PROTOTYPE_EDITOR_HOST_TOOLBAR_ACTION` 分支。直接发送的跨窗口回退也使用 `copy-prompt` 取文本，单靠动作名称无法区分用途。分屏已有单侧复制入口。
- 运行证据为本地 53817 服务进程使用安装包 0.6.23 CLI（命令行入口）和源码目录 `dist/admin`。经 HTTP 获取的管理端入口、预览启动脚本及批注组件脚本，与该目录产物逐一核对一致。

## 上游升级影响

重点复核页面标识、生成器的持久化与内存记录合并、预览消息以及手动复制和直接运行的共用入口。上游如果已有单页复制，需先通过以下场景再考虑采用。保留页面树路由相关的本地差异。

源码构建通过 Vite 引用本仓库的 `vendor/axhub-commentary` 包，运行入口为包内 `dist`。当前独立仓库缺少同步配置指向的上游源包。可用 `node scripts/build-commentary-vendor.mjs` 从本地 vendor 源码重建，随后构建管理端。脚本沿用项目已安装的 esbuild，产物对照表明本次只有两个入口文件变化。若升级后改用上游同步源，先把改造应用到同步源，防止同步覆盖本地源码及产物。

## 启停与回退

复用现有复制按钮，无新增用户配置。需要回退时，仅撤销本事项的入口和范围处理源码，再执行 `node scripts/build-commentary-vendor.mjs` 和管理端构建，核对同一服务入口返回的资源。没有数据迁移，现有批注与附件可继续读取。

## 验证与遗留

- 准备阶段已有 174 项基线测试通过。实施后用本地 Vitest 运行 8 项手动复制定向测试，覆盖同定位不同页、附件和截图、空页、旧数据、实时编辑去重、跳过已完成、已删除及执行中记录、单屏工具栏和分屏入口。Windows 上 `pnpm exec` 被依赖目录重装确认阻止，使用已安装的 `node_modules/vitest/vitest.mjs`。
- 批注组件构建成功，`node node_modules/vite/bin/vite.js build` 成功，CSS 压缩和大包提示仍在。53817 服务返回的管理端脚本、原型预览启动脚本及批注组件脚本均与本次 `dist/admin` 输出一致。
- 全仓 TypeScript 检查仍有项目引用输出缺失和现有类型诊断。按用户要求，未执行「直接发给 AI」的运行回归。
- 登记检查已覆盖本事项的改动路径。全仓检查仍报侧栏、页面路由和路径工具等 8 个其他改动路径缺档，本事项的差异空白检查通过。
- 浏览器工具无法确认 Edge 窗口 URL，未完成按钮和剪贴板实测。待验收场景包括单屏分别复制 A、B 两页，分屏分别复制两侧，空页提示和两份提示词在真实对话中的使用。
