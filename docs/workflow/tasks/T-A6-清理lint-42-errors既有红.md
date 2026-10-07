# T-A6 清理全仓 lint 42 errors（既有红）

> 立项依据：T-A2 门禁差额（`pnpm lint` 42 errors，基线 682455a 实跑复核为既有红，非 A2 引入；fm-dev 已定位三处根因）。级别 L1。

## 三处根因（fm-dev 定位，dev 复核定谳）

1. `.workflow-verify/deploy/*.ts` 未跟踪沙箱脚本（2GB 目录，含登录态 profile）——eslint ignores 未覆盖该目录；正解是把该目录移出项目（C3 清理项）或在 eslint.config.js 加 ignore。
2. apps/h5 feedback / history 页 react-hooks 规则告警（注释类）。
3. apps/h5 plan 页未使用变量 `gi`。

## AC（逐条 [✓]/[✗] 自检）

- AC1 `pnpm lint` 0 errors（当前 42 → 0），输出归档 evidence/T-A6/lint-after.txt。
- AC2 三处各自最小修复：eslint ignore 属配置改动需在说明中论证不影响其他门禁；两处代码修复删/用变量、补依赖数组，行为零变化（tsc + 既有 h5 用例证明）。
- AC3 `pnpm test`、`pnpm test:taboo`、`pnpm -r exec tsc --noEmit` 不回退。
- AC4 证据 evidence/T-A6-dev-2026-10-0x.md（≤1 页）+ fm-reviewer 独立实跑确认。

## 边界约束

- 允许改：eslint.config.js（ignore 段）、apps/h5/src/pages/{feedback,history,plan} 最小行。
- 禁改：业务逻辑行为、其他文件、新增依赖。
- `.workflow-verify` 移出项目属 C3 阶段事项，本卡只做 ignore 或等价隔离，不动目录本体。

## 终态（主控补登）

dev 完成（00d25d5，2026-10-08）：eslint ignore `.workflow-verify` + 三页面最小删改（失效 disable 注释、未用参数 gi），lint 42→0；taboo 130/130、tsc 0 错；test 唯一红 fetch2dish 为基线自带（本分支不含 T-A5 修复，A5 先合即消）。独立审查 **PASS**（evidence/T-A6-review-2026-10-08.md，全程实跑）。完成层级：**第 2 层**（无视觉改动，页面截图不适用）；合并待产品负责人授权。
