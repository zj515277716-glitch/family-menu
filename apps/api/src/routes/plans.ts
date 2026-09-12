// apps/api/src/routes/plans.ts
// F3/F4/F5/F6/F7: 计划相关 7 条路由
// 路由薄：schema 校验 + 调 planService，逻辑在 services

import type { FastifyPluginAsync } from 'fastify';
import {
  PlanIdParamsSchema,
  SwapPlanRequestSchema,
  SwapOptionsQuerySchema,
  SwapOptionsResponseSchema,
  PatchShoppingListRequestSchema,
  RescaleShoppingListRequestSchema,
  FeedbackRequestSchema,
  FeedbackResponseSchema,
  PlanResponseSchema,
  PlanListResponseSchema,
  ShoppingListResponseSchema,
} from '@family-menu/shared';
import { planService } from '../services/planService.js';

export const planRoutes: FastifyPluginAsync = async (app) => {
  // ── F3: 锁定菜单 ──
  // POST /api/plans/:id/lock
  app.post('/plans/:id/lock', async (request, reply) => {
    const params = PlanIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: 'Invalid plan id' });
    }
    // lock 请求体含 menuId（契约未定义 lock request schema，用本地校验）
    const body = request.body as Record<string, unknown> | null;
    if (!body || typeof body.menuId !== 'string') {
      return reply.code(400).send({ error: 'Validation error: menuId required' });
    }
    const plan = await planService.lockPlan(params.data.id, body.menuId);
    return PlanResponseSchema.parse(plan);
  });

  // ── F3: 换菜 ──
  // POST /api/plans/:id/swap
  app.post('/plans/:id/swap', async (request, reply) => {
    const params = PlanIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: 'Invalid plan id' });
    }
    // 请求过 SwapPlanRequestSchema 校验
    const parsed = SwapPlanRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Validation error', details: parsed.error.issues });
    }
    const plan = await planService.swapPlan(
      params.data.id,
      parsed.data.swapType,
      parsed.data.dishId,
      parsed.data.newDishId,
      parsed.data.reason,
    );
    return PlanResponseSchema.parse(plan);
  });

  // ── F3: 换菜候选（TP-03/DEC-013） ──
  // GET /api/plans/:id/swap-options?dishId=xxx（空候选=200+空数组，C-6 如实态）
  app.get('/plans/:id/swap-options', async (request, reply) => {
    const params = PlanIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: 'Invalid plan id' });
    }
    const query = SwapOptionsQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.code(400).send({ error: 'Validation error', details: query.error.issues });
    }
    const result = await planService.getSwapOptions(params.data.id, query.data.dishId);
    return SwapOptionsResponseSchema.parse(result);
  });

  // ── F4/F5: 获取采购清单 + 备菜顺序 ──
  // GET /api/plans/:id/shopping-list
  app.get('/plans/:id/shopping-list', async (request, reply) => {
    const params = PlanIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: 'Invalid plan id' });
    }
    // 调 list-merger.mergeShoppingList（在 planService 内部）
    const shoppingList = await planService.getShoppingList(params.data.id);
    return ShoppingListResponseSchema.parse(shoppingList);
  });

  // ── F4: 勾选状态 ──
  // PATCH /api/plans/:id/shopping-list
  app.patch('/plans/:id/shopping-list', async (request, reply) => {
    const params = PlanIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: 'Invalid plan id' });
    }
    // 请求过 PatchShoppingListRequestSchema 校验
    const parsed = PatchShoppingListRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Validation error', details: parsed.error.issues });
    }
    const shoppingList = await planService.patchShoppingList(
      params.data.id,
      parsed.data.itemId,
      parsed.data.checked,
    );
    return ShoppingListResponseSchema.parse(shoppingList);
  });

  // ── F4: 改人数重算清单（TP-04/DEC-014 裁决 3） ──
  // POST /api/plans/:id/shopping-list/rescale { people }
  app.post('/plans/:id/shopping-list/rescale', async (request, reply) => {
    const params = PlanIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: 'Invalid plan id' });
    }
    const parsed = RescaleShoppingListRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Validation error', details: parsed.error.issues });
    }
    const shoppingList = await planService.rescaleShoppingList(
      params.data.id,
      parsed.data.people,
    );
    return ShoppingListResponseSchema.parse(shoppingList);
  });

  // ── F6: 反馈（v0.6 三问模型，DEC-015/TP-05） ──
  // POST /api/plans/:id/feedback { didCook, taste?, willRepeat, actualMinutes? }
  // 注意：不用 requireLockedPlan（LOCKED-only 会击穿 COOKED/SKIPPED 态「修改重提」，DEC-015 裁决 4）
  app.post('/plans/:id/feedback', async (request, reply) => {
    const params = PlanIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: 'Invalid plan id' });
    }
    // 请求过 FeedbackRequestSchema 校验（taste 条件必填：做了必填/没做禁传）
    const parsed = FeedbackRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Validation error', details: parsed.error.issues });
    }
    const plan = await planService.addFeedback(params.data.id, parsed.data);
    return PlanResponseSchema.parse(plan);
  });

  // GET /api/plans/:id/feedback —— 该 plan 最新一条反馈
  // v0.9（T-P12）：plan 存在但无反馈 -> 200 + JSON null（service 返回 null 原样透传，响应体即 null 字面量）；
  // plan 不存在 -> 404（service NotFoundError，语义收敛为「资源不存在」）；有反馈 -> FeedbackResponse 校验后 200。
  app.get('/plans/:id/feedback', async (request, reply) => {
    const params = PlanIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: 'Invalid plan id' });
    }
    const feedback = await planService.getFeedback(params.data.id);
    if (feedback === null) {
      return reply.code(200).send(null);
    }
    return FeedbackResponseSchema.parse(feedback);
  });

  // ── F7: 历史列表 ──
  // GET /api/plans
  app.get('/plans', async () => {
    const plans = await planService.listPlans();
    return PlanListResponseSchema.parse(plans);
  });

  // ── F7: 复做 ──
  // POST /api/plans/:id/repeat
  app.post('/plans/:id/repeat', async (request, reply) => {
    const params = PlanIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: 'Invalid plan id' });
    }
    const plan = await planService.repeatPlan(params.data.id);
    return PlanResponseSchema.parse(plan);
  });
};
