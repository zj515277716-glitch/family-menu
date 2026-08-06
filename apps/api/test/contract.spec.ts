// apps/api/test/contract.spec.ts
// 契约测试（AC10）：fastify inject，全路由合法200/非法400，响应过 shared zod 校验
// 本机无 PG，mock planService 避免 DB 操作（路由薄、逻辑在 services，mock services 即可）
// 对齐实施方案 8.2 API测试（第638行）

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  FamilyRulesResponseSchema,
  RecommendResponseSchema,
  PlanResponseSchema,
  PlanListResponseSchema,
  ShoppingListResponseSchema,
} from '@family-menu/shared';

// ───── mock planService（避免 DB 操作） ─────
// vi.mock 提升到文件顶部，buildApp import 的 planService 被替换为 mock

vi.mock('../src/services/planService.js', () => {
  class NotFoundError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'NotFoundError';
    }
  }
  return {
    planService: {
      getFamilyRules: vi.fn(),
      updateFamilyRules: vi.fn(),
      generateRecommendation: vi.fn(),
      lockPlan: vi.fn(),
      swapPlan: vi.fn(),
      getShoppingList: vi.fn(),
      patchShoppingList: vi.fn(),
      addFeedback: vi.fn(),
      listPlans: vi.fn(),
      repeatPlan: vi.fn(),
    },
    NotFoundError,
  };
});

// ───── 导入被测模块（在 vi.mock 之后，得到 mock 版本） ─────

import { buildApp } from '../src/app.js';
import { planService, NotFoundError } from '../src/services/planService.js';

// ───── mock 数据 ─────

const mockFamilyRule = {
  id: 'test-rule-id',
  familyId: 'seed-family',
  defaultPeople: 4,
  timeBudgets: [30, 60],
  equipment: ['wok', 'rice_cooker'],
  cuisines: ['家常'],
  updatedAt: new Date('2026-08-06T00:00:00Z'),
};

const mockCandidates = [
  { menuId: 'menu-1', score: 0.85, reasons: ['家常快手', '食材复用'], breakdown: { historyAcceptance: 0.9 } },
  { menuId: 'menu-2', score: 0.72, reasons: ['清淡健康'], breakdown: { historyAcceptance: 0.7 } },
  { menuId: 'menu-3', score: 0.65, reasons: ['周末适合'], breakdown: { historyAcceptance: 0.6 } },
];

const mockPlan = {
  id: 'test-plan-id',
  familyId: 'seed-family',
  planDate: new Date('2026-08-07T00:00:00Z'),
  context: { people: 4, timeBudgetMin: 30, mustUse: [] },
  candidates: mockCandidates,
  lockedMenuId: 'menu-1',
  shoppingList: { groups: [] },
  status: 'LOCKED' as const,
  createdAt: new Date('2026-08-07T00:00:00Z'),
};

const mockShoppingList = {
  groups: [
    {
      category: '蔬菜',
      items: [
        { ingredientId: 'ing-1', name: '番茄', category: '蔬菜', qty: 200, unit: 'g', checked: false },
        { ingredientId: 'ing-2', name: '青椒', category: '蔬菜', qty: 100, unit: 'g', checked: false },
      ],
    },
    {
      category: '肉类',
      items: [
        { ingredientId: 'ing-3', name: '猪肉', category: '肉类', qty: 300, unit: 'g', checked: true },
      ],
    },
  ],
};

const mockRecommendResult = {
  candidates: mockCandidates,
  planId: 'test-plan-id',
};

// ───── 辅助：解析 JSON 响应（将 ISO 日期字符串恢复为 Date 对象，z.date() 需要） ─────

function parseResponse(body: string): unknown {
  return JSON.parse(body, (_key, value) => {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) {
        return date;
      }
    }
    return value;
  });
}

// ───── 测试 ─────

