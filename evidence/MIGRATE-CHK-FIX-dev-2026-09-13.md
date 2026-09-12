# MIGRATE-CHK-FIX · migrate checksum 漂移处置（DEV 执行卡，选项 A：单字段 UPDATE）

- **来源**：评估卡 MIGRATE-CHK（evidence/MIGRATE-CHK-dev-2026-09-12.md，REV1）§4.1 选项 A + REV1 S-6 前置注意；fm-verify 独立复跑 PASS（evidence/MIGRATE-CHK-verify-2026-09-12.md）
- **执行角色**：开发 DEV（fm-dev）
- **执行时间**：2026-09-13（北京时间凌晨；快照 UTC 时间戳见正文）
- **性质**：数据库元数据修复卡——唯一写操作 = 本地库 `_prisma_migrations` 表 rescale 行 checksum 单字段 UPDATE；零业务代码改动
- **前置定案**（沿用评估卡结论，本轮全部独立复证）：DB 侧错误值 `0187eb1f...` = sha384(migration.sql) 前 64 字符（TP-04 手工 INSERT 错误口径）；正确值 = Prisma 7.9.1 口径 sha256(migration.sql 磁盘字节) = `aad63032...`

---

## 0. 环境声明

| 项 | 值 |
|---|---|
| 操作系统 / Shell | Windows / PowerShell 5.1 |
| Node / Prisma | node v24 / Prisma 7.9.1（prisma.config.ts + dotenv 加载根 .env） |
| 本地 DB | PostgreSQL 17.5 @ 127.0.0.1:54329，库 family_menu，trust 认证（`show server_version`=17.5 本轮实测） |
| 仓库 HEAD（执行时） | `670a71901183ee05c3a2ac067db5b796b5355990`（= 评估卡定案提交） |
| 临时脚本 | `%TEMP%\fm-fix-snapshot.mjs`（只读快照）、`fm-fix-compare.mjs`（只读对比）、`fm-fix-update.mjs`（唯一写入口，含三级中止守卫）、`fm-fix-shadow.mjs`（shadow 库准备）、`fm-fix-prisma-config.mjs`（diff 用临时 Prisma 配置）；全部位于 %TEMP%，非仓库文件 |
| 新增依赖 | **0**（仅 node 内置模块 + apps/api 既有 pg + 既有 Prisma CLI） |
| 红线遵守声明 | 无 DELETE；无 migrate reset / resolve / db push；对 family_menu 业务表零写入；未触碰任何远程库（无 ssh fmsrv、无 RDS 连接）；未删除 `$env:TEMP\fm-rds.env`；未停止本地 PG（54329）；仓库代码文件零改动（唯一新建：本报告）；零 git 写操作（未提交，入库时点报主控） |

## 0.1 对 family_menu 库的写操作总量声明（全卡仅此一条）

```sql
UPDATE "_prisma_migrations"
SET checksum = 'aad630322f9ce295a7cfba2881ee990d9a6a6b10a3c0f5ee96e1716d3afdab04'
WHERE migration_name = '20260904000000_rescale_event_type'
  AND checksum = '0187eb1f4842a775db9991a70b5f6e861e2034f1d6efe7d89581d6ff47d05f2c';
```

- 与任务卡 AC2 给定 SQL 一致，另加旧值条件（WHERE 双条件防误伤），依据评估报告 §4.1 选项 A 原文；经 `fm-fix-update.mjs` 参数化执行。
- PG 实例级另有一次 `CREATE DATABASE fm_shadow_chkfix`（AC1 迁移重放诊断所需，独立空库，不触碰 family_menu 内容；详见 §1 与卡外发现 2）。

---

## 1. AC1（S-6 前置，只读）：schema 与迁移历史零 drift —— 通过后才落 UPDATE

### 1.1 前置事实复核（只读，EXIT=0）

`node "$env:TEMP\fm-fix-snapshot.mjs" "$env:TEMP\fm-fix-before.json"`（takenAt=2026-09-12T19:07:09.832Z）：

- `server_version=17.5`；库清单 `family_menu,postgres`
- 目标行原文：`migration_name=20260904000000_rescale_event_type checksum=0187eb1f4842a775db9991a70b5f6e861e2034f1d6efe7d89581d6ff47d05f2c started=2026-09-05T00:29:58.537Z finished=同值 logs=null steps=1`（与评估卡 §1.1 逐一相符）
- 磁盘迁移文件：**57 字节、无 CR（纯 LF）**；node crypto sha256=`aad630322f9ce295a7cfba2881ee990d9a6a6b10a3c0f5ee96e1716d3afdab04`、sha384=`0187eb1f...47d05f2c`**72052d80...**（前 64 字符即 DB 现值，二次实锤评估卡成因）
- 第二通道交叉验证：`Get-FileHash -Algorithm SHA256` → `AAD630322F9CE295A7CFBA2881EE990D9A6A6B10A3C0F5EE96E1716D3AFDAB04`（与 node 一致）

