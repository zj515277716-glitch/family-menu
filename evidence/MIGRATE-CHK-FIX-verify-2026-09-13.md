# MIGRATE-CHK-FIX 独立验收复跑报告（fm-verify）

- 卡片：「migrate checksum 漂移处置（选项 A：本地库单字段 UPDATE）」任务卡（归档：[evidence/MIGRATE-CHK-FIX-task-2026-09-13.md](./MIGRATE-CHK-FIX-task-2026-09-13.md)，含主控裁决 5 条）
- 被验收物：[evidence/MIGRATE-CHK-FIX-dev-2026-09-13.md](./MIGRATE-CHK-FIX-dev-2026-09-13.md)（fm-dev 执行报告，AC1~AC5 全 ✓ 自检）
- 验收角色：fm-verify（产品验收，独立于开发与技术审查；不采信开发者自述，全部数字以本会话独立复跑的真实命令 + 退出码为准）
- 执行时间：2026-09-13 凌晨（北京时间）；证据文件 capturedAt 为 UTC 时间戳（19:29~19:50Z，即北京 03:29~03:50）
- 证据落盘目录：`d:\codex\family-menu\.workflow-verify\migrate-chk-fix\`（.gitignore 已排除 `.workflow-verify/`，符合验收沙箱定位）

---

## 1. 环境声明

| 项 | 值 |
|---|---|
| 仓库 HEAD（验收时） | `670a71901183ee05c3a2ac067db5b796b5355990`（V5 实测，HEAD_IS_670A719=true） |
| Prisma / 引擎 | **7.9.1**（`prisma --version` 实测：prisma 7.9.1 / @prisma/client 7.9.1 / schema-engine-cli e922089b7d7502aff4249d5da3420f6fa55fc6ad，见 `v3-prisma-version.log`） |
| Node | v24.19.0（实测） |
| Shell | Windows PowerShell 5.1；输出采集一律 node `execSync` + `writeFileSync` 落盘（规避 PS 管道丢行缺陷） |
| 本地 DB | PostgreSQL **17.5** @ 127.0.0.1:54329（`SHOW server_version` 本轮实测），库 family_menu，trust 认证（DATABASE_URL=postgresql://postgres@127.0.0.1:54329/family_menu，根 .env） |
| shadow 库 | `fm_shadow_chkfix` 实测仍在（owner=postgres，ALLOWCONN=true，只确认未触碰） |
| 验收脚本 | 沙箱自建 6 个只读/受控脚本（v1-hash / v2-shadow-diff / v3-status / v4v6-db-state / v5-git / v7-migrate-dev，均 .mjs）+ 等价临时 Prisma 配置 `fm-verify-prisma-config.mjs`；全部位于 `.workflow-verify/migrate-chk-fix/`，非仓库文件 |
| 物证声明 | **开发报告引用的 `%TEMP%\fm-fix-*.mjs / fm-fix-*.json` 已全部不存在**（TEMP 现仅余 fm-dlog*.txt 与 fm-rds.env；`fm-rds.env` 按红线未触碰）。本验收不依赖消失物证，全部独立复跑（详见卡外发现 1） |
| 红线遵守 | 无 DELETE / migrate reset / migrate resolve / DROP DATABASE / 非幂等 SQL；业务表零写入（全程仅 SELECT 与 2 次只读 Prisma diff、1 次只读 status、1 次 migrate dev 参数解析失败即中止）；未删除 `$env:TEMP\fm-rds.env`；未停止本地 PG（54329）；RDS 零触碰（无任何远程连接）；仓库代码文件零改动；零 git 写操作 |
| 数据脱敏 | 本卡数据均为迁移元数据（哈希/时间戳/行数），不含任何用户个人数据 |

---

## 2. 验收项逐项结果（V1~V7）

> 每项含：Operation（操作）/ Expected（预期，据任务卡与 dev 报告口径）/ Actual（实测）/ Version / Evidence / Coverage boundaries（覆盖边界）。

### V1 哈希复算 —— [✓] 通过

- **Operation**：node crypto 读 `apps/api/prisma/migrations/20260904000000_rescale_event_type/migration.sql` 磁盘 Buffer 字节，计算 sha256、字节数、CR(0x0d) 检查；同时对另外 3 个迁移文件一并复算（供 V4 对照）。硬断言写入脚本。
- **Expected**：rescale sha256=`aad630322f9ce295a7cfba2881ee990d9a6a6b10a3c0f5ee96e1716d3afdab04`、57 字节、无 CR。
- **Actual**（EXIT=0，`V1_TARGET_EXPECT_MATCH=true`）：

| 迁移 | 字节 | sha256（实测） | hasCR |
|---|---|---|---|
| 20260806000000_init | 6948 | `83036ad9ada77dcb5d48932e56a4c066b985d1ffbd56d67daf3544137635078c` | false |
| **20260904000000_rescale_event_type** | **57** | **`aad630322f9ce295a7cfba2881ee990d9a6a6b10a3c0f5ee96e1716d3afdab04`** | **false** |
| 20260910000000_dish_source_image_fields | 194 | `c1699d9db61737ad165ac0f335f54cf5c8d4949d8a30fe9d12ad8ce9c73c81ff` | false |
| 20260912000000_timezone_timestamptz | 3690 | `801f2066b13e4918dd8fc975d906991bc36f07f7a64dea9ea9f4d176c925d79b` | false |

- **Version**：node v24.19.0；被测文件 = 仓库 HEAD 670a719 工作区磁盘字节。
- **Evidence**：`v1-hash.log`（含 V1_EXIT_OK=true、capturedAt=2026-09-12T19:29:33Z）。
- **Coverage boundaries**：仅复算 sha256 口径与字节/CR；未复算 sha384（成因实锤属上游评估卡范围）；未重复 Get-FileHash 双通道（上游评估与验收已双通道实证，本卡目标仅校验修复后口径）。

### V2 migrate diff 复跑（落盘日志） —— [✓] 通过

- **Operation**：①只读 SELECT `pg_database` 确认 `fm_shadow_chkfix` 仍在；②node execSync 在 cwd=apps/api 执行 `pnpm --filter @family-menu/api exec prisma migrate diff --config <沙箱等价配置> --from-config-datasource --to-migrations prisma/migrations --exit-code`，stdout/stderr/EXIT 全部落盘。
- **口径说明（如实记录两处指令偏差的处置）**：
  1. 任务指令的 `--config %TEMP%\fm-fix-prisma-config.mjs` 已不存在（物证消失）→ 按主控裁决 S-4 口径（`--from-config-datasource --to-migrations` + 配置文件 `shadowDatabaseUrl`）自建**等价配置** `fm-verify-prisma-config.mjs`（与仓库 prisma.config.ts 同构 + `shadowDatabaseUrl=postgresql://postgres@127.0.0.1:54329/fm_shadow_chkfix`，仅复用既有库，未创建未删除）。
  2. 任务指令写 `--to-migrations apps/api/prisma/migrations`（cwd=apps/api）在该 cwd 下不可解析（将拼成 apps/api/apps/api/...）；按 dev 报告 §1.3 同构口径 `--to-migrations prisma/migrations`（cwd=apps/api），语义等价（同一目录）。
