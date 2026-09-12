# T-P14 时区口径统一：时间列迁移 timestamptz（挂账④）

> 立项依据：挂账④「CookLog 与 Plan/Event 时区口径不一致」；证据链 T-C05-dev L154（首发现）→ T-P09-verify L125/L149（N2 UTC 钟面窗口教训）→ T-P11-dev L80（PG 时钟偏移 8 小时披露，建议并轨评估）。2026-09-12 主控读码+DB 只读诊断核实后成文两方案，用户经选项批准**方案 A：迁 Timestamptz**（同批批准⑧ regex 收紧=T-P15，本卡完成后串行执行）。

## 目标

把 DB 全部时间列从 `timestamp without time zone` 迁为 `timestamptz`，钉死「绝对时刻」语义，根治两类现存问题：
1. Plan/Event 读回绝对时刻偏 −8h（写入 UTC 钟面 + node-pg 按本地时区解析无时区钟面）；
2. 深夜（本地 0:00–8:00）生成 Plan 时 history 页 formatDate 显示日期提前一天。

## 主控诊断实证（2026-09-12 10:47，便携 PG，只读）

- `SHOW timezone` = **Asia/Shanghai**；now() = `2026-09-12 10:47:24.37+08`
- 列类型：CookLog.cookedAt / Plan.planDate / Plan.createdAt / Event.createdAt / Family.createdAt = `timestamp without time zone`（诊断查询未含 FamilyRule.updatedAt，同为 Prisma DateTime 同机制）
- **同库两种钟面并存（挂账④机制实锤）**：
  - CookLog.cookedAt = **本地钟面**（6 行：09-05 01:03:28.352 / 01:04:06.356 / 01:04:06.385 / 09-10 15:25:04.177 / 15:45:57.547 / 17:55:58.267）——写入路径 INSERT 不带该列，由 DB `CURRENT_TIMESTAMP` 填充（服务器时区钟面）
  - Plan.createdAt（54 行 09-04 14:10:18.26~09-06 09:04:09.747）/ Plan.planDate（…09.745）/ Event.createdAt（93 行 …09.754）= **UTC 钟面**（Prisma/驱动显式传值，pg 驱动把 JS Date 序列化为 UTC）
- 读回歧义：node-pg 对无时区钟面按**本地时区**解析 → Plan/Event 读回 Date 偏 −8h；~~CookLog 因「本地写+本地读」恰好闭环正确~~（**已勘误 2026-09-12，见终态节 + T-P14-review 附录六**：该结论仅对 node-pg 直查路径成立；Prisma 栈（adapter-pg）下恰好相反——Plan/Event 碰巧正确、CookLog 读回错 +8h）

**勘误声明**：报批消息中写「5 列」系主控漏数，实际 6 处 DateTime 列（漏计 FamilyRule.updatedAt L40，@updatedAt 由 Prisma client 生成 new Date() → UTC 钟面，同机制同处置）。用户批准的是「方案 A 迁 Timestamptz」方向，列数修正属事实勘误非方案变更。

## AC（验收线，逐条 [✓]/[✗] 自检）

- **AC1** schema.prisma 6 处 DateTime 加 `@db.Timestamptz`：Family.createdAt / FamilyRule.updatedAt / CookLog.cookedAt / Plan.planDate / Plan.createdAt / Event.createdAt；`prisma validate` 过 + `prisma generate` 成功（shared/engine 零改动）
- **AC2** 手写迁移 SQL（`prisma migrate dev --create-only` 生成骨架后**必须改写**：Prisma 自动生成的 ALTER 无 USING，会按会话时区 Asia/Shanghai 解释旧钟面 → Plan/Event 全错 8h）：6 列 ALTER ... TYPE timestamptz 带 USING 分支——**UTC 钟面列**（Plan.planDate/Plan.createdAt/Event.createdAt/Family.createdAt/FamilyRule.updatedAt）`USING col AT TIME ZONE 'UTC'`；**本地钟面列**（CookLog.cookedAt）`USING col AT TIME ZONE 'Asia/Shanghai'`。Family/FamilyRule 钟面归属先读 seed.ts/seed-data.ts 写入路径 + 直查基线库钟面**双重确认**（判定过程写进报告）；本地基线库应用成功
- **AC3** 迁移后双向抽查断言（与上表诊断数字精确对照）：
  - Plan.max(createdAt) → `'2026-09-06 09:04:09.747+00'`；Event.max → `'2026-09-06 09:04:09.754+00'`；Plan.max(planDate) → `'2026-09-06 09:04:09.745+00'`
  - CookLog.max(cookedAt) → `'2026-09-10 09:55:58.267+00'`（本地 17:55 − 8h）
  - 经 Prisma 读回 `Date.toISOString()`：Plan.max → `'2026-09-06T09:04:09.747Z'`、CookLog.max → `'2026-09-10T09:55:58.267Z'`（读回=写入真实绝对时刻）
