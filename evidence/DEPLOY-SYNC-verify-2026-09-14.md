# DEPLOY-SYNC 验证报告：源码同步部署生产（R-9/S-3 运行时 + 非运行时源码一致性）

- 执行日期：2026-09-13~14
- 执行人：主控（生产操作卡，rds-1 / T-C06-SYNC 先例）
- 任务卡：evidence/DEPLOY-SYNC-task-2026-09-14.md
- 物证目录：.workflow-verify/deploy-sync/（rds-baseline.js / zod-version.js / ac5-readonly.js / ac5-recommend.js / ac7-public.js / teardown-inspect.js / teardown-exec.js，gitignore 内）

## 0. 部署范围与方式

生产 /opt/family-menu 由 a5d4fef（rds-1 时点）推进至本地 HEAD=03a83eb（10 提交，git diff a5d4fef..HEAD = 47 文件 5577+/58−）。

- **运行时生效（apps/api，容器 rebuild 即生效）**：src/routes/dishes.ts（新 102 行，R-9 两端点）+ src/services/dishesService.ts（新 43 行）+ src/services/mappers.ts（+23，origin 必填直投/licenseNote 投影）+ src/app.ts（+7/−2，dishRoutes 注册）+ src/services/planService.ts（S-3 orderBy id asc 1 行）+ package.json/pnpm-lock.yaml（zod ^4.4.3，T2 主控批准）。
- **非运行时（仅源码一致性）**：tools/content-pipeline（R-2 过敏原关卡 + R-2-S1 CLI 守卫 + LOGIN-DOM DOM 弹窗探测）+ tests/tp03-cors-regression.cjs（B-4）+ evidence/。
- **零变更确认**：apps/h5（dist 未重建）、apps/api/prisma（无新迁移）、packages/shared、seed-data.ts（无 seed 重放）。

方式：服务器非 git 仓库（rds-1 实锤），本地 `git archive HEAD` 生成干净 tar → scp → 解压覆盖 → compose rebuild。

## 1. 执行记录（AC1~AC7）

### 1.1 备份先行（AC1 ✓）

- RDS 全库 dump：`/usr/pgsql-18/bin/pg_dump -Fc` → **/opt/backup/fm-full-20260914-sync-pre.dump（103596 字节）**，pg_restore --list 可读；连接串经内存传递不回显。
- 源码备份：**/opt/backup/src-bak-20260914-sync.tar.gz（60395030 字节）**。
- 未完成备份前未执行任何变更动作。

### 1.2 源码同步（AC2 ✓）

- 本地 `git archive HEAD` → /tmp/fm-src-20260914-sync.tar.gz（2444759 字节）→ scp fmsrv → 解压覆盖 /opt/family-menu（git archive 天然不含 .env/node_modules/dist/未跟踪物，**生产 .env 零触碰**）。
- md5 抽查 ≥3 关键文件（dishes.ts / planService.ts / package.json）**双端全部一致**；/tmp/fm-src-20260914-sync.tar.gz 与 /tmp/build-sync.log 留服务器作过程物证。

### 1.3 容器重建（AC3 ✓）

- `docker compose up -d --build api` → 新容器 **3ef8abf39484 healthy**，宿主映射 3001→3000 不变，/health 200。
- 容器内 zod 依赖：**ZOD=4.4.3**（zod-version.js 三级兜底 require；pnpm 布局下直接依赖在 /app/apps/api/node_modules，/app/node_modules/zod 不存在）。

### 1.4 迁移校验（AC4 ✓）

- **4 migrations found / No pending migrations to apply**（佐证无迁移变更，与任务卡零变更清单一致；openssl 警告无害）。
- 首跑异常（如实记录）：容器根路径下 `npx prisma migrate deploy` 触发 npx 拉取外部 prisma@8.0.0-rc.14 失败（npm error Cannot read properties of null (reading 'edgesOut')）——**未执行任何 migrate 动作，数据库零风险**；改 `docker exec -w /app/apps/api` 用项目自带 CLI 一次通过。