- **Expected**：fm_shadow_chkfix 存在；EXIT=0 且输出含 "No difference detected"。
- **Actual**：`SHADOW_DB_EXISTS=true`（owner=postgres，ALLOWCONN=true，SERVER_VERSION=17.5）；diff **EXIT=0**，stdout=`No difference detected.`，stderr 空，`V2_VERDICT_OK=true`。full 日志含命令原文与时间戳（capturedAt=2026-09-12T19:29:45Z）。
- **Version**：Prisma 7.9.1（schema-engine e922089b…）。
- **Evidence**：`v2-shadow-check.log`、`v2-diff.log`。
- **Coverage boundaries**：diff 为官方明示的只读命令（--exit-code 语义 Empty=0/Error=1/Not empty=2，实测走 Empty 分支）；shadow 库内部是否空库未另行审计（diff 成功重放本身即其可用性证据）；本项为 S-6 前置等价复核，不构成 UPDATE 操作重放。

### V3 migrate status 复跑（落盘日志） —— [✓] 通过

- **Operation**：node execSync 在仓库根执行 `pnpm --filter @family-menu/api exec prisma migrate status`，采集落盘；先行 `prisma --version` 记录版本。
- **Expected**：EXIT=0，报 4 migrations found / Database schema is up to date，无 checksum/reset 提示。
- **Actual**：**EXIT=0**；`4 migrations found in prisma/migrations`；`Database schema is up to date!`；脚本正则判定 `HAS_4_MIGRATIONS_FOUND=true / HAS_UP_TO_DATE=true / NO_CHECKSUM_RESET_HINT=true`，`V3_VERDICT_OK=true`（capturedAt=2026-09-12T19:40:08Z）。
- **Version**：Prisma 7.9.1（`v3-prisma-version.log`：prisma 7.9.1 / @prisma/client 7.9.1 / PSL 7.9.0-1.e922089b… / schema-engine-cli e922089b…）。
- **Evidence**：`v3-status.log`、`v3-prisma-version.log`。
- **Coverage boundaries**：status 对 checksum 零感知（上游评估卡 §1.2 定案），本项仅为旁证；checksum 修复的直接证明按主控裁决 S-1 收尾口径由三点闭环承担：diff EXIT=0 空差异（V2/V7-a）+ 磁盘 sha256（V1）+ DB 行值一字不差（V4）。

