# MIGRATE-CHK · migrate checksum 漂移独立评估（DEV 只读评估卡）

- **来源**：T-P14（2026-09-12）卡外发现挂账——「migrate checksum 漂移（`20260904000000_rescale_event_type` 与磁盘不一致致 migrate dev 永远要求 reset，当前口径 migrate deploy-only，成因与处置独立评估）」（CURRENT.md L80）
- **执行角色**：开发 DEV（fm-dev）
- **评估执行**：2026-09-12 ~ 2026-09-13（证据采集跨两会话，本报告 2026-09-13 落盘并重跑核心审计复核）
- **性质**：只读评估——只查证事实 / 成因 / 影响面 / 处置选项，**未执行任何处置**
- **红线遵守声明**：无 migrate resolve / reset / db push；无任何 DML/DDL 写操作；RDS 仅 SELECT；未删除 `$env:TEMP\fm-rds.env`；未停止本地 PG（54329）；未改任何仓库文件（本报告为唯一新建文件）；零新增依赖；零 git 写操作；本报告不含任何凭据明文。
- **修订历史**：REV1（2026-09-13）——响应 fm-reviewer 审查退回修订轮（有条件通过：0 阻塞、1 条件级 + 6 建议级），仅修订本报告 + 新增一次只读 SELECT 复核（§2.5）；无其他仓库文件改动、无数据库写操作、未触碰 `$env:TEMP\fm-rds.env` 与本地 PG 停启（详见文末「修订记录 REV1」）。

---

## 关键事实三行

1. **DB 侧 checksum**（本地 PG 17.5 @ 127.0.0.1:54329，`_prisma_migrations`）：`0187eb1f4842a775db9991a70b5f6e861e2034f1d6efe7d89581d6ff47d05f2c` —— 精确等于 sha384(migration.sql) hex 的**前 64 字符**。
2. **磁盘侧 checksum**（Prisma 7.9.1 实际口径 = sha256(migration.sql 磁盘字节) hex）：`aad630322f9ce295a7cfba2881ee990d9a6a6b10a3c0f5ee96e1716d3afdab04`（文件 57 字节，LF 行尾）。
3. **成因一句话**：2026-09-05 TP-04 任务中 `prisma migrate dev` 被沙箱拦截，改走「手动 SQL + 手工 INSERT `_prisma_migrations`」绕行路线，登记时误用 sha384 前 64 字符作 checksum（非 Prisma 实际的 sha256 口径）；磁盘迁移文件自首提交 fbb4a53 起从未被改动（git --follow 仅 1 提交 + git diff 空输出）。

**漂移结论：成立**（DB 值 ≠ Prisma 磁盘算法值），不构成「算法反转」。详见 §1.3 算法实证。

---

## 0. 环境声明

| 项 | 值 |
|---|---|
| 操作系统 / Shell | Windows / PowerShell 5.1 |
| Node / 包管理器 | node v24.19.0 / pnpm 11.20.0 |
| Prisma | 7.9.1（prisma.config.ts + dotenv 显式加载根 .env + driver adapter） |
| 本地 PG | 17.5 @ 127.0.0.1:54329，库名 family_menu，trust 认证（无密码） |
| 公网 RDS | PostgreSQL 18.3（`show server_version` 实测），经 `ssh fmsrv` → 容器 `family-menu-api` 内 node + createRequire('/app/apps/api/package.json') 解析 pg，只读 SELECT |
| 临时脚本 | `%TEMP%\fm-chk-audit.mjs`（本地审计）、`fm-chk-snapshot.mjs`（表快照）、`fm-chk-compare.mjs`（快照比对）、`fm-rds-chk.js`（RDS 侧审计，经 stdin 管道送入容器执行）、`fm-rev1-s3.mjs`（REV1 增补：logs 字段只读复核，仅一条 SELECT） |
| 凭据 | 全部经环境变量 / .env 注入，本报告脱敏 |

PowerShell 5.1 内嵌双引号经 ssh 会剥离，故 RDS 侧脚本一律 stdin 管道（`Get-Content ... -Raw | ssh fmsrv "docker exec -i family-menu-api node -"`）。

---

## 1. AC1 漂移事实定案

### 1.1 DB 侧目标行原文（本地 `_prisma_migrations`）

命令：`node "$env:TEMP\fm-chk-audit.mjs"`（本会话 2026-09-13 重跑，退出码 **0**）

```
migration_name=20260904000000_rescale_event_type
  checksum           = 0187eb1f4842a775db9991a70b5f6e861e2034f1d6efe7d89581d6ff47d05f2c
  finished_at        = 2026-09-05T00:29:58.537Z
  started_at         = 2026-09-05T00:29:58.537Z
  applied_steps_count= 1
  rolled_back_at     = null
  logs               = NULL
```

