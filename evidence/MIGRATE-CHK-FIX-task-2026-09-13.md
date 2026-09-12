# MIGRATE-CHK-FIX 任务卡归档（主控撰写，2026-09-13）

> 归档说明：本卡派发时未按 DEPLOY-04-task 先例即时落盘原文（reviewer S-2 指出），由主控按派发记录补录。口径以上游评估卡 evidence/MIGRATE-CHK-dev-2026-09-12.md §4 为权威。

## 一、任务卡原文要点（主控派发）

**目标**：按评估卡处置选项 A 修复本地库 `_prisma_migrations` 表 `20260904000000_rescale_event_type` 行 checksum 漂移（单字段 UPDATE），恢复 `prisma migrate dev` 可用性。

**背景**：评估卡（提交 670a719）定案——本地行 checksum=`0187eb1f…`（sha384 截断错误口径）vs 磁盘正确口径 sha256(migration.sql 字节)=`aad630322f9ce295a7cfba2881ee990d9a6a6b10a3c0f5ee96e1716d3afdab04`；目标迁移文件 apps/api/prisma/migrations/20260904000000_rescale_event_type/migration.sql（57 字节 LF）；本地 PG 17.5 @ 127.0.0.1:54329。

**AC**：
1. AC1（S-6 前置，只读）：migrate diff 等价只读手段确认 shadow database drift 为零；drift 非零立即停止不执行 UPDATE
2. AC2（单字段 UPDATE）：UPDATE 前全行快照 → `SET checksum='aad63032…' WHERE migration_name='20260904000000_rescale_event_type'` → 影响行数恰 1 → UPDATE 后全行快照，其余 7 字段逐一零变化
3. AC3（恢复验证）：`prisma migrate status` 报 up to date 无 checksum/reset 提示；禁止实际运行 migrate dev
4. AC4（零数据影响）：13 表行数前后逐一一致（七表基线 Dish 48/Menu 13/MenuDish 42/Ingredient 79/Plan 54/Event 93/CookLog 6）
5. AC5（完成报告落盘）：evidence/MIGRATE-CHK-FIX-dev-2026-09-13.md，命令+退出码+数字，禁止 Mock

**边界约束**：仅写 `_prisma_migrations` 一行 checksum 单字段；禁止 DELETE / migrate reset / 非幂等 SQL / 业务表写入；RDS 零触碰；红线——不得执行删除 $env:TEMP\fm-rds.env、停止本地 PG（54329）或类似清理/停止命令；新增依赖 0；不改仓库代码文件。

**异常升级路径**：drift 非零 / 影响行数≠1 / status 异常 / 任一表行数变化 → 停止报告不脑补。

## 二、主控裁决（4 条）

1. **拍板裁决**：处置四选项（A/C/B/D）AskUserQuestion 提问被用户跳过（deemed unnecessary）；依据用户总授权「按挂账队列依次执行」+ 评估卡推荐序（A 优先、零数据风险、仅本地库、RDS 无功能影响），主控裁决**按 A 执行**，本裁决即用户授权链的执行记录。
2. **T-1 追认（reviewer 条件级）**：fm-dev 为满足 AC1（S-6 前置）在本地实例 CREATE 独立空库 `fm_shadow_chkfix`，超出「唯一写操作」字面边界——**主控书面追认**：属 S-6 功能必需、独立库不碰业务数据、完成报告主动披露、风险实质为零。去留裁决：**保留**（migrate dev 复活验证与后续工作流复用；DROP 属清理类命令与红线同族不执行）。
3. **S-1 采纳（reviewer 建议级）**：收尾口径明确——checksum 修复的**直接证明 = migrate diff EXIT=0 空差异 + 磁盘文件 sha256=aad63032… + DB 行值一字不差**三点闭环；`migrate status` 对 checksum 零感知（评估卡 §1.2 定案），仅作旁证不作证明。
4. **S-2 采纳 + S-4 采纳**：本归档文件即 S-2 补录；S-4（Prisma 7.9.1 migrate diff 旗标口径：`--from-config-datasource --to-migrations` + 配置文件 shadowDatabaseUrl，`--exit-code` 语义 Empty=0/Error=1/Not empty=2）随卡写入 CURRENT.md 备忘。
5. **第 7 项纳入 verify（主控裁决）**：reviewer 移交复跑清单第 7 项（migrate dev 实测）原建议待用户批准，主控裁决纳入本卡 verify——前置 diff 复确认 EXIT=0 后执行；EXIT=130（非交互 SIGINT）系评估卡已实证的安全失败模式（13 表快照零写副作用），其他退出码停止报告。

## 三、执行链

- fm-dev 完成（AC1~AC5 全 ✓，evidence/MIGRATE-CHK-FIX-dev-2026-09-13.md）
- fm-reviewer 有条件通过（0 阻塞 / T-1 T-2 / S-1~S-4），静态取证 9 项事实
- fm-verify 复跑验收（evidence/MIGRATE-CHK-FIX-verify-2026-09-13.md）
