# DUP-KEY 独立技术审查报告（fm-reviewer）

- 审查对象：DUP-KEY 一词双食材归属定案与备案（调查+实施两阶段）
- 仓库 / 分支 / HEAD：`d:\codex\family-menu` / `feat/tp-06-menu-expansion` / `f2cdf61`（fix 报告 E0 台账口径）
- 审查人 / 日期：fm-reviewer（工具级只读、静态取证、数值复算移交 fm-verify）/ 2026-09-13
- 落盘说明：本报告由审查会话全文交付，主控按原文落盘至 evidence/DUP-KEY-review-2026-09-13.md（历史报告不改写原则下主控未作任何内容改动）

## 一、结论

**有条件通过。** 阻塞级（C）0 项；条件级（T）2 项；建议级（S）3 项。

核心修复（seed-data.ts 删除 2 个别名）经静态取证与多源互证成立：改动边界、裁决依据、F6 测试零耦合、probe 方法论、两报告数字一致性均通过。但存在 2 项必须在合并/收尾前满足的条件：tp01 落库未回基线（T-1）、RDS 与 sync-aliases.sh 残留未处置（T-2）。

## 二、审查边界与方法

- 只读边界：未修改任何业务文件、未跑测试、未触 DB；无 shell，git 层验证不可独立执行（移交 V-1）。
- 方法：静态取证 + 多源交叉互证（工作区文件 / 历史开发报告 / 两个运行时 JSON / 契约与引擎代码 / 运维脚本）。
- 历史报告不改写原则适用：发现失实仅备案勘误（S-2）。
- 证据链说明：HEAD 与分支未推送远端（GitHub MCP Not Found），git diff 独立验证以仓库内四重交叉证据替代，终确认移交 verify。

## 三、逐审查点判定

### R1 diff 边界 —— [✓]（附移交备注）

