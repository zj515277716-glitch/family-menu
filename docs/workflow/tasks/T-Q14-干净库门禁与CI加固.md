# T-Q14 干净库门禁与 CI 加固（L1）

> 立项：④验收预演发现干净库全量测试 2 条失败、CI 连续红（V3 复盘 P0-2），发布前必须恢复可信门禁。
> 目标：干净库 `pnpm test` 0 失败；CI 除 lint/build/test 外补跑 tsc/密钥/安全；删除失败重跑脚本。**不改产品运行时代码**；如发现真实产品缺陷，停下报告另立卡。

## 依据

- docs/复盘报告_V3_2026-10-21.md §P0-2 / §5.1
- .trae/rules/project_rules.md §3 常用命令、§5 五层、§8 红线（失败重跑=门禁作废）
- 复现：新建空库 → `prisma migrate deploy` → `prisma db seed` → `pnpm test`，失败仅：
  - `apps/api/test/dayplan-integration.spec.ts`「换一餐」：种子池无第二套午餐组合，测试却强制要求换成功；
  - `apps/api/test/mealtype-pool.spec.ts`「换菜候选池」：对未锁定计划调用 `getSwapOptions`，触发 PlanStateError。

## 需求

1. **dayplan-integration 换一餐**：在测试内补足午餐候选夹具（≥2 MAIN + 1 SIDE + 1 SOUP，`mealTypes` 含 lunch/dinner，唯一前缀），保证「当前菜不回池」后仍有替代组合；断言换餐成功、其他两餐逐字不动。夹具按前缀精确清理，不碰真实数据。若引擎确实无替代，允许测试改为断言「服务端拒绝且原餐保持」，但不得弱化 slot 隔离覆盖。
2. **mealtype-pool 换菜候选**：先 `planService.lockPlan` 锁定首候选，再取锁定组合中的 SIDE 菜调用 `getSwapOptions`；断言候选不含 breakfast 专属菜。清理不变。
3. **CI 加固**：在 `.github/workflows/ci.yml` 的 Test 之前补 `pnpm -r exec tsc --noEmit`、`pnpm check:secrets`、`pnpm check:safety`（seed 之后）；失败即红。
4. **删除** `package.json` 的 `test:gate`（失败重跑脚本，违反红线），并清理 CURRENT 候选中的对应提法。
5. **验证口径**：干净库（新建 `family_menu_ci2` 或等价）迁移+种子后 `pnpm test` 0 失败；本地开发库运行结果只作参考，不作为验收依据；lint/tsc/test:taboo 全绿；不新增失败。

## 影响清单

- 测试文件 2 个；CI workflow 1 个；根 package.json 脚本 1 行；CURRENT 候选 1 行。无 API/engine/shared/DB 运行时代码改动。
- 回退：git revert 本卡提交即可。

## 约束与验收

- 不改断言来「放过」失败：换一餐必须真实换成功且只动该餐；早餐菜不得进晚餐候选。
- 提交后推送 origin（走代理），等待 CI `verify` 变绿；若 CI 仍红，按日志继续定位，不得以本地绿代替。
- 分支 `t-q14-clean-ci-gate`，从 main `abb8b6d` 切；L1 流程：完成后主控派 fm-reviewer 实跑干净库与命令复核，再合并 main。
- 完成后回报：两测试修法、CI 新增步骤、干净库测试结果、CI run 号与结论、提交号、推送状态。