### V4 DB 终态复核 —— [✓] 通过

- **Operation**：只读 `SELECT id, migration_name, checksum, started_at, finished_at, rolled_back_at, logs, applied_steps_count FROM "_prisma_migrations" ORDER BY started_at`（node + pg，经 apps/api 依赖解析），脚本内置逐行断言。
- **Expected**：总行数=4；rescale 行 checksum=`aad63032…`、applied_steps_count=1；其余 3 行 checksum 与磁盘 sha256 一致（评估卡口径 init/dish_source/timezone）。
- **Actual**（EXIT=0，`V4_VERDICT_OK=true`，capturedAt=2026-09-12T19:50:20Z）：

| migration_name | checksum（实测） | =磁盘sha256 | steps | started → finished（UTC） | logs |
|---|---|---|---|---|---|
| 20260806000000_init | `83036ad9…7635078c` | true | 1 | 09-04T14:07:34.480Z → .531Z | null |
| **20260904000000_rescale_event_type** | **`aad63032…afdab04`** | **true** | **1** | 09-05T00:29:58.537Z → 同值 | null |
| 20260910000000_dish_source_image_fields | `c1699d9d…73c81ff` | true | 1 | 09-10T06:09:15.173Z → .200Z | null |
| 20260912000000_timezone_timestamptz | `801f2066…c925d79b` | true | 1 | 09-12T03:12:46.192Z → .362Z | null |

- MIG_ROW_COUNT=**4**；全部 rolled_back=null。
- **Version**：PostgreSQL 17.5 @ 127.0.0.1:54329 / pg ^8.13.0（apps/api 既有依赖）。
- **Evidence**：`v4-migrations.log`。
- **Coverage boundaries**：终态只读复核，未重放 UPDATE 动作（本验收不重复写操作）；4 行 id/时间戳与 dev 报告 UPDATE 前后快照一致（id 未变、started/finished 未变——与「仅 checksum 单字段变更」自洽）。

### V5 git 层核查 —— [✓] 通过

- **Operation**：只读 `git rev-parse HEAD` + `git status --porcelain`（node execSync 采集落盘），脚本断言三项。
- **Expected**：HEAD=670a719；已跟踪文件零改动；untracked 含 evidence/MIGRATE-CHK-FIX-dev-2026-09-13.md 与 evidence/MIGRATE-CHK-FIX-task-2026-09-13.md。
- **Actual**：`HEAD=670a71901183ee05c3a2ac067db5b796b5355990`（HEAD_IS_670A719=true）；`TRACKED_CHANGED_COUNT=0`（STATUS_LINE_COUNT=14 全部为 untracked）；`UNTRACKED_HAS_DEV_REPORT=true`、`UNTRACKED_HAS_TASK_CARD=true`；`V5_VERDICT_OK=true`（capturedAt=2026-09-12T19:50:28Z）。untracked 共 14 条（与上游评估验收记录的 13 条相比，新增两条 MIGRATE-CHK-FIX 文档；「复盘报告.md」以 git quotePath 八进制转义显示）。
- **Version**：git（系统版）+ 仓库 HEAD 670a719。
- **Evidence**：`v5-git.log`。
- **Coverage boundaries**：porcelain 快照时点即上表时间戳；本验收报告自身落盘后将新增 1 条 untracked（evidence/MIGRATE-CHK-FIX-verify-2026-09-13.md），属预期且未计入 V5 判定；未做 git diff 内容级审查（TRACKED_CHANGED_COUNT=0 已充分）。

### V6 13 表行数复核 —— [✓] 通过

- **Operation**：白名单 13 表逐一 `SELECT COUNT(*)::int`（只读）+ `information_schema` 动态枚举 public BASE TABLE 对照无遗漏。
- **Expected**：Dish 48 / Menu 13 / MenuDish 42 / Ingredient 79 / Plan 54 / Event 93 / CookLog 6 / DishIngredient 365 / ExclusionRule 2 / Family 1 / FamilyRule 1 / Substitution 0 / _prisma_migrations 4。
- **Actual**（EXIT=0，`V6_VERDICT_OK=true`）：13/13 逐一 MATCH=true；`PUBLIC_BASE_TABLE_COUNT=13`（枚举结果与白名单完全一致，全库无遗漏表）。
- **Version**：PostgreSQL 17.5 @ 127.0.0.1:54329。
- **Evidence**：`v6-counts.log`。
- **Coverage boundaries**：按任务口径只核行数不核内容；13 表对照明细见 §3。

