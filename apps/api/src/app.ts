// apps/api/src/app.ts
// 插件装配：zod type provider + auth(口令) + 错误处理（对齐实施方案第368行）
// server.ts 调用 buildApp() 创建实例，测试调用 buildApp() + inject

import Fastify, { type FastifyInstance, type FastifyRequest, type FastifyReply } from 'fastify';
import cookie from '@fastify/cookie';
import {
  ZodTypeProvider,
  validatorCompiler,
  serializerCompiler,
} from 'fastify-type-provider-zod';
import { prisma } from './db.js';
import { familyRoutes } from './routes/family.js';
import { recommendRoutes } from './routes/recommend.js';
import { planRoutes } from './routes/plans.js';
import { NotFoundError } from './services/planService.js';

// ───── auth 中间件插槽 ─────
// 阶段1：ACCESS_TOKEN 口令鉴权（cookie）
// 阶段2：替换为微信登录（修改此函数即可，路由不变）
async function authHook(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  // /health 端点豁免鉴权
  if (request.url.startsWith('/health')) {
    return;
  }
  // 口令鉴权：读取 cookie 中的 access_token，与 ACCESS_TOKEN 环境变量比对
  const token = request.cookies.access_token;
  const expected = process.env.ACCESS_TOKEN;
  if (!expected || token !== expected) {
    reply.code(401).send({ error: 'Unauthorized' });
  }
}

// ───── buildApp ─────

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });

  // 装配 zod type provider（AC1）
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  // withTypeProvider 提供 Zod 类型推导（路由中可选用 schema option）
  void app.withTypeProvider<ZodTypeProvider>();

  // 注册 @fastify/cookie（用于 auth 读取 cookie）
  await app.register(cookie);

  // auth 中间件插槽（AC9：口令鉴权，预留阶段2微信登录替换）
  app.addHook('preHandler', authHook);

  // 错误处理
  app.setErrorHandler((error, request, reply) => {
    // NotFoundError -> 404
    if (error instanceof NotFoundError) {
      return reply.code(404).send({ error: error.message });
    }
    // ZodError -> 400（响应 parse 失败，表示内部数据不符合契约）
    if (error instanceof Error && error.name === 'ZodError') {
      return reply.code(400).send({ error: 'Validation error', details: (error as unknown as { issues: unknown[] }).issues });
    }
    // 其他错误 -> 500
    request.log.error(String(error));
    reply.code(500).send({ error: 'Internal server error' });
  });

  // ── health 端点（不需鉴权，authHook 中豁免） ──
  app.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  app.get('/health/db', async () => {
    try {
      await prisma.$queryRaw`SELECT 1 as ok`;
      return { status: 'ok', db: 'connected' };
    } catch (err) {
      app.log.error(err);
      return { status: 'error', db: 'disconnected', error: String(err) };
    }
  });

  // ── API 路由（10 条，对齐 5.1 路由清单） ──
  await app.register(familyRoutes, { prefix: '/api' });
  await app.register(recommendRoutes, { prefix: '/api' });
  await app.register(planRoutes, { prefix: '/api' });

  return app;
}
