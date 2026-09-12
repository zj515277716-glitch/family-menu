# DUP-KEY 一词双食材归属定案与备案（实施阶段）— 开发报告

- **卡代号**：DUP-KEY 一词双食材归属定案与备案（实施阶段）
- **执行**：fm-dev ｜ **日期**：2026-09-13 ｜ **分支**：feat/tp-06-menu-expansion ｜ **HEAD**：f2cdf61（开工时与收尾时一致，未提交）
- **依据**：主控裁决（本任务卡）+ 调查报告 [evidence/DUP-KEY-survey-dev-2026-09-13.md](./DUP-KEY-survey-dev-2026-09-13.md)
- **性质**：数据定案实施——seed-data.ts 恰 2 行 aliases 消歧 + 本地库 seed 生效 + probe 复查 + 四套回归
- **产物**：本报告 + probe 脚本与原始输出（gitignored）：`.workflow-verify/dup-key/verify-fix.mjs`、`verify-fix-result.json`、`post-tp01-counts.mjs`

---

## 0. 改动摘要

**唯一代码改动 = [apps/api/prisma/seed-data.ts](../apps/api/prisma/seed-data.ts) 恰 2 行（按主控裁决逐字执行）**：

| 行 | 改前 | 改后 |
|---|---|---|
| L60（猪肉行） | `aliases: ['五花肉', '瘦肉', '里脊']` | `aliases: ['瘦肉', '里脊']` |
| L71（白糖行） | `aliases: ['冰糖', '砂糖', '白砂糖']` | `aliases: ['砂糖', '白砂糖']` |

效果：「冰糖」全库唯一归属独立冰糖食材（cmtnpn9rn003d0wpgw6ruwoxs）；「五花肉」全库唯一归属独立五花肉食材（cmtvnuvwv1rjg0bby4w5airrr）。matcher 层 1 选边从"依赖无 ORDER BY 物理堆序"变为"唯一持有者确定命中"，堆序翻转风险（调查 F4）随之消除，零代码改动。

零其他仓库改动：matcher.spec.ts 及一切测试/代码文件未动；shared/engine/h5 零改动；无契约变更；未执行 migrate 任何子命令；DB 仅 seed（upsert）与 SELECT。

## 1. 环境与命令台账（命令 + 退出码）

| # | 命令 | 目的 | 退出码 |
|---|---|---|---|
| E0 | `git rev-parse HEAD` / `git status --porcelain` | 开工基线：HEAD=f2cdf61…、无已跟踪文件改动 | 0 |
| E1 | `Test-NetConnection 127.0.0.1 -Port 54329` | PG 在线探测（True，非本卡拉起） | 0 |
| E2 | `pnpm db:seed`（第 1 次） | upsert 覆盖 aliases（AC2） | **0** |
| E3 | `pnpm db:seed`（第 2 次） | 幂等复验（AC2） | **0** |
| E4 | `node .workflow-verify\dup-key\verify-fix.mjs` | probe 复查（仅 SELECT，AC3） | **0**（ALL_PASS=true） |
| E5 | `pnpm exec vitest run apps/api/test/matcher.spec.ts` | matcher.spec 回归（AC4） | **0**，17/17 |
| E6 | `pnpm test` | 根全量回归（AC4） | **0**，391/391 |
| E7 | `pnpm test:taboo` | 禁忌集回归（AC4） | **0**，89/89 |
| E8 | `pnpm --filter @family-menu/api exec tsx src/server.ts`（非阻塞，本卡拉起） | tp01 前置 API server | 运行中，监听 :3000 |
| E9 | `node tests\tp01-mustuse-regression.cjs` | 必消输入真实 HTTP 回归（AC4） | **0**，54 PASS / 0 FAIL |
| E10 | `StopCommand`（杀 E8 进程树）+ `Test-NetConnection 127.0.0.1 -Port 3000` + `Get-Process -Id 13388` | 收尾：杀净本卡进程 | PORT3000_OPEN=**False**，pid 13388 不存在，:3000 零遗留 |
| E11 | `node .workflow-verify\dup-key\post-tp01-counts.mjs` | tp01 后七表收尾计数（仅 SELECT） | 0 |
| E12 | `git status --porcelain` / `git diff --stat` | 收尾：已跟踪改动仅 seed-data.ts 1 文件 | 0 |