### V7 migrate dev 复活实测（主控裁决纳入，严格按序） —— [✗] 未达成（中止于命令旗标错误，migrate dev 复活性未实测）

- **Operation**（脚本内置严格按序守卫）：a) 重跑 V2 diff 复确认 → b) cwd=apps/api 非交互执行 `pnpm --filter @family-menu/api exec prisma migrate dev --skip-generate` → c) 三种合法结局判定 → e) 只读复查。任一非法退出码即停止后续步骤并固定证据。
- **Expected**：a) EXIT=0；b/c) 两种合法结局之一（EXIT=0 且 "in sync" 类字样；或 EXIT=130 类非交互 SIGINT）；f）如因缺 shadowDatabaseUrl 报错退出亦属有效发现。
- **Actual**：
  - 步骤 a：**EXIT=0**，"No difference detected."（`v7-diff-recheck.log`，capturedAt=2026-09-12T19:50:43Z）——diff 复确认通过，按序放行。
  - 步骤 b：**EXIT=1，OUTCOME=UNEXPECTED**——Prisma CLI 报 `! unknown or unexpected option: --skip-generate` 并打印 migrate dev 帮助。帮助输出实测 migrate dev 可用选项仅：`-h/--help`、`--config`、`--schema`、`--url`、`-n/--name`、`--create-only`——**不存在 `--skip-generate`**（该旗标为 Prisma ≤6 时代口径，Prisma 7.9.1 已移除）。命令在参数解析阶段即失败，**未触达任何数据库逻辑，零写副作用**。
  - 按 V7.d 红线立即停止后续步骤；仅执行只读复查固定证据。
  - 步骤 e（只读复查，capturedAt=2026-09-12T19:50:45Z）：13 表行数逐一 MATCH（同 V6）；`MIG_ROW_COUNT=4`；rescale 行 checksum=`aad63032…`、steps=1，`RESCALE_CHK_STEPS_UNCHANGED=true`；`V7_AFTER_RECHECK_OK=true`。
- **Version**：Prisma 7.9.1（migrate dev 帮助输出为 CLI 实测原文）；配置加载自仓库 prisma.config.ts（日志 `Loaded Prisma config from prisma.config.ts.`）。
- **Evidence**：`v7-diff-recheck.log`、`v7-migrate-dev.log`（含命令原文、EXIT=1、OUTCOME=UNEXPECTED、完整 STDOUT/STDERR）、`v7-after-recheck.log`。
- **Coverage boundaries**：migrate dev 的真实复活行为（"Database is now in sync" 或 SIGINT 或 shadow 配置报错）**均未发生、未实测**；三种合法结局之外出现了第 4 种情形——**验收指令自身的命令口径错误**（`--skip-generate` 在 Prisma 7.9.1 migrate dev 不存在），与任务卡/主控裁决的命令形式过时同族（详见卡外发现 2）。不擅自去除保护性旗标重跑：裸 `migrate dev` 将 "trigger generators (e.g. Prisma Client)"（帮助原文），存在产生无关生成产物的未授权副作用风险，超出本卡授权，停止并交主控裁决。

---

## 3. 13 表行数对照表（V6 终态 = V7 实测后复查，两次一致）

| 表 | 预期 | V6 实测 | V7 后复查 | MATCH |
|---|---|---|---|---|
| Dish | 48 | 48 | 48 | OK |
| Menu | 13 | 13 | 13 | OK |
| MenuDish | 42 | 42 | 42 | OK |
| Ingredient | 79 | 79 | 79 | OK |
| Plan | 54 | 54 | 54 | OK |
| Event | 93 | 93 | 93 | OK |
| CookLog | 6 | 6 | 6 | OK |
| DishIngredient | 365 | 365 | 365 | OK |
| ExclusionRule | 2 | 2 | 2 | OK |
| Family | 1 | 1 | 1 | OK |
| FamilyRule | 1 | 1 | 1 | OK |
| Substitution | 0 | 0 | 0 | OK |
| _prisma_migrations | 4 | 4 | 4 | OK |

`_prisma_migrations` 4 行 checksum 全部与磁盘 sha256 一致（V4 与 V7 后复查两次实测一致），rescale 行 `RESCALE_CHK_STEPS_UNCHANGED=true`。

