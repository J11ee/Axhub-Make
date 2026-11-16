# CUST-005 单页原型需求文档与 H5 交付

- 模块：原型标注、PRD 和导出
- 类型：扩展设想
- 状态：已讨论未实施
- 首次可追溯的需求：2026-11-12
- 最近更新：2026-11-16（审计）

## 原始需求和原生行为

用户希望每个独立原型页面绑定一份 PRD（产品需求文档），Make 文档目录和原型内都能编辑同一份正文。可按页面顺序组成整份需求文档，发布或导出的 H5 可从侧栏阅读。AI 单页生成以可见字段、输入规范和跳转关系为主，业务细节由用户补充。用户要求尽量沿用原有逻辑。

基线已有 `.spec/spec.md` 原型规格、`annotation-source.json` 标注与文档目录、组件目标锚点，以及写 PRD 和导出入口。示例原型的 Markdown 和 HTML 已使用 `#axhub-target:`，属于原生能力。

## 实际实现

会话提出按页面组织 Markdown、复用标注锚点、评估共享文档和静态导出携带侧栏。没有找到该事项的实施命令、本地源码差异或端到端验收。历史调研对双向编辑和导出可行性的判断仍需通过真实数据流和产物验证。

## 关联路径

- `src/server/managementApi.prototypeAnnotation.ts`
- `src/server/managementApi.exports.ts`
- `src/server/exportHtmlArchive.ts`
- `src/index/components/content/PresentationToolbar.tsx`
- `client/.agents/skills/write-prd/SKILL.md`

## 历史证据

Antigravity 的历史调研记录了用户请求及上游锚点与组件定位的复用方案。当前源码与 `45b7c6e` 的相关模块相比未发现对应实现。

## 上游升级影响

实施前核对上游是否已支持页面到文档的绑定、编辑时的唯一文件来源、打包以及目标定位。验证规格与交付 PRD 的职责、导出后离线读写边界及页面跳转。

## 验证与遗留

本轮核对了原生标注、PRD 技能、导出入口和基线差异。单页生成、同源编辑和 H5 侧栏仍处于调研状态。