注意 **started_at == finished_at 完全相等**（真实 CLI 执行的行均有毫秒级间隔，见 §2.4 时间线）。该特征**不排他**——`migrate resolve --applied`（引擎 mark_migration_applied_impl）同样写 started==finished（REV1 修订）。精确指纹：**logs 为 NULL 且 started==finished ⇒ 手工 INSERT；logs 为空串（''）且 started==finished ⇒ resolve --applied 产物**。本行 logs=NULL → 指向手工 INSERT；§2.5（REV1 增补）只读查询已实证 logs 字段实际值为 NULL，成因「手工 INSERT」由推断升级为实锤。

### 1.2 npx prisma migrate status（完整输出 + 退出码）

命令：`npx prisma migrate status`（cwd: apps/api），退出码 **0**，关键输出：

```
4 migrations found in prisma/migrations
Following migration have not yet been applied: (无)
Database schema is up to date!
```

**结论**：status 对 checksum 完全零感知——漂移存在的情况下仍报 "up to date"（监控盲区，见 §3.4 / 卡外发现 3）。

### 1.3 Prisma checksum 算法实证：DB 记录值 vs 磁盘计算值并列

Prisma 官方未公开 checksum 算法文档；引擎计算在 Rust 编译的 schema-engine 二进制内（prisma/prisma-engines 为 Rust 工作区，仓库经 cargo build 产出 schema-engine 二进制；本地 node_modules/.pnpm/@prisma+engines@7.9.1 内实际二进制文件名 `schema-engine-windows.exe`；node_modules Grep 无源码命中）（REV1 修订：原表述「Go schema-engine」有误）。本评估以**对照法实证**：对本地全部 4 条迁移，将 DB 记录值与磁盘文件（Buffer 字节级）的 sha256 / sha384 计算值逐一比对——

| 迁移 | 磁盘字节 | DB checksum | =sha256(磁盘)? | =sha384(磁盘)[0:64]? |
|---|---|---|---|---|
| 20260806000000_init | 6948 | `83036ad9ada7...7635078c` | **true** | false |
| 20260904000000_rescale_event_type | 57 | `0187eb1f4842...7d05f2c` | **false** | **true** |
| 20260910000000_dish_source_image_fields | 194 | `c1699d9db617...3c81ff` | **true** | false |
| 20260912000000_timezone_timestamptz | 3690 | `801f2066b13e...25d79b` | **true** | false |

（审计脚本同一批输出的磁盘值：init sha256=`83036ad9ada77dcb5d48932e56a4c066b985d1ffbd56d67daf3544137635078c`；rescale sha256=`aad630322f9ce295a7cfba2881ee990d9a6a6b10a3c0f5ee96e1716d3afdab04`、sha384[0:64]=`0187eb1f...7d05f2c`；dish_source sha256=`c1699d9db61737ad165ac0f335f54cf5c8d4949d8a30fe9d12ad8ce9c73c81ff`；timezone sha256=`801f2066b13e4918dd8fc975d906991bc36f07f7a64dea9ea9f4d176c925d79b`。）

**实证结论**：
- 经真实 CLI 应用/登记的 3 条（init、dish_source、timezone），DB 值 = 磁盘 sha256 全 MATCH → **Prisma 7.9.1 的 checksum 口径 = sha256(migration.sql 磁盘字节) hex**；
- 唯一漂移行 rescale 的 DB 值精确等于 sha384 前 64 字符 → 与 Prisma 口径无关，是**登记侧写入值错误**，非算法变化、非文件改动。

**漂移成立**：DB `0187eb1f...` ≠ 磁盘 sha256 `aad63032...`。

---

## 2. AC2 成因链

### 2.1 git 全历史：磁盘文件从未改动

- `git log --follow --oneline -- apps/api/prisma/migrations/20260904000000_rescale_event_type/migration.sql`（退出码 0）：**仅 1 个提交 `fbb4a53`**（提交信息含「e2e 抓住并修复数据库枚举迁移遗漏」，即 TP-04）。
- `git status --porcelain -- apps/api/prisma/migrations`（退出码 0）：**空输出**——工作区无任何未提交改动。
- `git diff fbb4a53 -- .../20260904000000_rescale_event_type/migration.sql`（退出码 0）：**空输出**——磁盘文件与首提交逐字节一致。

（说明：仓库全历史自 2c80703 起、HEAD=e3201ec@2026-09-13 00:13 +0800；此处仅述**该迁移文件**的 --follow 历史，避免歧义。）

**推论**：「磁盘文件被改 → checksum 漂移」假设**排除**。

### 2.2 TP-04 手动路线双证

1. **开发日志.md L1422（TP-04 段）**原文关键句：「迁移修复（prisma migrate 被沙箱拦 commands.json，三环境变量绕不开）→ 手动 SQL 路线：migration.sql（ALTER TYPE ADD VALUE IF NOT EXISTS）+ $executeRawUnsafe 应用 + **INSERT 登记 _prisma_migrations（checksum=sha384 hex 前 64 字符，Prisma 实际口径；首版 96 字符触发 varchar(64) 超长）** + enum_range 验证含 RESCALE」。
2. **evidence/TP-04-2026-09-04.md L93**：同段成因背景记载。

