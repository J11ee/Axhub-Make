# CUST-003 侧栏一键刷新工作区

- 模块：管理端工作区与侧栏工具栏
- 类型：新增入口，复用原生加载器
- 状态：已实现
- 首次可追溯的需求：2026-11-12
- 最近更新：2026-11-16（审计）

## 原始需求和原生行为

用户想在 Make 内重载数据和画布，并保留当前管理端框架以避免整页刷新。基线已有项目切换列表刷新、侧栏数据加载、画布加载及预览刷新入口。侧栏头部当时没有统一的工作区刷新按钮。

## 实际实现

`ContentPanel` 在菜单和 AI 下拉入口之间显示刷新按钮、忙碌状态和提示。`IndexPage.handleRefreshWorkspace` 重新加载数据、文档和侧栏资源，强制读取当前页签树。画布模式重新加载原型和画布数据，其他模式调用当前元素的预览刷新。回调经过属性构建和 `NewSidebar` 传入；回调缺省时复用原有项目列表刷新。

## 关联路径

- `src/index/app/IndexPage.tsx`
- `src/index/app/hooks/useIndexPageSidebarPropsBuilder.ts`
- `src/index/components/sidebar/NewSidebar.tsx`
- `src/index/components/sidebar/ContentPanel.tsx`
- `src/index/components/sidebar/ContentPanel.interactions.test.ts`
- `src/index/types/index-page.types.ts`

## 历史证据

Antigravity 的评估记录了局部刷新的目标和复用原加载器的方案。实施记录、源码连线和测试支持实际落地。随后因旧服务仍加载旧产物，进一步调整了启动器，见 [CUST-004](CUST-004.md)。

## 上游升级影响

检查加载器的参数、画布和预览入口、页签到树类型的映射、刷新时未保存内容的状态，以及上游相同入口的覆盖范围。

## 验证与遗留

2026-11-16 的侧栏源码断言覆盖按钮位置、状态和回调连线。实际数据刷新、画布及预览未做浏览器验收。`Promise.allSettled` 会汇总各加载结果，但现有回调没有检查其中的拒绝项，个别加载失败时仍可能显示刷新成功。
