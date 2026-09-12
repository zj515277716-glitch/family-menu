# MIGRATE-CHK 独立验收复跑报告（fm-verify）

- 卡片：「migrate checksum 漂移」评估卡（T-P14 挂账项）
- 被验收物：[evidence/MIGRATE-CHK-dev-2026-09-12.md](./MIGRATE-CHK-dev-2026-09-12.md)（fm-dev 评估报告，含 REV1 修订记录）
- 验收角色：fm-verify（产品验收，独立于开发与技术审查；不采信 fm-dev 自述，全部数字独立复算）
- 执行时间：V1~V5 于 2026-09-12（北京时间），V6 于 2026-09-13 凌晨（北京时间；UTC 时间戳见证据文件）。报告文件名沿用派发指定日期 2026-09-12。
- 证据落盘目录：`.workflow-verify/migrate-chk/`（.gitignore L10 `*.log` 与 L26 `.workflow-verify/` 明确排除入库，符合四角色验收沙箱定位）

---

## 1. 环境声明

| 项 | 值 |
|---|---|
| 仓库 HEAD（验收时） | `e3201ec8ba07f95982837e2193e3552bbe0ed6bc`（v4-git-summary.log 实测） |
| 迁移工具 | Prisma 7.9.1（prisma.config.ts + dotenv 加载根 .env） |
| Node | v24.19.0 |
| Shell | Windows PowerShell 5.1 |
| 本地 DB | PostgreSQL 17.5 @ 127.0.0.1:54329，库名 family_menu，trust 认证（DATABASE_URL=postgresql://postgres@127.0.0.1:54329/family_menu，根 .env） |
| RDS | 公网 PostgreSQL，实测 `SHOW server_version` = **18.3**；访问方式：ssh 别名 fmsrv → `docker exec -i family-menu-api node -`，容器内 `createRequire('/app/apps/api/package.json')` 解析 pg |
| 红线遵守 | 全程零 git 写操作；数据库仅 SELECT/SHOW 只读；未执行 migrate resolve/reset/db push 等任何写形态；未触碰任何 teardown 组合命令（含「删除 $env:TEMP\fm-rds.env」「停止本地 PG 54329」）；V6 `migrate dev` 为派发明确允许的安全复现，实测未产生任何写副作用（见 §2 V6）；仓库文件零修改（唯一新增：本报告） |
| 数据脱敏 | 本卡涉及数据均为迁移元数据（hash/时间戳/表行数），不含任何用户个人数据 |

---

## 2. 验收项逐项结果（V1~V6）

> 每项含：操作 / 预期（据 fm-dev 报告与派发规格）/ 实际（页面级=命令级实测）/ 证据落盘。版本均为 §1 全局版本，下同。

### V1 哈希数值复算 —— 通过

- **操作**：①node crypto 脚本（隔离沙箱内，仅读 4 个 migration.sql 的磁盘 Buffer 字节）计算 sha256 / sha384 / sha384 前 64 字符 / 字节数，脚本内 `fs.writeFileSync` 自落盘；②PowerShell Get-FileHash（SHA256/SHA384）双通道交叉验证。
- **预期**：init sha256=83036ad9...、dish_source sha256=c1699d9d...、timezone sha256=801f2066...、rescale sha256=aad63032...；rescale sha384[0:64]=0187eb1f...；字节数 init=6948B / dish_source=194B / rescale=57B / timezone=3690B。
- **实际**（EXIT=0，`V1_NODE_EXIT_OK`）：

| 迁移 | 字节 | sha256 | sha384[0:64] |
|---|---|---|---|
| 20260806000000_init | 6948 | `83036ad9ada77dcb5d48932e56a4c066b985d1ffbd56d67daf3544137635078c` | `ee3b9d1a27be60af90e4272f2117c0e93df237cd9ea57db0a694e6dc75522463` |
| 20260904000000_rescale_event_type | 57 | `aad630322f9ce295a7cfba2881ee990d9a6a6b10a3c0f5ee96e1716d3afdab04` | **`0187eb1f4842a775db9991a70b5f6e861e2034f1d6efe7d89581d6ff47d05f2c`** |
| 20260910000000_dish_source_image_fields | 194 | `c1699d9db61737ad165ac0f335f54cf5c8d4949d8a30fe9d12ad8ce9c73c81ff` | `6d8d85f2f568f4540359f8c403000be94a61399ea6296b1685e04d8af196c0cb` |
| 20260912000000_timezone_timestamptz | 3690 | `801f2066b13e4918dd8fc975d906991bc36f07f7a64dea9ea9f4d176c925d79b` | `13619f86fc794e0f33a2f284c60f274f40db8bedbbbb275022f93517050e8281` |

