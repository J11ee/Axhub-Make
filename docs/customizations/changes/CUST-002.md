# CUST-002 侧栏的多级原型页面树

- 模块：客户端原型路由与管理端内容树
- 类型：扩展原生消息和渲染
- 状态：已实现
- 首次可追溯的需求：2026-11-11
- 最近更新：2026-11-16（审计）

## 原始需求和原生行为

用户需要在 Make 侧栏复现 Axure 原型的多级页面目录，包括父页、子页与通用弹窗。原型内部沿用 Axure 的菜单。上游已有 `defineHashPageRoute`、平面页面清单及 `group` 单级邻接分组，管理端经 `AXHUB_PROTOTYPE_ROUTE_INFO` 获取路由。

## 实际实现

`defineHashPageRoute` 接受可选 `pageTree` 并通过现有消息发送。管理端在接收边界核对页面 ID、去重、过滤不合法的分组，并把树中漏掉的有效页面补在顶层。`IndexPage` 把树写入当前原型项，`ContentPanel` 递归显示，自动展开当前页祖先，并保留既有预览跳转和拖动页面作为 AI 上下文的入口。旧原型没有有效的树时沿用 `group` 分组和平面路由。页面树来自原型声明，资源目录树的排序和存储沿用原有路径。

## 关联路径

- `client/src/common/useHashPage.ts`
- `client/tests/useHashPage-route.test.ts`
- `src/index/app/index-page/useIndexPagePreviewActions.tsx`
- `src/index/app/IndexPage.tsx`
- `src/index/types.ts`
- `src/index/components/sidebar/ContentPanel.tsx`
- `src/index/components/sidebar/ContentPanel.source.test.ts`
- `src/index/components/sidebar/prototypePageGroups.ts`
- `src/index/components/sidebar/prototypePageGroups.test.ts`

## 历史证据

基线 `45b7c6e`、当前路由及分组实现和测试共同证实该功能。Codex 的实施记录显示宿主侧曾直接修改源码仓库，两份原型路由也使用了现行协议，详见 [历史审计](../LEGACY_AUDIT.md)。

Antigravity 后续基于同一份 Axure 导出实现了第二个路由样例。曾讨论使用本地 `customPageTree` 允许页面拖拽重排，实施时保留了将页面拖入 AI 上下文的行为。覆盖与重排状态为「已讨论未实施」。

## 上游升级影响

这一改造横跨客户端模板与管理端消息契约。检查发送方、归一化逻辑、`ItemData`、旧原型、默认页、当前页同步、展开状态和拖放上下文。上游提供页面层级能力时比较配置格式、既有项目兼容和预览路由。

## 验证与遗留

2026-11-16 的 `prototypePageGroups.test.ts` 4 项、从 `client/` 运行的 `useHashPage-route.test.ts` 10 项，以及管理端源码断言通过。当前仓库自带的原型入口中未找到使用 `pageTree` 的声明。实际原型的 iframe（嵌入式预览）消息、树展开及跳页仍待浏览器验收。