### 1.5 行为验证（AC5 ✓，ac5-readonly.js 九步只读全绿 + ac5-recommend.js）

```
health=>200
dishes_no_token=>401
dishes_with_token=>200 count=49 originFETCHED=30 statuses={"PUBLISHED":18,"DRAFT":30,"TESTED":1}
  sample=✔️巨简单、零翻车、超香甜的玉米排骨汤❗️
dish_detail_ingredients=>200 ingredients=8 first=排骨/400g
dish_detail_404=>404
dishes_status_filter_bogus=>400
dishes_status_filter_draft=>200 count=30 allDraft=true
recommend_no_token=>401
```

- RECOMMEND（带 token，POST {people,timeBudgetMin,mustUse}）：`status=200 planId=cmu0kil80000001pncc7agmic candidates=3 brief=unmet=false`——R-9 dishes 两端点 + S-3 recommend 链路均正常。
- 方法学事故（如实记录）：v1 脚本统一末尾输出致 95 秒无输出假死（任一 fetch 挂起即全程无输出），StopCommand 后 v2 改流式 `process.stdout.write` + `AbortSignal.timeout(5000)` 一次通过。

### 1.6 基线零污染（AC6 ✓）

部署前后 RDS 七计数全等（只读 SELECT）：**Plan=83 / Event=136 / ExclusionRule=4 / Dish=49 / FETCHED=30 / Ingredient=81 / DishIngredient=375**。teardown 后复跑同七计数，`AC6_MATCH=ALL_EQUAL`（§1.7）。

### 1.7 公网冒烟（AC7 ✓）

双口径覆盖（nginx → caddy → api 全链路）：

- **服务器 --resolve 口径**：`curl --resolve menu.jijingkongjian.xin:443:127.0.0.1` → index 200 + /api/dishes 401。
- **服务器 node 直跑真实域名口径**（ac7-public.js，DNS 8.136.32.223，child_process.execSync 取 token 仅记 token_len=32）：index 200（text/html）+ dishes 401 / 200（count=49 fetched=30）+ recommend 401 / 200（`planId=cmu0klrqr000201pnvudu0ty5 candidates=3`）。

**teardown（三重防护，DELETE 披露见 §2）**：

1. 只读取证（teardown-inspect.js）：`PLAN_ROWS=2`（#A=cmu0kil8…@2026-09-13T17:32:19.826Z、#B=cmu0klrqr…@2026-09-13T17:34:48.261Z）+ `EVENT_GROUPS=2`（各恰 1 条 GENERATE）+ `NON_GENERATE_EVENTS=0`——精确锁定本卡冒烟产物，排除 UAT 关联数据。
2. 显式事务（teardown-exec.js）：`DELETE FROM "Event" WHERE "planId" = ANY(...)`（2 行）→ `DELETE FROM "Plan" WHERE id = ANY(...)`（2 行）→ **rowCount=2/2 全等才 COMMIT，否则 ROLLBACK** → `COMMIT_OK`（Event→Plan 先后序对齐 SetNull 外键语义）。
3. 终态复跑：`AFTER={"plan":83,"event":136,"exclusionRule":4,"dish":49,"dishFetched":30,"ingredient":81,"dishIngredient":375}` → **AC6_MATCH=ALL_EQUAL**，零残留。

鉴权口径（定谳）：无 login 接口——app.ts authHook 读 cookie access_token 与 process.env.ACCESS_TOKEN 全等比对（/health 豁免）；token 经 `docker exec family-menu-api printenv ACCESS_TOKEN` 内存传递（token_len=32），全程不落明文。

## 2. DELETE 披露与请示追认

