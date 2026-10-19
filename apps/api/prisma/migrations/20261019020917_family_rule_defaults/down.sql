-- 下行脚本（T-Q11，prisma migrate 无原生 down 的伴生文件）
-- 用法（本地实测 2026-10-19，回退预演通过）：
--   1) psql "$DATABASE_URL" -f down.sql
--   2) 删除迁移记录行（resolve --rolled-back 对非 failed 态迁移报 P3012，不可用；T-Q10 同口径）：
--      DELETE FROM "_prisma_migrations" WHERE migration_name='20261019020917_family_rule_defaults';
--   恢复：pnpm --filter @family-menu/api exec prisma migrate deploy
-- 加列式迁移回退：直接删除 3 个新增列，存量列原样未动（新增列数据随列删除，回退前如有需要请先备份）

ALTER TABLE "FamilyRule" DROP COLUMN IF EXISTS "avoidRecentDays";
ALTER TABLE "FamilyRule" DROP COLUMN IF EXISTS "defaultAdults";
ALTER TABLE "FamilyRule" DROP COLUMN IF EXISTS "defaultChildren";
