-- AlterTable
ALTER TABLE "CookLog" ADD COLUMN     "mealSlot" TEXT;

-- AlterTable
ALTER TABLE "Dish" ADD COLUMN     "mealTypes" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "mealSlot" TEXT;

-- AlterTable
ALTER TABLE "Plan" ADD COLUMN     "dayContext" JSONB,
ADD COLUMN     "dayPlan" JSONB;

-- Backfill（T-Q10）：历史单餐计划一律为晚餐语境，存量 Event/CookLog 回填 dinner。
-- 不回填 Plan（旧行 context/candidates 原样保留，dayContext/dayPlan 保持 NULL，
-- 读取侧按字段有无分流，不伪造三餐数据）；Dish.mealTypes 空数组=引擎按既有字段推断。
UPDATE "Event" SET "mealSlot" = 'dinner' WHERE "mealSlot" IS NULL;
UPDATE "CookLog" SET "mealSlot" = 'dinner' WHERE "mealSlot" IS NULL;