两处与 DB 行特征完全互证：checksum=sha384[0:64]、varchar(64) 超长教训（96 字符首版）、started==finished 时间戳签名。

### 2.3 「Prisma 7 前后算法变化」假设证伪

- 若是算法变化：磁盘文件未改（§2.1）而算法口径变化，则**其余 3 条经真实 CLI 写入的行也应漂移**——实测 3 条全 MATCH sha256，仅手工 INSERT 的 1 条漂移，模式不符。
- 手工 INSERT 特征组合（started==finished，0ms 间隔 **+ logs=NULL**）仅存在于 rescale 行；init（51ms 间隔）、dish_source（27ms）、timezone（170ms）均为真实 CLI 执行特征（注：started==finished 单特征不排他，`migrate resolve --applied` 产物同样如此，精确指纹见 §1.1 注与 §2.5——REV1 修订）。
- Prisma 7.x 迁移引擎无 checksum 算法变更公告或 changelog 迹象（官方文档 troubleshooting/migration-histories 均未提及算法代际差异）。

**结论**：漂移根因 = **登记侧手工写入口径错误**，与 Prisma 版本无关。

### 2.4 时间线六节点（成因链闭合）

| # | 时间（UTC） | 事件 | 证据 |
|---|---|---|---|
| 1 | 09-04 14:07:34.480→.531 | init 经真实 CLI 应用（51ms 间隔） | 本地 `_prisma_migrations` 时间戳 |
| 2 | 09-05 00:29:58.537（started==finished） | rescale **手工 INSERT**（TP-04 沙箱拦截 dev 的绕行；checksum=sha384[0:64]） | DB 行原文 + 开发日志 L1422 |
| 3 | 09-05 09:53（本地时间） | RDS 新库 family_menu_v2 首次 `prisma migrate deploy` 成功 | evidence/TP-07-2026-09-05.md L30 |
| 4 | TP-07 期间 | 本地 `_prisma_migrations` 两行（init/rescale）被**整行回填**至 RDS（毫秒级时间戳逐一相等为铁证）→ RDS 形成同名双记录 | RDS 6 行核验（§3.3） |
| 5 | 09-10 06:09:15.173→.200 | dish_source 经**真实本地 deploy** 应用（T-C01：绕行 prisma migrate diff 生成 DDL → 手写迁移目录 → prisma migrate deploy） | evidence/T-C01-dev-2026-09-10.md L83-86 |
| 6 | 09-12 03:12:46.192→.362 | timezone 经 `--create-only` + `pnpm db:migrate`（deploy）应用；同日 T-P14 卡外发现挂账 | evidence/T-P14-dev-2026-09-12.md L16/L39 + CURRENT.md L80 |

**漂移于 2026-09-10 T-C01 尝试 `migrate dev` 时首次暴露并留档**（T-C01 第八节卡外发现 1 完整记载报错与绕行：migrate diff → 手写迁移目录 → migrate deploy），09-10 起本地事实性 deploy-only；09-12 T-P14 再次触发报错后正式挂账评估（即本卡）。09-05 → 09-10 静默期成因：期间无 migrate dev 执行、两次新迁移（第 5、6 节点）均走 deploy——deploy 按名跳过已应用迁移、不校验已应用行的 checksum（status 同样零感知），漂移无暴露窗口（REV1 修订：原表述「存在 7 天未被察觉，直至 T-P14 才暴露」与 T-C01 留档证据不符）。

### 2.5 REV1 增补：logs 字段只读复核（S-3 精确指纹实证，2026-09-13）

命令：`node "$env:TEMP\fm-rev1-s3.mjs"`（连接根 .env DATABASE_URL → 本地 PG 17.5 @ 127.0.0.1:54329，**仅执行一条 SELECT**，退出码 **0**）：

```sql
SELECT migration_name, checksum, started_at, finished_at, logs, applied_steps_count FROM "_prisma_migrations" ORDER BY migration_name;
```

结果（4 行，logs 字段实际值）：

| migration_name | started==finished? | logs 实际值 | applied_steps_count | 判读 |
|---|---|---|---|---|
| 20260806000000_init | 否（51ms 间隔） | NULL | 1 | 真实 CLI 执行 |
| 20260904000000_rescale_event_type | **是（0ms）** | **NULL** | 1 | **手工 INSERT（S-3 指纹命中）** |
| 20260910000000_dish_source_image_fields | 否（27ms 间隔） | NULL | 1 | 真实 CLI 执行 |
| 20260912000000_timezone_timestamptz | 否（170ms 间隔） | NULL | 1 | 真实 CLI 执行 |

**判读（REV1）**：rescale 行 logs 实测值为 **NULL**（非空串）且 started==finished（2026-09-05T00:29:58.537Z）→ 命中 S-3 精确指纹的「手工 INSERT」分支，§2.2 成因结论（TP-04 手工 INSERT 写入 sha384[0:64]）由「文档互证 + 特征推断」升级为**实锤**；「resolve --applied 产物」分支（logs 为空串）被实测**否定**。注意：logs=NULL 单独不构成排他特征（真实 CLI 行同样为 NULL），须与 0ms 间隔组合判读。