- **结论**：本地 DB 漂移行 checksum（`0187eb1f...`）== rescale 磁盘文件 sha384 前 64 字符，**「DB 值 = sha384 截断」假说实锤成立**；node crypto 与 Get-FileHash 双通道全部一致。
- **证据**：`v1-node.log`、`v1-ps.log`

### V2 本地 DB 4 行只读复核 —— 通过

- **操作**：node + pg（`createRequire('d:/codex/family-menu/apps/api/package.json')` 解析），仅一条 `SELECT id, migration_name, checksum, started_at, finished_at, logs, applied_steps_count FROM "_prisma_migrations" ORDER BY finished_at`（只读），脚本内自落盘。
- **预期**：ROW_COUNT=4；rescale 行 checksum=`0187eb1f...`、logs=NULL、started==finished（delta=0ms，2026-09-05T00:29:58.537Z）；其余 3 行 checksum==磁盘 sha256 且有毫秒级间隔。
- **实际**（EXIT=0，ROW_COUNT=4，`V2_EXIT_OK`）：

| migration | checksum（前 16 位） | started → finished | delta | logs | applied_steps |
|---|---|---|---|---|---|
| init（id=ea6394a7-f5f5-4e92-94fb-f9b2a6772dea） | 83036ad9ada77dcb | 09-04T14:07:34.480Z → .531Z | 51ms | null | 1 |
| **rescale（id=b95477a8-35ac-4ddd-afcb-2f8d79d65092）** | **0187eb1f4842a775** | 09-05T00:29:58.537Z → 同值 | **0ms** | **NULL** | 1 |
| dish_source（id=134987cc-f613-4eec-8582-3405922fad80） | c1699d9db61737ad | 09-10T06:09:15.173Z → .200Z | 27ms | null | 1 |
| timezone（id=91dcac8a-15b8-439d-a367-373a2ad5ac67） | 801f2066b13e4918 | 09-12T03:12:46.192Z → .362Z | 170ms | null | 1 |

- **结论**：漂移行确认；REV1 S-2 精确指纹（logs=NULL 且 started==finished ⇒ 手工 INSERT；logs=空串 ⇒ resolve --applied 产物）在实测数据上成立；其余 3 行 checksum 与 V1 磁盘 sha256 逐一相等。
- **证据**：`v2-local-db.log`

### V3 RDS 侧只读复核 —— 通过

- **操作**：PowerShell 以 stdin 管道将 CommonJS 只读脚本送入 `ssh fmsrv "docker exec -i family-menu-api node -"`（规避 PS 5.1 双引号剥离），执行 `SHOW server_version` + 6 行 SELECT + 容器内 4 个迁移文件磁盘哈希（只读 fs）。
- **预期**：SERVER_VERSION=18.3；ROW_COUNT=6；三值互异（回填行 `0187eb1f...` / deploy 行 `ab46297b...` / RDS 磁盘 sha384[0:64]=`d72aec8d...`）；RDS 磁盘全 CRLF（init 7171B / rescale 59B / dish_source 201B / timezone 3735B）；deploy 行 checksum == RDS 磁盘 sha256。
- **实际**（EXIT=0，`V3_EXIT_OK`）：
  - `SERVER_VERSION=18.3`，`ROW_COUNT=6`。
  - **三值互异成立**：回填行（b95477a8...，`0187eb1f4842...`）≠ deploy 行（6539da99-902c-4e6a-bba9-7ff6c10e9613，`ab46297bb38a4f829b037c4805f4745de9bda967b505c1cb2901975af971ad8a`）≠ RDS 磁盘 rescale sha384[0:64]（`d72aec8d5a25b6086eaa7fc967e9611ba1f806a3dc9b7ee9d208a5ae3df224dd`）。
  - **整行回填铁证**：RDS 回填两行 id（ea6394a7... / b95477a8...）与毫秒级 started/finished 时间戳与本地库对应行**逐一相等**（2026-09-04T14:07:34.480/531Z、2026-09-05T00:29:58.537Z）。
  - **RDS 磁盘全 CRLF 且自洽**：init 7171B sha256=`fc6faf2017c86b66cc9d86b20c6bf5d16d6a8a0e00359cc0835edb706559ceff`；rescale 59B sha256=`ab46297b...`；dish_source 201B sha256=`1883760fd3e24d2d2cfafba0338518c2d1da31643f9b56219c72f7eb2f2c8e5d`；timezone 3735B sha256=`c4a0e859a09b5f37b34a6acc71cebe5516e107ddcc3e5afcaaa94e34b90134d1`；RDS 4 行 deploy checksum == RDS 磁盘 sha256 **4/4 全自洽**（含 09-05 deploy 的 init/rescale 与 09-12 deploy 的 dish_source/timezone）。
