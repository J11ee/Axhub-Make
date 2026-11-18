# CUST-001 侧栏目录操作和选中表现

- 模块：管理端内容树
- 类型：修改原生实现
- 状态：已实现
- 首次可追溯的需求：2026-11-12
- 最近更新：2026-11-17

## 原始需求和原生行为

用户希望原型、文档、设计三个页签沿用同一套目录组件，在浏览时可以先选中资源，再双击打开，三击重命名，用 Tab 或 Shift+Tab 调整目录层级。文件夹和原型使用着色矢量图标。基线 `ContentPanel.tsx` 在点击资源行时打开资源，文件夹行为取决于当前页签和选择权限，层级调整已有树操作和拖拽持久化。

## 实际实现

`ContentPanel` 将点击选中与资源打开拆开。单击主要选中，文档文件夹还更新粘贴目标。双击打开资源或展开、收起文件夹，右侧操作按钮以外的整行响应。同一节点的动作在 350 毫秒内去重，避免连续 `click` 与 `dblclick` 重复触发。三击和 F2 重命名受适用节点和权限约束。Tab 将节点移入前一个同级文件夹，Shift+Tab 将节点移到父目录之后，沿用 `onTreeChange` 和 `onTreePersist`。行样式区分选中和当前打开，增加长标题截断及文件夹和原型图标配色。

原型页面单击为灰底选中，当前打开的页面以绿字和绿色图标区分。分组行单击选中，双击只切换展开，折叠箭头单击单独生效。分组行的单击选中延迟 200 毫秒以等待可能的第二击。分组和页面层级契约见 [CUST-002](CUST-002.md)。

2026-11-17 优化原型树分组（空页面）辨识度：原型内部多级页面的分组文件夹在 14px 纯灰线框下易与未激活页面混淆。改为折叠显示蓝色半透明微填充 `Folder`（`fill-blue-500/20 text-blue-600 dark:fill-blue-500/30 dark:text-blue-400`），展开显示对应微填充 `FolderOpen`（`fill-blue-500/25 text-blue-600`），与页面纯灰线框 `File` 及激活翡翠绿 `File` 形成三层视觉区隔。

## 关联路径

- `src/index/components/sidebar/ContentPanel.tsx`
- `src/index/components/sidebar/ContentPanel.interactions.test.ts`
- `src/index/components/sidebar/ContentPanel.source.test.ts`

## 历史证据

Antigravity 的评估与实施记录保留了复用组件、三击重命名、目录树写入及新增交互测试的决策。11 月 16 日根据反馈继续调整整行双击区、分组箭头、配色和选中状态，详见 [历史审计](../LEGACY_AUDIT.md)。

## 上游升级影响

共同修改原生 `SidebarRow`、目录树管理与键盘交互。升级时检查树权限、焦点、拖拽、文档粘贴目标和持久化。上游提供等价选中和编辑方式时，按原操作场景和数据迁移成本评估采用。

## 验证与遗留

2026-11-16 的 `ContentPanel.source.test.ts` 与 `ContentPanel.interactions.test.ts` 共 82 项源码断言通过。浏览器内单双三击时序、键盘焦点、层级移动落盘和跨页签表现尚待实测。当前树节点处理 Tab 时会调用 `preventDefault`，即使没有可缩进的相邻文件夹，也需要验收能否按预期移出焦点。

2026-11-17 执行 `vitest` 验证 `ContentPanel.source.test.ts`（76 项）与 `ContentPanel.interactions.test.ts`（6 项）全部通过，分组文件夹蓝色微填充与开合图标联动断言通过；执行 `scripts/check-customizations.mjs` 核验通过。
