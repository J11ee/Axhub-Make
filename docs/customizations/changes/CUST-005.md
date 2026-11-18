# CUST-005 单页原型需求文档与 H5 交付

- 模块：原型标注、PRD 和导出
- 类型：扩展
- 状态：已实施当前页入口、外部保存回显和单页模板；生成提示词接入待授权；H5 导出未实施
- 首次可追溯的需求：2026-11-12
- 首次实施：2026-11-16
- 最近更新：2026-11-17

## 原始需求和原生行为

用户希望每个独立原型页面绑定一份 PRD（产品需求文档），Make 文档目录和原型内都能编辑同一份正文。可按页面顺序组成整份需求文档，发布或导出的 H5 可从侧栏阅读。AI 单页生成以可见字段、输入规范和跳转关系为主，业务细节由用户补充。用户要求尽量沿用原有逻辑。

基线已有 `.spec/spec.md` 原型规格、`annotation-source.json` 标注与文档目录、组件目标锚点，以及写 PRD 和导出入口。示例原型的 Markdown 和 HTML 已使用 `#axhub-target:`，属于原生能力。

## 实际实现

2026-11-16 在源码基线 `45b7c6e` 上实施本地页面 PRD。以项目、原型和现有路由的稳定页面 ID 定位绑定，写在原型目录的 `.page-prds.json`。首次保存才创建 `docs/page-prd/<pageId>.md`；显式关联已有 Markdown 时复用原文件。文件路径校验沿用项目文档接口。改名、重排、移动只改派生目录，移除页面保留绑定和正文。已有普通目录配置保留在 `annotation-source.json`。

原生标注运行时 1.0.20 提供 `replaceSource`、`openDirectoryArticle` 及浮动工具条的全局动作插槽，未提供文档按钮事件、文章编辑插槽或能同时承载文章和子节点的类型。采用 P2 公共接口替换运行时目录数据、打开原生分屏；采用 P4 的局部阅读器适配，挂在 Make 管理端预览启动代码上，只在文档目录内部处理默认打开、父页标题定位、切页联动和同屏编辑。在原生文章区域嵌入共用 Markdown 编辑器，关闭后恢复原生文章。普通运行时继续使用原有 Markdown 阅读和组件定位处理。未挂载标注的官方原型可用项目已安装的原生浏览器运行时，无需改原型入口。

目录和文档管理共享页面树及同一份绑定；普通文档继续原有排序。整篇 PRD 按页面树现算，保留分组和空父章节，只读，不生成第二份正文。原型主规格、组件标注、Commentary 原型批注、AI 工作流和 H5 导出均未纳入本次改造。

## 关联路径

- `src/server/managementApi.prototypeAnnotation.ts`
- `src/server/managementApi.projectRegistry.ts`
- `src/server/prototypePagePrds.ts`
- `src/server/__tests__/prototype-annotation-api.test.ts`
- `src/common/pagePrd.ts`
- `src/common/pagePrd.test.ts`
- `src/dev-template/index.tsx`
- `src/dev-template/pagePrdRuntime.ts`
- `src/dev-template/pagePrdReader.ts`
- `src/dev-template/webEditorV2Integration.ts`
- `src/index/app/index-page/useIndexPagePreviewActions.tsx`
- `src/index/app/IndexPage.tsx`
- `src/index/app/hooks/useIndexPageSidebarPropsBuilder.ts`
- `src/index/components/sidebar/NewSidebar.tsx`
- `src/index/components/sidebar/ContentPanel.tsx`
- `src/spec-template/embeddedMarkdownDocument.ts`
- `src/spec-template/embeddedMarkdownDocument.test.ts`
- `docs/customizations/templates/page-prd.md`
- `src/index/app/hooks/useIndexPagePresentationPropsBuilder.ts`
- `src/index/components/content/DocumentManagementDialog.tsx`
- `src/index/components/content/PagePrdManagement.tsx`
- `src/index/components/content/PresentationArea.tsx`
- `src/index/components/content/PresentationToolbar.tsx`
- `src/index/types/index-page.types.ts`
- `src/spec-template/index.tsx`
- `src/spec-template/MarkdownViewer.tsx`
- `vite.config.ts`

- `src/index/components/content/DocumentManagementDialog.test.ts`
- `src/index/components/content/PresentationToolbar.test.ts`
- `src/dev-template/pagePrdReader.test.ts`
- `src/common/pagePrdPlacement.ts`
- `src/index/types.ts`
- `tsconfig.node.json`

## 实施与变更记录

