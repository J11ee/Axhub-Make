# CUST-006 PRD 编辑器表格与文字颜色

- 模块：富文本编辑与 Markdown 预览
- 类型：复用编辑器扩展
- 状态：已实施表格及文字颜色工具
- 首次可追溯的专项调研：2026-11-13
- 首次实施及最近更新：2026-11-16

## 原始需求和原生行为

用户希望在 PRD 富文本编辑器中通过界面插入表格和设置文字颜色。上游规格预览使用 `SimpleEditor` 并以 Markdown 作为编辑内容格式。当前依赖产物含 Tiptap 的表格支持和背景高亮。

## 实际实现

在 Make 共用的 Markdown 文档编辑入口，沿用 `SimpleEditor`、原有工具条和 TableKit（表格扩展套件）。新增工具组向当前编辑实例调用已有的插入表格、增删行列、删除表格命令；编辑器按当前光标位置决定命令可用性。原型标注和 Commentary 不走这一封装。

原 `SimpleEditor` 的公开属性没有扩展插槽，当前仓库随包保存的是构建产物。Make 的 Vite 构建只为文档编辑入口解析独立模块，用 TableKit 自带的 `addExtensions` 在构建编辑器 schema（内容结构）前注册文字颜色标记；原生背景高亮照常使用。文字颜色存为带颜色属性的行内 `span`，正文仍是 Markdown，设置及清除只作用于文字颜色。普通 Markdown 文档和页面 PRD 使用同一入口。

## 关联路径

- `src/spec-template/MarkdownViewer.tsx`
- `src/spec-template/PrdMarkdownEditor.tsx`
- `src/spec-template/richMarkdownEditorTable.ts`
- `src/spec-template/richMarkdownEditorTable.test.ts`
- `src/spec-template/richMarkdownEditorRoundTrip.test.ts`
- `src/spec-template/makeDocumentTableKit.ts`
- `src/spec-template/markdownTextColor.ts`
- `src/spec-template/makeRichMarkdownEditorVitePlugin.ts`
- `src/spec-template/makeRichMarkdownEditorDependencies.d.ts`
- `vite.config.ts`
- `vitest.config.ts`
- `tsconfig.node.json`

## 实施与变更记录

- 2026-11-16：在共用 Markdown 文档编辑器接入原生表格命令及文字颜色。未提交。

## 历史证据

Antigravity 的历史调研记录了表格与文字颜色需求及可行性结论。

## 上游升级影响

核对上游 `SimpleEditor` 工具条结构、`onEditorReady`、TableKit 包导入及 Tiptap Markdown 扩展接口。上游若公开工具条与编辑扩展插槽，迁移工具组和颜色标记，撤下 DOM 挂载和独立模块解析。无需手改 `vendor/tiptap-editor/dist` 生成物。`.gitignore` 为手写的扩展类型声明加了单文件例外。

## 启停与回退

将 MarkdownViewer 恢复使用原始 `SimpleEditor`，撤下文档工具组、文字色扩展及专用构建入口，再重建。表格仍保存在原 Markdown；回退后的编辑器不能识别文字颜色标记，重新保存前保留正文历史以免丢失颜色。

## 验证与遗留

原生表格命令与选区可用性的定向测试通过。真实 Tiptap 测试验证了插表、增行与增列后 Markdown 重新读入，及文字色标记与原生高亮共存。原有 `==高亮==` 保存语义保持，原生编辑器选定的具体背景色仍按上游原有方式处理。

生产构建通过。53831 的实际原生分屏与整篇阅读均显示验收表格，文字颜色均读取为 `rgb(198, 40, 40)`。这组浏览器检查使用隔离项目中的测试 Markdown；编辑器序列化往返由定向测试覆盖。
