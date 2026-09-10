// apps/api/src/app.ts
// 插件装配：zod type provider + cors(E1) + auth(口令) + 错误处理（对齐实施方案第368行）
// server.ts 调用 buildApp() 创建实例，测试调用 buildApp() + inject

import Fastify, { type FastifyInstance, type FastifyRequest, type FastifyReply } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import {
  ZodTypeProvider,
  validatorCompiler,
  serializerCompiler,
} from 'fastify-type-provider-zod';
import { prisma } from './db.js';
import { familyRoutes } from './routes/family.js';
import { recommendRoutes } from './routes/recommend.js';
import { planRoutes } from './routes/plans.js';
import { NotFoundError, PlanStateError, SwapRecheckError } from './services/planService.js';

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

  // 注册 @fastify/cors（E1 修复：dev 跨源预检落入 authHook 返回 401 且零 CORS 头）
  // 机制自证（@fastify/cors 11.3.0 源码 index.js）：
  //   - 预检 OPTIONS 由 onRequest 钩子短路 204 返回（index.js:192-212），官方注释明示
  //     "reply to preflight requests BEFORE possible authentication plugins"（index.js:72-75），
  //     onRequest 先于 preHandler 的 authHook → 预检不再 401；
  //   - 非预检请求（含跨源真实请求）注入 CORS 头后 next() 继续完整生命周期 → 鉴权语义不变；
  //   - origin 数组为全等白名单（index.js:289-305）：不匹配时仅不写 ACAO 头、请求照常放行
  //     （index.js:219-226 注释引用上游 issue#127）→ 生产同源部署：同源请求不产生跨源预检，
  //     同源 POST 携带的生产 Origin 不在白名单 → 只是不加 CORS 头，业务行为不变。
  // 白名单=H5 dev server 两个本机源（对齐 E1 探针口径）；credentials 必须 true（本站 cookie 鉴权）。
  await app.register(cors, {
    origin: ['http://127.0.0.1:10086', 'http://localhost:10086'],
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // auth 中间件插槽（AC9：口令鉴权，预留阶段2微信登录替换）
  app.addHook('preHandler', authHook);

  // T-C03 AC1：静态图片服务（/images/** → apps/api/static/images/**）
  // fetch2dish.mjs 将抓取图片按归一扩展名落 dishes/<noteId>/ 下，Dish.imageUrl 存指向本目录的 URL。
  // 注册于 authHook 之后：preHandler 钩子对静态路由同样生效（图片不公开，需口令 cookie 访问，与全站安全口径一致）。
  const imagesRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../static/images');
  mkdirSync(imagesRoot, { recursive: true });
  await app.register(fastifyStatic, { root: imagesRoot, prefix: '/images/' });

  // 错误处理
  app.setErrorHandler((error, request, reply) => {
    // NotFoundError -> 404
    if (error instanceof NotFoundError) {
      return reply.code(404).send({ error: error.message });
    }
    // PlanStateError -> 409（状态不允许该操作，如未锁定就换菜，DEC-013）
    if (error instanceof PlanStateError) {
      return reply.code(409).send({ error: error.message });
    }
    // SwapRecheckError -> 400（换菜服务端复检拒绝，details 携带过滤轨迹，DEC-013）
    if (error instanceof SwapRecheckError) {
      return reply.code(400).send({ error: error.message, details: error.details });
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