- **AC4** 回归全绿：根 `pnpm test`（串行）数字自洽（基线 390=387+3skipped，若窗口口径更新增删用例须算术自洽）+ `pnpm test:taboo` 89/89 + tp01/tp12 全过 + h5 `typecheck` 0 错 + api `tsc` 0 错
- **AC5** 测试/脚本 UTC 钟面窗口口径逐处评估：grep tests/** 与 apps/api/test/** 中用裸钟面字符串比较时间列的清理窗口（tp08/tp12 先例口径），timestamptz 下裸字符串按**会话时区**解释、语义已变——逐一更新（建议 `AT TIME ZONE 'UTC'` 显式标注或 interval 相对窗口）并落清单；teardown 七表回基线 Dish=48/Menu=13/MenuDish=42/Ingredient=79/Plan=54/Event=93/CookLog=6 REL=29
- **AC6** seed 重放（db:seed 或等价流程）成功、语义不变（seed 显式传时间→原样；依赖 default→timestamptz 列 CURRENT_TIMESTAMP 语义=绝对时刻不破坏；若 seed 内有钟面断言冲突做最小修并报告）
- **AC7** 迁移文件头部注释写明每列钟面归属依据；SQL 无本机路径/端口硬编码，公网 RDS 可直接 `prisma migrate deploy`（对接挂账①「迁移脚本参数化」项）
- **AC8** 完成报告落盘 `evidence/T-P14-dev-2026-09-12.md`：含 5→6 列勘误确认、窗口口径改动清单、AC2 判定过程、AC3 抽查断言真实输出、全部测试命令+退出码+数字

## 输入资源

- [schema.prisma](../../../apps/api/prisma/schema.prisma)（L29/L40/L178/L193/L200/L217 六处）
- 迁移先例：apps/api/prisma/migrations/（init / 20260904_rescale / 20260910_dish_source_image）
- T-C05-dev L154 / T-P09-verify L125+L149 / T-P11-dev L80（证据链）
- 环境：便携 PG 未启动，dev 自行 `& "d:\codex\family-menu\.pg\bin\pg_ctl.exe" -D "d:\codex\family-menu\.pg\data" -o "-p 54329" -l "d:\codex\family-menu\.pg\pg-tp14dev.log" start`——**必须带 `-o "-p 54329"`**（主控今日踩坑：缺省时 conf 端口 5432 会导致连接拒绝）；连接串 `.env` postgresql://postgres@127.0.0.1:54329/family_menu；用完 `-m fast stop` 还原
- `pnpm db:migrate` / `pnpm db:seed`（AGENTS.md 常用命令）

## 边界约束

- 允许改：schema.prisma、prisma/migrations/**（新建迁移）、tests/** 与 apps/api/test/** 窗口口径、seed.ts/seed-data.ts（仅当钟面断言冲突时最小修）
- 禁改：packages/shared/**、packages/engine/**、apps/h5/src/**、apps/api/src/**（若读回语义修正暴露 API 测试断言冲突：属预期语义修正，测试侧适配并在报告说明；API 业务代码确需改动则停下报主控）
- 禁升级 prisma/pg 及任何依赖；禁 drop 表重建；迁移应用失败/抽查断言不符 → 保留现场（pg log + SQL + 断言输出）停下报主控
- 环境纪律：PG 用后 `-m fast stop`；并行派发不适用（WIP=1，本卡独占 PG）

## 异常升级路径

USING 方向争议 / seed 结构性冲突 / 迁移后基线数据对不上诊断数字 → 停手报主控，不得自行改方案。

## 终态（2026-09-12 主控补登）

**判定：已完成，随卡提交**——fm-dev AC1~AC8 全 [✓] → fm-reviewer **PASS-有条件**（12 审查点 11 [✓]；S-1 建议级转主控裁决已闭环，见 [T-P14-review 附录六](../../../evidence/T-P14-review-2026-09-12.md)）→ fm-verify **PASS（9 项复跑全命中 + 2 项静态确认，与 dev/review 零数字差异）**。证据三件套：[T-P14-dev-2026-09-12.md](../../../evidence/T-P14-dev-2026-09-12.md) / [T-P14-review-2026-09-12.md](../../../evidence/T-P14-review-2026-09-12.md) / [T-P14-verify-2026-09-12.md](../../../evidence/T-P14-verify-2026-09-12.md)。

- **实现交付**：[schema.prisma](../../../apps/api/prisma/schema.prisma) 6 处 DateTime 加 `@db.Timestamptz`（L29/L40/L178/L193/L200/L217，+6/−6）+ 手写迁移 [20260912000000_timezone_timestamptz](../../../apps/api/prisma/migrations/20260912000000_timezone_timestamptz/migration.sql)（6 条 `ALTER ... TYPE TIMESTAMPTZ(3) USING`：5×`AT TIME ZONE 'UTC'` + CookLog×`'Asia/Shanghai'`，头部注释逐列钟面归属依据，无本机路径/端口硬编码可直跑公网 RDS）；`migrate deploy` 本地基线库应用成功（`_prisma_migrations` 4 条全部 finished=true）。
- **AC3 双向断言全命中**：SQL 侧 6 组 max 逐字节精确命中（Plan.max(createdAt)=`2026-09-06 09:04:09.747+00`、Event.max=`…09.754+00`、Plan.max(planDate)=`…09.745+00`、CookLog.max=`2026-09-10 09:55:58.267+00`、Family/FamilyRule=`2026-08-06 00:00:00+00`），六列实测全 `timestamp with time zone`；Prisma 侧 7/7 HIT（Z 渲染，读回=写入真实绝对时刻）。
- **AC4/AC5 回归与 teardown**：根 `pnpm test` **390/390 0 skipped**（T-P13 基线 387+3skipped——3 条 projection-order DB 集成用例 PG 常驻后首次真实执行，AC4 预告的合法口径变化）+ taboo 89/89 + tp01 54 PASS + tp12 18 PASS（submittedAt UTC Z 渲染）+ h5 typecheck / api tsc 双 0 错；teardown 七表回基线 Dish=48/Menu=13/MenuDish=42/Ingredient=79/Plan=54/Event=93/CookLog=6 + REL=29；测试窗口口径 0 改动（reviewer 审查点 10 核实「0 处裸钟面字符串比较」成立）。
- **环境处置（方案 D）与系统约束显性化**：`.pg/data/postgresql.conf` L740 固化 `timezone='UTC'`（log_timezone 保持 Asia/Shanghai 不动；重置 .pg 后须重新固化）；系统约束「所有 PG 会话须以 UTC 运行」生效（adapter-pg `normalize_timestamptz` 假设会话 UTC 的设计前提）；生产 RDS 参数组 timezone='UTC' 对接挂账①。
- **S-1 裁决勘误（主控 2026-09-12，见 review 附录六）**：dev §9 断言为真（主控经 jsdelivr 取得 adapter-pg@7.9.1 dist 源码实证 `normalize_timestamp`/`normalize_timestamptz` 双函数；reviewer 审查点 12 [✗ 未验证] 系其沙盒 node_modules 读取限制，S-3「依赖空壳」经主控 PowerShell 深度实测证伪——Glob/LS 对 pnpm 符号链接穿透误判，勘误记 review 附录六第 7 条）；T-P11-dev L80「PG 服务器时钟偏移 8h」实测系 **node-pg 直查路径**按本地解释 UTC 钟面（teardown .cjs 产物在案），原文误判；「同库两种钟面 × 两套读取器」2×2 歧义矩阵**本卡根除**（迁移后两类读取器读回均为与时区无关的绝对时刻，写读口径唯一）——上方 L18 初判已随此勘误删除线标注。
- **卡外发现（挂账）**：migrate **checksum 漂移**——`20260904000000_rescale_event_type` 本机 `_prisma_migrations` checksum 与迁移目录文件不一致，`prisma migrate dev` 永远要求 reset（exit 130）；本卡维持 **migrate deploy-only** 口径，漂移成因与处置独立评估挂账。
- **verify 未覆盖移交**：公网 RDS deploy + RDS 参数组 UTC（对接①，部署时处置）；h5 真机回归未做（本卡 h5 零改动；formatDate 日期提前一天问题的用户可见修复属部署后观察项，成因不再单独追查）；conf 改动不入库（.gitignore `.pg/` 在案），云上等价物=RDS 参数组按环境择一。
- **环境还原**：dev server 停、PG `-m fast stop`、端口 3000/54329 双闭；新增依赖 0；历史遗留 untracked 经 verify 核实创建时间早于本卡开工日，非本卡引入。