### 1.2 Prisma 7.9.1 旗标差异与等价只读命令（如实记录）

任务卡推荐的 `migrate diff --from-url ... --shadow-database-url ...` 为 Prisma ≤6 命令形式；7.9.1 的 `prisma migrate diff --help` 实测（EXIT=0）已无 `--from-url`/`--shadow-database-url` 旗标，`--exit-code` 语义：**Empty=0 / Error=1 / Not empty=2**，且帮助明示 "prisma migrate diff is a read-only command that does not write to your datasource(s)"。

首次尝试 `--from-config-datasource --to-migrations prisma/migrations --exit-code`（EXIT=1）报错：`You must set datasource.shadowDatabaseUrl in your prisma.config.ts if you want to diff a migrations directory.` —— 仓库 prisma.config.ts 未配置该键且本卡禁止改仓库文件，故以 `--config` 指向 %TEMP% 临时配置（与仓库配置等价 + shadowDatabaseUrl 指向空库 fm_shadow_chkfix），未改任何仓库文件。

### 1.3 AC1 结果：UPDATE 前执行（EXIT=0）

命令：`pnpm --filter @family-menu/api exec prisma migrate diff --config "$env:TEMP\fm-fix-prisma-config.mjs" --from-config-datasource --to-migrations prisma/migrations --exit-code`

```
Loaded Prisma config from C:\Users\15273\AppData\Local\Temp\fm-fix-prisma-config.mjs.

No difference detected.

LASTEXITCODE=0
```

**判定：EXIT=0（Empty）→ 本地库 schema 与 4 条迁移重放结果零 drift，S-6 前置满足，允许落 UPDATE。**（若非零按卡应立即停止，未触发。）

---

## 2. AC2：单字段 UPDATE（影响行数恰为 1，其余字段零变化）

执行 `node "$env:TEMP\fm-fix-update.mjs"`（EXIT=0），脚本内置三级中止守卫（前置 checksum 不符→exit 3；影响行数≠1→exit 4；后验失败→exit 5），全部未触发：

**UPDATE 前全行快照**（留档 `$TEMP\fm-fix-row-before.json`）：

```json
{
  "id": "b95477a8-35ac-4ddd-afcb-2f8d79d65092",
  "migration_name": "20260904000000_rescale_event_type",
  "checksum": "0187eb1f4842a775db9991a70b5f6e861e2034f1d6efe7d89581d6ff47d05f2c",
  "started_at": "2026-09-05T00:29:58.537Z",
  "finished_at": "2026-09-05T00:29:58.537Z",
  "rolled_back_at": null,
  "logs": null,
  "applied_steps_count": 1
}
```

执行结果：

```
UPDATE_ROW_COUNT=1          ← 影响行数恰为 1
OTHER_FIELDS_UNCHANGED=true
DIFF_FIELDS=[]              ← 除 checksum 外逐字段比对零差异
MIGRATIONS_TABLE_COUNT=4    ← 表总行数不变（无增删）
CHECKSUM_NOW=aad630322f9ce295a7cfba2881ee990d9a6a6b10a3c0f5ee96e1716d3afdab04 MATCH=true
UPDATE_EXIT_OK
```

**UPDATE 后全行快照**（留档 `$TEMP\fm-fix-row-after.json`）：

```json
{
  "id": "b95477a8-35ac-4ddd-afcb-2f8d79d65092",
  "migration_name": "20260904000000_rescale_event_type",
  "checksum": "aad630322f9ce295a7cfba2881ee990d9a6a6b10a3c0f5ee96e1716d3afdab04",
  "started_at": "2026-09-05T00:29:58.537Z",
  "finished_at": "2026-09-05T00:29:58.537Z",
  "rolled_back_at": null,
  "logs": null,
  "applied_steps_count": 1
}
```

字段级对照：id / migration_name / started_at / finished_at / rolled_back_at / logs / applied_steps_count 七项**逐一零变化**；仅 checksum 由 `0187eb1f...` → `aad63032...`。UPDATE 之外对 `_prisma_migrations` 及全部业务表**零写入**。

---

## 3. AC3：migrate status 恢复验证（禁止运行 migrate dev，已遵守）

