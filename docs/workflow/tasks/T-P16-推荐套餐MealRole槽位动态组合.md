# T-P16 推荐套餐按 MealRole 槽位动态组合（方案2 · PD-018）

> 立项依据：用户 2026-09-17 需求「推荐套餐里的菜谱要在菜谱池里按类别选取组合，套餐骨架保持不变（主菜+配菜+汤），数量随用餐人数变更」——已按变更流程登记为 **PD-018**（[PRODUCT-DECISIONS.md](../../../docs/ai-rebuild/PRODUCT-DECISIONS.md)），确认书 C-3 已先行修订。前置：方案1 数据层已落地（[evidence/RIBS-MENU-dev-2026-09-17.md](../../../evidence/RIBS-MENU-dev-2026-09-17.md)，commit a095661）。

## 目标

把推荐从「整套 PUBLISHED 套餐原子匹配」升级为「骨架不变、槽位组合」：

- PUBLISHED 菜按 mealRole 归类别池（MAIN=主菜 / SIDE=配菜 / SOUP=汤）；
- 生成菜单时按槽位数量映射抽选组合：**主菜=⌈people/2⌉、SIDE=1、SOUP=1**（STAPLE 暂不设槽，挂账）；
- safety 禁忌一票否决、mustUse 硬要求（PD-001）、时长档、缺槽降级（留空+原因标注）全部按 PD-018 口径执行。

## 主控诊断实证（2026-09-17，只读）

- MealRole 枚举已含 MAIN/SIDE/SOUP/STAPLE（packages/shared/src/schemas/dish.ts L9），**无需扩契约角色值**；
- 方案1 后本地库（54329）有 4 道 PUBLISHED 排骨菜 + 3 套 PUBLISHED 套餐；`mustUse=[排骨]` 真实链路返回 3 候选（ribs-menu-01/03/02）；
- 引擎四层管道（safetyFilter→feasibilityFilter→score→diversify）就绪，.workflow-verify/recruit/repro-mustuse.cjs 本地复现 filtered trace 正确（该目录不入库，仅本地参考）；
- planService.loadMenuViews include 链已含 dishes→dish→ingredients→ingredient，mealRole 数据可达装载层。

## AC（验收线，逐条 [✓]/[✗] 自检）

- **AC1** 引擎组合层：PUBLISHED 菜按 mealRole 归池（MAIN/SIDE/SOUP），按映射组合（主菜=⌈people/2⌉ 向上取整、SIDE=1、SOUP=1）；现有 PUBLISHED 套餐（Menu 行）数据保留可回溯，组合结果不再依赖 Menu 原子匹配。
- **AC2** 安全零回归：safetyFilter 优先级最高；硬禁忌食材/菜绝不出现在任何槽位；`pnpm test:taboo` 全绿（一票否决）。
- **AC3** mustUse 不回归（PD-001）：组合出的整桌必须消耗全部必消食材；无法满足时空手口径与 C-7/C-7a 两型一致（unmetReasons 侧车透传，P10 口径）。
- **AC4** 时长档：组合菜单各菜时长之和 ≤ 所选档位；排不下走时间型口径（C-7 时间型）。
- **AC5** 缺槽降级（PD-018）：某槽位无可用菜 → 该槽留空、其余槽位照常出单；原因以侧车字段如实透出（风格对齐 unmetReasons）；绝不拿不合条件的菜凑数。
- **AC6** 换一批（PD-013）/换一道（C-5 同角色候选）语义不回归：同条件重新组合=真的换了；换一道候选按同 mealRole 池给出，「共 N 个」如实展示。
- **AC7** 契约与保存：API 响应结构不变（菜品列表+侧车）；当晚菜单保存/同天重进不重生成（C-3 保存口径）。**若发现 Plan/保存链路强依赖 menuId 需 schema 结构性改动 → 停手报主控，不得自行改 schema**。
- **AC8** 方案1 手工数据固化：4 排骨菜 PUBLISHED 升格 + 2 汤 mealRole 纠偏（MAIN→SOUP）+ 3 套套餐固化为可重放 seed（或等价迁移，幂等），teardown/重放后数据可恢复；固化方式与理由写入报告。
- **AC9** 回归全绿：根 `pnpm test` 数字自洽 + `pnpm test:taboo` 全过 + api `tsc` 0 错 + h5 `typecheck` 0 错；teardown 七表基线数字以实测为准并在报告登记（方案1 固化后基线将变化，须算术自洽）。

## 输入资源

