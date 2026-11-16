# CUST-008 默认打开原型新建引导

- 模块：管理端工作区
- 类型：修改
- 状态：已实现
- 首次提出、实施和最近更新日期：2026-11-16

## 原始需求和原生行为

普通启动应进入原型新建引导，等待用户手动选择原型。上游基线 `45b7c6e6c197f242f3595806966ddec377cfdfbe` 默认关闭新建引导，资源加载后自动选中侧栏中的第一个原型。原生新建引导和资源直达链接已有完整入口，采用 P4 局部调整默认状态和选择逻辑。

## 实际实现

`IndexPage` 在启动地址未指定资源时启用现有的新建引导。选择同步在引导开启且未选择原型时跳过自动选择，手动选中的原型和页面可正常保留。指定资源的直达链接沿用原有解析流程。改动只涉及管理端初始页面及选择同步，复用现有引导组件和 AI 操作入口。

## 关联路径

- `src/index/app/IndexPage.tsx`
- `src/index/app/IndexPage.test.ts`
- `src/index/app/hooks/useIndexPageSelectionSync.tsx`
- `src/index/app/hooks/useIndexPageSelectionSync.test.ts`

## 实施与变更记录

- 2026-11-16，启用普通启动的新建引导，移除选择同步中会清除刚选中原型的处理，并覆盖从引导打开非首位原型的回归场景。

## 历史证据

需求来自 2026-11-16 会话。实现见 `IndexPage` 的引导初始状态和 `resolvePrototypeAutoSelectionDecision`。本次未提交 Git。

## 上游升级影响

合入上游时核对初始资源直达链接的解析顺序、现有新建引导的启用条件，以及侧栏选择是否会在资源刷新后保留。

## 启停与回退

恢复本档相关的初始状态和选择同步差异后重新构建管理端即可恢复原行为。无配置或项目数据迁移。

## 验证与遗留

- 2026-11-16，使用本地依赖运行 `IndexPage`、选择同步、资源直达链接、内容区和引导提示词五组 Vitest 测试，共 169 项通过。当前 pnpm 的默认依赖校验尝试重装依赖并在无交互终端中中止，本次以 `pnpm --config.verify-deps-before-run=false exec` 运行测试和构建。
- `vite build` 通过，输出依赖注释、CSS 压缩和分包大小警告。运行中的 0.6.23 服务通过 `--admin-root` 加载 0.6.22 源码生成的 `dist/admin`，访问 `http://127.0.0.1:53817/` 和管理端脚本均返回 200，脚本响应与新产物的 SHA-256 一致。
- 本次涉及的既有文件通过 `git diff --check`。`node scripts/check-customizations.mjs` 仍报任务开始前已有的 `src/index/components/sidebar/ContentPanel.tsx` 缺少本次匹配档案，新增改造路径已登记。
- 按用户要求，浏览器中的操作验收由用户自行完成。