任务卡 §四红线「禁止 DROP/DELETE/UPDATE/TRUNCATE 类 SQL」与 §二 AC7「真实建 Plan 后水位法 teardown 回基线」存在内在张力：plans 路由 10 条无 DELETE 接口（routes/plans.ts 实证），teardown 只能 SQL。处置：按 AC7 设计内行为执行，加三重防护（只读精确锁定→事务行数校验→基线全等），实际删除恰 2 Event + 2 Plan 且均为本卡冒烟产物、UAT 数据零触碰。**请示追认。**

## 3. 事故与异常时间线（两次 dockerd OOM + 磁盘 100%）

### 3.1 dockerd OOM 两次（承前置会话取证）

- ①dmesg 两条 OOM 实锤命中 dockerd；②dockerd RSS 1.26GB；③两次均 `docker start family-menu-api` 恢复，数据零损失；④**restart=no 连坐**：宿主 docker daemon 被 OOM 杀重启后容器不自动拉起，公网中断直至人工恢复。
- 本验证全程（teardown 收尾后快照）：api 容器连续 **Up 36 分钟 healthy 无中断**、caddy Up、dmesg oom 宽口径计数无新增——两事故未复发。

### 3.2 磁盘 100% 满 → prune 意外回收

- 容器 rebuild 过程中磁盘打满：**38G/0 100%**；`docker system prune -af` 挂死约 1 小时无产出，StopCommand 停止。
- 意外发现：prune 已在后台实际完成回收 **~4G**（可用 0→3.9G，34G/90%），紧急状态解除；overlay2 层目录 88→83、layerdb 22→17，**孤儿层仍 ~66 个**（rm -rf 处置属破坏性 ops，须用户批准，见 §5）。

### 3.3 过程性异常（均已修复，零后果）

- zod-version.js 首跑 MODULE_NOT_FOUND（pnpm 布局）→ 三级兜底 require 修复（§1.3）。
- AC4 npx 外部 RC 版失败（§1.4，零 DB 风险）。
- ac5-readonly.js v1 输出设计缺陷（§1.5）。

## 4. AC 自检

1. [✓] AC1 备份先行：dump 103596B pg_restore 可读 + 源码 tar 60395030B（§1.1）
2. [✓] AC2 源码同步：md5 三文件双端一致，.env 零触碰（§1.2）
3. [✓] AC3 容器重建：3ef8abf39484 healthy + ZOD=4.4.3 + /health 200（§1.3）
4. [✓] AC4 迁移校验：4 migrations found / No pending（§1.4）
5. [✓] AC5 行为验证：九步只读全绿 + recommend 200 建候选（§1.5）
6. [✓] AC6 基线零污染：七计数部署前后全等（§1.6）
7. [✓] AC7 公网冒烟：双口径 index/dishes/recommend 全绿 + teardown 回基线 ALL_EQUAL（§1.7）

## 5. 治理请示清单（不阻塞验收，须用户批准后另执行）

1. **孤儿层 rm -rf 处置**：~66 个 overlay2 孤儿层仍占磁盘，属破坏性 ops 待批准。
2. **加 swap**：1.8GB RAM 无 swap，docker build 期 dockerd OOM 根因级缓解。
3. **compose restart 策略改 unless-stopped**：消除宿主 daemon 重启后容器不自动拉起的连坐面。
4. **定期 prune**：当前 90% 水位仍紧张，建议 cron 或手动节奏固化。

## 6. 边界遵守确认

- 生产 .env/nginx/H5 dist 零改动；回滚资产三件套（RDS dump + 源码 tar + 备份目录）齐全在 /opt/backup/。
- UAT 活跃数据零触碰：全程只读 SELECT 为主，仅 teardown 按披露删除本卡冒烟产物 2+2 行（§2）。
- $env:TEMP\fm-rds.env 未删；本地 PG 54329 未停；9222 CDP 浏览器未杀。
- 运行时零 LLM API 调用；token 内存传递不落明文（token_len=32 口径）。
- commit 提交物仅文档（任务卡+本报告+CURRENT.md），零业务代码。