- **证据**：`v3-rds.log`

### V4 git 成因复核 —— 通过

- **操作**（全只读）：`git log --follow --oneline -- apps/api/prisma/migrations/20260904000000_rescale_event_type/migration.sql`；`git rev-parse fbb4a53:<path>` 与 `git hash-object` 磁盘文件 blob 比对；`git diff` / `git diff --cached`；`git status --porcelain`；`git ls-files evidence/`。经 node execSync 采集落盘（原因见 §5 卡外发现 1）。
- **预期**：--follow 仅 fbb4a53；提交 blob == 磁盘 blob；零已跟踪改动；untracked 含 dev 报告。
- **实际**：
  - `LOG_FOLLOW_COMMIT_COUNT=1`：仅 `fbb4a53`（[TP-04] ...e2e 抓住并修复数据库枚举迁移遗漏）。
  - blob 哈希：committed = disk = `195afe558324314d2a2aa01f95875cf21f808093`（逐字节一致）。
  - `git diff` = 0 字节、`git diff --cached` = 0 字节 → **零已跟踪改动**。
  - `git status --porcelain` 共 13 条 untracked：`.pai/`、`docs/design/preview.html`、`docs/design/preview.md`、`docs/ui-redesign/`、`evidence/MIGRATE-CHK-dev-2026-09-12.md`、`tests/engine-perf.mjs`、`tests/step08-deploy-validate.cjs`、`tools/append-log.mjs`、`tools/fm-code.tar.gz`、`tools/fm-uifix2.tar.gz`、`tools/fm-uifix3c.tar.gz`、`tools/preview-server.mjs`、`复盘报告.md`（STATUS_LINE_COUNT=13）。
  - `git ls-files evidence/` = 56 个已跟踪文件；MIGRATE-CHK-dev **不在其中**（即该评估报告当前为未入库状态）。
- **证据**：`v4-git.log`（blob 两行）、`v4-git-summary.log`、`v4-git-status.log`、`v4-git-diff.log`（空）、`v4-git-diff-cached.log`（空）、`v4-git-log.log`、`v4-git-lsfiles.log`

### V5 REV1 修订点逐条核对（纯文件核验） —— 通过

- **操作**：逐行核读 dev 报告修订锚点 + 只读文本扫描（正则计数，落盘 `v5-rev1-grep.log`）。
- **预期**：7 条修订①~⑦全部落实；失实旧表述（「Go schema-engine」「7 天」等）在正文活语境零残留（仅允许存在于 REV1 引用/修订记录语境）。
- **实际**（`V5_EXIT_OK`，报告 329 行内容 / 分割 330 段）：
  - ① 暴露时点改 09-10 T-C01（T-1）：L127 落实（「漂移于 2026-09-10 T-C01 尝试 migrate dev 时首次暴露并留档...」），L320 修订记录；关键词 T-C01 共 4 行命中（124/127/271/320）。
  - ② 引擎语言改 Rust（S-1）：L70、L311 落实（「Rust 编译的 schema-engine 二进制」「prisma-engines 为 Rust 工作区...schema-engine-windows.exe」），L321 修订记录；Rust 共 3 行命中。
  - ③ LF/CRLF 引擎归一容差：L269 落实（「原始字节 / LF 归一 / CRLF 归一三种哈希任一匹配即通过」）；CRLF 共 4 行命中。
  - ④ 手工 INSERT 精确指纹：L54、L111 落实 + §2.5 增补只读查询；sha384 相关 14 行命中支撑对照法论证。
  - ⑤ resolve 写入口径源码级强指向（checksum.rs 单一实现点）：L241、L261、L309 落实。
  - ⑥ missing migration 措辞修正（S-5）：L237 落实（「删除已应用记录后应以 --applied 重新登记」），L325 修订记录。
  - ⑦ shadow drift 补披露 + 前置只读确认：L221、L312 落实；shadow 共 3 行命中。
  - **失实旧表述残留扫描**：`Go schema[- ]engine` 2 命中（L70 REV1 引用语境、L321 修订记录）；`7 天` 2 命中（L127 REV1 引用、L320 修订记录）；`missing migration` 2 命中（L237 REV1 引用、L325 修订记录）——**正文活语境零残留**。
