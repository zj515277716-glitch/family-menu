// apps/api/src/routes/family.ts
// F1: 家庭规则与禁忌 - GET/PUT /api/family/rules
// 路由薄：schema 校验 + 调 planService，逻辑在 services

import type { FastifyPluginAsync } from 'fastify';
import {
  PutFamilyRulesRequestSchema,
  FamilyRulesResponseSchema,
  GetExclusionsResponseSchema,
  PutExclusionsRequestSchema,
} from '@family-menu/shared';
import { planService } from '../services/planService.js';

export const familyRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/family/rules - 读家庭规则
  app.get('/family/rules', async (request, reply) => {
    const rule = await planService.getFamilyRules();
    if (!rule) {
      return reply.code(404).send({ error: 'Family rules not found' });
    }
    // 响应过 FamilyRulesResponseSchema 校验
    return FamilyRulesResponseSchema.parse(rule);
  });

  // PUT /api/family/rules - 写家庭规则（全量写入）
  app.put('/family/rules', async (request, reply) => {
    // 预处理日期字段（JSON 日期字符串 -> Date，z.date() 需要 Date 对象）
    const raw = request.body as Record<string, unknown> | null;
    if (raw && typeof raw.updatedAt === 'string') {
      raw.updatedAt = new Date(raw.updatedAt);
    }
    // 请求过 PutFamilyRulesRequestSchema 校验
    const parsed = PutFamilyRulesRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Validation error', details: parsed.error.issues });
    }
    const updated = await planService.updateFamilyRules(parsed.data);
    return FamilyRulesResponseSchema.parse(updated);
  });

  // GET /api/family/exclusions - 读全部禁忌规则（ExclusionRule）
  app.get('/family/exclusions', async () => {
    const exclusions = await planService.getExclusions();
    return GetExclusionsResponseSchema.parse(exclusions);
  });

  // PUT /api/family/exclusions - 写禁忌规则（全量替换，语义同 PUT /api/family/rules）
  app.put('/family/exclusions', async (request, reply) => {
    // 请求过 PutExclusionsRequestSchema 校验（z.array(ExclusionRuleSchema)）
    const parsed = PutExclusionsRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Validation error', details: parsed.error.issues });
    }
    const updated = await planService.putExclusions(parsed.data);
    return GetExclusionsResponseSchema.parse(updated);
  });
};
