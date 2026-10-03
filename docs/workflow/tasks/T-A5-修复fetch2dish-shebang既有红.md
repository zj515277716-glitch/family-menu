# T-A5 修复 fetch2dish.spec 既有红（shebang 触发 vitest4 SSR SyntaxError）

> 立项依据：T-A2 门禁差额（`pnpm test` 唯一失败 suite，基线 682455a 实跑复核为既有红，非 A2 引入；fm-dev 已定位根因并留证 evidence/T-A2/probe-shebang.txt：去 shebang 副本实测可跑）。级别 L1（缺陷修复，先写失败测试再修）。

## AC（逐条 [✓]/[✗] 自检）

- AC1 修复后 `pnpm test` 全绿：Test Files 0 failed、Tests 全 passed（当前基线：411+ passed/16 skipped/1 failed suite 归零为 passed）。
- AC2 根因处置到位且最小：`tools/content-pipeline/fetch2dish.mjs` 首行 shebang 在 vitest 4 SSR transform 下报「Invalid or unexpected token」；按 probe 实证二选一（删 shebang / 改 .cjs / 调整 vitest include 排除），选影响最小者并在 dev 报告说明为何不选另两项。
- AC3 先失败测试：修复前该 suite 实跑失败输出留证；修复后全绿留证（两次输出都归档 evidence/T-A5/）。
- AC4 `pnpm -r exec tsc --noEmit`、`pnpm lint`、`pnpm test:taboo` 不回退。
- AC5 证据 evidence/T-A5-dev-2026-10-0x.md（≤1 页）。

## 边界约束

- 允许改：tools/content-pipeline/test/fetch2dish.spec.ts 的 import 方式或 fetch2dish.mjs 的 shebang（一处）；必要时 vitest 配置（根配置一处）。
- 禁改：其他包、其他测试断言基线；禁引入依赖；禁用「重跑到过」碰运气（规则红线）。
- 不合并 main、不推送；完成后独立审查（fm-reviewer 实跑命令）。

## 终态（主控补登）

待派发执行后补登。