describe('API contract tests', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.ACCESS_TOKEN = 'test-token';
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── 鉴权测试（AC9） ──

  describe('auth (AC9)', () => {
    it('returns 401 without access_token cookie', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/family/rules' });
      expect(response.statusCode).toBe(401);
    });

    it('returns 401 with wrong token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/family/rules',
        cookies: { access_token: 'wrong-token' },
      });
      expect(response.statusCode).toBe(401);
    });

    it('returns 200 for /health without auth', async () => {
      const response = await app.inject({ method: 'GET', url: '/health' });
      expect(response.statusCode).toBe(200);
    });
  });

  // ── F1: GET/PUT /api/family/rules（AC2） ──

  describe('GET /api/family/rules (AC2)', () => {
    it('returns 200 with valid FamilyRulesResponse', async () => {
      vi.mocked(planService.getFamilyRules).mockResolvedValue(mockFamilyRule);
      const response = await app.inject({
        method: 'GET',
        url: '/api/family/rules',
        cookies: { access_token: 'test-token' },
      });
      expect(response.statusCode).toBe(200);
      const body = parseResponse(response.body);
      expect(() => FamilyRulesResponseSchema.parse(body)).not.toThrow();
    });

    it('returns 404 when rules not found', async () => {
      vi.mocked(planService.getFamilyRules).mockResolvedValue(null);
      const response = await app.inject({
        method: 'GET',
        url: '/api/family/rules',
        cookies: { access_token: 'test-token' },
      });
      expect(response.statusCode).toBe(404);
    });
  });

  describe('PUT /api/family/rules (AC2)', () => {
    it('returns 200 with valid request body', async () => {
      vi.mocked(planService.updateFamilyRules).mockResolvedValue(mockFamilyRule);
      const response = await app.inject({
        method: 'PUT',
        url: '/api/family/rules',
        cookies: { access_token: 'test-token' },
        body: { ...mockFamilyRule, updatedAt: mockFamilyRule.updatedAt.toISOString() },
      });
      expect(response.statusCode).toBe(200);
      const body = parseResponse(response.body);
      expect(() => FamilyRulesResponseSchema.parse(body)).not.toThrow();
    });

    it('returns 400 with invalid body (missing timeBudgets)', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/family/rules',
        cookies: { access_token: 'test-token' },
        body: { id: 'x', familyId: 'x', equipment: [], cuisines: [], updatedAt: '2026-08-06T00:00:00.000Z' },
      });
      expect(response.statusCode).toBe(400);
    });
  });

  // ── F2/F3: POST /api/recommend（AC3） ──

  describe('POST /api/recommend (AC3)', () => {
    it('returns 200 with valid RecommendResponse', async () => {
      vi.mocked(planService.generateRecommendation).mockResolvedValue(mockRecommendResult);
      const response = await app.inject({
        method: 'POST',
        url: '/api/recommend',
        cookies: { access_token: 'test-token' },
        body: { people: 4, timeBudgetMin: 30, mustUse: [] },
      });
      expect(response.statusCode).toBe(200);
      const body = parseResponse(response.body);
      expect(() => RecommendResponseSchema.parse(body)).not.toThrow();
    });

    it('returns 400 with invalid body (people not int)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/recommend',
        cookies: { access_token: 'test-token' },
        body: { people: 'four', timeBudgetMin: 30, mustUse: [] },
      });
      expect(response.statusCode).toBe(400);
    });

    it('returns 400 with invalid body (missing mustUse)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/recommend',
        cookies: { access_token: 'test-token' },
        body: { people: 4, timeBudgetMin: 30 },
      });
      expect(response.statusCode).toBe(400);
    });
  });

  // ── F3: POST /api/plans/:id/lock（AC4） ──

  describe('POST /api/plans/:id/lock (AC4)', () => {
    it('returns 200 with valid PlanResponse', async () => {
      vi.mocked(planService.lockPlan).mockResolvedValue(mockPlan);
      const response = await app.inject({
        method: 'POST',
        url: '/api/plans/test-plan-id/lock',
        cookies: { access_token: 'test-token' },
        body: { menuId: 'menu-1' },
      });
      expect(response.statusCode).toBe(200);
      const body = parseResponse(response.body);
      expect(() => PlanResponseSchema.parse(body)).not.toThrow();
    });

    it('returns 400 with invalid body (missing menuId)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/plans/test-plan-id/lock',
        cookies: { access_token: 'test-token' },
        body: {},
      });
      expect(response.statusCode).toBe(400);
    });

    it('returns 404 when plan not found', async () => {
      vi.mocked(planService.lockPlan).mockRejectedValue(new NotFoundError('Plan not found'));
      const response = await app.inject({
        method: 'POST',
        url: '/api/plans/unknown/lock',
        cookies: { access_token: 'test-token' },
        body: { menuId: 'menu-1' },
      });
      expect(response.statusCode).toBe(404);
    });
  });

  // ── F3: POST /api/plans/:id/swap（AC4） ──

  describe('POST /api/plans/:id/swap (AC4)', () => {
    it('returns 200 with valid SwapPlanRequest (全换)', async () => {
      vi.mocked(planService.swapPlan).mockResolvedValue(mockPlan);
      const response = await app.inject({
        method: 'POST',
        url: '/api/plans/test-plan-id/swap',
        cookies: { access_token: 'test-token' },
        body: { reason: '太麻烦', swapType: '全换' },
      });
      expect(response.statusCode).toBe(200);
      const body = parseResponse(response.body);
      expect(() => PlanResponseSchema.parse(body)).not.toThrow();
    });

    it('returns 200 with valid SwapPlanRequest (单菜换)', async () => {
      vi.mocked(planService.swapPlan).mockResolvedValue(mockPlan);
      const response = await app.inject({
        method: 'POST',
        url: '/api/plans/test-plan-id/swap',
        cookies: { access_token: 'test-token' },
        body: { reason: '不吃辣', swapType: '单菜换', dishId: 'dish-1' },
      });
      expect(response.statusCode).toBe(200);
    });

    it('returns 400 with invalid swapType', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/plans/test-plan-id/swap',
        cookies: { access_token: 'test-token' },
        body: { reason: 'x', swapType: 'invalid' },
      });
      expect(response.statusCode).toBe(400);
    });

    it('returns 400 with missing reason', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/plans/test-plan-id/swap',
        cookies: { access_token: 'test-token' },
        body: { swapType: '全换' },
      });
      expect(response.statusCode).toBe(400);
    });
  });

  // ── F4/F5: GET /api/plans/:id/shopping-list（AC5） ──

  describe('GET /api/plans/:id/shopping-list (AC5)', () => {
    it('returns 200 with valid ShoppingListResponse', async () => {
      vi.mocked(planService.getShoppingList).mockResolvedValue(mockShoppingList);
      const response = await app.inject({
        method: 'GET',
        url: '/api/plans/test-plan-id/shopping-list',
        cookies: { access_token: 'test-token' },
      });
      expect(response.statusCode).toBe(200);
      const body = parseResponse(response.body);
      expect(() => ShoppingListResponseSchema.parse(body)).not.toThrow();
    });
  });

  // ── F4: PATCH /api/plans/:id/shopping-list（AC5） ──

  describe('PATCH /api/plans/:id/shopping-list (AC5)', () => {
    it('returns 200 with valid PatchShoppingListRequest', async () => {
      vi.mocked(planService.patchShoppingList).mockResolvedValue(mockShoppingList);
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/plans/test-plan-id/shopping-list',
        cookies: { access_token: 'test-token' },
        body: { itemId: 'ing-1', checked: true },
      });
      expect(response.statusCode).toBe(200);
      const body = parseResponse(response.body);
      expect(() => ShoppingListResponseSchema.parse(body)).not.toThrow();
    });

    it('returns 400 with invalid body (checked not boolean)', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/plans/test-plan-id/shopping-list',
        cookies: { access_token: 'test-token' },
        body: { itemId: 'ing-1', checked: 'yes' },
      });
      expect(response.statusCode).toBe(400);
    });

    it('returns 400 with missing itemId', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/plans/test-plan-id/shopping-list',
        cookies: { access_token: 'test-token' },
        body: { checked: true },
      });
      expect(response.statusCode).toBe(400);
    });
  });

  // ── F6: POST /api/plans/:id/feedback（AC6） ──

  describe('POST /api/plans/:id/feedback (AC6)', () => {
    it('returns 200 with valid FeedbackRequest (cooked)', async () => {
      vi.mocked(planService.addFeedback).mockResolvedValue(mockPlan);
      const response = await app.inject({
        method: 'POST',
        url: '/api/plans/test-plan-id/feedback',
        cookies: { access_token: 'test-token' },
        body: { result: 'cooked', actualMinutes: 35 },
      });
      expect(response.statusCode).toBe(200);
      const body = parseResponse(response.body);
      expect(() => PlanResponseSchema.parse(body)).not.toThrow();
    });

    it('returns 200 with valid FeedbackRequest (not_cooked)', async () => {
      vi.mocked(planService.addFeedback).mockResolvedValue(mockPlan);
      const response = await app.inject({
        method: 'POST',
        url: '/api/plans/test-plan-id/feedback',
        cookies: { access_token: 'test-token' },
        body: { result: 'not_cooked' },
      });
      expect(response.statusCode).toBe(200);
    });

    it('returns 200 with valid FeedbackRequest (repeat)', async () => {
      vi.mocked(planService.addFeedback).mockResolvedValue(mockPlan);
      const response = await app.inject({
        method: 'POST',
        url: '/api/plans/test-plan-id/feedback',
        cookies: { access_token: 'test-token' },
        body: { result: 'repeat' },
      });
      expect(response.statusCode).toBe(200);
    });

    it('returns 400 with invalid result', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/plans/test-plan-id/feedback',
        cookies: { access_token: 'test-token' },
        body: { result: 'invalid' },
      });
      expect(response.statusCode).toBe(400);
    });

    it('returns 400 with missing result', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/plans/test-plan-id/feedback',
        cookies: { access_token: 'test-token' },
        body: {},
      });
      expect(response.statusCode).toBe(400);
    });
  });

  // ── F7: GET /api/plans（AC7） ──

  describe('GET /api/plans (AC7)', () => {
    it('returns 200 with valid PlanListResponse', async () => {
      vi.mocked(planService.listPlans).mockResolvedValue([mockPlan]);
      const response = await app.inject({
        method: 'GET',
        url: '/api/plans',
        cookies: { access_token: 'test-token' },
      });
      expect(response.statusCode).toBe(200);
      const body = parseResponse(response.body);
      expect(() => PlanListResponseSchema.parse(body)).not.toThrow();
    });

    it('returns 200 with empty list', async () => {
      vi.mocked(planService.listPlans).mockResolvedValue([]);
      const response = await app.inject({
        method: 'GET',
        url: '/api/plans',
        cookies: { access_token: 'test-token' },
      });
      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual([]);
    });
  });

  // ── F7: POST /api/plans/:id/repeat（AC7） ──

  describe('POST /api/plans/:id/repeat (AC7)', () => {
    it('returns 200 with valid PlanResponse', async () => {
      vi.mocked(planService.repeatPlan).mockResolvedValue(mockPlan);
      const response = await app.inject({
        method: 'POST',
        url: '/api/plans/test-plan-id/repeat',
        cookies: { access_token: 'test-token' },
      });
      expect(response.statusCode).toBe(200);
      const body = parseResponse(response.body);
      expect(() => PlanResponseSchema.parse(body)).not.toThrow();
    });

    it('returns 404 when original plan not found', async () => {
      vi.mocked(planService.repeatPlan).mockRejectedValue(new NotFoundError('Plan not found'));
      const response = await app.inject({
        method: 'POST',
        url: '/api/plans/unknown/repeat',
        cookies: { access_token: 'test-token' },
      });
      expect(response.statusCode).toBe(404);
    });
  });
});