---

## 3. AC3 影响面

### 3.1 本地 `_prisma_migrations` 全表状态

count=4，全部 applied_steps_count=1、rolled_back_at=null、logs=NULL；逐行对照见 §1.3 表——**唯一漂移行 = rescale**，其余 3 行健康。

### 3.2 `npx prisma migrate dev` 安全复现（零写副作用验证）

命令：`npx prisma migrate dev`（cwd: apps/api，非 TTY），退出码 **130**，关键输出：

```
The migration `20260904000000_rescale_event_type` was modified after it was applied.

We need to reset the "public" schema at "127.0.0.1:54329".
You may use prisma migrate reset to drop the development database.
All data will be lost.
```

**零写副作用证明**：dev 执行前后各取 public 全表快照（`fm-chk-snapshot.mjs` 输出 13 表行数 JSON），`fm-chk-compare.mjs` 深比较（排除 takenAt 字段）：**IDENTICAL_EXCLUDING_TAKENAT=true，COMPARE_EXIT=0**。快照基线：CookLog=6 / Dish=48 / DishIngredient=365 / Event=93 / ExclusionRule=2 / Family=1 / FamilyRule=1 / Ingredient=79 / Menu=13 / MenuDish=42 / Plan=54 / Substitution=0 / _prisma_migrations=4。

**补充事实**：`prisma migrate dev --create-only` 不触发漂移报错（T-P14 L16 实证已按此生成 timezone 骨架）——这是本地工作流被迫转向的客观基础。

### 3.3 公网 RDS 该迁移 checksum 状态（只读 SELECT）

命令：`Get-Content "$env:TEMP\fm-rds-chk.js" -Raw | ssh fmsrv "docker exec -i family-menu-api node -"`（stdin 管道，容器内 createRequire 解析 pg、连 `process.env.DATABASE_URL`、`show server_version`），退出码 **0**。

结果（SERVER_VERSION=18.3，共 6 行）：

| migration_name | 来源 | checksum | 校验 |
|---|---|---|---|
| init | 回填行（=本地行，时间戳 2026-09-04T14:07:34.531Z 逐一相等） | `83036ad9...7635078c` | =本地值（sha256 口径） |
| init | deploy 产物行 | `fc6faf2017c8...9ceff` | =RDS 磁盘 sha256 |
| rescale | 回填行（=本地行，时间戳 2026-09-05T00:29:58.537Z 逐一相等） | `0187eb1f...7d05f2c` | =本地值（sha384[0:64] 错误口径） |
| rescale | deploy 产物行 | `ab46297bb38a...71ad8a` | **=RDS 磁盘 59B CRLF sha256**（自洽） |
| dish_source | deploy 产物行 | `1883760fd3e2...2c8e5d` | =RDS 磁盘 sha256 |
| timezone | deploy 产物行 | `c4a0e859a09b...90134d1` | =RDS 磁盘 sha256 |

排除法完备性：RDS 磁盘 rescale 的 sha384[0:64]=`d72aec8d...`，与回填行（`0187eb1f...`）、deploy 行（`ab46297b...`）均不同——三值互异，回填行确系错误口径值的整行复制。

**RDS 结论**：RDS 侧 deploy 口径**自洽**（deploy 产物行 = RDS 磁盘 CRLF sha256）；同名双记录中的回填行是 TP-07 数据导入痕迹（卡外发现 1）。RDS 上 rescale 存在「错误口径回填行 + 自洽 deploy 行」并存，deploy 按名取哪一行的行为未实测（红线仅 SELECT），但 RDS 当前无 migrate dev 使用场景，实际风险面在本地。

### 3.4 「不处置」持续影响清单

1. **migrate dev 永久不可用**：每次必报 "was modified after it was applied" 并要求 reset（EXIT=130）。
2. **报错文本具诱导性**：输出明示 "You may use prisma migrate reset ... All data will be lost."——不知情开发者/未来 Agent 易被诱导执行 reset，将一次可单行修复的元数据错误升级为**本地 UAT 数据丢失**（Plan 54 / Event 93 / Dish 48 等 13 表）。
3. **本地新迁移工作流被约束**：只能 `migrate dev --create-only` 生成 + `pnpm db:migrate`（deploy）应用（T-P14 已按此成功两次）；该口径若未写入开发约定，依赖个人记忆，脆弱。
4. **监控盲区**：`migrate status` 对 checksum 零感知（EXIT=0 up to date）；deploy 对「已应用迁移被修改」按官方 migration-histories 文档会**持续输出 WARNING**（"The following migrations have been modified since they were applied"）——仅警告不阻断；本地/RDS 当前是否实际输出该 WARNING **未实测**（红线禁止执行 deploy，如实记录）。
5. **CI 免疫**：ci.yml L52-53 对全新 postgres:18 service 空库执行 `pnpm --filter @family-menu/api prisma migrate deploy`，从零应用全部迁移（含 rescale）→ CI 侧不存在漂移，测试基线不受影响。
6. **引擎口径锁定风险**：sha256 口径为 7.9.1 对照实证；若未来 Prisma 大版本变更算法（无已知迹象），需重新核对（当前 4 行健康值会随之变化，属全行业迁移升级问题，非本漂移特有）。