- **证据**：`v5-rev1-grep.log`

### V6 EXIT=130 安全复现（派发标注可选） —— 通过

- **操作**：①快照前（只读 SELECT COUNT：information_schema 查 public 全表行数，node 脚本自落盘）→ ②cwd `apps/api` 执行 `$o = npx prisma migrate dev 2>&1`（**无任何降低确认门槛的标志**，非 TTY 非交互）记录 `$LASTEXITCODE` → ③快照后（同①）→ ④前后比对（排除 takenAt 深比较）。
- **预期**：非交互下 migrate dev 报错退出（预期 EXIT=130），报错文本命中 rescale modified after applied + 要求 reset；全程对 13 表零写副作用。
- **实际**：
  - 快照前：EXIT=0，`TABLE_COUNT=13`，takenAt=2026-09-12T18:37:49.433Z。13 表行数：CookLog=6 / Dish=48 / DishIngredient=365 / Event=93 / ExclusionRule=2 / Family=1 / FamilyRule=1 / Ingredient=79 / Menu=13 / MenuDish=42 / Plan=54 / Substitution=0 / _prisma_migrations=4。
  - `npx prisma migrate dev`：**MIGRATE_DEV_EXIT=130**；输出命中预期文本（「The migration \`20260904000000_rescale_event_type\` was modified after it was applied. We need to reset the "public" schema at "127.0.0.1:54329" ... You may use prisma migrate reset to drop the development database. All data will be lost.」）；非交互中止，**未执行任何 reset**。
  - 快照后：EXIT=0，`TABLE_COUNT=13`，takenAt=2026-09-12T18:39:33.563Z。
  - 比对：`TABLE_COUNT_BEFORE=13`、`TABLE_COUNT_AFTER=13`、`DIFFS=NONE`、**`IDENTICAL_EXCLUDING_TAKENAT=true`** → **零写副作用实锤**。
- **证据披露**：`v6-migrate-dev.log` 因 PS 5.1 对 2>&1 ErrorRecord 渲染的管道缺陷仅捕获到末行「All data will be lost.」；完整报错文本与退出码 130 系执行时终端输出直接确认（快照前后零差异已独立证明无写副作用）。
- **证据**：`v6-snap-before.json`、`v6-snap-after.json`、`v6-compare.log`、`v6-migrate-dev.log`

---

## 3. 总体判定

**PASS** —— V1~V6 六项全部通过，全部关键数字与 fm-dev 评估报告（含 REV1）**零差异**；红线全程遵守（零 git 写、零 DB/迁移写、零仓库文件修改、零 teardown 命令触碰）。

核心结论独立复核成立：
1. 本地漂移真实存在：DB rescale 行 checksum=`0187eb1f...`（sha384 截断口径）≠ Prisma 7.9.1 校验口径 sha256(磁盘)=`aad63032...`。
2. 成因链实锤：TP-04（09-05）migrate dev 被拦截 → 手工 SQL + 手工 INSERT（logs=NULL、delta=0ms 指纹）；RDS 侧同两行整行回填（id/时间戳与本地逐一相等）；文件提交历史干净（仅 fbb4a53，blob 与磁盘一致）。
3. fm-dev 报告 REV1 修订后无失实表述残留；处置建议（A>C>B>D）的事实基础全部复核通过。

---

## 4. 与 fm-dev 报告数字差异明细

**无。** 逐项对照全部相等：

| 对照点 | fm-dev 报告值 | fm-verify 实测 | 差异 |
|---|---|---|---|
| init sha256 / 字节 | 83036ad9... / 6948B | 同 | 0 |
| rescale sha256 / 字节 / sha384[0:64] | aad63032... / 57B / 0187eb1f... | 同 | 0 |
| dish_source sha256 / 字节 | c1699d9d... / 194B | 同 | 0 |
| timezone sha256 / 字节 | 801f2066... / 3690B | 同 | 0 |
| 本地 _prisma_migrations | 4 行；rescale logs=NULL、delta=0ms | 同 | 0 |
| RDS SERVER_VERSION | 18.3 | 18.3 | 0 |
| RDS _prisma_migrations | 6 行；三值互异（0187eb1f / ab46297b / d72aec8d） | 同 | 0 |
| RDS 磁盘 CRLF 字节数 | 7171 / 59 / 201 / 3735 | 同 | 0 |
| RDS deploy 行自洽 | ==RDS 磁盘 sha256 | 4/4 | 0 |
| 回填行 id/时间戳与本地相等 | 是 | 逐一相等 | 0 |
| git --follow | 仅 fbb4a53 | 1 commit | 0 |
| blob committed==disk | 195afe55... | 相等 | 0 |
| git status | 零已跟踪改动 | diff 0B + cached 0B | 0 |
| V6 退出码 | 130 | 130 | 0 |

---

## 5. 卡外发现（不属本卡验收范围，报主控裁量）

1. **证据采集工具缺陷（非仓库问题）**：PowerShell 5.1 原生命令（node/git）stdout 经管道直写文件存在丢行缺陷（初版 v1-node.log、v2-local-db.log、v4-git-status.log、v6-migrate-dev.log 仅存末行）。已改用 node 脚本内 `fs.writeFileSync` 自落盘与 `execSync` 变量捕获重采，全部证据现已完整；v6-migrate-dev.log 的不完整在 §2 V6 如实披露。该缺陷不影响任何验收数字。
2. **evidence/MIGRATE-CHK-dev-2026-09-12.md 尚未入库**：`git ls-files evidence/` 共 56 个已跟踪文件，本 dev 报告不在其中（untracked）。提请主控在批准合并时一并处理入库时点。
3. **仓库现存 13 条 untracked**（见 §2 V4 清单：复盘报告.md、tools/*.tar.gz、docs/ui-redesign/ 等）：属卡外状态，本次未触碰、未评估其内容。
4. **.gitignore 机制确认**：L10 `*.log`、L26 `.workflow-verify/` 将验收沙箱与日志排除入库——四角色验收证据的「不入库」定位与实际行为一致。
5. **跨环境字节差异记录**：本地 LF / RDS CRLF 导致同一迁移文件两环境 sha256 天然不同，但两侧各自内部自洽（RDS deploy 行 4/4 匹配 RDS 磁盘 sha256）；与 REV1 ③「引擎归一容差」描述一致，不构成新风险。

---

## 6. 证据文件清单（d:\codex\family-menu\.workflow-verify\migrate-chk\）

| 文件 | 内容 |
|---|---|
| v1-node.log | V1 node crypto 复算 4 行 + V1_NODE_EXIT_OK |
| v1-ps.log | V1 PowerShell Get-FileHash 交叉验证 4 行 |
| v2-local-db.log | V2 本地 DB 4 行全列 + delta_ms + V2_EXIT_OK |
| v3-rds.log | V3 SERVER_VERSION + 6 DB 行 + 4 DISK 行 + V3_EXIT_OK |
| v4-git.log | V4 blob 哈希 committed/disk 两行 |
| v4-git-summary.log | V4 汇总：status 13 条 + diff 字节数 + follow 计数 + ls-files 计数 + HEAD |
| v4-git-status.log / v4-git-diff.log / v4-git-diff-cached.log / v4-git-log.log / v4-git-lsfiles.log | V4 各只读命令原始输出 |
| v5-rev1-grep.log | V5 锚点行 12 条 + 三短语命中统计 + 关键词分布 |
| v6-snap-before.json / v6-snap-after.json | V6 快照（takenAt + 13 表 counts） |
| v6-compare.log | V6 比对结果 IDENTICAL_EXCLUDING_TAKENAT=true |
| v6-migrate-dev.log | V6 报错末行（不完整，已在正文披露） |
| rds-query.cjs / recheck-local.cjs | 历史辅助只读查询脚本残留 |
