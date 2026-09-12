# DUP-KEY 调查报告 — 一词双食材归属调查备案（调查阶段，只读）

- **卡代号**：DUP-KEY 一词双食材归属调查备案（调查阶段）
- **执行**：fm-dev ｜ **日期**：2026-09-13 ｜ **分支**：feat/tp-06-menu-expansion ｜ **HEAD**：f2cdf61
- **性质**：纯只读调查（仅 SELECT，零代码改动，零写副作用；未启 :3000 API server；未跑回归测试——无代码改动）
- **产物**：本报告 + 实验脚本与原始输出（gitignored）：`.workflow-verify/dup-key/survey.mjs`、`survey.mjs 运行输出 result.json`、`match-probe-wuhua.mjs`、`wuhua-result.json`
- **归属裁决权**：主控。本报告只给事实与建议方向，不拍板。

---

## 0. 环境与命令台账（命令 + 退出码）

| # | 命令 | 目的 | 退出码 |
|---|---|---|---|
| E1 | `Test-NetConnection -ComputerName 127.0.0.1 -Port 54329 -InformationLevel Quiet` | 探测本地便携 PG 在线 | 0（返回 True，PG 已在线，未由本卡启动） |
| E2 | `node .workflow-verify\dup-key\survey.mjs` | AC1/AC2/AC3/AC4 主调查（仅 SELECT） | 0 |
| E3 | `node .workflow-verify\dup-key\match-probe-wuhua.mjs` | AC4 补充：「五花肉」选边探针（仅 SELECT） | 0 |