---

## 4. AC4 处置选项（4 项，推荐排序 A > C > B > D）

### 4.0 官方文档依据（四件）

1. **CLI reference（prisma migrate resolve）**：resolve「只能用于失败的迁移（failed migrations）」，对已成功迁移使用会报错。
2. **patching-and-hotfixing**：`migrate resolve --applied` 「会将迁移添加到迁移历史记录表中，而不会运行实际的 SQL」。
3. **migration-histories**：「If Prisma Migrate reports a missing or edited migration that has already been applied, we recommend **fixing the root cause** (restoring the file or reverting the change) **rather than resetting**」；并明示 deploy 对已应用迁移被修改会持续输出 WARNING（不阻断）。
4. **troubleshooting**：「You should **never** purposefully delete or edit a migration」。

官方文档**未提供**直接编辑 `_prisma_migrations.checksum` 的命令或支持——任何 checksum 修复路径均非官方一等接口，需用户知情拍板。

### 4.1 选项 A（推荐）：手工 UPDATE 本地行 checksum 对齐磁盘 sha256

- **操作**：仅本地库执行一条 UPDATE——`UPDATE _prisma_migrations SET checksum='aad630322f9ce295a7cfba2881ee990d9a6a6b10a3c0f5ee96e1716d3afdab04' WHERE migration_name='20260904000000_rescale_event_type' AND checksum='0187eb1f4842a775db9991a70b5f6e861e2034f1d6efe7d89581d6ff47d05f2c';`（WHERE 双条件防误伤），随后 `npx prisma migrate status` + `npx prisma migrate dev`（预期 EXIT=0）验证。
- **对本地影响**：单行单字段；migrate dev 立即恢复；其余 3 行不动。
- **对 RDS 影响**：无。
- **可回滚性**：极高——旧值已在手，回滚 = 一条反向 UPDATE。
- **风险副作用**：非官方接口（与引用 ④ 冲突，需知情决策）；目标值即 Prisma 7.9.1 自身算法口径，改后与引擎期望一致；未来若有算法代际变更需重对（§3.4-6，非本项特有）。
- **migrate dev 恢复**：是。
- **残余不确定性（REV1 补披露）**：checksum 修复后 `migrate dev` 仍会执行 shadow database drift 诊断——rescale 为 `ALTER TYPE ... ADD VALUE IF NOT EXISTS` 语义，在 shadow 库重放应与 schema 期望等价，**预期通过但未实测**（红线：本卡无任何写操作，含 shadow 库）。处置执行卡应加入前置只读确认步骤：先以只读 diff（`migrate diff`，from-migrations vs schema 期望）确认 drift 为零，再落 UPDATE。
- **需用户拍板**：是（涉及本地 DB 写操作，超出本只读卡边界）。

### 4.2 选项 C：维持 deploy-only 现状（零操作）

- **操作**：无操作；将「本地新迁移 = --create-only 生成 + pnpm db:migrate（deploy）应用」固化为书面开发约定（T-P14 已按此成功执行 dish_source、timezone 两次）。
- **对本地影响**：零写风险；migrate dev 永远不可用。
- **对 RDS 影响**：零。
- **可回滚性**：不适用（无变更）。
- **风险副作用**：漂移长期隐性存在（status 零感知）；报错文本诱导 reset 的风险持续存在（§3.4-2）；deploy 可能持续输出 WARNING 噪音（§3.4-4，未实测）。
- **migrate dev 恢复**：否。
- **需用户拍板**：否（即现状），但约定固化建议记录在案。

### 4.3 选项 B：DELETE 行 + `migrate resolve --applied` 重登记

- **操作**：本地 DELETE rescale 行 → `prisma migrate resolve --applied 20260904000000_rescale_event_type` 重登记。
- **官方支持性**：resolve 是官方命令（引用 ①②），但 CLI reference 限定「只能用于失败的迁移」——对成功迁移先 DELETE 制造场景属绕行；且 DELETE 后若误触 deploy/status，Prisma 将该迁移视为「删除已应用记录后应以 --applied 重新登记」的场景（REV1 修订：原表述「missing migration」），deploy 会重跑非幂等 ALTER TYPE 而卡 failed（枚举值已存在），需再 resolve 收拾。
- **对本地影响**：行删重建（新 id/时间戳）；中间态有产生 failed 迁移记录的风险。
- **对 RDS 影响**：无。
- **可回滚性**：中——旧行字段值在手可重建，但 id/时间戳不可复原。
- **风险副作用**：resolve 实际写入的 checksum 口径官方文档未明示，但**源码级强指向明确**（REV1 升级）——Prisma CLI 各 migrate 命令的输入由 CLI 从磁盘加载 MigrationList 传入 schema-engine，引擎侧 checksum 统一在 checksum.rs 单一实现点计算 ⇒ `resolve --applied` 强指向写入 **sha256(磁盘文件)**，与本库目标口径一致，功能有效性概率上调；但实际写入路径未实测（红线：本卡无任何写操作），且 DELETE 窗口与非幂等风险定性**不变**；步骤链长、易错。
- **migrate dev 恢复**：源码级强指向恢复（写入值应为 sha256(磁盘)），仍未经实测，处置上按不确定对待。
- **需用户拍板**：是。

