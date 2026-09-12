# DUP-KEY 独立产品验收报告（fm-verify）

- **验收对象**：DUP-KEY 一词双食材归属定案与备案（复跑 + teardown 终验）
- **验收人 / 日期**：fm-verify（独立验收，不复现不通过）/ 2026-09-13
- **版本**：仓库 `d:\codex\family-menu` / 分支 `feat/tp-06-menu-expansion` / HEAD `f2cdf610a8dabd479122bfe58d70e9374708adbe`（f2cdf61）/ 工作区含未提交改动 `apps/api/prisma/seed-data.ts` 2 行（待合并内容）
- **验收方式**：全部为真实命令复跑 + 真实 PG（127.0.0.1:54329）直查/操作；probe 与计数均为只读 SELECT，teardown 仅按白名单 DELETE Plan/Event 两表 tp01 产物行；零 Mock、零库外替代
- **证据目录**：`.workflow-verify/dup-key/verify/`（gitignored 沙箱，dev 轮物证以副本保护）
- **依据**：审查移交清单 V-1→V-3→V-2→V-4（evidence/DUP-KEY-review-2026-09-13.md §五）、PRODUCT-CONFIRMATION 相关裁决、fix 报告台账 E0-E12

## 0. 结论

**PASS（5/5）。** V-1 边界、V-3 teardown 回基线、V-2 probe 复跑、V-4 回归抽查、V-5 收尾环境全部通过，数字与 dev/review 两轮披露零矛盾。审查条件 T-1（tp01 落库未回基线）已由 V-3 解除；T-2（RDS 与 sync-aliases.sh 残留）属另立卡范围不在本验收边界。**建议放行合并。**

## 1. V-1 git 层边界终确认 —— PASS

- **操作**：`git status --short`、`git log -1`、`git diff --stat`、`git diff -- apps/api/prisma/seed-data.ts`、`git branch --show-current`、`git rev-parse HEAD`
- **预期**（按审查 V-1 移交口径）：已跟踪改动恰为 seed-data.ts 2 行（L60 删「五花肉」、L71 删「冰糖」），零其他已跟踪文件越界，HEAD=f2cdf61
- **实际**：
  - status：已跟踪改动仅 ` M apps/api/prisma/seed-data.ts` 一行
  - diff --stat：`apps/api/prisma/seed-data.ts | 4 ++--`，1 file changed，2 insertions / 2 deletions
  - diff 逐字核对：L60 猪肉 `aliases: ['五花肉', '瘦肉', '里脊']` → `['瘦肉', '里脊']`；L71 白糖 `aliases: ['冰糖', '砂糖', '白砂糖']` → `['砂糖', '白砂糖']`，与 fix 报告 §0 改前列逐字一致
  - HEAD=f2cdf610a8dabd479122bfe58d70e9374708adbe，分支 feat/tp-06-menu-expansion
- **证据**：终端输出（EXIT=0×3）；hunk 头 `@@ -57,7 +57,7 @@` / `@@ -68,7 +68,7 @@` 与 L60/L71 对位吻合
- **边界披露**：untracked 文件（`?? `）含 .pai/、docs/design/preview.html+md、docs/ui-redesign/、evidence/DUP-KEY-{survey,fix,review}-2026-09-13.md（本卡产物）、tests/engine-perf.mjs、tests/step08-deploy-validate.cjs、tools/append-log.mjs、tools/fm-*.tar.gz、tools/preview-server.mjs、复盘报告.md。untracked 不属"工作区 vs HEAD 已跟踪改动"，不构成越界；其中非本卡产物项（docs/design、tools 打包等）系历史遗留 untracked，如实备案。`.workflow-verify/` 在 .gitignore L26（四角色验收沙箱，不入库）
- **判定**：PASS

## 2. V-3 teardown 回基线（先于 V-2 执行）—— PASS

- **操作**（两步，脚本落 `.workflow-verify/dup-key/verify/`）：
  1. `node .workflow-verify\dup-key\verify\recon.mjs`（只读侦察：水位法识别 tp01 产物，生成精确白名单）
  2. `node .workflow-verify\dup-key\verify\delete-tp01.mjs`（白名单三重核对 → 先 Event 后 Plan 精确 DELETE → 回基线断言）
