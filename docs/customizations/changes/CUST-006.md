# CUST-006 PRD 编辑器表格、文字颜色与高光

- 模块：富文本编辑与 Markdown 预览
- 类型：复用编辑器扩展
- 状态：已实施表格、文字颜色及高光颜色修复
- 首次可追溯的专项调研：2026-11-13
- 首次实施：2026-11-16
- 最近更新：2026-11-19

## 原始需求和原生行为

用户希望在 PRD 富文本编辑器中通过界面插入表格和设置文字颜色。上游规格预览使用 `SimpleEditor` 并以 Markdown 作为编辑内容格式。当前依赖产物含 Tiptap 的表格支持和背景高亮。

## 实际实现

在 Make 共用的 Markdown 文档编辑入口，沿用 `SimpleEditor`、原有工具条和 TableKit（表格扩展套件）。新增工具组向当前编辑实例调用已有的插入表格、增删行列、删除表格命令；编辑器按当前光标位置决定命令可用性。原型标注和 Commentary 不走这一封装。

原 `SimpleEditor` 的公开属性没有扩展插槽，当前仓库随包保存的是构建产物。Make 的 Vite 构建只为文档编辑入口解析独立模块，用 TableKit 自带的 `addExtensions` 在构建编辑器 schema（内容结构）前注册文字颜色标记；原生背景高亮照常使用。文字颜色存为带颜色属性的行内 `span`，正文仍是 Markdown，设置及清除只作用于文字颜色。普通 Markdown 文档和页面 PRD 使用同一入口。

## 关联路径

- `src/spec-template/MarkdownViewer.tsx`
- `src/spec-template/PrdMarkdownEditor.tsx`
- `src/spec-template/legacy-editing-boundary.test.ts`
- `src/spec-template/richMarkdownEditorTable.ts`
- `src/spec-template/richMarkdownEditorTable.test.ts`
- `src/spec-template/richMarkdownEditorRoundTrip.test.ts`
- `src/spec-template/makeDocumentTableKit.ts`
- `src/spec-template/makeDocumentHighlight.ts`
- `src/spec-template/markdownTextColor.ts`
- `src/spec-template/makeRichMarkdownEditorVitePlugin.ts`
- `src/spec-template/makeRichMarkdownEditorDependencies.d.ts`
- `vite.config.ts`
- `vitest.config.ts`
- `tsconfig.node.json`
- `src/common/markdown/markdownHighlight.ts`
- `src/common/markdown/ReadOnlyMarkdown.tsx`
- `src/common/pagePrd.ts`
- `src/common/pagePrd.test.ts`
- `src/server/__tests__/onDemandBuild.test.ts`
- `package.json`

## 实施与变更记录

- 2026-11-16：在共用 Markdown 文档编辑器接入原生表格命令及文字颜色，提交 `727f373`。
- 2026-11-17：页面 PRD 分屏较窄时，原工具栏把追加在末尾的表格和文字颜色收进了隐藏滚动条的横向区域。共用文档编辑器工具栏改为自动换行并随行数增高，保留顶部吸附。两个入口增加「表格」「文字颜色」标签。未提交。
- 2026-11-19：优化侧边栏富文本编辑工具栏布局与响应式体验。解决换行模式下弹性占位符（Spacer flex: 1）导致行首空白与宽度拖拽右推跳变、独立分隔线悬挂在行末/行首、文字按钮（表格/文字颜色/图片）占用过宽导致被挤到第 4 行等问题。启用 `compactToolbar={true}` 屏蔽占位符，隐藏独立竖线并改为组内右侧边框跟随，统一按钮为紧凑正方形图标（保留悬浮 Tooltip），优化功能层级排序，让调色板紧邻文本修饰与高亮，且图标反映当前选中文本颜色；在侧边栏常见宽度下稳定收敛至 2 行（约 68px），避免垂直空间过度占用与排版剧烈抖动。未提交。

## 历史证据

Antigravity 的历史调研记录了表格与文字颜色需求及可行性结论。