### 4.4 选项 D：`migrate reset` 重建本地库

- **操作**：`PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION=... npx prisma migrate reset`（全量重放 4 迁移 + seed）。
- **官方支持性**：官方命令；但与引用 ③ 直接冲突（官方建议修根因而非 reset）。
- **对本地影响**：**清空本地库全部数据**（Plan 54 / Event 93 / Dish 48 等），UAT 数据丢失**不可逆**；reset 后 rescale 经真实 CLI 应用写入 sha256 口径，漂移确实消失。
- **对 RDS 影响**：无。
- **可回滚性**：极低——本机无 psql/pg_dump（卡外发现 5），事前仅能 node 逐表导出，恢复链复杂且未验证。
- **风险副作用**：数据代价最大；违背官方建议。
- **migrate dev 恢复**：是。
- **需用户拍板**：是。

### 4.5 推荐排序与理由

**A > C > B > D**：
- **A** 首选：改动面最小（单字段）、直接根治 dev 可用性、回滚成本近零、目标值即引擎自身口径；唯一硬伤是非官方接口，属「知情绕行」，须用户批准。
- **C** 次选：零风险零操作，工作流已事实常态化；但把修复责任转嫁给「所有人永远遵守口径」的脆弱约束，且保留 §3.4-2 诱导风险。
- **B** 第三：使用官方命令但前置 DELETE 属绕行、存在中间失败态；resolve 写入口径文档未明示但源码级强指向 sha256(磁盘)（§4.3 REV1，功能有效性概率上调），仍排 A 后的原因是步骤链长、DELETE 窗口与非幂等陷阱不变——比 A 更绕且更不可控。
- **D** 最后：数据代价最大且违背官方建议，仅在本地数据确认可弃且前述全数否决时考虑。

---

## 5. 卡外发现（记录，不修改，移交主控）

1. **RDS 同名双记录回填痕迹**：init/rescale 两行被整行回填至 RDS（毫秒级时间戳逐一相等），与 deploy 产物行并存——TP-07 数据导入流程的副作用；清理策略未评估（本卡范围外）。
2. **LF/CRLF 环境差异**：本地磁盘迁移文件 LF（rescale 57 字节），RDS 容器磁盘 CRLF（59 字节）→ 同一文件两环境 sha256 天然不同（RDS deploy 行自洽即按 CRLF 计算）。引擎侧校验（prisma-engines checksum.rs 的 `script_matches_checksum`）对**原始字节 / LF 归一 / CRLF 归一**三种哈希任一匹配即通过——跨环境行尾差异**不会**导致引擎侧漂移误报（REV1 修订）；「分环境计算」的注意事项仅适用于**人工复算原始文件字节哈希**的场景（如本报告 §1.3 对照法），不构成引擎层面的跨环境风险。
3. **`migrate status` 对 checksum 零感知**：漂移存在仍报 up to date（EXIT=0）→ 现有监控/验证手段无法发现此类漂移。
4. **本地 09-10 起事实性 deploy-only**：09-10 T-C01 `migrate dev` 报漂移错（漂移首次暴露，见 §2.4）后即改走 deploy，两次新迁移（dish_source、timezone）均如此；deploy 按名跳过已应用迁移、不校验已应用行 checksum → 09-05~09-10 漂移静默与 09-10 暴露后仍未修复的共同机制原因（REV1 修订：与 §2.4 时间线口径统一）。
5. **本机无 psql/pg_dump**：.pg/bin 精简安装，DB 操作只能 node + pg（createRequire 解析 apps/api 依赖）；影响 §4.4-D 的可回滚性评估。
6. **凭据泄漏事件（过程记录）**：早前会话曾将 `$env:TEMP\fm-rds.env` 内容直接输出，DATABASE_URL 含明文密码进入会话过程记录；文件本身按用户指示保留未删（红线遵守）；本报告不含任何凭据值。建议后续如需复用该文件，读取时仅提取所需变量、禁止整文件输出。

---

## 6. 命令与退出码汇总