## 4. 与 fm-dev 报告数字差异明细

V1~V6 全部对照点**零差异**（sha256×4、字节数×4、CR 检查、diff EXIT=0 与输出、status 输出、_prisma_migrations 4 行全字段、13 表行数、HEAD、untracked 两条 MIGRATE-CHK-FIX 文档在列、fm_shadow_chkfix 存在）。

差异仅一项，属验收侧执行面而非交付数字：V7 步骤 b 因 `--skip-generate` 旗标不存在而 EXIT=1 中止（dev 报告 §7 未验证项 1/2 原本就未实测 migrate dev，本卡裁决纳入实测后因指令口径问题仍未实测）。

## 5. 总体判定

**FAIL（V7 项未达成；6/7 通过）**

1. **checksum 修复事实全部复跑成立**：磁盘 sha256（V1）= DB rescale 行值（V4），diff 空差异（V2、V7-a），status up to date 旁证（V3），DB 终态 4 行无多余变更（V4），git 层干净（V5），13 表零数据影响（V6、V7-e），与 dev 报告逐数字零差异。主控裁决 S-1 的三点闭环（diff EXIT=0 + 磁盘 sha256 + DB 行值一字不差）成立。
2. **但任务目标「恢复 prisma migrate dev 可用性」的核心实测项 V7 未完成**：三种合法结局均未出现，实际结局为第 4 种——`--skip-generate` 旗标在 Prisma 7.9.1 的 `migrate dev` 中不存在，命令在参数解析阶段 EXIT=1 中止（零写副作用，DB 状态复查无任何变化）。按 V7.d 红线停止并如实报告，不擅自改用裸 `migrate dev`（避免未授权的 generator 副作用）。

**总体 FAIL 的含义**：不是开发交付物被证伪，而是「migrate dev 复活」这一验收目标在本卡内无法闭环，需主控再裁决后补一轮 V7 复跑。

## 6. 卡外发现（记录，不修改，移交主控）

1. **`%TEMP%` 下 fm-fix-* 临时脚本与物证已全部消失**：开发报告 §0 列举的 fm-fix-snapshot.mjs / fm-fix-compare.mjs / fm-fix-update.mjs / fm-fix-shadow.mjs / fm-fix-prisma-config.mjs 及 fm-fix-before.json / fm-fix-after.json / fm-fix-row-before.json / fm-fix-row-after.json 均不在（TEMP 现仅余 fm-dlog*.txt、fm-rds.env）。reviewer 曾静态取证过的物证链不可再追溯；本验收以沙箱自建等价脚本独立复跑，不依赖消失物证，故不影响上述判定。`fm-rds.env` 按红线未触碰。
2. **任务卡/主控裁决的 migrate dev 命令口径为 Prisma ≤6 风格**：`--skip-generate` 已在 Prisma 7.9.1 migrate dev 中移除（帮助输出实测）。与评估卡卡外发现 1（diff 的 --from-url/--shadow-database-url 移除）、dev 报告卡外发现 1 同族——建议主控在流程备忘中固化「派发 DB 工具卡前先跑 `prisma <subcmd> --help` 核对旗标」的规则。
3. **终端沙箱拦截 Prisma CLI 收尾写操作**：V2/V3/V7 执行时终端沙箱报 `hit restricted: Not allow operate files: C:\Users\15273\AppData\Roaming\prisma-nodejs\Config\commands.json, ...checkpoint-nodejs\Cache\prisma-...`。该现象与 TP-04 当年「migrate 被沙箱拦 commands.json」同族；不影响 diff/status 只读结果与退出码判定（均发生在命令核心逻辑完成之后），但预示本环境下裸跑 migrate dev 的 generator 环节可能同样被拦——补跑 V7 前需主控知悉并考虑环境因素。
4. **shadow 库 `fm_shadow_chkfix` 实测仍在**（owner=postgres，ALLOWCONN=true），按主控裁决保留、零触碰。
5. **V2 任务指令两处口径偏差已按等价口径处置**（--config 物证消失→沙箱等价配置；--to-migrations 相对路径笔误→cwd=apps/api 下 `prisma/migrations`），均如实留痕于 V2 小节。

## 7. 遗留问题清单

