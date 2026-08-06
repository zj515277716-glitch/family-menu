// apps/api/src/db.ts - PrismaClient 单例（Prisma 7 driver adapter 模式）
// STEP-03 将实现完整的数据层（schema.prisma + migration + seed）
//
// Prisma 7 配置方式（DEC-001）：
//   - generator: prisma-client（非 prisma-client-js）
//   - datasource URL: 通过 prisma.config.ts 配置（非 schema.prisma）
//   - 运行时: @prisma/adapter-pg + pg Pool（driver adapter）
//
// ESM 加载顺序：所有 import 先执行，然后执行模块顶层代码。
// 此处 dotenv.config() 在 createPrismaClient() 之前执行，
// 确保 process.env.DATABASE_URL 在 new Pool() 时已就绪。

import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from './generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

export const prisma: PrismaClient = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