环境红线遵守：本地 PG（54329）与所有环境组件未停止/未清理；$env:TEMP\fm-rds.env 未触碰；CDP 浏览器（9222）未杀；仅终止本卡自己拉起的 tsx/server 进程树。临时脚本与输出全部落 `.workflow-verify/dup-key/`（未用 %TEMP%）。

## 2. AC2 证据：seed 两次执行

两次 `pnpm db:seed` 均输出 `Seed data validation passed (shared v0.1 zod schema)` + `Seed completed: 1 family + 1 rule + 2 exclusions + 17 ingredients + 10 dishes + 29 dish-ingredients + 4 menus + 13 menu-dishes.`，退出码均为 0。upsert 覆盖语义下幂等成立：第二次与第一次输出逐字一致，probe（E4）中白糖/猪肉 aliases 为消歧后的值。

## 3. AC3 证据：probe 复查（E4，EXIT=0，ALL_PASS=true）

### 3.1 卡面五项断言

| # | 断言 | 结果 | 数字 |
|---|---|---|---|
| ① | 「冰糖」命中数=1 且 id=独立冰糖食材 | **true** | hitCount=1，id=cmtnpn9rn003d0wpgw6ruwoxs（3 连查 run1/run2/run3 全部一致） |
| ② | 「五花肉」命中数=1 且为独立五花肉食材 id | **true** | hitCount=1，id=cmtvnuvwv1rjg0bby4w5airrr（3 连查一致） |
| ③ | 全库跨食材重复词扫描=0 | **true** | Ingredient 79 行、词元总数=153、唯一词=153、跨食材重复词=**0**（调查时为 2） |
| ④ | Ingredient=79 行数不变 | **true** | 79 |
| ⑤ | 七表基线 | **true** | Dish 48 / Menu 13 / MenuDish 42 / Ingredient 79 / Plan 54 / Event 93 / CookLog 6，逐表等于基线（seed 不触碰 Dish/Menu/DishIngredient/Plan/Event/CookLog 行） |

### 3.2 附加核对（数据面）

- 白糖（seed-ing-sugar）aliases=["砂糖","白砂糖"]，不含「冰糖」=true；猪肉（seed-ing-pork）aliases=["瘦肉","里脊"]，不含「五花肉」=true。
- 独立冰糖食材行存在=true；独立五花肉食材行存在=true。
- 引用层零变动抽查（DishIngredient 引用数与调查基线一致）：冰糖 4、白糖 15、五花肉 3、猪肉 1。
- matcher 对照「大虾」：唯一命中鲜虾 cmtvnuvy9ecb4hyi7yn4qafsz（hitCount=1），T-P05 闭环保持。

### 3.3 观察项（非断言，如实记录）

- 全量 79 行**自然序**在 3 次独立连接查询间存在波动（run2/run3 与 run1 的全量 JSON 序不一致，4 个关键食材相对序位一致）——无 ORDER BY 不承诺行序，与调查 F4 一致，为 PG 真实行为实证。
- **消歧后该波动不再影响 matcher 正确性**：3 连查选边 id 全部稳定（冰糖→独立冰糖、五花肉→独立五花肉）——这正是本卡以数据消歧替代堆序依赖的目的。

## 4. AC4 证据：四套回归数字

| 套件 | 命令 | 结果 | 退出码 |
|---|---|---|---|
| matcher.spec | `pnpm exec vitest run apps/api/test/matcher.spec.ts` | **17 passed (17)**（Test Files 1 passed） | 0 |
| 根全量 | `pnpm test` | **391 passed (391)**（Test Files 15 passed，含 matcher.spec/seed.spec/contract.spec 等） | 0 |
| 禁忌集 | `pnpm test:taboo` | **89 passed (89)**（feasibility 7 + taboo 18 + swap-candidates 13 + score 51） | 0 |
| tp01 | `node tests\tp01-mustuse-regression.cjs` | **54 PASS / 0 FAIL** | 0 |

说明：tp01 卡面记"35 PASS"，脚本 [tests/tp01-mustuse-regression.cjs](../tests/tp01-mustuse-regression.cjs) 为已跟踪文件、本卡零改动（E12 确认非 modified），当前规模 54 项系此前任务追加 T-P05/T-P10 切片所致（输出含 T-P05 全换/鸡歧义、T-P10 R1-R4 等切片），0 FAIL 与卡面要求一致，无异常升级触发。