1. **V7 补跑裁决（阻塞项）**：migrate dev 复活性未实测。选项：(a) 授权以裸 `pnpm --filter @family-menu/api exec prisma migrate dev`（不带 --skip-generate）复跑一次——需接受 generator 触发与终端沙箱拦截的不确定性，建议限定在验收沙箱监督下执行；(b) 不补跑，将「migrate dev 复活性验证」并入「migrate dev 工作流配置卡」（prisma.config.ts 是否配置 shadowDatabaseUrl 属仓库文件变更，超出本卡授权）一并闭环。需主控拍板。
2. **Prisma 7 旗标口径修订**：任务卡模板/流程备忘需收录「Prisma 7.9.1 migrate dev 无 --skip-generate；migrate diff 需 --from-config-datasource/--to-migrations + shadowDatabaseUrl」（合并 dev 报告卡外发现 1/3 与本报告卡外发现 2）。
3. **%TEMP% 物证留存机制**：临时物证随系统清理丢失，后续任务卡的证据留档建议以 evidence/ 或 .workflow-verify/ 落盘副本为准（不影响本卡结论）。
4. 沿袭未验证项（非本卡新增）：migrate deploy 是否输出 edited-migration WARNING；RDS 同名双记录处置——均属其他卡范围。

## 8. 证据文件清单（d:\codex\family-menu\.workflow-verify\migrate-chk-fix\）

| 文件 | 内容 |
|---|---|
| fm-verify-prisma-config.mjs | 沙箱等价 Prisma 配置（同构仓库配置 + shadowDatabaseUrl→fm_shadow_chkfix） |
| v1-hash.mjs / v1-hash.log | V1 哈希复算脚本与结果（4 文件 sha256/字节/CR + V1_TARGET_EXPECT_MATCH=true） |
| v2-shadow-diff.mjs / v2-shadow-check.log / v2-diff.log | V2 shadow 库确认 + migrate diff EXIT=0 全输出 |
| v3-status.mjs / v3-prisma-version.log / v3-status.log | V3 版本声明 + migrate status EXIT=0 全输出 |
| v4v6-db-state.mjs / v4-migrations.log / v6-counts.log | V4 迁移表全行 + V6 13 表行数（含 information_schema 枚举） |
| v5-git.mjs / v5-git.log | V5 HEAD + porcelain 全量 + untracked 判定 |
| v7-migrate-dev.mjs / v7-diff-recheck.log / v7-migrate-dev.log / v7-after-recheck.log | V7 按序守卫脚本 + diff 复确认 + migrate dev EXIT=1 全输出 + 只读复查 |

---

## 9. V7-bis 补跑（主控授权） —— [✓] 通过（合法 A：migrate dev 复活成立）

> 主控已授权裸跑 `prisma migrate dev`（不带任何额外旗标），对应 §7 遗留问题 1 选项 (a)。本轮为 V7 补跑，前轮 V1~V6 结论不变。
> 执行时间：2026-09-13 北京时间凌晨二轮（证据 capturedAt=2026-09-12T20:10:18~25Z）；脚本：`v7bis.mjs`（严格按序守卫：前置 1 未过即不跑前置 2 / migrate dev；裸跑前先固定 before 快照；任一异常立即停止）。全程本脚本对数据库零写操作，输出全部 node `execSync` + `writeFileSync` 落盘。

### 9.1 前置 1：diff 复确认 —— 通过

- **Operation**：①确认 `%TEMP%\fm-fix-prisma-config.mjs` 仍存在（实测存在；内容核验：datasource url 指向仓库根 .env 的 DATABASE_URL、shadowDatabaseUrl 指 `postgresql://postgres@127.0.0.1:54329/fm_shadow_chkfix`、schema/migrations 指 apps/api——与主控授权口径一致，非仓库文件）；②cwd=apps/api 重跑 `pnpm exec prisma migrate diff --config C:/Users/15273/AppData/Local/Temp/fm-fix-prisma-config.mjs --from-config-datasource --to-migrations prisma/migrations --exit-code`。
- **Expected**：EXIT=0 且输出含 "No difference detected"，否则立即停止、不跑 migrate dev。
- **Actual**：**EXIT=0**，stdout=`No difference detected.`，stderr 空（`STEP_A_OK=true`）。
- **Evidence**：`v7bis-diff-recheck.log`（含命令原文、TMP_CFG 路径、capturedAt=2026-09-12T20:10:20.459Z）。
- **Coverage boundaries**：同 V2 口径（官方只读命令，Empty=0 分支）；shadow 库仅被 diff 只读重放使用。

### 9.2 前置 2：13 表快照 before + `_prisma_migrations` 留档 —— 通过

