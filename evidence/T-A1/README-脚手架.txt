T-A1 本地验收脚手架（L2 证据附件，2026-10-03 由 tools/ 归档至此）

定位：仅本地的一次性验收辅助脚本。便携 PG（zonky 精简包）缺 createdb/psql 可执行文件，
故用 apps/api 既有 pg 驱动直连 127.0.0.1:54329；只服务于 T-A1 的本地空库验收（AC5）。
不含口令/密钥，不连生产，无新增依赖；不属业务代码，门禁不经过它们。

用法（均在仓库根目录执行；PG 启停用仓库既有 tools/.pg-init.mjs / pg_ctl，端口 54329）：
1. node evidence/T-A1/.pg-createdb-a1.mjs
   建库（幂等）并校验本地一次性库 family_menu_a1。
2. node evidence/T-A1/.pg-a1-deliberate.mjs publish|dangling|restore
   publish=绕过发布入口直改 status=PUBLISHED（复刻 09-14 裸 SQL 场景，check:safety 应FAIL）；
   dangling=把花生 INGREDIENT 规则 targetId 改成不存在 id（复刻悬空场景，应FAIL）；
   restore=两者复原（闭环：restore 后 check:safety 应回 exit 0）。
3. 配套检查：pnpm check:safety -- --db-url postgresql://postgres@127.0.0.1:54329/family_menu_a1

注意：accept-*.txt 原始留证中的命令行按当时路径 node tools/.pg-*.mjs 记录，未改写；
脚本新址以本说明为准。评测复用请按上面第 1-3 步使用新路径。