命令：`pnpm --filter @family-menu/api exec prisma migrate status`（EXIT=0）：

```
Loaded Prisma config from prisma.config.ts.

Prisma schema loaded from prisma\schema.prisma.
Datasource "db": PostgreSQL database "family_menu", schema "public" at "127.0.0.1:54329"

4 migrations found in prisma/migrations

Database schema is up to date!
```

- 输出 "Database schema is up to date!"（Prisma 7.9.1 文本，即任务卡「Database is up to date」口径），**无任何 checksum / reset / modified 提示**。
- 双证之二：AC1 只读 diff 在 UPDATE 前后各执行一次，均 `No difference detected.`（EXIT=0），schema 层零漂移且 UPDATE 未引入副作用。
- 红线遵守：**未实际运行 migrate dev**（按卡禁止，非交互环境行为不可控）；checksum 与 Prisma 引擎期望一致由「双通道哈希复算（node crypto + Get-FileHash）= 引擎 7.9.1 对照实证口径（评估卡 §1.3）」背书。

---

## 4. AC4：13 表行数 UPDATE 前后对照（零数据影响）

`node "$env:TEMP\fm-fix-snapshot.mjs" "$env:TEMP\fm-fix-after.json"`（takenAt=2026-09-12T19:09:34.383Z）→ `node "$env:TEMP\fm-fix-compare.mjs" before after`（CMP_EXIT=0，**ALL_EQUAL=true**）：

| 表 | UPDATE 前 | UPDATE 后 | 相等 |
|---|---|---|---|
| CookLog | 6 | 6 | OK |
| Dish | 48 | 48 | OK |
| DishIngredient | 365 | 365 | OK |
| Event | 93 | 93 | OK |
| ExclusionRule | 2 | 2 | OK |
| Family | 1 | 1 | OK |
| FamilyRule | 1 | 1 | OK |
| Ingredient | 79 | 79 | OK |
| Menu | 13 | 13 | OK |
| MenuDish | 42 | 42 | OK |
| Plan | 54 | 54 | OK |
| Substitution | 0 | 0 | OK |
| _prisma_migrations | 4 | 4 | OK |

- **TABLE_COUNT_BEFORE=13，TABLE_COUNT_AFTER=13**（information_schema 动态枚举 public BASE TABLE，全库无遗漏表）。
- **七表基线逐一精确命中**：Dish=48 / Menu=13 / MenuDish=42 / Ingredient=79 / Plan=54 / Event=93 / CookLog=6（BASELINE7 全 MATCH）。
- 目标行 checksum 修后值在 after 快照中复核为 `aad63032...`，其余 3 行 checksum 与 UPDATE 前逐字符相同。

---

## 5. 命令与退出码汇总

| # | 命令 | 退出码 | 关键输出 |
|---|---|---|---|
| 1 | `node "$env:TEMP\fm-fix-snapshot.mjs" "$env:TEMP\fm-fix-before.json"` | 0 | PG 17.5；13 表行数；目标行原文；文件 57B/LF、sha256=aad63032... |
| 2 | `Get-FileHash -Algorithm SHA256 <migration.sql>` | 0 | AAD63032...DAB04（与 node 双通道一致） |
| 3 | `pnpm --filter @family-menu/api exec prisma migrate diff --help` | 0 | Prisma 7 旗标清单（无 --from-url/--shadow-database-url；--exit-code: Empty 0/Error 1/Not empty 2） |
| 4 | `pnpm --filter @family-menu/api exec prisma migrate diff --from-config-datasource --to-migrations prisma/migrations --exit-code`（未带 shadow 配置） | 1 | 报错 "You must set datasource.shadowDatabaseUrl..."（未发生任何写） |
| 5 | `node "$env:TEMP\fm-fix-shadow.mjs" fm_shadow_chkfix` | 0 | SHADOW_CREATED db=fm_shadow_chkfix（实例级唯一 DDL，独立空库） |
| 6 | `pnpm --filter @family-menu/api exec prisma migrate diff --config "$env:TEMP\fm-fix-prisma-config.mjs" --from-config-datasource --to-migrations prisma/migrations --exit-code`（UPDATE **前**） | 0 | **No difference detected.**（AC1 通过） |
| 7 | `node "$env:TEMP\fm-fix-update.mjs"` | 0 | UPDATE_ROW_COUNT=1；DIFF_FIELDS=[]；MIGRATIONS_TABLE_COUNT=4；UPDATE_EXIT_OK（AC2） |
| 8 | `pnpm --filter @family-menu/api exec prisma migrate status` | 0 | Database schema is up to date!（AC3） |
| 9 | 同 #6（UPDATE **后**复跑） | 0 | No difference detected.（schema 零副作用） |
| 10 | `node "$env:TEMP\fm-fix-snapshot.mjs" "$env:TEMP\fm-fix-after.json"` | 0 | 13 表行数（§4 after 列） |
| 11 | `node "$env:TEMP\fm-fix-compare.mjs" before.json after.json` | 0 | ALL_EQUAL=true；BASELINE7 全 MATCH（AC4） |
| 12 | `git status --porcelain` + `git diff --stat` + `git diff --cached --stat` | 0 | 零已跟踪文件改动；HEAD=670a719 |