- **Operation**：只读 SELECT：13 表逐一 `COUNT(*)`；`_prisma_migrations` 全行按 started_at 排序留档；`pg_database` 确认 fm_shadow_chkfix。
- **Expected**：Dish 48 / Menu 13 / MenuDish 42 / Ingredient 79 / Plan 54 / Event 93 / CookLog 6 / DishIngredient 365 / ExclusionRule 2 / Family 1 / FamilyRule 1 / Substitution 0 / _prisma_migrations 4；rescale 行 checksum=`aad63032…afdab04`；fm_shadow_chkfix 仍在（不删除不重建）。
- **Actual**（capturedAt=2026-09-12T20:10:20.564Z）：13/13 全部与基线一致，`BEFORE_MATCH_EXPECT=true`；`MIG_ROW_COUNT=4`；rescale 行 checksum=`aad630322f9ce295a7cfba2881ee990d9a6a6b10a3c0f5ee96e1716d3afdab04`、steps=1，`RESCALE_CHK_STEPS_OK=true`；`SHADOW_DB_EXISTS=true`（owner=postgres，ALLOWCONN=true，SERVER_VERSION=17.5）。
- **Evidence**：`v7bis-before-counts.log`（4 行迁移全字段留档）、`v7bis-shadow-check.log`。

### 9.3 裸跑 migrate dev —— EXIT=0，判定合法 A

- **Operation**：仓库根目录，node execSync 执行 `pnpm --filter @family-menu/api exec prisma migrate dev`（**无任何额外旗标**；配置自动加载仓库 prisma.config.ts，日志见输出首行），stdout/stderr/EXIT 全部落盘（`v7bis-dev-output.txt` / `v7bis-dev-exit.txt`）。
- **Expected**：三种合法结局之一——A：EXIT=0 且 "Already in sync / no schema change or pending migration" 类字样；B：EXIT=130 类非交互 SIGINT；C：shadow database 相关报错退出。其他任何退出码/输出即停止报告。
- **Actual**：**EXIT=0**，TIMED_OUT=false，输出原文（全文，stderr 空）：

  ```
  Datasource "db": PostgreSQL database "family_menu", schema "public" at "127.0.0.1:54329"

  Already in sync, no schema change or pending migration was found.
  ```

- **结局判定**：**合法 A（`LEGAL_A_ALREADY_IN_SYNC`）**——EXIT=0 且命中 "Already in sync, no schema change or pending migration was found."，migrate dev 复活成立。判据落盘：`v7bis-verdict.log`（LEGAL_OUTCOME=true）。
- **Version**：Prisma 7.9.1 / @prisma/client 7.9.1 / Node v24.19.0 / Schema Engine e922089b…（`v7bis-prisma-version.log` 本轮实测，与 V3 记录一致）；配置来源 `prisma.config.ts`（输出可见 `Loaded Prisma config from prisma.config.ts.`）。
- **Evidence**：`v7bis-dev-output.txt`（命令原文+全输出+capturedAt=2026-09-12T20:10:24.427Z）、`v7bis-dev-exit.txt`（EXIT=0）。
- **Coverage boundaries**：本轮实测的是"无待迁移、无 schema 漂移"的 **Already in sync 路径**；产生新迁移的写路径（交互 name 输入、shadow 重放生成 diff SQL）未测——本轮未触发 shadow 逻辑，故合法 B/C 形态未实测（属正常开发工作流的后续验证范围）。

### 9.4 后置复核 —— 全部通过

- **Operation**：裸跑后立即只读复查 13 表 + `_prisma_migrations` 全行，与 before 快照逐一对比；`git status --porcelain` 复核仓库层；核对 generator 产物去向。
- **Expected**：13 表 COUNT 与 before 逐一相等；`_prisma_migrations` 仍 4 行、rescale 行 checksum/steps 不变；已跟踪文件零改动；若有 generator 产物则仅限 node_modules/忽略目录内。
- **Actual**（capturedAt=2026-09-12T20:10:24.556Z / 24.643Z）：
  - 13 表 before→after 逐一相等：

    | 表 | before | after | EQUAL |
    |---|---|---|---|
    | Dish | 48 | 48 | OK |
    | Menu | 13 | 13 | OK |
    | MenuDish | 42 | 42 | OK |
    | Ingredient | 79 | 79 | OK |
    | Plan | 54 | 54 | OK |
    | Event | 93 | 93 | OK |
    | CookLog | 6 | 6 | OK |
    | DishIngredient | 365 | 365 | OK |
    | ExclusionRule | 2 | 2 | OK |
    | Family | 1 | 1 | OK |
    | FamilyRule | 1 | 1 | OK |
    | Substitution | 0 | 0 | OK |
    | _prisma_migrations | 4 | 4 | OK |

  - `_prisma_migrations`：仍 4 行；**MIGRATIONS_SIGNATURE_UNCHANGED=true**（4 行 migration_name|checksum|steps 序列逐行不变）；rescale 行 `RESCALE_CHK_STEPS_OK=true`。
  - git 层：`git status --porcelain` **TRACKED_CHANGED_COUNT=0**（已跟踪文件零改动）；15 条 untracked 与 V5 时点完全一致（V5 实测 14 条 + 本验收报告自身 1 条），migrate dev 前后 git 状态零变化。
  - generator 产物去向：本轮输出**无 "Generated Prisma Client" 字样**（Already in sync 短路，未触发 generator）；即便触发，schema.prisma 的 generator output=`../src/generated/prisma`（apps/api 内），该目录已被 .gitignore 第 17 行 `apps/api/src/generated/` 忽略（实测 `git check-ignore` 命中），git 层"仓库源码零改动"结论不受影响。
