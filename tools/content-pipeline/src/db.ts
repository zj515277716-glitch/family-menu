// tools/content-pipeline/src/db.ts
// PrismaClient 工厂 + DraftWriter 实现（CLI 入口用，测试用 mock）
// 动态 import apps/api 的 generated PrismaClient，避免编译时依赖 generated 目录
// 仅本机运行，不进服务器（实施方案第792行）

import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import type { DraftWriter } from './import.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

/**
 * 创建 PrismaClient（Prisma 7 driver adapter 模式，复用 apps/api 的 generated client）。
 * 动态 import 避免编译时依赖 apps/api/src/generated（该目录由 apps/api build 时 prisma generate 生成）。
 * 返回类型为 any（generated 类型在编译时不可用），运行时为 PrismaClient 实例。
 */
export async function createPrismaClient(): Promise<Record<string, unknown> & { $disconnect(): Promise<void> }> {
  // 用 string 类型（非字面量）路径，使 TS 对动态 import 返回 any，不检查模块路径
  const generatedPath: string = '../../../apps/api/src/generated/prisma/client.js';
  const mod = (await import(generatedPath)) as { PrismaClient: new (opts: { adapter: unknown }) => Record<string, unknown> & { $disconnect(): Promise<void> } };
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new mod.PrismaClient({ adapter });
  return prisma;
}

/**
 * 创建 DraftWriter（基于 PrismaClient）。
 * 实现 import.ts 的 DraftWriter 接口，用 PrismaClient upsert 食材 + 创建菜品。
 */
export async function createPrismaDraftWriter(): Promise<DraftWriter & { $disconnect(): Promise<void> }> {
  const prisma = await createPrismaClient();
  return {
    $disconnect: () => prisma.$disconnect(),
    async upsertIngredient(input) {
      const ingredient = await (prisma.ingredient as {
        upsert(args: unknown): Promise<{ id: string }>;
      }).upsert({
        where: { name: input.name },
        create: {
          name: input.name,
          aliases: input.aliases,
          category: input.category,
          defaultUnit: input.defaultUnit,
        },
        update: {
          aliases: input.aliases,
          category: input.category,
          defaultUnit: input.defaultUnit,
        },
      });
      return { id: ingredient.id };
    },
    async createDishWithIngredients(input) {
      const created = await (prisma.dish as {
        create(args: unknown): Promise<{ id: string }>;
      }).create({
        data: {
          ...input.dish,
          steps: input.dish.steps,
          // 双保险：status/origin 已由字面量类型锁定 DRAFT/LLM_DRAFT
          ingredients: {
            create: input.ingredients.map((ing) => ({
              ingredientId: ing.ingredientId,
              qty: ing.qty,
              unit: ing.unit,
              optional: ing.optional,
            })),
          },
        },
      });
      return { id: created.id };
    },
  };
}
