# DEPLOY-SYNC 任务卡：源码同步部署生产（R-9/S-3 运行时 + R-2/R-2-S1/LOGIN-DOM/B-4 非运行时）

> 立卡：主控 2026-09-14。执行方式：主控亲自执行（rds-1 / T-C06-SYNC 生产操作卡先例）。
> 授权依据：用户上轮「回复『部署』或『继续』即按推荐序推进」，本轮「继续」=批准源码同步部署。

## §一 目标与范围

生产 /opt/family-menu 由 a5d4fef（rds-1 时点）推进至本地 HEAD=03a83eb（10 提交）。差异盘点（git diff a5d4fef..HEAD = 47 文件 5577+/58−）：

**运行时生效（apps/api，容器 rebuild 即生效）**：
| 文件 | 来源卡 | 内容 |
|---|---|---|
| src/routes/dishes.ts（新 102 行） | R-9 | GET /api/dishes（status 白名单）+ GET /api/dishes/:id |
| src/services/dishesService.ts（新 43 行） | R-9 | 服务层 |
| src/services/mappers.ts（+23） | R-9 | origin 必填直投 + licenseNote 投影 |
| src/app.ts（+7/−2） | R-9 | dishRoutes 注册 + 路由注释 17 条实数口径 |
| src/services/planService.ts（1+/1−） | S-3 | resolveMustUseIds findMany 加 orderBy id asc |
| package.json + pnpm-lock.yaml | R-9（T2 主控批准） | 新增依赖 zod ^4.4.3 |

**非运行时（生产不执行，仅源码一致性）**：tools/content-pipeline（R-2 过敏原关卡 + R-2-S1 CLI 守卫 + LOGIN-DOM batch-fetch——生产管线目录无 node_modules/dist 不运行，T-C06-SYNC 定案）、tests/tp03-cors-regression.cjs（B-4）、evidence/（各卡报告）。

**零变更确认（本次部署不涉及）**：apps/h5（无需重建 H5 dist）、apps/api/prisma（无新迁移 → migrate deploy 应 No pending）、packages/shared、seed-data.ts（无需 seed 重放）。数据库内容已由 T-C06-SYNC 对齐（Dish 49/FETCHED 30/Ingredient 81/DI 375）。

## §二 AC 清单

- AC1 备份先行：RDS 全库 dump（/usr/pgsql-18/bin/pg_dump -Fc）落 /opt/backup/ 且 pg_restore --list 可读 + 生产源码 tar 备份。
- AC2 源码同步：tar 解压覆盖后 md5 抽查 ≥3 个关键文件（dishes.ts / planService.ts / package.json）双端一致；生产目录 .env 不被触碰。
- AC3 容器重建：docker compose up -d --build api 后新容器 healthy；容器内 zod 依赖就位（node -e 解析版本 4.x）。
- AC4 迁移校验：容器内 prisma migrate deploy → No pending（佐证无迁移变更）。
- AC5 行为验证（容器内 localhost:3000）：GET /api/dishes 无 token 401 / 带 token 200 且含 FETCHED 菜；GET /api/dishes/:id 取一 FETCHED 菜 200 且含 ingredients 数组；随机 cuid 404；POST /api/recommend no-token 401（S-3 改动后 recommend 链路正常）。
- AC6 基线零污染：部署前后 RDS 计数 Plan=83 / Event=136 / ExclusionRule=4 / Dish=49 / FETCHED=30 / Ingredient=81 / DishIngredient=375 全等（只读 SELECT，零写入）。
- AC7 公网冒烟：`curl --resolve menu.jijingkongjian.xin:443:127.0.0.1` 口径 index 200 + /api/dishes 401/200 + /api/recommend 401/200（真实建 Plan 后水位法 teardown 回基线）。

## §三 runbook（承 rds-1 六步先例）

1. ①定案：探查生产容器/源码现状（api 容器 healthy、当前源码版本锚点 planService.ts 是否含 orderBy）。
2. ②备份：RDS dump + 源码 tar（/opt/backup/，时间戳后缀 20260914-sync）。
3. ③同步：本地 `git archive HEAD` 生成干净 tar（天然不含 .env/node_modules/dist 未跟踪物）→ scp 上传 → 解压覆盖 → md5 抽查 → `docker compose up -d --build api`（rebuild 含 pnpm install 拉 zod）→ `prisma migrate deploy`。
4. ④验证：AC3~AC5 容器内执行。
5. ⑤冒烟：AC6 + AC7。
6. ⑥落档：验证报告 evidence/DEPLOY-SYNC-verify-2026-09-14.md + CURRENT.md 落段 + git 提交（提交物仅文档，零业务代码）。

## §四 边界与红线

- 备份先行，未完成备份不执行任何变更动作。
- UAT 活跃数据零触碰：全程只读 SELECT；AC7 冒烟建 Plan 用水位法 teardown（Event 按 planId → Plan 按 createdAt>水位），回基线核验。
- 禁止 DROP/DELETE/UPDATE/TRUNCATE 类 SQL。
- 容器 rebuild 期间旧容器保持 healthy（rds-1 先例：compose --build 原地替换，中断窗口仅容器切换秒级）。
- H5 零变更不重建 dist；nginx 不动。
- ssh 用别名 fmsrv；PowerShell 下含 `$()` 的远端命令以单引号包裹整个远端命令串。
- 服务器 /opt/family-menu 非 git 仓库（rds-1 实锤），tar/scp 同步口径；deploy.sh 的 git pull 不适用。

## §五 异常升级路径

任一 AC 失败 → 停止执行并报告：容器异常可回滚至备份源码 tar 重建旧版本；数据异常可 pg_restore 备份 dump（须用户批准）；发现计划外差异（如远端文件与 a5d4fef 不符）→ 先取证再决策，不带病推进。

## §六 交付物

- evidence/DEPLOY-SYNC-verify-2026-09-14.md（验证报告）
- CURRENT.md 落段 + git 提交
- 物证存 .workflow-verify/deploy-sync/（gitignore 内）