- **Evidence**：`v7bis-after-counts.log`、`v7bis-git-status.log`（porcelain 全量 15 条 untracked 原文）。
- **Coverage boundaries**：按任务口径只核行数/元数据不核表内容；未做 git diff 内容级审查（TRACKED_CHANGED_COUNT=0 已充分）。

### 9.5 观察记录（如实记录，不构成问题）

1. 前轮卡外发现 3 预警的终端沙箱拦截（`commands.json` / checkpoint）本轮**未复现**——migrate dev 全程干净完成（亦因未触发 generator 环节）。
2. 合法 B（SIGINT）/合法 C（shadow 报错）两种结局因未触发相应路径而未实测，属环境使然而非偏差。
3. prisma.config.ts 仍未配置 `datasource.shadowDatabaseUrl`（diff 场景经临时配置补齐；migrate dev 本轮未需要 shadow）。该配置是否入库留待「migrate dev 工作流配置卡」评估，本轮零改动。

### 9.6 最终结论（整卡改判）

- **V1~V6 ✓（前轮实测）+ V7-bis 合法 A ✓ → 7/7 全部通过，整卡判定由 FAIL 改判 PASS。**
- checksum 修复四点互证闭环：磁盘 sha256（V1）= DB rescale 行值（V4）= diff 空差异（V2/V7-bis 前置 1）= migrate dev EXIT=0 "Already in sync"（V7-bis），status up to date 旁证（V3）；13 表零数据影响（V6/V7-bis 前置 2+后置）；git 层零改动（V5/V7-bis 后置）。
- §7 遗留问题 1（V7 补跑裁决）**已按选项 (a) 闭环**；遗留 2（Prisma 7 旗标口径修订）、遗留 3（%TEMP% 物证留存）维持建议不变；遗留 4 属其他卡范围。
- 红线遵守（本轮）：无 DELETE / migrate reset / migrate resolve / DROP DATABASE / 非幂等 SQL / 业务表写入；未删除 `fm-rds.env`；未停止本地 PG（54329）；fm_shadow_chkfix 零触碰；RDS 零触碰；仓库已跟踪源码零改动；输出采集全部 node execSync + writeFileSync。

### 9.7 证据文件清单（本轮新增，均在 d:\codex\family-menu\.workflow-verify\migrate-chk-fix\）

| 文件 | 内容 |
|---|---|
| v7bis.mjs | V7-bis 严格按序守卫脚本（前置 1 → 前置 2 → 裸跑 → 判定 → 后置复核） |
| v7bis-prisma-version.log | prisma 7.9.1 / Node v24.19.0 版本留档 |
| v7bis-diff-recheck.log | 前置 1 diff EXIT=0 "No difference detected." 全输出 |
| v7bis-shadow-check.log / v7bis-before-counts.log | 前置 2 shadow 库存在确认 + 13 表/migrations before 快照 |
| v7bis-dev-output.txt / v7bis-dev-exit.txt | 裸跑 migrate dev 全输出（EXIT=0）+ 退出码落盘 |
| v7bis-verdict.log | 结局判定 LEGAL_A_ALREADY_IN_SYNC / LEGAL_OUTCOME=true / FINAL_OK=true |
| v7bis-after-counts.log | after 13 表对照 + migrations 签名不变判定 |
| v7bis-git-status.log | porcelain 全量（TRACKED_CHANGED_COUNT=0，15 条 untracked 原文） |

---

## 修订记录

- V1（2026-09-13）：初版落盘。全部验收命令于本会话真实执行，退出码与数字见 §2~§4。
- V2（2026-09-13）：追加 §9「V7-bis 补跑（主控授权）」——裸跑 `prisma migrate dev` EXIT=0 合法 A（"Already in sync, no schema change or pending migration was found."），后置复核全通过；整卡判定由 FAIL **改判 PASS**（7/7）。