## 上游升级影响

核对上游 `SimpleEditor` 工具条结构、`onEditorReady`、TableKit 包导入及 Tiptap Markdown 扩展接口。上游若公开工具条与编辑扩展插槽，迁移工具组和颜色标记，撤下 DOM 挂载和独立模块解析。无需手改 `vendor/tiptap-editor/dist` 生成物。`.gitignore` 为手写的扩展类型声明加了单文件例外。

## 启停与回退

将 MarkdownViewer 恢复使用原始 `SimpleEditor`，撤下文档工具组、文字色扩展及专用构建入口，再重建。表格仍保存在原 Markdown；回退后的编辑器不能识别文字颜色标记，重新保存前保留正文历史以免丢失颜色。

## 验证与遗留

原生表格命令与选区可用性的定向测试通过。真实 Tiptap 测试验证了插表、增行与增列后 Markdown 重新读入，及文字色标记与原生高亮共存。原有 `==高亮==` 保存语义保持，原生编辑器选定的具体背景色仍按上游原有方式处理。

生产构建通过。53831 的实际原生分屏与整篇阅读均显示验收表格，文字颜色均读取为 `rgb(198, 40, 40)`。这组浏览器检查使用隔离项目中的测试 Markdown；编辑器序列化往返由定向测试覆盖。

2026-11-17：工具栏调整通过旧入口、表格命令和 Markdown 往返共 29 项测试。Vite 生产构建通过，53817 正在运行的本地源码服务已返回新入口版本和工具栏脚本。构建使用现有依赖，关闭 pnpm 的运行前依赖检查以避免新版 pnpm 尝试重新安装。

使用 Playwright 在 1084px 视口及 790px 嵌入框验证 53817 的实际页面 PRD 编辑入口。工具栏宽 694px，换行后横向溢出为 0，两个按钮均可见。通过界面给选中文字着色，插入 3 × 3 表格。浏览器使用临时正文，未保存到项目。

### 2026-11-18 页面需求高光

原富文本扩展把所有高光写为 `==文字==`，阅读器显示原始符号，重新编辑时浏览器用默认亮黄色显示。延用文档编辑器的构建扩展入口，只替换该入口的高光标记解析和序列化。九种预设色保存为带十六进制色值的行内 `mark`，重开时恢复原工具栏识别的色值。侧栏查看和 HTML 离线导出共用页面需求目录投影，将旧标记显示为 `#fef9c3`。普通文档预览依据解析后保留的颜色属性设置背景色。保留原格式的读取能力，不批量改写文档。旧文档中已经丢失的具体色值无法恢复，统一按淡黄色显示。

上游升级时核对高光扩展注入点、预设色、Markdown 内联解析及阅读器的 `mark` 渲染。撤销本节相关源码和构建接入即可回退，原文档仍可按 Markdown 读取。回退后的旧编辑器重新保存时会丢失带颜色的高光，应保留文档历史。已生成的旧 HTML 包需重新导出。改动未提交。

77 项编辑器、需求目录和导出接口定向测试，以及 1 项实际 HTML 构建测试通过。九种预设色均覆盖保存、重开和清除测试。管理端和 Axure 运行时生产构建、服务端与改动模块类型检查通过。Edge 验证 53817 工作台「提交下一步」旧正文呈淡黄色，临时文档通过真实工具栏选色、拦截保存、重开和 Markdown 预览。使用同一原型的隔离副本生成 HTML，在阻断网络请求时核对旧高光及九种预设背景色。未写入原项目文档。

### 2026-11-19 侧边栏富文本编辑工具栏紧凑规整优化

通过 `legacy-editing-boundary.test.ts` 新增断言覆盖 `compactToolbar` 传参、Spacer 屏蔽、独立分隔符移除及纯图标紧凑样式规则，`src/spec-template` 目录下共 8 个测试文件（71 项单元测试）全数通过。Vite 生产构建成功通过，`dist/admin/spec-template.html` 正常生成。未提交。
