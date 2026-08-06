// apps/api/src/server.ts - Fastify 启动入口
// STEP-05 将实现完整的路由+口令鉴权+契约测试
// 当前为骨架，仅 /health + /health/db 端点

import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import { prisma } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const port = Number(process.env.PORT) || 3000;

const app = Fastify({
  logger: true,
});

app.get('/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

app.get('/health/db', async () => {
  try {
    const result = await prisma.$queryRaw`SELECT 1 as ok`;
    return { status: 'ok', db: 'connected', result };
  } catch (err) {
    app.log.error(err);
    return { status: 'error', db: 'disconnected', error: String(err) };
  }
});

async function start(): Promise<void> {
  try {
    await app.listen({ port, host: '0.0.0.0' });
    app.log.info(`Server listening on http://localhost:${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