---

## 6. AC 逐条自检

| AC | 结论 | 依据 |
|---|---|---|
| AC1 S-6 前置只读确认零 drift | **[✓]** | §1.3：`migrate diff --from-config-datasource --to-migrations --exit-code` EXIT=0 "No difference detected."（Prisma 7.9.1 等价只读形式，旗标差异已如实记录 §1.2；drift 非零即停的分支未触发） |
| AC2 单字段 UPDATE 恰 1 行、其余字段零变化 | **[✓]** | §2：UPDATE 前后全行快照留档；UPDATE_ROW_COUNT=**1**；DIFF_FIELDS=[]（7 个非 checksum 字段逐一零变化）；MIGRATIONS_TABLE_COUNT=4（零增删）；UPDATE 之外对该表零写入 |
| AC3 migrate status up to date 且无 checksum/reset 提示 | **[✓]** | §3：EXIT=0 "Database schema is up to date!"，输出无 checksum/reset/modified 字样；AC1 diff 双证（前后各一次均 No difference detected）；未运行 migrate dev（遵守卡内禁止） |
| AC4 13 表行数前后逐一相等 | **[✓]** | §4：13/13 表 OK；ALL_EQUAL=true；七表基线精确命中（48/13/42/79/54/93/6） |
| AC5 完成报告落盘（命令+退出码+数字） | **[✓]** | 本文件 evidence/MIGRATE-CHK-FIX-dev-2026-09-13.md；全部命令真实执行，无 Mock |

---

## 7. 未验证项（如实记录，不脑补）

1. **migrate dev 恢复可用性未实测**——任务卡明令禁止运行 migrate dev。修复依据为：修后值 = Prisma 7.9.1 自身口径（评估卡 §1.3 对照法：3 条真实 CLI 行全 MATCH sha256）+ 本轮双通道哈希复算一致。
2. **migrate dev 是否需要 prisma.config.ts 配置 `datasource.shadowDatabaseUrl`**（Prisma 7 diff 已实测需要，dev 未测）——属仓库配置决策，超出本卡授权，移交主控。
3. migrate deploy 是否输出 edited-migration WARNING——沿袭评估卡未验证项（本卡未运行 deploy）。
4. shadow 库重放（diff 内部将 4 条迁移应用于 fm_shadow_chkfix）由 Prisma CLI 托管完成，未逐语句审计；重放成功本身即 AC1 证据。
5. RDS 侧状态本卡零触碰（无任何远程连接），"RDS 不受影响" 为边界推定而非实测；RDS 同名双记录回填行（含错误口径 checksum `0187eb1f...`）仍存在，处置归 RDS 范围任务。

## 8. 卡外发现（记录，不修改，移交主控）

1. **任务卡命令形式为 Prisma ≤6 风格**：`migrate diff` 的 `--from-url`/`--shadow-database-url` 旗标在 7.9.1 已不存在，等价形式为 `--from-config-datasource/--to-migrations` + 配置文件 `datasource.shadowDatabaseUrl`。建议后续派发 DB 工具卡时更新命令口径。
2. **shadow 库 `fm_shadow_chkfix` 现存于本地 PG 实例**（本卡为 AC1 所建，空库；因红线避免任何"清理"类操作未删除）。请主控决定保留（可复用为后续 migrate diff/dev 诊断）或另行授权清理。
3. **prisma.config.ts 未配置 shadowDatabaseUrl**：当前 migrate diff（migrations 目录口径）无法以仓库配置直接运行（§1.2 EXIT=1 报错）。若主控决定固化 diff 诊断或恢复 migrate dev 工作流，需一张配置变更卡（涉及仓库文件，超出本卡授权）。
4. **本报告尚未入库**：`git status` 显示仅新增本文件（untracked），零已跟踪文件改动；提交/入库时点报请主控批准（与评估卡先例一致）。

---

## 修订记录

- V1（2026-09-13）：初版落盘。执行会话内全部 12 组命令真实执行，退出码见 §5。
