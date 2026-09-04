// apps/api/src/routes/recommend.ts
// F2/F3: 推荐 - POST /api/recommend
// 传今晚情境 -> 调 engine.recommend -> 返回 3 候选 + 理由
// 空手（PD-001）：无方案能消耗全部必消 -> candidates=[] + unmetMustUse（不建 Plan，无 planId）

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

    // 调 planService 引擎编排（正常：建 Plan + 返回 planId；空手：不建 Plan，返回 unmetMustUse）
    const result = await planService.generateRecommendation(parsed.data);

    // 响应过 RecommendResponseSchema 校验（unmetMustUse 必须经 parse 透传，否则被 strip）
    const response = RecommendResponseSchema.parse({
      candidates: result.candidates,
      ...(result.unmetMustUse ? { unmetMustUse: result.unmetMustUse } : {}),
    });
    // 返回 candidates + planId（planId 供后续 lock/swap 使用；空手时无 planId）
    return result.planId !== undefined ? { ...response, planId: result.planId } : response;
  });
};