- **预期**：仅删 Plan/Event 两表 tp01 产物行（Plan -8 / Event -10），七表回 {Dish:48, Menu:13, MenuDish:42, Ingredient:79, Plan:54, Event:93, CookLog:6}；Ingredient 及 aliases 零触碰；禁止 seed 重放与任何其他写操作
- **白名单识别依据（三重互证）**：
  1. **时间水位**：top8 Plan 与 top10 Event 的 createdAt 全部为 2026-09-13T04:35:10(+08)（dev 轮 tp01 执行时刻，cuid 前缀 `cmtyugl*`）；第 9/11 名回落 2026-09-06 17:04:09，断档 7 天
  2. **特征吻合**：8 个 Plan 的 context.mustUse 恰为 tp01 脚本 8 次正常推荐（西红柿/西蓝花/[]空手/小番茄/土豆丝/鸡蛋/土豆丝/西红柿；AC1-c 组合空手不建 Plan）；10 条 Event 恰为 8×GENERATE + 2×SWAP_MENU（planService.ts L439-443/L577-581），且 planId 全部指向白名单 Plan（鸡蛋 Plan 挂 1 GENERATE + 2 SWAP）
  3. **计数吻合**：62-8=54、103-10=93，与审查 T-1 披露一致
- **实际**（19 PASS / 0 FAIL，EXIT=0）：
  - 删除前白名单核对 7 条全 PASS：Plan 白名单=8/8、Event 白名单=10/10、按 planId 挂靠恰=10/10、id∪planId 联合集恰=10/10（白名单完备）、水位上界之上 Plan 恰 8 行 / Event 恰 10 行（水位法完整性）、白名单 createdAt 均为 dev 轮时刻
  - 删除：Event 10/10、Plan 8/8，残留（白名单行+挂靠引用）= 0
- **teardown 前后七表计数**：

  | 表 | teardown 前 | teardown 后 | 基线 | 判定 |
  |---|---|---|---|---|
  | Dish | 48 | 48 | 48 | ✓ 零变化 |
  | Menu | 13 | 13 | 13 | ✓ 零变化 |
  | MenuDish | 42 | 42 | 42 | ✓ 零变化 |
  | Ingredient | 79 | 79 | 79 | ✓ 零变化 |
  | Plan | **62** | **54** | 54 | ✓ 回吐恰 -8 |
  | Event | **103** | **93** | 93 | ✓ 回吐恰 -10 |
  | CookLog | 6 | 6 | 6 | ✓ 零变化 |
  | REL（Dish.imageUrl LIKE '/images/%'） | 29 | 29 | 29 | ✓ 不动 |

- **消歧态保持抽查**：白糖（seed-ing-sugar）aliases=["砂糖","白砂糖"]（不含冰糖）✓；猪肉（seed-ing-pork）aliases=["瘦肉","里脊"]（不含五花肉）✓；Ingredient=79 行不变 ✓
- **红线遵守**：本次 teardown 仅 `DELETE FROM "Event"` / `DELETE FROM "Plan"` 白名单行；零 UPDATE/INSERT/CREATE/DROP/ALTER；零 migrate/db:seed；Ingredient 零触碰
- **证据**：`recon-result.json`、`teardown-result.json`（含删除的精确 id 清单 8+10 条）落沙箱
- **判定**：PASS

## 3. V-2 probe 独立复跑（V-3 之后执行）—— PASS