- 2026-11-16：接入管理端原生目录、页面绑定、正文读写和整篇汇总，保持旧目录及标注数据。未提交。
- 2026-11-16：在原型预览侧栏增加「需求 PRD」。复用原生分屏及当前页编辑器。预览框按已有路由解析函数从 hash、查询参数和原型默认页读取页面身份，按该 ID 打开本文或空态。
- 2026-11-16：外部页面 PRD PUT 直接落盘。既有 `PAGE_PRD_SAVED`、`markdown-file-saved` 由浏览器编辑入口发出，外部调用不触发。侧栏入口和窗口重新聚焦均复用 `PAGE_PRD_CONFIGURE` 的重新读取。页面处于编辑时延后替换原生目录，在编辑器中回显外部正文或保留草稿并提示，覆盖外部正文需在保存时选择确认。首次外部写入后重新进入编辑，若已绑定文档没有草稿，沿原页面草稿键恢复。沿用存储与绑定接口，未提交。
- 2026-11-16：添加 [单页 PRD 模板](../templates/page-prd.md)，引用 J11workbench 的四段结构，按页面证据编写字段、反馈和验收。当前是独立文件，尚未接入 Make 的运行时提示词。

- 2026-11-17：侧栏入口始终打开当前原型页需求并收起目录。在原生正文标题栏增加「文档目录」，沿用原生面板切换和同屏编辑草稿保护。有子项的真实原型页面仍可阅读，空节点只占层级。目录和文档管理使用原型侧栏的页面/文件夹图标，缺失关联或正文使用状态图标。
- 2026-11-17：阅读器、文档管理和汇总共用编号树。固定章节为「1. 产品总述」和「2. 原型说明」，完整 Markdown 可汇总，无独立目录项。按现行原型树和独立需求位置重算编号，现有正文、路径和页面绑定原地复用。现有未绑定文档沿用原树嵌套并显示在「产品总述」。独立 Markdown 可在文档管理新增或移动，与同层原型节点混排。
- 在既有文档 `create` 和新增 `move` 动作中使用可选 `prdPlacement`，保存在对应的原始 Markdown 目录节点上。原型位置用父节点 ID 和可选后继原型节点 ID 表示。普通文件夹继续使用原有原始目录嵌套。节点移除导致位置失效时在产品总述显示，后继移走时在原父节点末尾显示。页面绑定优先，绑定正文在编号树和汇总只出现一次。目录编号与 UI 适配不改变提示词或生成流程。
- 2026-11-17：优化「文档管理」弹窗中原型页面的操作按钮显示。当原型页面尚未关联页面需求 Markdown 文档时，仅显示「关联已有文档」按钮，隐藏「打开」和「编辑」按钮，避免在没有关联实体文档时展示无效操作入口；关联完成后恢复显示「打开」、「编辑」和「更换关联」。
- 2026-11-17：优化批注模式工具栏，在进入批注模式（`isQuickEditActive`）时隐藏「文档管理」按钮，避免在批注元素与 AI 执行模式下出现冗余的文档管理入口；退出批注后恢复显示。
- 2026-11-17：移除侧栏顶部「需求 PRD」冗余按钮。当前页 PRD 触发入口已收敛至侧栏原型页面节点与文档管理体系中，移除侧栏顶部刷新与打开 AI 之间的独立按钮，保持侧栏顶部全局工具条简洁。
- 2026-11-17：优化文档目录树与文档管理弹窗树图标展示，并修复父子节点退格问题。空节点（纯分组/章节目录）改用页面需求规范的蓝色文件夹图标（`stroke: #2563eb; fill: rgba(59, 130, 246, 0.2)`），支持折叠与展开状态动态切换；有内容的节点（页面分支、叶子页面及 Markdown 文档）统一采用单色文件图标。修复由于叶子节点隐藏原生 icon 导致丢失 14px 宽度、父节点因箭头向右偏移而反超子节点缩进（视觉退格）的问题，叶子节点保留 14px 透明占位符，实现父子缩进严格递增与同级图标严格对齐。
- 2026-11-17：将「文档管理」弹窗内全部目录项与文档项图标同步为统一视觉规范。弹窗内的纯分组与文件夹节点（`DocumentRow` 与 `PagePrdManagement`）统一使用蓝色文件夹图标（`Folder` / `FolderOpen`，带半透明蓝填充），所有 Markdown 文档与原型页面统一替换为单色无横线折角文档图标（`File`），替代原先繁杂的 `FileText` 线性横杠图标，与侧栏页面需求及阅读器目录保持完全一致的视觉体验。
- 回退此轮时恢复此前的管理端构建及相应后端。位置元数据可保留，旧阅读器按原始文档树显示。独立文档移动到原型章节时保存在原始目录根部，因此旧版可以继续读到正文。保留 `annotation-source.json`、`.page-prds.json` 和 Markdown 文件。

## 历史证据

