# T-Q10 契约+DB迁移：三餐计划结构（L2）独立审查报告

审查人：fm-reviewer（全部命令实跑取证）｜基线 t-q09-engine-dayplan@67bccb1 → 待审 t-q10-contract-db-dayplan@eabfcd3

## 门禁（实跑退出码）
`pnpm lint`=0；`pnpm -r exec tsc --noEmit`=0；`pnpm test`：**582 过 + 2 败**（a3-reputation B3/B4）；`pnpm test:taboo`=0 **161/161 全绿**；`pnpm check:secrets`=0（0 命中/572 文件）；db:seed 连跑两遍 exit 0。

## a3 基线复核（本卡改了 planService，不能沿用 T-Q09 旧结论，切 67bccb1 同库实跑）
基线码+现库：B2 红（CookLog 0 行——6 道早餐菜混入晚餐组合，锁定纯早餐组合）、B3/B4 绿；本卡码+现库：B2 绿（过滤修复生效）、B3/B4 红（库内真实口碑行击穿"无关组合中性 0.7"对照断言，`expected 1 to be 0.7`）。失败数 2→2 无净增，根因同源（真实数据击穿 spec 中性前提，CURRENT.md 已挂账加固候选），**非本卡代码逻辑缺陷**；基线 B2 红恰好实证本卡早餐池过滤修复的必要性。

## 九项重点结论
1. **红线（手删 _prisma_migrations）**：定性**可接受**——操作发生在本地便携库 54329（生产冻结，镜像仍 1ef04f3 未动）；提交说明如实记录"删 _prisma_migrations 记录行（P3012 限制下的手动下行）"；终态取证迁移表 5 条全 applied、`rolled_back_at:null` 无伪造；down.sql 头注释给标准用法（migrate resolve，生产路径无手删步骤）。缺"生产禁手删"明文，记建议。
2. **真实库操作（9 行 CookLog）**：**通过**——现库 11 行全 dinner、无 NULL、无 2026-10-18 后残留行；2026-09-04~10-07 真实历史行全在（B3/B4 仍因真实口碑败＝未删真实数据的反向实证）；集成测试清理双条件精确（mealSlot in breakfast/lunch 且 cookedAt>=startedAt）。
3. **迁移与回填**：**通过**——上行仅加列+两行 UPDATE 回填 dinner，无 DROP/DELETE；存量 Plan dayPlan/dayContext 恒 NULL 不伪造三餐；down.sql 删新增列保存量；migration-backfill.spec 4 断言对真库全过。
4. **契约对齐**：**通过**——DayPlanSchema 与 engine DayPlanResult 六字段同构（对齐基准 67bccb1）；breaking 全在 v0.12 账本+提交说明声明（旧报文 400 属计划内演进，生产冻结+UI 下一卡重写）。
5. **引擎只读**：**通过**——`git show eabfcd3 -- packages/engine` 零改动；"早餐混晚餐池"修在 API 层（loadPublishedDishViews/loadDishViews 按引擎 inferMealTypes 过滤），附 mealtype-pool.spec 2 回归。
6. **API 语义**：**通过**——换一餐 replanMeal 其他两餐逐字不动（集成测试断言 toEqual）；反馈按餐取最新等效覆盖；GET /plans?date 倒序数组语义正确；11 处 event.create 全带 mealSlot（全天操作 dinner 占位有注释依据）。
7. **list-merger**：**通过**——day-merge.spec 9 例真实覆盖去重/换算凑整/必消优先于常备剔除/prepAdvice 两组仲裁；纯函数与单餐口径并存不互改。
8. **种子**：**通过**——两遍 seed 后 DUP_DISH/DUP_ING/DUP_DI 全空；6 道早餐菜（水煮蛋/鸡蛋饼/小米粥级）mealTypes=['breakfast'] 含用料分步，cuid 食材引用在 seed 清单内定义（全新库 upsert 建行不悬空）。
9. **不变量（第 7 节）**：**通过**——真库取证：targetId 悬空 0、PUBLISHED×HARD 违规 0、taboo 161 全绿（HARD 先于评分）、产物无口令（check:secrets 0 命中）。

## 卡外发现处理
卡外改动仅 publish-dish.ts（+1 行 mealTypes 透传）、safetyCheck mealTypes 字段——均为对接必需且提交说明如实列出，处理妥当。测试适配只增不弱（contract.spec it 53→65，seed.spec 增早餐断言，无 skip/only）。页面未验证（本卡无 UI，不适用）。

## 结论：**通过**

未验证/风险：生产环境未预演（生产冻结、部署另卡，计划内）；a3 spec 失败面随库状态漂移（提交说明"main 同败"表述已过时但无害）。

## 建议级意见（不入账）
1. a3-reputation spec 数据耐受性加固尽快开卡（CURRENT.md 已挂账候选）。
2. down.sql 或部署卡补一行明文"生产回退禁手删 _prisma_migrations 行，走 migrate resolve"。
3. 迁移说明独立成文（上行/下行/回填/生产步骤），勿只散在 SQL 注释+提交说明；packages/shared/dist 入库遗留（红线已列阶段 C 清理）本卡延续提交，随阶段 C 一并清。