脚本真实性说明：matcher 直接 `import` 编译产物 [apps/api/dist/utils/must-use-matcher.js](file:///d:/codex/family-menu/apps/api/dist/utils/must-use-matcher.js)（与 [src 源码](file:///d:/codex/family-menu/apps/api/src/utils/must-use-matcher.ts)逐行一致，已人工比对）；候选序用 `SELECT id, name, aliases FROM "Ingredient"` **无 ORDER BY**，与 [planService.ts L167](file:///d:/codex/family-menu/apps/api/src/services/planService.ts#L167) 的 `prisma.ingredient.findMany()` 同构（无 orderBy）。

## 1. 前置基线核对（无矛盾，不触发升级）

| 表 | 行数 | 与基线对照 |
|---|---|---|
| Ingredient | **79** | = 基线 79 ✓ |
| Dish | 48 | —（仅记录） |
| DishIngredient | 365 | —（仅记录） |
| Menu | 13 | —（仅记录） |
| MenuDish | 42 | —（仅记录） |

DishIngredient.ingredientId 外键指向 Ingredient.id（[schema.prisma L131-140](file:///d:/codex/family-menu/apps/api/prisma/schema.prisma#L131-L140)），与任务卡输入一致。**未发现与基线矛盾的事实**。

## 2. AC1 全景扫描结果（79 食材 × name∪aliases，逐词统计）

统计口径：词 = 每个食材的 name 与每个 alias（trim+小写归一）；词元总数 155，唯一词 153，**跨食材重复词（同一词被 ≥2 个不同食材持有）= 2 个**。

### 2.1 词级双归属全库清单（全部 ≥2 命中词，仅此 2 个）

| 词 | 命中食材 id | 命中食材 name | 来源 |
|---|---|---|---|
| **冰糖** | cmtnpn9rn003d0wpgw6ruwoxs | 冰糖 | name |
| **冰糖** | seed-ing-sugar | 白糖 | alias（[seed-data.ts L71](file:///d:/codex/family-menu/apps/api/prisma/seed-data.ts#L71)：aliases 含 冰糖/砂糖/白砂糖） |
| **五花肉** | cmtvnuvwv1rjg0bby4w5airrr | 五花肉 | name |
| **五花肉** | seed-ing-pork | 猪肉 | alias |

**关键发现 F1（新发现，超出 TP-08 备案清单）**：「五花肉」是全库第二个词级双归属词，TP-08 备案（开发日志 L1786）未收录——备案时只点了「冰糖」及姜/蒜/葱系。

### 2.2 TP-08 备案词的核对结论（如实报告）

TP-08 备案原文：「同类：姜/生姜、蒜/大蒜、葱/小葱/香葱/葱花 多套重复食材」。本轮逐词核查（AC3，见 §4）：**这 8 个词各自在词级都是唯一归属（各命中且仅命中 1 个食材）**，不构成 matcher 词级歧义。TP-08 说的"重复食材"实际是**语义冗余的多食材行**（如「姜」与「生姜」是两个不同食材行、互不持对方名字），属于数据治理问题，不属于本卡定义的"一词双归属（dup-key）"问题。全库词级 dup-key 即 §2.1 的 2 个。

## 3. AC2 冰糖引用分布（DishIngredient 全明细）

### 3.1 引用数对比

| 食材 | id | DishIngredient 引用数 | 其中 PUBLISHED / TESTED / DRAFT |
|---|---|---|---|
| 冰糖 | cmtnpn9rn003d0wpgw6ruwoxs | **4** | 2 / 0 / 2 |
| 白糖 | seed-ing-sugar | **15** | 2 / 1 / 12 |

### 3.2 冰糖食材引用明细（4 条，全量）

| dishId | 菜名 | 状态 | qty | unit | optional | dishIngredientId |
|---|---|---|---|---|---|---|
| cmtnpn9rs003h0wpgj7wlkoky | 土豆炖鸡块 | PUBLISHED | 15 | g | 否 | cmtnpn9rs003q0wpg8zqlofql |
| cmtnpn9s600470wpggf0kogbp | 番茄土豆炖牛腩 | PUBLISHED | 15 | g | 否 | cmtnpn9s7004e0wpgmye7zndv |
| cmtvk1w3v0000rwpgkoxz982k | 6⃣️种经典红烧肉做法，你更喜欢哪一种？（即 T-C05 evidence 表中的"红烧肉"） | DRAFT | 20 | g | 否 | cmtvnxrak2tcnh2srratz6elh |
| cmtvk2erk0000nopg3y2tqytq | 零翻车！保姆级糖醋排骨！新手也能一次成功 | DRAFT | 30 | g | 否 | cmtvnxrarh3m2mvj4bdbxfxsb |

### 3.3 白糖食材引用明细（15 条，全量）

| dishId | 菜名 | 状态 | qty | unit | optional | dishIngredientId |
|---|---|---|---|---|---|---|
| cmtvk2nya00008wpgf52iawwe | 6道巨下饭家常菜✨轻松搞定挑食娃 | DRAFT | 15 | g | 否 | cmtvnxrawu88ccn4oxxctoqqc |
| cmtvk2x4a00004wpgsyw1nn5h | 这碗青椒肉丝，我连干三碗饭！ | DRAFT | 3 | g | 是 | cmtvnxrb2ezohqelwrp21bty1 |
| cmtvkmre4000020pglsqyzak8 | 巨入味！清甜酸甜口宫保鸡丁！口感封 | DRAFT | 15 | g | 否 | cmtvnxrbb550gb2q3hhay3s7x |
| cmtvkn13r0000t8pgcvn9cvps | 6款懒人营养蒸菜🥘 | DRAFT | 3 | g | 是 | cmtvnxrbhoq3ic2ojv0fgly23 |
| cmtvknshw00003gpgifiy8jgz | 这才是回锅肉的天花板！肥而不腻，秒杀饭店！ | DRAFT | 5 | g | 否 | cmtvnxrbmcs4v97c3rd36czrr |
| cmtvkoazs0000vwpg3agr82s4 | 9款厨房小白必学菜 一看就会 简单不翻车 | DRAFT | 5 | g | 否 | cmtvnxrbstdolnamlicyuuuah |
| cmtvkot7s0000y0pg66z2iznc | 土豆丝脆爽的秘诀，99%的人第一步就错了 | DRAFT | 2 | g | 是 | cmtvnxrbxgvukm56mqmc6i21h |
| cmtvkpbrz0000dopga1ul1r6b | 地三鲜 | DRAFT | 8 | g | 否 | cmtvnxrc49acwm9gl0svm28g4 |
| cmtvkpl4b0000jgpg27raohxx | 干煸四季豆 | DRAFT | 2 | g | 是 | cmtvnxrc8lt8uca0bc6y1w0p0 |
| cmtvkpuc60000l8pgr50dhf84 | 汤鲜甜 肉软烂的 🍅番茄炖牛肉，巨好吃！！ | DRAFT | 5 | g | 是 | cmtvnxrcasc59fqdavbtfi2hq |
| cmtvkr49o0000m0pgj3uz5zza | 懒人封神葱油拌面 | DRAFT | 10 | g | 否 | cmtvnxrcsahwlta9mm0xubpen |
| cmtvku5bj0000rkpg5f154fpo | 茄子 6 种家常详细做法，下饭不重样 | DRAFT | 10 | g | 否 | cmtvnxrc1umh200n1rovbqt48 |
| seed-dish-braised-pork | 红烧肉 | PUBLISHED | 10 | g | 否 | seed-di-005 |
| seed-dish-cucumber-salad | 凉拌黄瓜 | PUBLISHED | 3 | g | 否 | seed-di-019 |
| seed-dish-potato-ribs | 土豆烧排骨 | TESTED | 5 | g | 否 | seed-di-012 |

### 3.4 用料文本与食材挂接一致性核对（AC2 顺带项）

DB 的 DishIngredient **无用料名字段**（schema 仅 qty/unit/optional + 外键），用料文本存在于内容管线基线 [tc05-baseline-dish-ingredients.json](file:///d:/codex/family-menu/tools/content-pipeline/out/xhs/tc05-baseline-dish-ingredients.json)（107 行，含 ing_name）。以「基线 ing_name ↔ DB 挂接食材 name」比对：**107/107 全部同名一致（exact-name），0 条错挂**。含糖字样行专项（5 条）：

| 菜 | 基线用料名 | DB 实际挂接 | 一致性 |
|---|---|---|---|
| 土豆炖鸡块 | 冰糖 15g | 冰糖(cmtnpn9rn003d0wpgw6ruwoxs) | ✓ |
| 番茄土豆炖牛腩 | 冰糖 15g | 冰糖(cmtnpn9rn003d0wpgw6ruwoxs) | ✓ |
| 红烧肉(seed-dish-braised-pork) | 白糖 10g | 白糖(seed-ing-sugar) | ✓ |
| 凉拌黄瓜 | 白糖 3g | 白糖(seed-ing-sugar) | ✓ |
| 土豆烧排骨 | 白糖 5g | 白糖(seed-ing-sugar) | ✓ |

**关键发现 F2**：含「冰糖」字样用料名的菜（土豆炖鸡块、番茄土豆炖牛腩、T-C05 evidence 表中"红烧肉"与"糖醋排骨"两道管线 DRAFT 菜）挂的全是**独立冰糖食材**；白糖的 15 条引用侧用料文本全部是「白糖」。**挂接层零错挂，双归属只存在于"必消输入词→食材"匹配层**。
命名澄清：T-C05 evidence 表格的"红烧肉"（cmtvk1w3v0000rwpgkoxz982k）是管线 DRAFT 菜（全名「6⃣️种经典红烧肉做法…」），与 seed 的 PUBLISHED「红烧肉」（seed-dish-braised-pork，挂白糖）是**两道不同的菜**，二者不矛盾。

## 4. AC3 TP-08 同类词核查（姜/蒜/葱系逐词现状）

| 词 | 命中食材数 | 命中明细 | 词级双归属？ |
|---|---|---|---|
| 姜 | 1 | 姜(cmtnpn9rl00380wpg0d2yxoh6) | 否 |
| 生姜 | 1 | 生姜(cmtnpn9qs002c0wpgan1e1zqz) | 否 |
| 蒜 | 1 | 蒜(cmtnpn9pq000u0wpgy1zypsgh) | 否 |
| 大蒜 | 1 | 大蒜(cmtnpn9nu00020wpgn8n46mt7) | 否 |
| 葱 | 1 | 葱(cmtnpn9qt002d0wpg1ek0s6b7) | 否 |
| 小葱 | 1 | 小葱(cmtnpn9q2001a0wpgfhmxmg7v) | 否 |
| 香葱 | 1 | 香葱(cmtnpn9pe000i0wpgyvtjbdqx) | 否 |
| 葱花 | 1 | 葱花(cmtnpn9rp003g0wpg48llhv6d) | 否 |
| 大虾 | 1 | 鲜虾(cmtvnuvy9ecb4hyi7yn4qafsz, via alias) | 否（T-P05 已闭环复核通过 ✓） |
| 冰糖 | **2** | 冰糖 + 白糖(alias) | **是** |

结论：姜/蒜/葱系 8 词现状为**语义冗余食材行**（多行各持其名，互不冲突），不是词级双归属；「大虾」唯一归属鲜虾（与 T-P05 闭环定案一致）；词级双归属仅「冰糖」「五花肉」两个。

## 5. AC4 matcher 选边实证（真实 dist 实现 + 库内真实行序）

### 5.1 实证结果（3 次独立连接查询，序完全一致）

| 输入词 | 选边结果 | hitCount | 候选序位 | 层 1 key 归属 |
|---|---|---|---|---|
| 冰糖 | **cmtnpn9rn003d0wpgw6ruwoxs（独立冰糖食材）** | 1（层 1 命中即短路） | 冰糖食材=第 6 位；白糖=第 31 位 | key「冰糖」由候选序第 6 位食材（via name）先建立 |
| 五花肉 | **cmtvnuvwv1rjg0bby4w5airrr（独立五花肉食材）** | 1 | 五花肉=第 15 位；猪肉=第 20 位 | key「五花肉」由第 15 位食材（via name）先建立 |
| 大虾（对照） | cmtvnuvy9ecb4hyi7yn4qafsz（鲜虾） | 1 | —（唯一持有者） | — |

层 2 对照（假设层 1 不命中）：「冰糖」走层 2 双向子串会命中 **2 个食材**（冰糖、白糖）→ 歧义 → 不猜、原文透传空手。

### 5.2 选边机理与风险（事实推演）

1. **现行机理**：[must-use-matcher.ts L61-72](file:///d:/codex/family-menu/apps/api/src/utils/must-use-matcher.ts#L61-L72) 层 1 字典 `exactByKey` 按**候选遍历序先到先得**（`if (!exactByKey.has(normalized))` 才写入）；层 1 命中后 `continue`，**不触发层 2 歧义检测**——双归属词被静默选边，与 T-P05 dev §10.1 定性一致。
2. **选边结果 = 恰好堆序靠前者赢**。当前「冰糖」选独立冰糖食材、「五花肉」选独立五花肉，均因新食材行（无 ORDER BY 堆序）恰好排在 seed 食材之前。
3. **关键发现 F3（备案描述已过时）**：TP-08 备案（开发日志 L1786）记载旧 resolveMustUseIds 为「Map 后写覆盖」——按旧实现，白糖（第 31 位，后写）会覆盖冰糖（第 6 位），「冰糖」当时应选边**白糖**；T-P05 改为先到先得后方向**反转**为选**冰糖**。即备案描述的选边行为与现行代码已不同。
4. **风险（F4）**：候选查询无 ORDER BY（planService.ts L167），PG 无 ORDER BY 不承诺行序——**表重建/迁移/物理重排后选边可能静默翻转**（如翻转成白糖，层 2 不会补救：层 1 命中即短路）。归属若由数据消歧（去重 alias）固定，则不再依赖堆序（见 §6 建议方向，是否采纳由主控拍板）。

## 6. AC5 归属建议表（事实推演方向，**不拍板**）

| 词 | 命中明细 | 引用分布摘要 | 事实推演的归属建议方向 + 理由 |
|---|---|---|---|
| 冰糖 | 冰糖(name) + 白糖(alias) | 冰糖食材 4 条（PUBLISHED 2：土豆炖鸡块/番茄土豆炖牛腩；DRAFT 2）；白糖 15 条（PUBLISHED 2 + TESTED 1 + DRAFT 12） | **方向：该词归独立「冰糖」食材；白糖 aliases 移除「冰糖」**。理由：① 挂接层已按文本语义区分冰糖/白糖（F2，零错挂），归白糖则与全部既有挂接语义冲突；② 现行 matcher 已选冰糖食材（§5.1），去 alias 后选边由数据固定，消除堆序翻转风险（F4）；③ 改动面=纯 aliases 增量数据变更，零代码、零挂接迁移。反向方向（归白糖）需迁移 2 条 PUBLISHED 挂接并改管线产物，成本高且与用量语义（冰糖≠白糖）相悖 |
| 五花肉 | 五花肉(name) + 猪肉(alias) | 五花肉 3 条（全 DRAFT）；猪肉 1 条（seed 红烧肉，PUBLISHED） | **方向：该词归独立「五花肉」食材；猪肉 aliases 移除「五花肉」**。理由：① 挂接层已区分（五花肉菜挂五花肉、seed 红烧肉挂「猪肉」，语义自洽）；② 现行 matcher 已选五花肉（§5.1），消歧后固定；③ 纯 aliases 数据变更，零代码。注：本词为 TP-08 备案外新发现（F1） |
| 大虾 | **已闭环：唯一归属鲜虾**（id=cmtvnuvy9ecb4hyi7yn4qafsz，aliases=[基围虾,大虾,活虾]，hitCount=1，本轮复核通过） | —（T-P05 已定案，probe 复查命中数=1） | 无需动作 |
| 姜/生姜、蒜/大蒜、葱/小葱/香葱/葱花 | 各词唯一归属（§4），为语义冗余食材行而非词级歧义 | 不影响 matcher 正确性 | 非 dup-key 问题，不进本卡归属裁决；是否合并属食材数据治理另案，建议移交主控归档评估 |

## 7. AC 逐条自检表

| AC | 内容 | 自检 | 证据 |
|---|---|---|---|
| AC1 | 全景扫描：79 食材逐词统计，输出全部 ≥2 命中词清单（词/食材 id+name/name-or-alias） | [✓] | §2.1：79 行、155 词元、153 唯一词、重复词=2（冰糖、五花肉）；姜/蒜/葱系如实报告现状（§4） |
| AC2 | 冰糖与白糖引用分布（dishId/菜名/qty/unit/optional 全明细）+ 引用数对比 + 用料文本一致性 | [✓] | §3.1-3.3 全量明细（4 vs 15）；§3.4 基线 107/107 同名一致，糖类 5 行专项核对 |
| AC3 | 姜/生姜、蒜/大蒜、葱/小葱/香葱/葱花逐词现状 | [✓] | §4 表：8 词均唯一归属（语义冗余行，非词级歧义） |
| AC4 | matcher 层 1 实现研读 + 真实行序选边实证 + 产物落 .workflow-verify/dup-key/ | [✓] | §5：真实 dist 实现 + 3 连查序稳定；「冰糖」→独立冰糖食材；含「五花肉」补充探针；脚本与输出均落 .workflow-verify/dup-key/（survey.mjs/result.json/match-probe-wuhua.mjs/wuhua-result.json） |
| AC5 | 归属建议表（每双归属词一行 + 大虾标注已闭环） | [✓] | §6：冰糖、五花肉、大虾（已闭环标注）三行齐备，姜/蒜/葱系按事实归档为另案 |

## 8. 卡外发现移交主控（本卡不处置）

1. **F1 新双归属词「五花肉」**：TP-08 备案未收录，建议补入归属备案清单。
2. **F3 备案行为描述过时**：TP-08「Map 后写覆盖」定性已因 T-P05 先到先得实现而反转（当时选白糖 → 现行选冰糖），建议备案条目更新引用本报告 §5。
3. **F4 堆序依赖风险**：planService 候选查询无 ORDER BY，双归属词选边依赖物理堆序，存在静默翻转可能。若主控拍板归属方向，消除方式是数据消歧（去重 alias），无需改 matcher 代码。
4. **姜/蒜/葱系语义冗余食材行**：非 matcher 问题，属数据治理，另案评估。

## 9. 未验证项（如实声明）

1. **未验证 HTTP 全链路行为**（按卡红线未启 :3000）：「冰糖」作为必消输入经 POST /api/recommend 的端到端表现未实测，仅实证 matcher 纯函数层与服务层查询同构性。
2. **行序跨环境稳定性未验证**：本机 3 连查堆序稳定，但无 ORDER BY 序在其他环境/时点无保证（此即 F4 风险本身，无法在只读调查内"验证消除"）。
3. **未验证其他候选查询路径**：planService 另有 `ingredient.findMany({ where: { id: { in: ... } } })`（L111-113，忌口 join 用），未逐点核对其行序与主路径一致性（不影响本卡结论：该路径只取 id 已知行，不做词匹配）。
4. **tc05 基线 JSON 与 T-C05 evidence 表格的用量版本差异**（如红烧肉 evidence 表 20g vs seed 红烧肉 10g 系两道菜所致，但管线内部版本差异未逐行审计）——超出本卡范围，仅声明。