本地任务前源码为 `7846efe`，工作区无未提交变更。管理端实际服务为外层 0.6.23 CLI、源码 0.6.22 构建的 `dist/admin`，检查了进程参数和服务 HTML 资源版本。新接口需同一份本地源码服务和管理端构建，不能只替换旧安装包加载的前端。验收使用 Vite 原生 `--outDir` 分开生成管理端，构建插件同样读取该参数，避免改写正式服务所用的产物。

## 上游升级影响

升级时核对标注运行时的控制器、Shadow DOM 内原生文档按钮、文章头/正文和树节点属性；有受支持的文章动作、选择事件或父页节点时优先采用，移除对应局部适配。复核页面路由消息、同源与跨源的嵌入编辑、项目路径规则和旧标注链接。

## 启停与回退

构建单独产物：`node node_modules/vite/bin/vite.js build --outDir dist/admin-page-prd --emptyOutDir`。运行本地源码：`node --import tsx bin/cli.mjs --host 127.0.0.1 --port 53817 --admin-root dist/admin-page-prd --no-open`。使用正式端口需先退出旧安装包服务；并行验收应使用独立端口和 Make 状态目录（`AXHUB_MAKE_HOME_DIR`）。本轮未更改原启动器或替换 53817。

回退页面 PRD 的 API、运行时适配、目录投影和文档管理接入后，从对应源码重建管理端，启动对应服务。旧版忽略 `.page-prds.json`，既有普通目录照常读取。回退时保留该文件及 Markdown 正文；新增页面正文仍可按文件路径读取。撤销关联不会恢复关联后已保存的内容，需从正文历史恢复。

## 待授权的 AI 工作流改动

- 入口及调用链：仅在 `src/spec-template/MarkdownViewer.tsx` 的页面 PRD 编辑操作区增加「生成」。沿 `src/dev-template/pagePrdReader.ts` 已有嵌入上下文传递当前稳定 ID、标题与页面 PRD 地址。点击时检查保存状态和草稿，读取最新绑定信息后复制，复用 `src/spec-template/quickEdit.ts` 的文档提示词构建入口和自定义模板参数，沿 `src/index/utils/clipboard.ts` 及现有 Make 成功/失败消息反馈。
- 数据及文件：拟在 `src/server/managementApi.prototypeAnnotation.ts` 复用页面 GET，按需返回当前项目标识和根路径、原型和主规格实际位置、可读取的页面来源以及单页模板绝对路径。仅按显式参数读取生成所需的元数据；默认 GET 和既有 PUT 保持原协议。模板随本地源码运行，模板不可读时提示并停止复制。
- 预期变化：提示词明确直接使用 Make `write-prd`，提供项目、原型、页面 ID、标题、来源、模板和已绑定路径。外部 Agent 先用同一页面 GET 读取最新正文；按 `PUT /api/prototype-annotation/page-prd?projectId=…&targetPath=…&pageId=…`、`Content-Type: application/json`、`{"content":"<Markdown>"}` 保存。仅生成当前页，其他页只用于入口及跳转。首次写入自动绑定，已绑定更新原文件。成功报告响应中的路径，失败说明原因并保留正文。原生 `write-prd`、规划链路、模型调用和批注提示词默认行为沿用上游。
- 风险及验证：已有正文作为修订依据，复制前要求先处理当前草稿，Agent 写入前复核页面和绑定，返回 Make 后已有冲突提示。验证两页互切时的复制文本、已有及空白正文、草稿阻止复制、模板不可读、剪贴板失败、接口首次和原地保存，以及现有普通文档提示词的定向回归。回退时撤销生成按钮、提示词接线和可选读取字段，保留模板、当前页入口、绑定和正文。

## 验证与遗留

2026-11-16：真实项目接口测试验证首次保存、同一文件原地更新、拒绝重复关联与越界；目录测试验证改名、改序、父章节和未绑定占位。普通目录删除实体文件的既有断言在 `7846efe` 和本次工作区同样失败。服务端类型检查通过；临时去掉根前端项目引用的类型检查诊断与基线一致。

53831 的实际 Make 源码服务和 51731 的隔离模板项目中，冷启动后用鼠标实际点击原生「文档目录」，默认在分屏打开当前页。目录点击定位原型，整篇和普通文档在切页时保持，普通文档既有 `#axhub-target:` 链接仍跨页定位。A 页通过内嵌编辑首次保存，页面 API 与原生项目文档 API 回读同一路径及正文。正式业务工作区的 53817 仍使用旧安装包服务；该接口在 53817 返回 404。

在文档管理界面将「内容标注」关联到原有的 `docs/prd-02-flow.md`。从管理打开原生分屏，核对原正文和编辑入口一致，两个界面不重复列出普通文档引用，其他普通文档仍可打开。未写入原有正文。保留原有普通文档删除实体文件的基线失败；未在正式业务项目操作。

