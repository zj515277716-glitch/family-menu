// apps/api/src/server.ts - Fastify 启动入口
// 引入 app.ts（插件装配），仅负责 dotenv 加载 + listen

import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const port = Number(process.env.PORT) || 3000;

async function start(): Promise<void> {
  const app = await buildApp();
  try {
    await app.listen({ port, host: '0.0.0.0' });
    app.log.info(`Server listening on http://localhost:${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
