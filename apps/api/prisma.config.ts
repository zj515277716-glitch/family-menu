// prisma.config.ts - Prisma 7 配置
// Prisma 7 破坏性变更：
//   - datasource URL 从 schema.prisma 迁移到 prisma.config.ts
//   - generator 由 prisma-client-js 改为 prisma-client
//   - 运行时通过 @prisma/adapter-pg + pg Pool 连接数据库（driver adapter）
//   - Prisma 7 不自动加载 .env 文件，需 dotenv 显式加载
//   - Prisma 7 seed 配置在 migrations.seed 字段（非 package.json prisma.seed）
//     来源：prisma.io/docs/orm/prisma-migrate/workflows/seeding

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { defineConfig, env } from 'prisma/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 加载项目根目录的 .env 文件
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    path: path.join('prisma', 'migrations'),
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
