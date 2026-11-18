# CUST-011 修复中文路径下删除原型提示成功但文件仍在

- 模块：管理端文件操作
- 类型：缺陷修复
- 状态：已实现
- 首次提出、实施和最近更新日期：2026-11-17

## 原始需求和原生行为

用户报告 DCOP 和个人助理 app 删除原型后仍能看到源码。上游基线 `45b7c6e` 的 `POST /api/delete` 调用 `fs.rmSync`，随后更新项目元数据并直接返回成功。Windows 上使用 Node.js 24.10.0 时，两个项目的中文路径下均可复现同步删除未报错但文件仍在。选择 P4，局部修改现有删除入口，两个项目共用这条路径。

## 实际实现

`handleFileOperationsApi` 等待 `fs.promises.rm` 完成，再用 `lstatSync` 检查目标路径。目标仍存在时返回 500 和明确错误，确认移除后才更新项目元数据并返回原有成功响应。原项目范围、路径检查和不存在时的 404 保持兼容，无须转换旧数据。这一改动只影响直接文件删除，不修改引用确认界面或 AI 工作流。

## 关联路径

- `src/server/managementApi.fileOperations.ts`
- `src/server/__tests__/fileOperations.test.ts`

## 实施与变更记录

- 2026-11-17 将同步删除改为异步删除并核实落盘结果，把现有原型删除测试改为在中文项目路径下执行。

## 历史证据

2026-11-17 用户在本会话报告问题并授权修复。当前改动未提交。修复前两项目的临时原型均收到 200 但实体目录仍在，中文目录回归测试同样失败。

## 上游升级影响

核对共享删除入口、删除后才更新元数据的顺序和中文路径回归用例。上游出现等价修复后可回归原生实现。

## 启停与回退

随源码后端启动，无独立开关。回退时反向应用本档所列源码和测试的改动，再重启管理端后端。已删除的文件需从备份或版本历史恢复。

## 验证与遗留

- 中文项目路径回归测试已在修复前复现目标目录仍在。
- 修复后以 `pnpm --config.verify-deps-before-run=ignore exec node node_modules/vitest/vitest.mjs run src/server/__tests__/fileOperations.test.ts src/server/__tests__/projects-legacy-api.test.ts src/index/app/index-page/useIndexPageResourceActions.test.ts --silent` 运行，48 项通过。
- Windows Node.js 24.10.0 上已重启 53817 的 0.6.22 源码服务。CLI 的优雅停止超时后，核对旧服务进程身份并停止，再用原参数启动，健康检查通过。
- 用运行中的管理端删除接口对 DCOP 和个人助理 app 各删除一个临时原型，两次均返回 200，磁盘目录消失，重复请求返回 404。两个项目的“批注演示”入口文件哈希均一致。已验证实际接口，未进行浏览器点击验收。