| # | 命令 | 退出码 | 关键输出 |
|---|---|---|---|
| 1 | `node "$env:TEMP\fm-chk-audit.mjs"`（本地，2026-09-13 重跑复核） | 0 | DB 4 行原文 + 磁盘 4 文件 sha256/sha384 对照（§1.1/§1.3 全部数字） |
| 2 | `npx prisma migrate status`（cwd apps/api） | 0 | 4 migrations found / Database schema is up to date! |
| 3 | `npx prisma migrate dev`（cwd apps/api，非 TTY） | 130 | "was modified after it was applied ... We need to reset"（§3.2） |
| 4 | `node fm-chk-snapshot.mjs <out>`（dev 前后各一）+ `node fm-chk-compare.mjs <before> <after>` | 0 | IDENTICAL_EXCLUDING_TAKENAT=true，13 表零写副作用 |
| 5 | `git log --follow --oneline -- apps/api/prisma/migrations/20260904000000_rescale_event_type/migration.sql` | 0 | 仅 fbb4a53 |
| 6 | `git status --porcelain -- apps/api/prisma/migrations` | 0 | 空输出 |
| 7 | `git diff fbb4a53 -- .../migration.sql` | 0 | 空输出 |
| 8 | `Get-Content "$env:TEMP\fm-rds-chk.js" -Raw \| ssh fmsrv "docker exec -i family-menu-api node -"` | 0 | SERVER_VERSION=18.3，6 行 + RDS 磁盘哈希（§3.3） |
| 9 | Grep `modified since they were applied`（全仓 *.md） | — | 仅 T-P08 h5 构建 1 条无关命中 → 无任何历史证据记录过 deploy WARNING 实际输出 |
| 10 | `git status --porcelain`（本报告落盘后收尾核验） | 0 | **零已跟踪文件改动**（无 M 状态行）；untracked 中本卡仅新增本报告，其余 untracked 条目（.pai/、docs/design/、docs/ui-redesign/、tests/、tools/ 等）为仓库既有状态，非本卡产生 |
| 11 | `node "$env:TEMP\fm-rev1-s3.mjs"`（REV1 增补只读复核，2026-09-13） | 0 | 4 行 logs 字段实测值：rescale 行 logs=NULL 且 started==finished → 手工 INSERT 实锤（§2.5） |

注：#2~#9 于 2026-09-12/13 证据采集会话执行，#1 于 2026-09-13 本报告落盘会话重跑复核，数字一致。#11 为 REV1 修订轮（2026-09-13）增补的唯一新执行命令（只读 SELECT）。

---

## 7. AC 自检汇总与未验证项

| AC | 结论 | 依据 |
|---|---|---|
| AC1 漂移事实定案 | [✓] | §1.1 DB 行原文（checksum/finished_at/applied_steps_count/logs）；§1.2 status 完整输出+EXIT=0；§1.3 算法实证 DB vs 磁盘并列 → 漂移成立 |
| AC2 成因链 | [✓] | §2.1 git --follow 仅 1 提交 + diff 空 → 磁盘未改；§2.2 TP-04 双证（开发日志 L1422 + evidence/TP-04 L93）；§2.3 算法变化假设证伪；§2.4 时间线六节点闭合 |
| AC3 影响面 | [✓] | §3.1 全表状态；§3.2 dev 安全复现 EXIT=130 + 快照零写证明；§3.3 RDS 6 行只读核验；§3.4 影响清单 6 条（含 CI 免疫与 deploy WARNING 口径） |
| AC4 处置选项 | [✓] | §4 四选项（A/C/B/D）各含操作/影响/回滚/风险/官方引用；推荐 A>C>B>D；拍板项已标注（A/B/D 均需用户拍板） |
| AC5 报告落盘 | [✓] | 本文件 evidence/MIGRATE-CHK-dev-2026-09-12.md，简体中文，全数字带命令与退出码 |

**未验证项（如实记录，不脑补）**：
1. 本地/RDS `migrate deploy` 当前是否实际输出 edited-migration WARNING——红线禁止执行 deploy，官方文档行为未实测（§3.4-4）。
2. `migrate resolve --applied` 实际写入 checksum 的口径——官方文档未明示；源码级强指向 sha256(磁盘文件)（§4.3 REV1），实际写入值未实测。
3. RDS 同名双记录中 deploy 按名取行行为——仅 SELECT 无法确定（§3.3）；RDS 侧处置不在本卡范围。
4. Prisma 引擎（Rust schema-engine）内部 checksum 实现未能从 node_modules 静态确认——sha256 口径为 4 条迁移对照实证 + 排除法推断（3 条 MATCH sha256 / 唯一漂移行 MATCH sha384）；引擎语言/二进制形态已复核：prisma-engines 为 Rust 工作区，本地 @prisma/engines@7.9.1 内二进制名 schema-engine-windows.exe（§1.3 REV1）。
5. checksum 修复后 `migrate dev` 的 shadow database drift 诊断结果——rescale 为 ADD VALUE 语义等价重放，预期通过但未实测（§4.1 REV1 补披露）。

---

## 修订记录 REV1（响应 review T-1 + S-1~S-6，2026-09-13）

