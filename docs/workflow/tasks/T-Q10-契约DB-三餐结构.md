# T-Q10 契约 + DB 迁移：三餐计划结构（L2）

> 立项：T-Q05 实施路线第 5 步第二卡（T-Q09 引擎三餐规划已完成第 2 层，2026-10-14 派发）。级别：**L2**。
> 目标：契约与数据库从「单餐计划」升级为「三餐计划」——Plan/Event 扩餐次维度，apps/api 接通 T-Q09 的 DayPlan 引擎，list-merger 支持三餐合并与成人/儿童换算，为 UI 全量卡（下一卡）提供稳定 API。

## 依据（先读）

- PRODUCT-CONFIRMATION.md v2（C-2/C-3/C-3a/C-4/C-5 验收口径）与 PRODUCT-DECISIONS.md PD-020 明细（契约 Plan→三餐×菜单、Event 按餐关联、DB Plan/Candidate 扩餐次+Feedback 按餐关联、list-merger 三餐合并+成人/儿童换算）
- packages/engine/src/types.ts（T-Q09 DayPlan 模型：MealSlot/DayPlanContext/DayPlanResult/MealPlanView）
- packages/shared/src/schemas/（api/dish/family/menu/plan）与 types/；apps/api/prisma/schema.prisma（Family/FamilyRule/ExclusionRule/Ingredient/Substitution/Dish/DishIngredient/Menu/MenuDish/CookLog/Plan/Event）；apps/api 路由现状

## 需求

1. **契约（packages/shared）**：Plan 从「一套菜单（单餐）」→「三餐×菜单」——对齐引擎 DayPlanResult：餐次（MealSlot）、每餐菜品列表与 FilterTrace 可解释数据、必消落位、想吃的菜冲突标注、空手归因；日计划上下文（成人/儿童人数、必消、临时忌口、想吃的菜、餐次勾选、避开窗口）入 Plan 记录；Event 反馈按餐关联（mealSlot 维度：做了没/好吃吗/下次还做/耗时选填，同日同餐重提覆盖）。zod schema 与类型同步，版本兼容策略写进提交说明。
2. **DB 迁移（apps/api/prisma）**：Plan（或 Menu/MenuDish，按现状模型关系定）与 Event/CookLog 扩餐次字段；Dish 扩餐型字段（mealTypes，早餐池判定用）。**迁移必须保现有生产数据**：历史单餐数据回填 dinner/晚餐餐次；写迁移说明（上行/下行）。
3. **apps/api 适配**：生成计划路由改接引擎 DayPlan（输入日计划上下文，输出三餐计划落库）；计划查询按日期返三餐；换一道/换一餐/换一批路由接引擎对应语义；反馈路由按餐记录；清单路由接 list-merger 三餐合并。
4. **list-merger**：三餐食材合并去重一张清单；成人/儿童人数换算凑整；必消标「已有」不删（PD-004）；常备调料不出现；备菜建议分「今晚预处理/明早先做」（规则可简单：含泡/腌/解冻关键词的工序入今晚预处理，早餐相关工序入明早先做）。
5. **种子数据**：早餐池补 5~8 道真实家常早餐（小米粥/鸡蛋饼/豆浆油条级，含用料与分步，mealTypes 标 breakfast），否则早餐永远空手；种子幂等。

## 影响清单

- **引擎**：只读对接（发现引擎 bug 另起提交，不顺手改语义）。
- **契约**：packages/shared schemas+types 全量按上。
- **DB**：prisma 迁移 1 个（餐次/餐型字段），含回填；迁移脚本与说明入库。
- **UI**：不动（下一卡）。**部署**：不动（生产冻结，合并后另行部署卡）。
- **测试**：API 集成测试（三餐生成/按餐反馈覆盖/清单合并/换一餐）+ 迁移测试（旧数据回填验证）+ 现有测试全量适配。
- **文档**：API 契约变更写进提交说明；本卡终态主控补。

## 约束与验收

- 设计规则 2/3/4/6；真实数据原则（不造假兜底）；**test:taboo 必跑**。
- 门禁：pnpm lint、pnpm -r exec tsc --noEmit、pnpm test、pnpm test:taboo 全绿；本地便携 PG（54329）起停按项目规则；a3-reputation B3/B4 已知「本地真实库击穿」问题（T-Q09 审查证实 main 同败）不作为本卡阻断，但不得新增失败。
- 回退：prisma migrate 下行 + git revert；回退步骤写进提交说明并实测。
- 分支 t-q10-contract-db-dayplan，从 main 切（含 T-Q09 引擎？——引擎在分支 t-q09-engine-dayplan 未合并。处理方式：从 t-q09-engine-dayplan 切出本卡分支，两卡一并在合并时审）；推送走代理（故障则记录待推送）。
- L2 流程：完成后主控派 fm-reviewer 独立审查。

完成后回报：契约变更点清单、DB 迁移说明（上行/下行/回填）、API 路由适配表、list-merger 规则、种子早餐清单、门禁输出、回退实测、提交号、推送状态。

## 终态（主控补登，2026-10-18）

- 完成层级：**第 2 层**（已验证）。fm-dev 交付（eabfcd3，46 files +3420/-306，已推 origin）→ fm-reviewer 独立审查**通过**（实跑门禁四项 + 种子幂等双跑 + 迁移/不变量对真库只读取证，报告 evidence/T-Q10/review-report.md）。
- 审查亮点：a3 失败未沿用 T-Q09 旧结论，切基线 67bccb1 同库实跑——基线 B2 红 / 本卡 B2 绿，恰好实证早餐池过滤修复（planService mealTypes 过滤）生效；B3/B4 仍为真实口碑击穿 spec 中性前提，非本卡缺陷（候选挂账）。
- 两项红线敏感操作定性**可接受**：①P3012 手删 _prisma_migrations 行＝本地便携库验证操作 + 提交说明如实记录 + down.sql 标准用法即生产回退路径（生产禁手删）；②9 行 CookLog 清除＝精确只删测试污染行，真实历史行全在（B3/B4 仍败为未误删真实数据的反向实证）。
- 卡外发现：6 道早餐菜曾混入晚餐池，已按缺陷流程修复 + 回归测试；Plan 存量数据不伪造三餐。
- 审查 3 条建议级意见按规则不入账（a3 spec 加固已在候选清单、down.sql 补生产禁手删明文、迁移说明独立成文随阶段 C 清理一并做）。
- 分支自 t-q09-engine-dayplan 切出，两卡**待一并合并 main**（合并时审）；生产冻结未破（镜像仍 1ef04f3）。