在隔离浏览器中用原生路由消息模拟页面改名和移动。目录标题及层级随路由更新，已有页面仍命中原路径和原正文；整篇标题按新树排序。文档管理的打开请求等目标页面路由就绪后再完成文章切换；整篇与单页复用原有文档的图片预处理结果，正文文件不因阅读而改变。

同一工作区另有并行改动。本次 `dist/admin-page-prd` 用基线及本次代码的隔离副本构建，未打入并行侧栏入口和外部正文刷新协议。隔离副本的登记检查通过（35 个候选路径），共 311 项定向测试通过，验收服务返回的管理端、预览和编辑器入口与隔离构建哈希一致。

最终隔离产物中，普通文档固定阅读期间经「文档管理」打开改名后的 B，浏览器验证原生分屏切到了 B 的文章 ID，展示原正文，原文件路径保持。
整篇阅读显示重排后的章节和 B 正文。原有两处图片占位符正确转成图片地址，两张图片实际加载成功，未出现浏览器页面错误。

2026-11-16 当前页入口验证：工作区以 `7846efe` 为 HEAD，接手时页面 PRD、编辑器表格和文字颜色、草稿隔离已有未提交差异。使用本地源码 0.6.22，单独构建 `dist/admin-current-page-prd`，未替换 53817 或 53831。服务端类型检查通过。前端全量诊断仍因工作区已有类型问题未通过。

定向 Vitest 覆盖预览路由、侧栏、正文处理、草稿和页面 PRD API。本地源码服务与独立 Node 写入进程联测，向带两个不同候选页面的预览桥发送当前页读取请求，验证 hash 页优先于查询和默认页，空态及先后两次外部写入的回显、首次创建绑定和原地更新。浏览器窗口聚焦及编辑交互仍待人工验收。生成按钮、提示词复制及实际 Agent 生成待授权后验证。

回退本轮入口和回显时，撤销侧栏回调、页面路由读取和外部刷新/草稿提示接线，使用之前的管理端构建。页面 PRD 存储和正式服务仍可沿既有方式运行。

2026-11-17 在实际端口 53817 复现「确认关联」返回 `404 Not found`。项目中的 `新文档-3.md` 存在，缺失的是外层安装包的页面 PRD 路由。按 CUST-004 换成配套源码后端后，重试「公文面板」（`document-board`）关联，PUT 返回 200，页面和目录 GET 均回读 `src/prototypes/maoming-document-flow/docs/新文档-3.md`。关联前后文件 SHA-256 一致。本次重试使用实际接口，未重复点击浏览器操作。


2026-11-17 编号目录：7 组定向 Vitest 共 209 项通过，覆盖共享目录投影、文档管理、页面入口、编辑器回显与真实文档 API。服务端 TypeScript 检查、`git diff --check` 和改造登记检查通过。管理端构建输出到 `dist/admin-prd-numbered-final`，以独立源码服务 53842 和茂名项目副本的 Vite 51741 验证。构建完成，保留依赖注解、CSS 压缩和大块提示；正式服务 53817 未切换。测试执行使用 `pnpm --config.verify-deps-before-run=false exec` 复用已安装依赖。

使用茂名项目副本的路由定义与 53842 的真实 PRD 响应构建目录，验证公文中心为 2.1、公文面板为 2.1.1。反转公文中心的同级子项后，公文面板变为 2.1.6；绑定路径及 Markdown 字节与原业务项目一致。

隔离 Edge 浏览器通过本地直连打开测试副本。用鼠标点击「需求 PRD」后，阅读器显示当前页「2.1.2.1 审批流管理」，文章 ID 为 `make-page-prd:page:approval-flow-list`，目录控件为收起状态，目录树尚未显示。后续浏览器运行读取内嵌阅读器超时，目录开合、分支、缺失图标、首次保存、草稿保护和窄屏布局的浏览器验收待完成。接口、目录编号及正文兼容已有定向验证。

2026-11-17 未关联页面按钮优化验证：在 `DocumentManagementDialog.test.ts` 新增单元测试，验证未关联页面行只渲染「关联已有文档」按钮，不渲染「打开」和「编辑」按钮；已关联页面行同时渲染「打开」、「编辑」和「更换关联」按钮。改动仅限纯界面按钮展示逻辑，不影响既有数据结构和后端接口。

2026-11-17 侧栏顶部需求 PRD 按钮移除验证：移除 `ContentPanel.tsx` 中侧栏顶部工具条上的 `Button`，运行二开登记检查和代码格式检查，确认未破坏既有组件接口与侧栏其余渲染逻辑。