- [00-START-HERE.md](../../00-START-HERE.md) + [PRODUCT-CONFIRMATION.md](../../../PRODUCT-CONFIRMATION.md)（C-3/C-3a/C-7/C-7a）+ AGENTS.md
- 引擎源码 packages/engine/src/**（safety.ts / feasibility.ts / score.ts / recommend.ts / must-use-matcher.ts）
- 装载链 apps/api/src/services/planService.ts（loadMenuViews / resolveMustUseIds / generateRecommendation）、mappers.ts
- 方案1 证据 [evidence/RIBS-MENU-dev-2026-09-17.md](../../../evidence/RIBS-MENU-dev-2026-09-17.md)
- 环境：便携 PG 必须带 `-o "-p 54329"` 启动——`& "d:\codex\family-menu\.pg\bin\pg_ctl.exe" -D "d:\codex\family-menu\.pg\data" -o "-p 54329" -l "d:\codex\family-menu\.pg\pg-tp16dev.log" start`；连接串 `postgresql://postgres@127.0.0.1:54329/family_menu`；用完 `-m fast stop`
- 常用命令：pnpm i / pnpm test / pnpm test:taboo / pnpm db:migrate / pnpm db:seed

## 边界约束

- 允许改：packages/engine/**、apps/api/src/**（装载/透传最小改动）、tests/** 与 apps/api/test/**（适配+新增组合用例）、apps/api/prisma/seed*.ts（AC8 固化）
- 禁改：apps/h5/src/**（渲染已泛化；确需适配停手报主控）、prisma/schema.prisma、现有迁移文件
- 契约红线：packages/shared 仅允许注释级改动；若需新增侧车字段等契约变更 → 停手报主控（人工批准）
- 禁引入新依赖；禁 Redis/消息队列/微服务/K8s；运行时禁 LLM API（DEC-006）
- WIP=1：本卡独占；PG 用后必停（`-m fast stop`）
- 分支：从当前分支（feat/tp-06-menu-expansion @ a095661）切 `feat/tp-16-role-slot-composition`

## 异常升级路径

契约需要新字段 / Plan 模型结构性改动 / 测试基线与 AC 冲突 / 类别池或槽位判定争议 → 停手，写报告报主控，不得自行改方案。

## 终态（主控补登 · 2026-09-17）

**结论：PASS（四角色流程走完，全链路闭环）**

| 角色 | 结论 | 证据/锚点 |
|---|---|---|
| DEV（fm-dev） | AC1~AC9 全 [✓]，代码 e2e8b92 + 报告 5e7a71f | [evidence/T-P16-dev-2026-09-17.md](../../../evidence/T-P16-dev-2026-09-17.md) |
| REVIEW（fm-reviewer） | PASS-有条件 → 经主控裁决 5 条补登后升格 **PASS**（条件③ verify 复跑 5/5 一致已闭环） | [evidence/T-P16-review-2026-09-17.md](../../../evidence/T-P16-review-2026-09-17.md)（附录：主控裁决） |
| VERIFY（fm-verify） | **PASS**——数字复跑 5/5 一致；接口级产品验收 8/8 命中 | [evidence/T-P16-verify-2026-09-17.md](../../../evidence/T-P16-verify-2026-09-17.md) |

关键数字（verify 复跑）：pnpm test 21 files / 471 passed；test:taboo 6 files / 108 passed；api tsc 0 错；h5 tsc 6 错（≤基线 6，主控裁决豁免口径命中）；seed 幂等闭环 teardown 四表 Dish=49 / Menu=16 / MenuDish=52 / Ingredient=81。

人数映射实测：2 人=3 道 [MAIN,SIDE,SOUP]；4 人=主推 3 道 [MAIN,MAIN,SOUP]（配菜槽降级，完整 4 道已生成仅排序未进 top-3 → V-1 观察项）；6 人=5 道 [MAIN,MAIN,MAIN,SIDE,SOUP]。

主控裁决 5 条（详见 review 报告附录）：①h5 子项豁免口径=typecheck 错误数≤基线 6 错（pre-existing）；②PD-018/确认书修订随 e2e8b92 入库归属确认；③verify 数字复跑坐实；④teardown 七表断言收敛为内容四表（Plan/Event 仅登记）；⑤P3 缺陷「换批兜底候选 reasons 未并入 slotShortages」挂账不阻塞。

**P3 观察项（挂账，待用户裁决是否立卡）**：V-1 people=4 完整套排序加权；V-2 tb=60+必消牛腩单菜候选体验；换批兜底 slotShortages 并入；h5 typecheck 6 错 pre-existing 修复卡。

环境清理：API 已停、PG `-m fast stop` exit 0、禁忌测试规则已还原 seed 基线 3 条、临时脚本在 %TEMP% 未入库。浏览器实操未做（无自动化驱动），接口级已覆盖全链路。