响应 fm-reviewer 审查退回修订轮（判定：有条件通过，0 阻塞，1 条件级 + 6 建议级）。纯措辞/事实修正 + 一次只读 SELECT 增补，零代码改动、零迁移写操作、零新增依赖、未触碰 `$env:TEMP\fm-rds.env` 与本地 PG 停启：

1. **T-1（条件级·叙事失实）**：§2.4 原表述「漂移存在 7 天（09-05 → 09-12）未被察觉……直至 T-P14 尝试 migrate dev 才暴露」→ 新表述「漂移于 2026-09-10 T-C01 尝试 migrate dev 时首次暴露并留档，09-10 起本地事实性 deploy-only；09-12 T-P14 再次触发报错后正式挂账评估」。依据：evidence/T-C01-dev-2026-09-10.md L82（migrate dev 因历史迁移 checksum drift 要求 reset 的绕行背景）与 L200（卡外发现 1 完整记载报错文本与绕行方案）。同步修订 §5 卡外发现 4（「漂移静默 7 天」→ 与 §2.4 口径统一），消除与「09-10 起事实性 deploy-only」的自相矛盾。
2. **S-1**：§1.3 原表述「引擎计算在 Go schema-engine 二进制内」→ 新表述「引擎计算在 Rust 编译的 schema-engine 二进制内」。依据：prisma/prisma-engines 为 Rust 工作区（仓库 README：cargo build 产出 schema-engine 二进制；历史提交 #3855 "Rename migration-engine binary to schema-engine"）；本地 node_modules/.pnpm/@prisma+engines@7.9.1 内实际二进制文件名 `schema-engine-windows.exe`。同步修订 §7 未验证项 4。
3. **S-2**：§5 卡外发现 2 原表述「跨环境 checksum 比对必须分环境计算，不可直接互比」→ 新表述「引擎侧 script_matches_checksum（checksum.rs）对原始/LF 归一/CRLF 归一三种哈希任一匹配即通过——跨环境行尾差异不会导致引擎侧漂移误报；『分环境计算』注意事项仅适用于人工复算原始文件字节哈希的场景（如 §1.3 对照法）」。依据：prisma-engines checksum.rs 引擎源码校验逻辑（审查方源码复核结论）。
4. **S-3**：§1.1 原表述「started_at == finished_at 完全相等——这是手工 INSERT 的签名特征」→ 新表述「该特征不排他：migrate resolve --applied（mark_migration_applied_impl）同样写 started==finished；精确指纹：logs 为 NULL 且 started==finished ⇒ 手工 INSERT，logs=''（空串）且 started==finished ⇒ resolve --applied 产物」。同步修订 §2.3（特征组合），并新增 §2.5 REV1 增补只读查询实证（见第 8 条）。
5. **S-4**：§4.3 选项 B 原表述「resolve 写入口径文档未明示——若写入值仍非 sha256 磁盘口径，漂移可能复现」→ 新表述「文档未明示但源码级强指向明确：CLI 从磁盘加载 MigrationList 传入 schema-engine、引擎统一经 checksum.rs 单一实现点计算 ⇒ resolve --applied 强指向写入 sha256(磁盘文件)，功能有效性概率上调；DELETE 窗口与非幂等风险定性不变」。§4.3 恢复行、§4.5 推荐排序 B 理由、§7 未验证项 2 同步更新；处置决策仍按 A 优先。
6. **S-5**：§4.3 原表述「Prisma 视其为 missing migration」→ 新表述「Prisma 将该迁移视为『删除已应用记录后应以 --applied 重新登记』的场景」。
7. **S-6**：§4.1 选项 A 补披露残余不确定性（新增条目）：checksum 修复后 migrate dev 仍会执行 shadow database drift 诊断——rescale 为 ADD VALUE 语义等价，预期通过但未实测；处置执行卡应加入前置只读确认步骤（先 migrate diff 确认 drift 为零，再落 UPDATE）。§7 未验证项新增第 5 条。
8. **REV1 增补查询（S-3 实证）**：`node "$env:TEMP\fm-rev1-s3.mjs"`（EXIT=0，仅一条 SELECT：`SELECT migration_name, checksum, started_at, finished_at, logs, applied_steps_count FROM "_prisma_migrations" ORDER BY migration_name;`）——rescale 行 logs 字段实测值 = **NULL**（非空串），且 started==finished（2026-09-05T00:29:58.537Z）→ 命中 S-3 精确指纹的「手工 INSERT」分支，§2.2 成因结论由「文档互证 + 特征推断」升级为**实锤**；「resolve --applied 产物」分支（logs=''）被实测否定。其余 3 行 logs 亦为 NULL 但有毫秒级间隔（真实 CLI 特征），与既有记录一致。详见 §2.5（标注「REV1 增补」）。

修订轮执行记录：本轮唯一新执行命令为上述第 8 条只读 SELECT（§6 #11）；唯一新增临时脚本 `$env:TEMP\fm-rev1-s3.mjs`（只读查询，已列入 §0）；仓库侧仅改动本报告文件，git 收尾核验见回报。