- **操作**：先以 `Copy-Item` 快照 dev 轮物证为 `verify/verify-fix-result-dev-baseline.json`（复跑会覆盖原文件），再 `node .workflow-verify\dup-key\verify-fix.mjs`
- **预期**：ALL_PASS=true（dup=0；冰糖 hitCount=1→cmtnpn9rn003d0wpgw6ruwoxs；五花肉 hitCount=1→cmtvnuvwv1rjg0bby4w5airrr；七表基线断言；引用分布 冰糖4/白糖15/五花肉3/猪肉1）；退出码 0；数字与 dev 轮一致（orderStable 波动属设计内披露不算 FAIL）
- **实际**（EXIT=0，ALL_PASS=true）：

  | 断言 | 复跑结果 | dev 轮基线 | 一致 |
  |---|---|---|---|
  | 七表 {48,13,42,79,54,93,6} | 全等 true | 全等 true | ✓ |
  | dup 扫描 | 79 行 / 153 词元 / 153 唯一 / **0 重复** | 79 / 153 / 153 / 0 | ✓ |
  | 冰糖 | hitCount=1 → cmtnpn9rn003d0wpgw6ruwoxs | 同 | ✓ |
  | 五花肉 | hitCount=1 → cmtvnuvwv1rjg0bby4w5airrr | 同 | ✓ |
  | 大虾（对照） | hitCount=1 → cmtvnuvy9ecb4hyi7yn4qafsz | 同 | ✓ |
  | 白糖/猪肉 aliases | [砂糖,白砂糖] / [瘦肉,里脊] | 同 | ✓ |
  | 引用分布 DishIngredient | 冰糖4 / 白糖15 / 五花肉3 / 猪肉1 全 match | 同 | ✓ |
  | 3 连查选边稳定（matchResultStable） | true | true | ✓ |
  | 3 连查全序一致（orderStable，仅记录非断言） | false（indices 恒 6/28/15/5，全量序波动） | false | ✓ 设计内披露 |
  | ALL_PASS | **true** | true | ✓ |

- **证据**：终端输出全量（EXIT=0）；复跑写出的 verify-fix-result.json 与 dev 基线快照同置沙箱可 diff 比对
- **判定**：PASS（复跑数字与 dev 轮零矛盾，未触发"停止报主控"分支）

## 4. V-4 回归数字抽查 —— PASS

- **操作**：`node .workflow-verify\dup-key\verify\runner.mjs "pnpm test" pnpm-test`、`node .workflow-verify\dup-key\verify\runner.mjs "pnpm test:taboo" pnpm-taboo`（runner 为规避 PS 5.1 长输出丢行缺陷的 node execSync 落盘封装，MIGRATE-CHK-FIX 卡教训；两套均为真实复跑）
- **实际**：

  | 套件 | 结果 | 退出码 | dev 轮台账 | 一致 |
  |---|---|---|---|---|
  | `pnpm test` | Test Files **15 passed (15)**；Tests **391 passed (391)**；无 skipped | **0** | E6：391/391 EXIT=0 | ✓ |
  | `pnpm test:taboo` | Test Files 4 passed (4)；Tests **89 passed (89)**（feasibility 7 + taboo 18 + swap-candidates 13 + score 51） | **0** | E7：89/89 EXIT=0 | ✓ |
  | tp01 复跑 | **豁免口径（不复跑）**：采纳 dev 轮 E9 = 54 PASS / 0 FAIL EXIT=0 | - | E9：54 PASS | ✓ |

- **tp01 豁免口径理由**（三条件并列成立）：
  1. dev 轮 tp01（E9，04:35:10）即在本卡 seed 修复生效后的库上真实执行（时序：E2/E3 db:seed → E4 probe 04:33:41 → E8 server → E9 tp01 → E11 收尾计数），其 54 PASS 本身就是消歧后状态的真实复跑结果，无信息损失；
  2. tp01 用例词集（西红柿/西蓝花/苦瓜/小番茄/土豆丝/鸡/鸡蛋）与本次删除的 2 个别名（冰糖/五花肉）零交集，matcher 算法语义零耦合已由 review R3 [✓] + matcher.spec F6 锚定（17/17 含于本次 391 内复跑通过），且本验收 V-2 已在真库直接覆盖数据面与选边实证；
  3. 复跑必然再 +8/+10 落库并需第二次 teardown（两轮 teardown 数字：第 1 轮 62→54/103→93 已完成；第 2 轮 54→62/93→103→54/93），为验收平添两轮 DB 写负载而零信息增量，违背「除 V-3 规定删除外零写操作」红线精神。
