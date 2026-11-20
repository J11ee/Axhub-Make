# CUST-012 从原型右键菜单复制完整原型

- 模块：管理端原型侧栏、文件操作
- 类型：修改
- 状态：已实现
- 首次提出、实施和最近更新日期：2026-11-19

## 原始需求和原生行为

上游基线 `45b7c6e` 的「创建副本」调用通用文件复制接口，仅复制目录。需要同时复制页面结构和已保存的页面需求，避免副本编辑原文档。

## 实际实现

复用现有菜单与刷新入口，局部加入项目范围内的复制接口（P4）。服务端分配 ID 和显示名称、复制原型目录、重建页面需求绑定并登记副本。原型目录外已绑定的 Markdown 复制进副本，重定位项目内有效相对链接。通用复制接口及原有数据格式继续使用。

## 关联路径

- `src/index/app/index-page/resourceActions.helpers.ts`
- `src/index/app/index-page/useIndexPageResourceActions.test.ts`
- `src/index/app/index-page/useIndexPageResourceActions.tsx`
- `src/index/components/sidebar/ContentPanel.tsx`
- `src/index/components/sidebar/ContentPanel.source.test.ts`
- `src/index/utils/sidebarTree.ts`
- `src/server/__tests__/projects-legacy-api.test.ts`
- `src/server/managementApi.fileOperations.ts`
- `src/server/managementApi.ts`
- `src/server/prototypeDuplicate.ts`

## 实施与变更记录

- 2026-11-19 增加「复制原型」入口及项目内复制接口。复制失败时清理本次生成的目录。
- 2026-11-19 原型菜单使用标准菜单选择事件，居中弹窗显示侧栏原型名称，确认后才请求复制。弹窗打开和请求执行期间防止重复触发。
- 2026-11-19 跳过由目录名生成的侧栏占位标题，保留原型的正式显示名或自定义标题。等右键菜单关闭并释放焦点后再打开确认弹窗，避免菜单和弹窗同时锁定鼠标和焦点。

## 历史证据

本次对话确认原型目录外的已绑定需求也生成独立文件。源码变更未提交。

## 上游升级影响

核对上游复制入口、项目写入范围、原型元数据扫描及页面需求绑定格式。无需迁移旧数据。

## 启停与回退

管理端和服务端配套使用。反向应用本档案关联的改动并重新构建可恢复原有复制入口。现有副本可继续作为独立原型使用。

## 验证与遗留

- 2026-11-19 使用仓库本地 Vitest 运行侧栏、原型操作和服务端兼容测试，132 项通过。真实接口覆盖项目隔离、连续复制、中文路径、页面路由文件、默认页、独立文档保存、相对图片读取、缺失需求和写入冲突后的清理。
- 服务端 TypeScript 检查通过。浏览器实际右键、点击副本和预览页面树待验收。
- 使用本地 Vite 构建管理端和 Axure 导出运行时，产物已生成到 `dist/admin`。构建有 CSS 压缩和分包大小警告。改造登记与差异空白检查通过。
- 确认弹窗调整后，124 项定向测试通过，管理端构建及登记检查通过。DCOP 核对时只有一个编号为 3 的实际副本，缺少原操作的请求记录，浏览器交互待验收。
- 标题和弹窗时序修复后，142 项定向测试、服务端 TypeScript 检查、管理端和 Axure 导出运行时构建通过。真实接口验证侧栏保存英文占位标题时仍以中文名复制。浏览器取消和确认后的实际交互待验收。
