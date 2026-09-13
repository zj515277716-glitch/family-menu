# T-C07-FIX 花生缺口处置（方案 A）产品验收报告（VERIFY）

> 执行：fm-verify｜日期：2026-09-13｜角色：产品验收（独立于 dev/review）
> 上游依据（权威顺序）：任务卡 [T-C07-FIX-task-2026-09-13.md](file:///d:/codex/family-menu/evidence/T-C07-FIX-task-2026-09-13.md) → dev 报告（含勘误）[T-C07-FIX-dev-2026-09-13.md](file:///d:/codex/family-menu/evidence/T-C07-FIX-dev-2026-09-13.md) → 审查报告 [T-C07-FIX-review-2026-09-13.md](file:///d:/codex/family-menu/evidence/T-C07-FIX-review-2026-09-13.md)

## 报告头

| 项 | 内容 |
|---|---|
| 验收对象 | T-C07-FIX 花生过敏缺口处置（方案 A）：seed 补 HARD+INGREDIENT(花生米) 规则 + engine 真实形态回归用例 6 条 + putExclusions 风险评估 |
| 版本基线 | 分支 feat/tp-06-menu-expansion，HEAD=256ba85（git log 实测确认，提交信息「[T-C07] 花生过敏 HARD+TAG 规则口径缺口评估…」） |
| 数据环境 | 本地 PG 17.5，库 family_menu @ 127.0.0.1:54329（DATABASE_URL 于仓库根 .env，连接串脱敏为 postgresql://postgres:***@127.0.0.1:54329/family_menu） |
| 方法学 | 全部验收项在真实仓库/真实库上实际执行：git 只读核验、pnpm 测试独立复跑、pg/Prisma 直连数据库直查、ROLLBACK 事务内风险复现；无 Mock 冒充。验收自建脚本与结果 JSON 落 .workflow-verify/t-c07-fix-verify/（gitignore 内，不随卡提交） |
| 数据安全承诺履行 | 验收全程及结束后 13 表基线与 V3 预期完全一致（V3 首查与 V5 后终态复查两次全 PASS）；全部写操作仅存在于显式 ROLLBACK 事务内；未执行 DROP/TRUNCATE/非回滚事务 deleteMany/migrate reset；未删 $env:TEMP\fm-rds.env、未停本地 PG(54329)、未碰 9222 CDP 浏览器；git 零写操作 |

## V1~V5 逐项验收表

### V1 AC 可追溯 —— 判定 [✓]

采用勘误后口径（18 断言、+9 行纯规则块）逐条核对任务卡 AC1~AC5 与 dev 报告证据链：

| AC | 任务卡要求摘要 | dev 证据核对结论 | verify 独立补强 | 判定 |
|---|---|---|---|---|
| AC1 | seed 恰 +1 行（TAG 行原样）；db:seed EXIT=0；13 表逐行对账仅 ExclusionRule 2→3；快照落盘 | [seed-data.ts](file:///d:/codex/family-menu/apps/api/prisma/seed-data.ts#L46-L54) L46-54 恰 9 行纯规则块（verify 读码确认行块边界，勘误 S-F2 口径成立）；TAG 行在 diff 中零出现（原样）；[result-v1-compare.json](file:///d:/codex/family-menu/.workflow-verify/t-c07-fix/result-v1-compare.json) 12 表 IDENTICAL、ExclusionRule 2→3、+1/-0/~0（verify 读档核对）；rows-before/after.json 落盘；db:seed EXIT=0 | V4 直接核验 diff 内容级（见 V4）；V3 直接核验库内终态（见 V3） | [✓] |
| AC2 | 全链 2/2 拦截 reason 一致 + PUBLISHED 零误伤 + v4/v5 落盘 | [result-v2-e2e.json](file:///d:/codex/family-menu/.workflow-verify/t-c07-fix/result-v2-e2e.json) verify 逐键清点恰 18 个断言键、全 pass=true（勘误 S-F1 的 18 口径与实物吻合）；partB 2/2 blocked、reason 均为「含花生米，命中 HARD 食材禁忌#seed-excl-peanut-ing」；partA 12/12 零误伤；partC 49 中恰拦 2=花生集；result-v4-category.json / result-v5-zeroing.json 落盘 | **verify 独立复跑 v2-e2e-intercept.mjs：EXIT=0，18 断言全 PASS**（真实库 3 规则行 → 装配 targetName/aliases 注入 → dist 生产代码 safetyFilter；运行时留痕 gitHead=256ba85） | [✓] |
| AC3 | engine 真实形态用例通过；pnpm test 全绿；test:taboo 通过 | 新 spec [safety-ingredient-realform.spec.ts](file:///d:/codex/family-menu/packages/engine/test/safety-ingredient-realform.spec.ts) 6 用例（verify 读码确认 it 计数=6，断言精确到 FilterTrace.rule，非弱断言）；test:taboo 目录级过滤口径说明成立（package.json 实测 `test:taboo = vitest run packages/engine/test/`，新增 engine 用例必然计入，AC3 原文「89/89」字面系任务卡撰写期写死计数缺陷，dev 如实更正为 95/95） | V2 独立复跑 397/397 + 95/95（见 V2） | [✓]（口径经勘误后一致） |
| AC4 | putExclusions 源码级分析 + 风险验证不留污染态 + ≥3 处置候选 | 源码定位 [planService.ts L352-370](file:///d:/codex/family-menu/apps/api/src/services/planService.ts#L352-L370)（verify 读码确认 deleteMany+createMany 全量替换、familyId 强制覆盖）；[result-v3-putexclusions.json](file:///d:/codex/family-menu/.workflow-verify/t-c07-fix/result-v3-putexclusions.json) 8 断言全 pass、中间态 seed 全清实证、ROLLBACK 后完好；处置候选 5 条≥3 | V5 独立复现风险（见 V5 场景 1） | [✓] |
| AC5 | 13 表终态基线 + git diff 范围恰=授权 + 新增依赖 0 | 终态对账表（dev 报告第一节）；git diff 范围声明；新增依赖 0 | V3 独立直查 13 表全吻合；V4 独立核验改动面；git status 无 package.json / pnpm-lock.yaml 改动（0 依赖佐证） | [✓] |

结论：AC1~AC5 证据链完整、可追溯，dev/review 结论经独立复核成立；两处勘误（S-F1 断言数 21→18、S-F2 行数口径）与实物核对吻合。

### V2 测试独立复跑（闭环首轮审查 S-F4）—— 判定 [✓]

| 项 | 结果 |
|---|---|
| 验证方式 | 仓库根目录真实执行 pnpm 脚本，独立于 dev 复跑 |
| 命令 1 | `pnpm test` |
| 退出码 | 0 |
| 数字结果 | **Test Files 16 passed (16)；Tests 397 passed (397)**（= 基线 391 + 新增 6）；新 spec `packages/engine/test/safety-ingredient-realform.spec.ts (6 tests)` 全绿 |
| 命令 2 | `pnpm test:taboo` |
| 退出码 | 0 |
| 数字结果 | **Test Files 5 passed (5)；Tests 95 passed (95)** = taboo 18 + feasibility 7 + swap-candidates 13 + score 51 + 新增 6，与 dev 勘误口径精确吻合 |
| 备注 | 复跑后经 V3 直查确认库基线未被测试污染（API 契约测试的 PUT /api/family/exclusions 请求发生在测试自管范围内，未影响生产基线） |

### V3 数据库基线直查 —— 判定 [✓]

| 项 | 结果 |
|---|---|
| 验证方式 | verify 自建只读脚本 [verify-v3-db-baseline.mjs](file:///d:/codex/family-menu/.workflow-verify/t-c07-fix-verify/verify-v3-db-baseline.mjs)（pg Client 直连，零写操作），V5 执行后再次重跑做终态对账 |
| 命令 | `node .workflow-verify\t-c07-fix-verify\verify-v3-db-baseline.mjs` |
| 退出码 | 0（首查与终态复查两次均 0） |
| 数字结果 | 13 表计数全部与预期基线吻合：Dish 49 / Menu 13 / MenuDish 42 / Ingredient 81 / Plan 54 / Event 93 / CookLog 6 / DishIngredient 375 / Family 1 / FamilyRule 1 / **ExclusionRule 3** / Substitution 0 / _prisma_migrations 4；ExclusionRule 三行实测：seed-excl-organ(TAG/SOFT/内脏)、seed-excl-peanut(TAG/HARD/花生)、seed-excl-peanut-ing(INGREDIENT/HARD/targetId=cmtvnuvxvc2oy5fdrzhpxxe69) |
| **口径偏差记录** | 主控验收项 V3 文字中三条 id 写为「seed-excl-peanut-tag、seed-excl-organ-tag、seed-excl-peanut-ing」；**实测与代码口径（seed-data.ts L29/L38/L47）一致为「seed-excl-peanut、seed-excl-organ（无 -tag 后缀）、seed-excl-peanut-ing」**，与主控文字口径 match=false。判定以库内实测 + 源码为准：主控文字中两个「-tag」后缀系笔误（scope=TAG 被误并入 id），非实现缺陷；result JSON 中 idSetComparison 字段已固化该比对 |
| 结果产物 | [result-v3-db-baseline.json](file:///d:/codex/family-menu/.workflow-verify/t-c07-fix-verify/result-v3-db-baseline.json)（终态复查覆盖同文件，均为全 PASS 态） |

### V4 git 改动面核验（复核 review S-1）—— 判定 [✓]

| 项 | 结果 |
|---|---|
| 验证方式 | git 只读命令直接核验（闭环 review S-1「无 shell 直接核验未验证」项） |
| 命令 1 | `git log -1 --oneline` + `git branch --show-current` |
| 结果 | HEAD=256ba85；分支 feat/tp-06-menu-expansion（与验收基线一致） |
| 命令 2 | `git status --short` |
| 结果 | 已跟踪改动恰 1 项：` M apps/api/prisma/seed-data.ts`；untracked 本卡相关恰 2 类：`packages/engine/test/safety-ingredient-realform.spec.ts`（新 spec）+ `evidence/T-C07-FIX-task/dev/review-2026-09-13.md` 三份（verify 报告落盘后亦将入列，共 4 份，属预期）；另有历史遗留 untracked（.pai/、docs/design/、docs/ui-redesign/、tests/、tools/、复盘报告.md 等）非本卡产物，与 review 报告注记一致，未触碰 |
| 命令 3 | `git diff 256ba85 --stat` |
| 结果 | `apps/api/prisma/seed-data.ts | 9 +++++++++，1 file changed, 9 insertions(+)` —— 与勘误后口径「恰 +9 行」精确吻合，S-1 正式闭环 |
| 命令 4 | `git diff 256ba85 -- apps/api/prisma/seed-data.ts`（内容级） |
| 结果 | 恰 9 行纯新增规则块（`{`…`},`，seed-excl-peanut-ing，字段与既有两行同构）；上下文确认 seed-excl-organ 行原样、seed-excl-peanut 行不在 diff 中（未动）；无任何删改行 |

### V5 putExclusions 风险产品面复核 + 空数组行为定论（闭环 review S-2）—— 判定 [✓]

| 项 | 结果 |
|---|---|
| 验证方式 | verify 自建脚本 [verify-v5-putexclusions.mjs](file:///d:/codex/family-menu/.workflow-verify/t-c07-fix-verify/verify-v5-putexclusions.mjs)：场景 1 = pg 层显式 BEGIN→DELETE+INSERT→中间态捕获→ROLLBACK(try/finally)；场景 2 = Prisma interactive transaction（复刻 planService.ts L355-368 事务体 + PUT([]) payload）内实测 `createMany({data:[]})`，throw 信号由 Prisma 自动回滚。**对生产库净写=0**。按主控授权，UI 真实浏览器保存流程（破坏性写操作）以 API/事务层验证替代 |
| 命令 | `node .workflow-verify\t-c07-fix-verify\verify-v5-putexclusions.mjs` |
| 退出码 | 0（13 项断言全 PASS） |
| 场景 1 数字结果 | before=3 条 seed 规则 → 事务内一次 PUT（payload 仅 1 条用户自定义 TAG 规则）后中间态=1 条（ui-sim-tag-verify），**seed 3 条全部消失、INGREDIENT 行=0**（HARD 花生食材级拦截随即失效）→ ROLLBACK 后复核=3 条完好、INGREDIENT=1。**「一次前端保存即清掉 seed 3 规则」语义风险独立复现成立**（dev 结论复核通过） |
| 场景 2 定论（review S-2 待定论项） | **本项目 Prisma 7 下 `createMany({data:[]})` 返回 `{"count":0}`，未抛错（NOOP_RETURN 分支定论）**；deleteMany 后 + 空数组 no-op 后事务内中间态行数=0。**精确机制定论：「PUT([]) 若提交 → deleteMany 生效 + createMany 空插 no-op → 全表清空」成立，不是 500 分支**。zod 层面（PutExclusionsRequestSchema=z.array 无 .min(1)）空数组可通过路由校验到达 service，与 review S-2 已定论部分一致 |
| 零残留确认 | 两场景 ROLLBACK 后各断言 PASS；随后重跑 V3 脚本终态对账：13 表基线与预期完全一致、ExclusionRule=3 且三条 id 完好 |
| 未覆盖面（如实注明） | ① 真实 H5 UI 端到端（浏览器/真机）保存流程未在本验证范围（破坏性写操作，主控授权以事务层替代；不碰 9222 CDP）；② putExclusions 未对运行中 API 实例发真实 HTTP PUT（避免污染本地库）；③ loadRule 网络失败后「静默全清」场景与场景 1 同机制（deleteMany 语义相同），未单独复现 |

## 总判定

**PASS**

- V1~V5 五项验收全部 [✓]，无 [✗]；dev/review 结论（AC 5/5、PASS WITH NOTES 0C/0T/5S）经独立复核成立。
- 关键数字独立实测吻合：+9 行纯规则块、18 断言、397/397、95/95、13 表基线、ExclusionRule=3、putExclusions 风险复现、createMany({data:[]})=no-op 定论。
- 数据基线红线履行：验收前后 13 表两次对账完全一致，对生产库净写=0。

## 遗留与移交项

1. **[已闭环] review S-1**：git 改动面直接核验由本验收 V4 完成（diff stat 恰 +9、改动面恰两项）。
2. **[已闭环] review S-2**：`createMany({data:[]})` 行为已由本验收 V5 场景 2 定论为 no-op（`{"count":0}`），「PUT([]) → 全表清空」机制精确成立；建议主控将该定论回填 dev 报告 §2.2 风险#2 机制描述（文档动作）。zod 层 `.min(1)` 拒绝空数组属契约变更，仍需走主控批准流程，本验收不代改。
3. **[维持移交] putExclusions 处置裁决**：dev 报告 5 候选（推荐短期 1+4+5 / 长期 3）待主控/用户裁决；review S-4（候选 5 适用边界）、S-5（候选 1 UX 弊端）一并纳入决策输入。本验收 V5 实证强化了「不处置则一次保存即归零拦截力」的风险紧迫性。
4. **[维持移交] 主控验收项 V3 文字勘误**：ExclusionRule 三条 id 实测为 seed-excl-peanut / seed-excl-organ / seed-excl-peanut-ing（与代码一致），主控任务书中「seed-excl-peanut-tag / seed-excl-organ-tag」两处 id 带 -tag 后缀系笔误，建议后续任务书修正引用。
5. **[维持移交] review S-3 / dev 卡外发现**：seed-data.ts L3 头注释过期（写「2禁忌」实为 3 条）、seed.ts L218 过期日志（硬编码 "2 exclusions"）、seed 与内容管线跨源引用（新空库该规则惰性）、UI 自建规则有效性缺口、GET exclusions 不回传食材名——均未在本卡处置，建议主控纳入排期评估。
6. **[覆盖边界声明] 真实 UI 验证未做**：H5 真实浏览器/真机端到端（含设置页保存流程、推荐页拦截展示）不在本卡验证范围；若需 UI 级验收请主控另派（需授权破坏性写场景或隔离环境）。

## 验收产物清单（gitignore 内，不随卡提交）

- [verify-v3-db-baseline.mjs](file:///d:/codex/family-menu/.workflow-verify/t-c07-fix-verify/verify-v3-db-baseline.mjs) + [result-v3-db-baseline.json](file:///d:/codex/family-menu/.workflow-verify/t-c07-fix-verify/result-v3-db-baseline.json)（终态复查覆盖，全 PASS）
- [verify-v5-putexclusions.mjs](file:///d:/codex/family-menu/.workflow-verify/t-c07-fix-verify/verify-v5-putexclusions.mjs) + [result-v5-putexclusions-verify.json](file:///d:/codex/family-menu/.workflow-verify/t-c07-fix-verify/result-v5-putexclusions-verify.json)
- 复用 dev 只读脚本复跑佐证：.workflow-verify/t-c07-fix/v2-e2e-intercept.mjs（复跑 EXIT=0，result-v2-e2e.json 为复跑后刷新产物，18 断言全 PASS）

（验收完毕。验收全程未修改任何业务代码、UI 基线或既有 evidence 文件；git 零写操作。）
