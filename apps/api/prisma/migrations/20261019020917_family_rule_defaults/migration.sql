-- AlterTable
ALTER TABLE "FamilyRule" ADD COLUMN     "avoidRecentDays" INTEGER NOT NULL DEFAULT 7,
ADD COLUMN     "defaultAdults" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "defaultChildren" INTEGER NOT NULL DEFAULT 0;

-- 存量回填（T-Q11 主控裁决）：原总人数视为成人——defaultAdults 以原 defaultPeople 回填，
-- 不取列默认值 2；儿童 0、避开窗口 7 天按列默认值即裁决口径。defaultPeople 列保留不删（兼容期）。
UPDATE "FamilyRule" SET "defaultAdults" = "defaultPeople";
