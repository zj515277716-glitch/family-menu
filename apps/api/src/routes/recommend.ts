// apps/api/src/routes/recommend.ts
// F2/F3: 推荐 - POST /api/recommend
// 传今晚情境 -> 建 Plan -> 调 engine.recommend -> 返回 3 候选 + 理由

import type { FastifyPluginAsync } from 'fastify';
import { RecommendRequestSchema, RecommendResponseSchema } from '@family-menu/shared';
import { planService } from '../services/planService.js';

export const recommendRoutes: FastifyPluginAsync = async (app) => {
  // POST /api/recommend - 传情境 -> 返回 3 候选
  app.post('/recommend', async (request, reply) => {
    // 请求过 RecommendRequestSchema 校验
    const parsed = RecommendRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Validation error', details: parsed.error.issues });
    }

    // 调 planService 引擎编排（建 Plan + 调 engine.recommend）
    const result = await planService.generateRecommendation(parsed.data);

    // 响应过 RecommendResponseSchema 校验
    const response = RecommendResponseSchema.parse({ candidates: result.candidates });
    // 返回 candidates + planId（planId 供后续 lock/swap 使用，不在 schema 中但客户端需要）
    return { ...response, planId: result.planId };
  });
};
