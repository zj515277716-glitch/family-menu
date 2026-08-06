// apps/api/prisma/seed.ts
// 种子数据执行脚本（Prisma 7 driver adapter 模式）
// 通过 prisma db seed 调用（prisma.config.ts -> migrations.seed: "tsx prisma/seed.ts"）
//
// 执行流程：
//   1. 加载 .env（dotenv 显式加载，Prisma 7 不自动加载）
//   2. validateSeedData()：用 shared v0.1 zod schema 校验所有种子数据（AC8）
//   3. main()：用 PrismaClient upsert 写入 DB（AC7，可重复执行）
//
// Prisma 7 要求：PrismaClient 必须用 driver adapter 初始化（见 db.ts 同款配置）

import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import {
  FamilySchema,
  FamilyRuleSchema,
  ExclusionRuleSchema,
  IngredientSchema,
  DishSchema,
  DishIngredientSchema,
  MenuSchema,
  MenuDishSchema,
} from '@family-menu/shared';
import {
  family,
  familyRule,
  exclusionRules,
  ingredients,
  dishes,
  dishIngredients,
  menus,
  menuDishes,
} from './seed-data.js';

// ───── 环境变量加载 ─────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

// ───── 种子数据 zod 校验（AC8）─────

function validateSeedData(): void {
  FamilySchema.parse(family);
  FamilyRuleSchema.parse(familyRule);

  for (const rule of exclusionRules) {
    ExclusionRuleSchema.parse(rule);
  }

  for (const ing of ingredients) {
    IngredientSchema.parse(ing);
  }

  for (const dish of dishes) {
    DishSchema.parse(dish);
  }

  for (const di of dishIngredients) {
    DishIngredientSchema.parse(di);
  }

  for (const menu of menus) {
    MenuSchema.parse(menu);
  }

  for (const md of menuDishes) {
    MenuDishSchema.parse(md);
  }

  console.log('Seed data validation passed (shared v0.1 zod schema).');
}

// ───── PrismaClient 初始化（driver adapter）─────

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// ───── 种子数据写入（upsert，可重复执行）─────

async function main(): Promise<void> {
  validateSeedData();

  // 家庭
  await prisma.family.upsert({
    where: { id: family.id },
    update: {},
    create: {
      id: family.id,
      name: family.name,
      createdAt: family.createdAt,
    },
  });

  // 家庭规则（familyId @unique）
  await prisma.familyRule.upsert({
    where: { familyId: familyRule.familyId },
    update: {},
    create: {
      id: familyRule.id,
      familyId: familyRule.familyId,
      defaultPeople: familyRule.defaultPeople,
      timeBudgets: familyRule.timeBudgets,
      equipment: familyRule.equipment,
      cuisines: familyRule.cuisines,
      updatedAt: familyRule.updatedAt,
    },
  });

  // 禁忌规则
  for (const rule of exclusionRules) {
    await prisma.exclusionRule.upsert({
      where: { id: rule.id },
      update: {},
      create: {
        id: rule.id,
        familyId: rule.familyId,
        scope: rule.scope,
        targetId: rule.targetId,
        targetTag: rule.targetTag,
        severity: rule.severity,
        note: rule.note,
      },
    });
  }

  // 食材（name @unique）
  for (const ing of ingredients) {
    await prisma.ingredient.upsert({
      where: { name: ing.name },
      update: {},
      create: {
        id: ing.id,
        name: ing.name,
        aliases: ing.aliases,
        category: ing.category,
        defaultUnit: ing.defaultUnit,
      },
    });
  }

  // 菜品
  for (const dish of dishes) {
    await prisma.dish.upsert({
      where: { id: dish.id },
      update: {},
      create: {
        id: dish.id,
        name: dish.name,
        mealRole: dish.mealRole,
        cuisine: dish.cuisine,
        flavorTags: dish.flavorTags,
        spicyLevel: dish.spicyLevel,
        splitFlavor: dish.splitFlavor,
        activeMinutes: dish.activeMinutes,
        totalMinutes: dish.totalMinutes,
        equipment: dish.equipment,
        steps: dish.steps,
        status: dish.status,
        origin: dish.origin,
        licenseNote: dish.licenseNote,
      },
    });
  }

  // 菜品-食材关联
  for (const di of dishIngredients) {
    await prisma.dishIngredient.upsert({
      where: { id: di.id },
      update: {},
      create: {
        id: di.id,
        dishId: di.dishId,
        ingredientId: di.ingredientId,
        qty: di.qty,
        unit: di.unit,
        optional: di.optional,
      },
    });
  }

  // 菜单
  for (const menu of menus) {
    await prisma.menu.upsert({
      where: { id: menu.id },
      update: {},
      create: {
        id: menu.id,
        name: menu.name,
        scene: menu.scene,
        serves: menu.serves,
        totalActiveMinutes: menu.totalActiveMinutes,
        prepSequence: menu.prepSequence,
        status: menu.status,
      },
    });
  }

  // 菜单-菜品关联（复合主键 menuId+dishId）
  for (const md of menuDishes) {
    await prisma.menuDish.upsert({
      where: { menuId_dishId: { menuId: md.menuId, dishId: md.dishId } },
      update: {},
      create: {
        menuId: md.menuId,
        dishId: md.dishId,
        sort: md.sort,
      },
    });
  }

  console.log('Seed completed: 1 family + 1 rule + 2 exclusions + 17 ingredients + 10 dishes + 29 dish-ingredients + 4 menus + 13 menu-dishes.');
}

main()
  .then(async () => {
    await prisma.$disconnect();
    await pool.end();
  })
  .catch(async (e) => {
    console.error('Seed failed:', e);
    await prisma.$disconnect();
    await pool.end();
    process.exit(1);
  });