tp01 运行细节：本卡以 `pnpm --filter @family-menu/api exec tsx src/server.ts` 拉起 server（pid 13388，监听 :3000），回归完成后以 StopCommand 终止，复验 `PORT3000_OPEN=False` 且 pid 13388 不存在——**:3000 零遗留，进程树杀净**。

### tp01 后收尾计数（E11，仅 SELECT）

- Dish 48 / Menu 13 / MenuDish 42 / **Ingredient 79** / CookLog 6 / DishIngredient 365：与基线一致，tp01 未触碰 seed 固有数据行。
- Plan 62（基线 54，+8）、Event 103（基线 93，+10）：增量全部来自 tp01 自身正常推荐用例落库（其输出含多个 planId；异常用例自证"Plan/Event 落库零增量"，如 AC2-b 苦瓜 Plan 57→57、T-P10 R2 Plan 60→60）。属测试预期行为，非 seed 污染。
- 终态 dup 扫描：跨食材重复词=**0** 保持。

## 5. AC 逐条自检表

| AC | 内容 | 自检 | 证据 |
|---|---|---|---|
| AC1 | seed-data.ts 恰 2 行 diff（L60/L71 各删 1 词），git diff --stat 仅此 1 文件；零其他仓库改动 | [✓] | `git diff --stat`：`apps/api/prisma/seed-data.ts | 4 ++--`（2 insertions, 2 deletions），1 file changed；E12 确认已跟踪改动仅此 1 文件，matcher.spec 等未动 |
| AC2 | `pnpm db:seed` 连续 2 次 EXIT=0 | [✓] | §2：两次均 EXIT=0，输出逐字一致（幂等） |
| AC3 | probe 复查五项（冰糖/五花肉/重复词=0/Ingredient=79/七表基线） | [✓] | §3：verify-fix.mjs EXIT=0、ALL_PASS=true；①id=cmtnpn9rn003d0wpgw6ruwoxs ②id=cmtvnuvwv1rjg0bby4w5airrr ③重复词=0 ④79 ⑤七表逐表等于基线；脚本落 .workflow-verify/dup-key/ |
| AC4 | 回归全绿：matcher.spec 17/17 + pnpm test 391/391 + test:taboo 89/89 + tp01 35→54 PASS/0 FAIL + :3000 杀净零遗留 | [✓] | §4：17/17、391/391、89/89 均 EXIT=0；tp01 54 PASS/0 FAIL EXIT=0（54 系脚本当前规模，见说明）；PORT3000_OPEN=False |
| AC5 | 报告落 evidence/DUP-KEY-fix-dev-2026-09-13.md（命令+退出码+数字、diff 摘要、probe 结果、AC 自检表） | [✓] | 即本报告 |

异常升级路径核对：AC4 无任何 FAIL（未触发"停止升级报主控"分支）；probe 无行数偏离基线（§3.1 ⑤）。无卡外发现需移交。

## 6. 未验证项（如实声明）

1. **RDS 未覆盖**：本卡仅本地库（db:seed 生效）+ seed-data.ts 固化；RDS 侧 aliases 消歧按卡面属另立卡范围，未触碰。
2. **「冰糖/五花肉」HTTP 端到端专项未测**：tp01 覆盖西红柿/西蓝花/苦瓜/小番茄/土豆丝/鸡/鸡蛋等词的真实 HTTP 路径，未新增「冰糖」「五花肉」专用 HTTP 用例（卡面未要求新增测试，且红线禁止改动测试文件）；matcher 纯函数层与服务层查询同构性已由调查报告 §5 + 本卡 probe（dist 实现 + 无 ORDER BY 同构查询）实证。
3. **全量自然序跨重启稳定性**：本机 3 连查存在波动（§3.3），消歧后不影响 matcher 结果；如需终局消除行序不确定性需 ORDER BY 代码改动，超出本卡授权范围，未做。

## 7. 交付状态

- 代码改动：seed-data.ts 2 行（未提交，停在工作区待审）。
- 建议提交信息（供主控/审查参考）：`[DUP-KEY] 移除白糖别名冰糖与猪肉别名五花肉，一词双食材归属定案为独立食材`。
- 待主控按流程文档第 6 章步骤 5 核对放行。