- 工作区现状与 fix 报告 §0 改后列逐字一致：[seed-data.ts:60](file:///d:/codex/family-menu/apps/api/prisma/seed-data.ts#L60) 猪肉 aliases `['瘦肉','里脊']`（删「五花肉」）；[seed-data.ts:71](file:///d:/codex/family-menu/apps/api/prisma/seed-data.ts#L71) 白糖 aliases `['砂糖','白砂糖']`（删「冰糖」）。
- 改前三方互证：T-P05-dev 历史别名清单 [T-P05-dev-2026-09-11.md:62](file:///d:/codex/family-menu/evidence/T-P05-dev-2026-09-11.md#L62)、[L66](file:///d:/codex/family-menu/evidence/T-P05-dev-2026-09-11.md#L66)（猪肉：五花肉/瘦肉/里脊；白糖：冰糖/砂糖/白砂糖）；调查期 [result.json](file:///d:/codex/family-menu/.workflow-verify/dup-key/result.json)（155 词元/153 唯一/重复词 2，即改前 DB 状态）；[sync-aliases.sh:28](file:///d:/codex/family-menu/tools/sync-aliases.sh#L28)、[L36](file:///d:/codex/family-menu/tools/sync-aliases.sh#L36) 旧别名旁证。
- 改后 DB 生效：[verify-fix-result.json](file:///d:/codex/family-menu/.workflow-verify/dup-key/verify-fix-result.json) probes 白糖行 aliases=[砂糖,白砂糖]、猪肉行=[瘦肉,里脊]；生效机制为 seed upsert 语义 [seed.ts:132-141](file:///d:/codex/family-menu/apps/api/prisma/seed.ts#L132-L141)（L137 `update: { aliases: ing.aliases }`，重跑即覆盖）。
- 备注：无 shell，「恰 1 文件 2 行零越界」不可独立复跑 → 移交 V-1 git 层终确认。

### R2 裁决依据 —— [✓]

- 引用分布 冰糖 4 / 白糖 15 / 五花肉 3 / 猪肉 1 三方互证：survey §3.1-3.3（[L58-59](file:///d:/codex/family-menu/evidence/DUP-KEY-survey-dev-2026-09-13.md#L58-L59)、[L65-88](file:///d:/codex/family-menu/evidence/DUP-KEY-survey-dev-2026-09-13.md#L65-L88)）；probe 引用抽查 [verify-fix.mjs:143-148](file:///d:/codex/family-menu/.workflow-verify/dup-key/verify-fix.mjs#L143-L148)（`[冰糖,4],[白糖,15],[五花肉,3],[猪肉,1]`，result checks 全 match）；seed DI 独立计数 seed-ing-pork 恰 1 条（seed-di-003）、seed-ing-sugar 恰 3 条（seed-di-005/012/019）。
- 「零错挂」证据支撑：[result.json](file:///d:/codex/family-menu/.workflow-verify/dup-key/result.json) baselineCompare `{comparedRows:107, exactNameMatch:107, unmatched:0}` + survey F2（[§3.4](file:///d:/codex/family-menu/evidence/DUP-KEY-survey-dev-2026-09-13.md#L92-L103)）。
- 裁决方向自洽：冰糖归独立冰糖、五花肉归独立五花肉，survey [L145-146](file:///d:/codex/family-menu/evidence/DUP-KEY-survey-dev-2026-09-13.md#L145-L146) 理由成立；大虾 hitCount=1 维持 T-P05 闭环零动作。
- 备注：引用分布属 DB 查询结果，本审查静态复核了 seed DI 计数与 probe 断言的一致性，运行库全量复算由 V-2 probe 复跑覆盖。

### R3 matcher.spec F6 复刻测试与 seed 零耦合 —— [✓]

- [matcher.spec.ts:2-4](file:///d:/codex/family-menu/apps/api/test/matcher.spec.ts#L2-L4) 头注「零 IO，不依赖 DB」；[L6](file:///d:/codex/family-menu/apps/api/test/matcher.spec.ts#L6) 唯一 import 为 matcher 本体；[L8-19](file:///d:/codex/family-menu/apps/api/test/matcher.spec.ts#L8-L19) 纯内存 CANDIDATES；[L15-17](file:///d:/codex/family-menu/apps/api/test/matcher.spec.ts#L15-L17) F6 场景；[L40-43](file:///d:/codex/family-menu/apps/api/test/matcher.spec.ts#L40-L43) 断言 `expect(r.ids).toEqual(['ing-sugar'])` 锚定「先到先得」语义（[must-use-matcher.ts:61-72](file:///d:/codex/family-menu/apps/api/src/utils/must-use-matcher.ts#L61-L72) `if (!exactByKey.has(...)) set`；[L79-85](file:///d:/codex/family-menu/apps/api/src/utils/must-use-matcher.ts#L79-L85) 层 1 命中即短路）。
- fix 报告 E12 确认 matcher.spec 未改动。零耦合成立。
- 说明：F6 合成场景注册序（白糖 alias 先到）与消歧后真实库（独立冰糖唯一持有）方向相反，但 F6 锚定的是算法语义而非 seed 数据；消歧后真实库无双持有者、结果与遍历序无关——零耦合正是设计目的，不构成问题。

### R4 语义回归风险 —— [✗] → 条件级 T-2

- Substitution 表：`apps/api/src` 大小写不敏感 grep "substitution" 零命中 → 运行时零引用，非活路径。
- content-pipeline：[import.ts:179](file:///d:/codex/family-menu/tools/content-pipeline/src/import.ts#L179)、[L227](file:///d:/codex/family-menu/tools/content-pipeline/src/import.ts#L227) 的 aliases 源于自有输入 JSON（[L18](file:///d:/codex/family-menu/tools/content-pipeline/src/import.ts#L18)、[L69](file:///d:/codex/family-menu/tools/content-pipeline/src/import.ts#L69) 输入类型），tc05 基线 107 行仅 ing_name，无对已删别名的依赖。
- **关键发现**：[sync-aliases.sh:28](file:///d:/codex/family-menu/tools/sync-aliases.sh#L28)、[L36](file:///d:/codex/family-menu/tools/sync-aliases.sh#L36) 仍持旧别名（猪肉含五花肉、白糖含冰糖），[L2](file:///d:/codex/family-menu/tools/sync-aliases.sh#L2) 注明面向生产库补齐；[L59](file:///d:/codex/family-menu/tools/sync-aliases.sh#L59)+[L67](file:///d:/codex/family-menu/tools/sync-aliases.sh#L67) 纯增量合并**永不删除**（重跑不会撤销本地修复，但清单与 seed-data.ts 口径分叉）；[L45-53](file:///d:/codex/family-menu/tools/sync-aliases.sh#L45-L53) owner map 冲突自检（WARN pre-existing dup）+ [L62-63](file:///d:/codex/family-menu/tools/sync-aliases.sh#L62-L63) CONFLICT SKIP 构成安全网；[L75-94](file:///d:/codex/family-menu/tools/sync-aliases.sh#L75-L94) 面向生产容器/域名。**两份开发报告均未披露此残留。**
- 关联：CURRENT.md ①-5 记录 RDS 于 2026-09-12 重放 65 食材 upsert，先于本卡修复 → RDS 大概率仍持 dup（本审查无法连接 RDS，未验证）。

### R5 probe 方法论充分性 —— [✓]

- [verify-fix.mjs](file:///d:/codex/family-menu/.workflow-verify/dup-key/verify-fix.mjs) 口径充分：[L29-34](file:///d:/codex/family-menu/.workflow-verify/dup-key/verify-fix.mjs#L29-L34) 真实 dist 编译产物 matcher + norm 同构 + 双 ID 指定；[L47-48](file:///d:/codex/family-menu/.workflow-verify/dup-key/verify-fix.mjs#L47-L48) 七表基线 EXPECTED；[L52](file:///d:/codex/family-menu/.workflow-verify/dup-key/verify-fix.mjs#L52) 无 ORDER BY 同构扫描（与 [planService.ts:167](file:///d:/codex/family-menu/apps/api/src/services/planService.ts#L167) 运行时查询同构）；[L87-88](file:///d:/codex/family-menu/.workflow-verify/dup-key/verify-fix.mjs#L87-L88) whiteSugarNoBingtang / porkNoWuhua；[L101-121](file:///d:/codex/family-menu/.workflow-verify/dup-key/verify-fix.mjs#L101-L121) 3 连查；[L127-137](file:///d:/codex/family-menu/.workflow-verify/dup-key/verify-fix.mjs#L127-L137) 五断言聚合（[L134](file:///d:/codex/family-menu/.workflow-verify/dup-key/verify-fix.mjs#L134) orderStableAcross3Runs 显式仅记录、不参与 ALL_PASS；matchResultStableAcross3Runs 计入）；[L143-148](file:///d:/codex/family-menu/.workflow-verify/dup-key/verify-fix.mjs#L143-L148) 引用抽查；[L152-161](file:///d:/codex/family-menu/.workflow-verify/dup-key/verify-fix.mjs#L152-L161) ALL_PASS 聚合正确；[L165](file:///d:/codex/family-menu/.workflow-verify/dup-key/verify-fix.mjs#L165) `if (!allPass) process.exit(2);` 防呆（勘误：exit 2 实为 L165，非前记 L164）。
- 序波动实证：调查时点 indices 6/31/15/20 vs probe run1 6/28/15/5，而 resolvedId 恒定（冰糖 `cmtnpn9rn003d0wpgw6ruwoxs`、五花肉 `cmtvnuvwv1rjg0bby4w5airrr`）；run2/run3 orderIdenticalToRun1=false 如实记录且 matchResultStable=true → 消歧后唯一持有者使 matcher 选边与遍历序无关，**行序波动不再构成正确性风险**。fix 报告 [§3.3 观察项](file:///d:/codex/family-menu/evidence/DUP-KEY-fix-dev-2026-09-13.md#L69-L70) 披露口径与证据一致。

### R6 残留与移交 —— ①[✗]→T-1　②[✓]　③[✓]（附 S-1）

- ① teardown：fix 报告 [L88（E11）](file:///d:/codex/family-menu/evidence/DUP-KEY-fix-dev-2026-09-13.md#L88) 披露 Plan 54→62(+8)/Event 93→103(+10) 未 teardown，披露如实；但 CURRENT.md [L74/76/80/88/90](file:///d:/codex/family-menu/CURRENT.md#L74-L90) 显示「teardown 七表回基线 48/13/42/79/54/93/6」为多卡一贯惯例，本卡未执行且未指派清理 → **T-1**。
- ② 35 PASS vs 54 PASS 数字演进：[tp01-mustuse-regression.cjs:251](file:///d:/codex/family-menu/tests/tp01-mustuse-regression.cjs#L251)「既有 17 断言保持原样」+18=35、[L400](file:///d:/codex/family-menu/tests/tp01-mustuse-regression.cjs#L400)「既有 35 断言保持原样」+19=54；CURRENT.md [L70](file:///d:/codex/family-menu/CURRENT.md#L70)（T-P05 35/35）→ [L71](file:///d:/codex/family-menu/CURRENT.md#L71)（T-P10 54 PASS）；fix 报告 [L81](file:///d:/codex/family-menu/evidence/DUP-KEY-fix-dev-2026-09-13.md#L81) 说明「54 系脚本当前规模」。17+18=35、35+19=54 算术自洽，演进披露属实。
- ③ RDS 另立卡：fix 报告 [§6 未验证项](file:///d:/codex/family-menu/evidence/DUP-KEY-fix-dev-2026-09-13.md#L103-L107) 含 RDS 未覆盖、移交在案；但 CURRENT.md [L84](file:///d:/codex/family-menu/CURRENT.md#L84) 挂账条目仍为旧口径（「一词双食材归属备案（大虾/冰糖）」），未反映本卡进展与姜/蒜/葱系剩余项 → **S-1**。

### R7 调查报告与实施报告数字一致性 —— [✓]

- 重复词 2→0：result.json ac1（155 词元/153 唯一/dup 2，改前）vs verify-fix-result.json dupScan（rows=79 / unique=153 / dup=0，改后）；155−2=153 算术自洽。
- 79 行不变：dupScan Ingredient=79 与基线一致（消歧仅改 aliases 数组，不增删食材行）。
- 两报告（survey [L35](file:///d:/codex/family-menu/evidence/DUP-KEY-survey-dev-2026-09-13.md#L35)、fix [§0](file:///d:/codex/family-menu/evidence/DUP-KEY-fix-dev-2026-09-13.md#L13-L22)）与两 JSON 数字全一致。

## 四、问题清单

**阻塞级（C）**：无。

**条件级（T）**：
- **T-1** tp01 落库未回基线：当前库 Plan 62/Event 103（tp01 产物）。要求 verify 收尾时执行七表 teardown 回基线 {Dish:48, Menu:13, MenuDish:42, Ingredient:79, Plan:54, Event:93, CookLog:6}；teardown 范围须确认不含 Ingredient 删除或 seed 重放，完成后复核 Ingredient=79 且白糖/猪肉 aliases 保持消歧后状态。
- **T-2** RDS 与 sync-aliases.sh 残留：另立卡须包含 ① RDS aliases 消歧（与本地同口径：猪肉删「五花肉」、白糖删「冰糖」）；② [sync-aliases.sh:28/36](file:///d:/codex/family-menu/tools/sync-aliases.sh#L28) 清单与 seed-data.ts 对齐，或书面认定其 owner-map 冲突自检（WARN + CONFLICT SKIP）作为安全网充分并注明两份口径差异；③ 引用 [开发日志.md:1787](file:///d:/codex/family-menu/开发日志.md#L1787) 备案时按勘误口径——resolveMustUseIds 现行为「先到先得 + 层 1 命中短路」，TP-08 备案中「Map 后写覆盖」表述已过时（调查 F3 已证）。

**建议级（S）**：
- **S-1** 更新 [CURRENT.md:84](file:///d:/codex/family-menu/CURRENT.md#L84) 挂账条目：大虾/冰糖/五花肉已由本卡闭环，姜/蒜/葱系同型词仍在挂账，条目应反映最新状态。
- **S-2** survey 报告 [L46](file:///d:/codex/family-menu/evidence/DUP-KEY-survey-dev-2026-09-13.md#L46)、[L138](file:///d:/codex/family-menu/evidence/DUP-KEY-survey-dev-2026-09-13.md#L138) 引用「开发日志 L1786」实为 L1787（±1 行号偏差）。历史报告不改写，仅备案勘误。
- **S-3** [planService.ts:167](file:///d:/codex/family-menu/apps/api/src/services/planService.ts#L167) 无 ORDER BY 的 findMany()：消歧后正确性已与序无关（R5 实证），建议挂账做防御性排序评估（跨会话返回序确定性、排查成本）。

## 五、移交 verify 清单（执行时序：V-1 → V-3 → V-2 → V-4）

- **V-1 git 层边界终确认**：`git status` + `git diff` 复核改动恰为 apps/api/prisma/seed-data.ts 两行（L60 删「五花肉」、L71 删「冰糖」），HEAD=f2cdf61，无其他文件越界。（reviewer 无 shell，未独立复跑）
- **V-3 teardown 执行（必须先于 V-2）**：七表回基线 {Dish:48, Menu:13, MenuDish:42, Ingredient:79, Plan:54, Event:93, CookLog:6}；完成后确认 Ingredient=79 且 aliases 为消歧后状态。
- **V-2 probe 独立复跑（时序注意：必须先完成 V-3）**：当前库若仍为 tp01 后 Plan 62/Event 103，probe 的七表基线断言（EXPECTED Plan 54/Event 93）会误报失败；先 V-3 再复跑 verify-fix.mjs，核对 ALL_PASS=true 且 dup=0。
- **V-4 回归数字抽查**：抽验 fix E5-E7 台账（17/17、391/391、89/89）至少一组真实复跑；如复跑 tp01（54 断言）将再次 +8/+10 落库，复跑后须再次执行 V-3 teardown，或采用豁免口径记录。

## 六、未验证项声明

- git diff 边界独立复跑：未验证（无 shell）→ V-1。
- probe 复跑 / teardown / tp01 复跑：未验证 → V-2/V-3/V-4。
- RDS 当前状态：未验证（无法连接）→ T-2 另立卡处置。
- 引用分布全量复算：静态复核了 seed DI 计数与 probe 断言一致性；DB 全量复算未独立执行 → V-2 覆盖。

**最终结论：有条件通过。解除 T-1、T-2 后方可合并。**
