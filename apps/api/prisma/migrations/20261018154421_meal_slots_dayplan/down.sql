-- 下行脚本（T-Q10，prisma migrate 无原生 down 的伴生文件）
-- 用法：psql "$DATABASE_URL" -f down.sql && pnpm --filter api exec prisma migrate resolve --rolled-back 20261018154421_meal_slots_dayplan
-- 顺序：先删列再改默认（回滚到迁移前状态，数据不丢——新增列直接删除，存量列原样未动）

ALTER TABLE "Event" DROP COLUMN IF EXISTS "mealSlot";
ALTER TABLE "CookLog" DROP COLUMN IF EXISTS "mealSlot";
ALTER TABLE "Dish" DROP COLUMN IF EXISTS "mealTypes";
ALTER TABLE "Plan" DROP COLUMN IF EXISTS "dayContext";
ALTER TABLE "Plan" DROP COLUMN IF EXISTS "dayPlan";
