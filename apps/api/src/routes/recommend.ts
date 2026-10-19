// apps/api/src/routes/recommend.ts
// F2/F3: 推荐 - POST /api/recommend（v0.12 三餐化，PD-020/C-3）
// 传日计划上下文（成人/儿童、必消、临时忌口、想吃的菜、餐次勾选、避开窗口）
// -> 引擎 planDay 生成次日三餐 -> 生成即落库（LOCKED，无三选一）-> 返回完整 Plan。
// 空手（C-7）：三餐全空也建 Plan，dayPlan.failures 携带各餐归因，供当日调整出路。

import type { FastifyPluginAsync } from 'fastify';
import { PlanResponseSchema, RecommendRequestSchema } from '@family-menu/shared';
import { dayPlanService } from '../services/dayPlanService.js';

export const recommendRoutes: FastifyPluginAsync = async (app) => {
  // POST /api/recommend - 传日计划上下文 -> 返回三餐计划（已落库，planId 在 Plan.id）
  app.post('/recommend', async (request, reply) => {
    // 请求过 RecommendRequestSchema（DayPlanContext）校验
    const parsed = RecommendRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Validation error', details: parsed.error.issues });
    }

    // 调 dayPlanService 日计划编排（引擎 planDay + 三餐清单合并 + 落库）
    const plan = await dayPlanService.generateDayPlan(parsed.data);
    return PlanResponseSchema.parse(plan);
  });
};
