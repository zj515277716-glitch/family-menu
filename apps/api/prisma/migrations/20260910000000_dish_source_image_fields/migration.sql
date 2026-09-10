-- AlterEnum
ALTER TYPE "ContentOrigin" ADD VALUE 'FETCHED';

-- AlterTable
ALTER TABLE "Dish" ADD COLUMN     "imageUrl" TEXT,
ADD COLUMN     "sourceSite" TEXT,
ADD COLUMN     "sourceUrl" TEXT;