- **库扰动佐证**：V-4 两套复跑后终态复查（`final-check.mjs`，EXIT=0）七表仍为 {48,13,42,79,54,93,6}+DishIngredient 365，dup=0，消歧态保持——pnpm test/test:taboo 零库扰动
- **证据**：`pnpm-test-output.txt`/`pnpm-test-exit.txt`、`pnpm-taboo-output.txt`/`pnpm-taboo-exit.txt` 落沙箱
- **判定**：PASS

## 5. V-5 收尾环境 —— PASS

- **操作**：`node .workflow-verify\dup-key\verify\final-check.mjs` + `Get-NetTCPConnection`（-LocalPort 3000/54329/9222 -State Listen）
- **实际**：
  - `PORT3000_LISTEN=0`：:3000 零遗留监听（本验收全程未拉起任何 server；dev 轮 E8/E10 已杀净）
  - `PORT54329_LISTEN=2`：本地 PG 在线保持（未停止、未清理，红线遵守）
  - `PORT9222_LISTEN=0`：CDP 端口现状观测（本验收全程未启动、未终止、未触碰任何浏览器/进程，仅 TCP 状态只读观测）
  - 终态库：EXIT=0，七表基线 + 消歧态 + dup=0 全部保持
- **判定**：PASS

## 6. 环境与 DB 红线遵守声明

- 未停止/未清理本地 PG（54329）——验收后仍在线（LISTEN=2）
- 未触碰 `$env:TEMP\fm-rds.env`；未杀 CDP 浏览器（9222）；全程仅观测未杀任何进程
- DB 写操作仅 V-3 规定的 Plan/Event 两表白名单 DELETE（8+10 行），零 UPDATE/INSERT/CREATE/DROP/ALTER，零 migrate/db:seed
- 临时脚本与输出全部落 `.workflow-verify/dup-key/verify/`（未用 %TEMP%）；无真实用户数据落盘（库内均为种子/测试数据）
- 未修改任何业务代码或测试文件；沙箱新增脚本 6 个（recon.mjs / delete-tp01.mjs / runner.mjs / final-check.mjs + 输出 8 个）均为验收辅助，属 gitignored 沙箱范围

## 7. 覆盖边界与未验证项

- **已覆盖**：git diff 边界（V-1）；tp01 产物的精确识别与清理、七表基线与消歧态保持（V-3）；probe 五断言 + 引用分布 + matcher 选边 3 连查真库复跑（V-2）；pnpm test 391/391 与 taboo 89/89 真实复跑（V-4）；端口与库终态（V-5）
- **未覆盖（如实声明）**：
  1. tp01 复跑采用豁免口径（理由见 V-4），未在本验收会话内第三次执行 tp01（dev 轮消歧后库 54 PASS 已采纳）；
  2. RDS 侧 aliases 状态不可达未验证（审查 T-2 另立卡范围，不阻塞本地合并）；
  3. matcher.spec 17/17 未单独复跑（其含于 pnpm test 391 全量复跑内，无需重复）；
  4. 「冰糖/五花肉」HTTP 端到端专项用例不存在（fix 报告 §6.2 同口径，matcher 纯函数层与服务层同构性已由 probe 实证，卡面未要求新增测试）；
  5. untracked 非本卡产物文件（docs/design、tools 打包等）未深究来历，仅按"非已跟踪改动"口径备案。

## 8. 验收产物清单（.workflow-verify/dup-key/verify/）

recon.mjs、recon-result.json（水位侦察+白名单）、delete-tp01.mjs、teardown-result.json（teardown 前后计数+删除 id 清单）、verify-fix-result-dev-baseline.json（dev 轮 probe 数字快照）、runner.mjs、pnpm-test-output.txt、pnpm-test-exit.txt、pnpm-taboo-output.txt、pnpm-taboo-exit.txt、final-check.mjs

**最终结论：V-1~V-5 全部 PASS，审查条件 T-1 已解除，DUP-KEY 具备合并放行条件（T-2 另立卡跟进）。**
