// apps/api/test/contract.spec.ts
// 契约测试（AC10）：fastify inject，全路由合法200/非法400，响应过 shared zod 校验
// 本机无 PG，mock planService 避免 DB 操作（路由薄、逻辑在 services，mock services 即可）
// 对齐实施方案 8.2 API测试（第638行）

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { ExclusionRule } from '@family-menu/shared';
import {
  FamilyRulesResponseSchema,
  GetExclusionsResponseSchema,
  RecommendResponseSchema,
  PlanResponseSchema,
  PlanListResponseSchema,
  ShoppingListResponseSchema,
  FeedbackResponseSchema,
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
  class PlanStateError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'PlanStateError';
    }
  }
  class SwapRecheckError extends Error {
    readonly details: unknown[];
    constructor(message: string, details: unknown[] = []) {
      super(message);
      this.name = 'SwapRecheckError';
      this.details = details;
    }
  }
  return {
    planService: {
      getFamilyRules: vi.fn(),
      updateFamilyRules: vi.fn(),
      getExclusions: vi.fn(),
      putExclusions: vi.fn(),
      generateRecommendation: vi.fn(),
      lockPlan: vi.fn(),
      swapPlan: vi.fn(),
      getSwapOptions: vi.fn(),
      getShoppingList: vi.fn(),
      patchShoppingList: vi.fn(),
      rescaleShoppingList: vi.fn(),
      addFeedback: vi.fn(),
      getFeedback: vi.fn(),
      listPlans: vi.fn(),
      repeatPlan: vi.fn(),
    },
    NotFoundError,
    PlanStateError,
    SwapRecheckError,
  };
});

// v0.12：POST /api/recommend 路由直连 dayPlanService（三餐生成），一并 mock 避免 DB 操作
vi.mock('../src/services/dayPlanService.js', () => {
  return {
    dayPlanService: {
      generateDayPlan: vi.fn(),
      swapDayPlan: vi.fn(),
      getDaySwapOptions: vi.fn(),
      getDayShoppingList: vi.fn(),
      rescaleDayShoppingList: vi.fn(),
      addDayFeedback: vi.fn(),
    },
    nextLocalMidnight: vi.fn(),
  };
});

// ───── 导入被测模块（在 vi.mock 之后，得到 mock 版本） ─────

import { buildApp } from '../src/app.js';
import { planService, NotFoundError } from '../src/services/planService.js';
import { dayPlanService } from '../src/services/dayPlanService.js';

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

const mockExclusions: ExclusionRule[] = [
  {
    id: 'ex-test-1',
    familyId: 'seed-family',
    scope: 'INGREDIENT',
    targetId: 'ing-cilantro',
    severity: 'HARD',
    note: '爸爸不吃香菜',
  },
  {
    id: 'ex-test-2',
    familyId: 'seed-family',
    scope: 'TAG',
    targetTag: '内脏',
    severity: 'SOFT',
  },
];

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

  // ── F1: GET/PUT /api/family/exclusions（v0.2 新增，禁忌持久化） ──

  describe('GET /api/family/exclusions', () => {
    it('returns 200 with valid GetExclusionsResponse', async () => {
      vi.mocked(planService.getExclusions).mockResolvedValue(mockExclusions);
      const response = await app.inject({
        method: 'GET',
        url: '/api/family/exclusions',
        cookies: { access_token: 'test-token' },
      });
      expect(response.statusCode).toBe(200);
      const body = parseResponse(response.body);
      expect(() => GetExclusionsResponseSchema.parse(body)).not.toThrow();
    });

    it('returns 200 with empty list', async () => {
      vi.mocked(planService.getExclusions).mockResolvedValue([]);
      const response = await app.inject({
        method: 'GET',
        url: '/api/family/exclusions',
        cookies: { access_token: 'test-token' },
      });
      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual([]);
    });
  });

  describe('PUT /api/family/exclusions', () => {
    it('returns 200 with valid request body', async () => {
      vi.mocked(planService.putExclusions).mockResolvedValue(mockExclusions);
      const response = await app.inject({
        method: 'PUT',
        url: '/api/family/exclusions',
        cookies: { access_token: 'test-token' },
        body: mockExclusions,
      });
      expect(response.statusCode).toBe(200);
      const body = parseResponse(response.body);
      expect(() => GetExclusionsResponseSchema.parse(body)).not.toThrow();
    });

    it('returns 400 with invalid body (scope not enum)', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/family/exclusions',
        cookies: { access_token: 'test-token' },
        body: [{ id: 'x', familyId: 'x', scope: 'INVALID', severity: 'HARD' }],
      });
      expect(response.statusCode).toBe(400);
    });

    it('returns 400 with non-array body', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/family/exclusions',
        cookies: { access_token: 'test-token' },
        body: { id: 'x' },
      });
      expect(response.statusCode).toBe(400);
    });
  });

  // ── F2/F3: POST /api/recommend（AC3；v0.12 三餐化：DayPlanContext 入参，Plan 出参） ──

  describe('POST /api/recommend (AC3)', () => {
    it('returns 200 with valid RecommendResponse (DayPlanContext -> Plan)', async () => {
      vi.mocked(dayPlanService.generateDayPlan).mockResolvedValue(mockPlan);
      const response = await app.inject({
        method: 'POST',
        url: '/api/recommend',
        cookies: { access_token: 'test-token' },
        body: { adults: 2, children: 1, timeBudgetMin: 30, mustUseIngredients: [] },
      });
      expect(response.statusCode).toBe(200);
      const body = parseResponse(response.body);
      expect(() => RecommendResponseSchema.parse(body)).not.toThrow();
      expect(dayPlanService.generateDayPlan).toHaveBeenCalledWith({
        adults: 2,
        children: 1,
        timeBudgetMin: 30,
        mustUseIngredients: [],
      });
    });

    it('returns 200 with optional fields (tempAvoidances/desiredDishIds/meals/avoidRecentDays)', async () => {
      vi.mocked(dayPlanService.generateDayPlan).mockResolvedValue(mockPlan);
      const response = await app.inject({
        method: 'POST',
        url: '/api/recommend',
        cookies: { access_token: 'test-token' },
        body: {
          adults: 2,
          children: 0,
          timeBudgetMin: 60,
          mustUseIngredients: ['seed-ing-tomato'],
          tempAvoidances: [{ ingredientName: '香菜' }],
          desiredDishIds: ['seed-dish-tomato-egg'],
          meals: ['breakfast', 'dinner'],
          avoidRecentDays: 3,
        },
      });
      expect(response.statusCode).toBe(200);
      expect(dayPlanService.generateDayPlan).toHaveBeenCalled();
    });

    it('returns 400 with invalid body (adults not int)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/recommend',
        cookies: { access_token: 'test-token' },
        body: { adults: 'two', children: 1, timeBudgetMin: 30, mustUseIngredients: [] },
      });
      expect(response.statusCode).toBe(400);
    });

    it('returns 400 with timeBudgetMin not in 15|30|60 (v0.12 对齐引擎时长档)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/recommend',
        cookies: { access_token: 'test-token' },
        body: { adults: 2, children: 1, timeBudgetMin: 45, mustUseIngredients: [] },
      });
      expect(response.statusCode).toBe(400);
    });

    it('returns 400 with invalid body (missing mustUseIngredients)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/recommend',
        cookies: { access_token: 'test-token' },
        body: { adults: 2, children: 1, timeBudgetMin: 30 },
      });
      expect(response.statusCode).toBe(400);
    });

    it('returns 400 with v0.11 legacy shape (people/mustUse 单餐报文，v0.12 breaking)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/recommend',
        cookies: { access_token: 'test-token' },
        body: { people: 4, timeBudgetMin: 30, mustUse: [] },
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

    it('returns 200 with valid SwapPlanRequest (单菜换 v0.4：dishId+newDishId)', async () => {
      vi.mocked(planService.swapPlan).mockResolvedValue(mockPlan);
      const response = await app.inject({
        method: 'POST',
        url: '/api/plans/test-plan-id/swap',
        cookies: { access_token: 'test-token' },
        body: { reason: '不吃辣', swapType: '单菜换', dishId: 'dish-1', newDishId: 'dish-2' },
      });
      expect(response.statusCode).toBe(200);
      // 透传校验：newDishId 须传给 service（DEC-013 服务端复检）；slot 第 6 参缺省 undefined
      expect(vi.mocked(planService.swapPlan)).toHaveBeenCalledWith(
        'test-plan-id',
        '单菜换',
        'dish-1',
        'dish-2',
        '不吃辣',
        undefined,
      );
    });

    it('returns 200 with 换一餐 (v0.12：slot 透传给 service)', async () => {
      vi.mocked(planService.swapPlan).mockResolvedValue(mockPlan);
      const response = await app.inject({
        method: 'POST',
        url: '/api/plans/test-plan-id/swap',
        cookies: { access_token: 'test-token' },
        body: { reason: '早餐想换口味', swapType: '换一餐', slot: 'breakfast' },
      });
      expect(response.statusCode).toBe(200);
      expect(vi.mocked(planService.swapPlan)).toHaveBeenCalledWith(
        'test-plan-id',
        '换一餐',
        undefined,
        undefined,
        '早餐想换口味',
        'breakfast',
      );
    });

    it('returns 400 with 换一餐 missing slot (v0.12 条件必填)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/plans/test-plan-id/swap',
        cookies: { access_token: 'test-token' },
        body: { swapType: '换一餐' },
      });
      expect(response.statusCode).toBe(400);
    });

    it('returns 400 with 换一餐 invalid slot value', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/plans/test-plan-id/swap',
        cookies: { access_token: 'test-token' },
        body: { swapType: '换一餐', slot: 'snack' },
      });
      expect(response.statusCode).toBe(400);
    });

    it('returns 200 without reason (v0.4：reason 可选)', async () => {
      vi.mocked(planService.swapPlan).mockResolvedValue(mockPlan);
      const response = await app.inject({
        method: 'POST',
        url: '/api/plans/test-plan-id/swap',
        cookies: { access_token: 'test-token' },
        body: { swapType: '全换' },
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

    it('returns 400 with 单菜换 missing newDishId (v0.4 条件必填)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/plans/test-plan-id/swap',
        cookies: { access_token: 'test-token' },
        body: { reason: 'x', swapType: '单菜换', dishId: 'dish-1' },
      });
      expect(response.statusCode).toBe(400);
    });

    it('returns 400 with v0.3 legacy shape (单菜换不带 newDishId，行为收紧)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/plans/test-plan-id/swap',
        cookies: { access_token: 'test-token' },
        body: { reason: '不吃辣', swapType: '单菜换', dishId: 'dish-1' },
      });
      expect(response.statusCode).toBe(400);
    });

    it('returns 400 with dishId === newDishId (换给自己无意义)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/plans/test-plan-id/swap',
        cookies: { access_token: 'test-token' },
        body: { reason: 'x', swapType: '单菜换', dishId: 'dish-1', newDishId: 'dish-1' },
      });
      expect(response.statusCode).toBe(400);
    });
  });

  // ── F3: GET /api/plans/:id/swap-options（TP-03/DEC-013） ──

  describe('GET /api/plans/:id/swap-options', () => {
    it('returns 200 with valid SwapOptionsResponse (有候选)', async () => {
      vi.mocked(planService.getSwapOptions).mockResolvedValue({
        dishId: 'dish-1',
        mealRole: 'MAIN',
        candidates: [
          {
            dishId: 'dish-2',
            name: '番茄炒蛋',
            mealRole: 'MAIN',
            cuisine: '家常',
            flavorTags: ['清淡'],
            spicyLevel: 0,
            activeMinutes: 15,
            totalMinutes: 20,
            equipment: ['wok'],
          },
        ],
      });
      const response = await app.inject({
        method: 'GET',
        url: '/api/plans/test-plan-id/swap-options?dishId=dish-1',
        cookies: { access_token: 'test-token' },
      });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as Record<string, unknown>;
      expect(body.dishId).toBe('dish-1');
      expect(body.mealRole).toBe('MAIN');
      expect(Array.isArray(body.candidates)).toBe(true);
    });

    it('returns 200 with empty candidates (C-6 空候选如实态)', async () => {
      vi.mocked(planService.getSwapOptions).mockResolvedValue({
        dishId: 'dish-1',
        mealRole: 'MAIN',
        candidates: [],
      });
      const response = await app.inject({
        method: 'GET',
        url: '/api/plans/test-plan-id/swap-options?dishId=dish-1',
        cookies: { access_token: 'test-token' },
      });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as Record<string, unknown>;
      expect(body.candidates).toEqual([]);
    });

    it('returns 400 without dishId query', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/plans/test-plan-id/swap-options',
        cookies: { access_token: 'test-token' },
      });
      expect(response.statusCode).toBe(400);
    });

    it('returns 404 when dish not in tonight menu', async () => {
      vi.mocked(planService.getSwapOptions).mockRejectedValue(
        new NotFoundError('今晚菜单中没有这道菜：dish-x'),
      );
      const response = await app.inject({
        method: 'GET',
        url: '/api/plans/test-plan-id/swap-options?dishId=dish-x',
        cookies: { access_token: 'test-token' },
      });
      expect(response.statusCode).toBe(404);
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

  // ── F4: POST /api/plans/:id/shopping-list/rescale（TP-04/DEC-014；v0.12 改成人/儿童口径 C-4） ──

  describe('POST /api/plans/:id/shopping-list/rescale (TP-04)', () => {
    it('returns 200 with rescaled ShoppingListResponse (adults/children)', async () => {
      vi.mocked(planService.rescaleShoppingList).mockResolvedValue(mockShoppingList);
      const response = await app.inject({
        method: 'POST',
        url: '/api/plans/test-plan-id/shopping-list/rescale',
        cookies: { access_token: 'test-token' },
        body: { adults: 3, children: 2 },
      });
      expect(response.statusCode).toBe(200);
      const body = parseResponse(response.body);
      expect(() => ShoppingListResponseSchema.parse(body)).not.toThrow();
      expect(planService.rescaleShoppingList).toHaveBeenCalledWith('test-plan-id', 3, 2);
    });

    it('returns 400 with adults=0', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/plans/test-plan-id/shopping-list/rescale',
        cookies: { access_token: 'test-token' },
        body: { adults: 0, children: 2 },
      });
      expect(response.statusCode).toBe(400);
    });

    it('returns 400 with non-integer children', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/plans/test-plan-id/shopping-list/rescale',
        cookies: { access_token: 'test-token' },
        body: { adults: 2, children: 1.5 },
      });
      expect(response.statusCode).toBe(400);
    });

    it('returns 400 with v0.11 legacy shape (people 单口径，v0.12 breaking)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/plans/test-plan-id/shopping-list/rescale',
        cookies: { access_token: 'test-token' },
        body: { people: 6 },
      });
      expect(response.statusCode).toBe(400);
    });

    it('returns 400 with missing children', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/plans/test-plan-id/shopping-list/rescale',
        cookies: { access_token: 'test-token' },
        body: { adults: 2 },
      });
      expect(response.statusCode).toBe(400);
    });
  });

  // ── F6: POST/GET /api/plans/:id/feedback（AC6，v0.6 三问模型 DEC-015） ──

  describe('POST /api/plans/:id/feedback (AC6)', () => {
    it('returns 200 with 三问全答（做了+好吃+还做+耗时）', async () => {
      vi.mocked(planService.addFeedback).mockResolvedValue(mockPlan);
      const response = await app.inject({
        method: 'POST',
        url: '/api/plans/test-plan-id/feedback',
        cookies: { access_token: 'test-token' },
        body: { didCook: true, taste: 'good', willRepeat: true, actualMinutes: 35 },
      });
      expect(response.statusCode).toBe(200);
      const body = parseResponse(response.body);
      expect(() => PlanResponseSchema.parse(body)).not.toThrow();
      expect(planService.addFeedback).toHaveBeenCalledWith('test-plan-id', {
        didCook: true, taste: 'good', willRepeat: true, actualMinutes: 35,
      });
    });

    it('returns 200 with mealSlot (v0.12 按餐记录，C-5)', async () => {
      vi.mocked(planService.addFeedback).mockResolvedValue(mockPlan);
      const response = await app.inject({
        method: 'POST',
        url: '/api/plans/test-plan-id/feedback',
        cookies: { access_token: 'test-token' },
        body: { didCook: true, taste: 'good', willRepeat: true, mealSlot: 'breakfast' },
      });
      expect(response.statusCode).toBe(200);
      expect(planService.addFeedback).toHaveBeenCalledWith('test-plan-id', {
        didCook: true, taste: 'good', willRepeat: true, mealSlot: 'breakfast',
      });
    });

    it('returns 400 with invalid mealSlot value', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/plans/test-plan-id/feedback',
        cookies: { access_token: 'test-token' },
        body: { didCook: false, willRepeat: false, mealSlot: 'brunch' },
      });
      expect(response.statusCode).toBe(400);
    });

    it('returns 200 with 没做+不做了（无 taste）', async () => {
      vi.mocked(planService.addFeedback).mockResolvedValue(mockPlan);
      const response = await app.inject({
        method: 'POST',
        url: '/api/plans/test-plan-id/feedback',
        cookies: { access_token: 'test-token' },
        body: { didCook: false, willRepeat: false },
      });
      expect(response.statusCode).toBe(200);
      expect(planService.addFeedback).toHaveBeenCalledWith('test-plan-id', {
        didCook: false, willRepeat: false,
      });
    });

    it('returns 400 when 做了缺 taste（第②问条件必填）', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/plans/test-plan-id/feedback',
        cookies: { access_token: 'test-token' },
        body: { didCook: true, willRepeat: true },
      });
      expect(response.statusCode).toBe(400);
    });

    it('returns 400 when 没做却传 taste（禁传）', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/plans/test-plan-id/feedback',
        cookies: { access_token: 'test-token' },
        body: { didCook: false, taste: 'good', willRepeat: true },
      });
      expect(response.statusCode).toBe(400);
    });

    it('returns 400 when 缺 willRepeat（第③问必填）', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/plans/test-plan-id/feedback',
        cookies: { access_token: 'test-token' },
        body: { didCook: true, taste: 'good' },
      });
      expect(response.statusCode).toBe(400);
    });

    it('returns 400 with 旧五项报文（result/cookResult，v0.6 breaking）', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/plans/test-plan-id/feedback',
        cookies: { access_token: 'test-token' },
        body: { result: 'cooked', cookResult: 'partial' },
      });
      expect(response.statusCode).toBe(400);
    });

    it('returns 400 with taste 非法值', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/plans/test-plan-id/feedback',
        cookies: { access_token: 'test-token' },
        body: { didCook: true, taste: 'success', willRepeat: true },
      });
      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /api/plans/:id/feedback (v0.6 DEC-015 裁决 4；v0.9 空态 200+null，T-P12)', () => {
    it('returns 200 with FeedbackResponse（有反馈）', async () => {
      vi.mocked(planService.getFeedback).mockResolvedValue({
        didCook: true, taste: 'good', willRepeat: true, actualMinutes: 30,
        submittedAt: new Date('2026-09-05T19:00:00'),
      });
      const response = await app.inject({
        method: 'GET',
        url: '/api/plans/test-plan-id/feedback',
        cookies: { access_token: 'test-token' },
      });
      expect(response.statusCode).toBe(200);
      const body = parseResponse(response.body);
      expect(() => FeedbackResponseSchema.parse(body)).not.toThrow();
      // v0.12：路由恒传两参（无 mealSlot query 时第二参 undefined）
      expect(planService.getFeedback).toHaveBeenCalledWith('test-plan-id', undefined);
    });

    it('returns 200 with 旧事件宽松解析（缺 taste/willRepeat 如实缺省）', async () => {
      vi.mocked(planService.getFeedback).mockResolvedValue({
        didCook: false, submittedAt: new Date('2026-09-04T19:00:00'),
      });
      const response = await app.inject({
        method: 'GET',
        url: '/api/plans/test-plan-id/feedback',
        cookies: { access_token: 'test-token' },
      });
      expect(response.statusCode).toBe(200);
      const body = parseResponse(response.body);
      expect(body.taste).toBeUndefined();
    });

    it('returns 200 with null body when 无反馈（v0.9：plan 存在但无反馈 -> 200 + JSON null）', async () => {
      vi.mocked(planService.getFeedback).mockResolvedValue(null);
      const response = await app.inject({
        method: 'GET',
        url: '/api/plans/test-plan-id/feedback',
        cookies: { access_token: 'test-token' },
      });
      expect(response.statusCode).toBe(200);
      // 响应体即 null 字面量（非空对象/空串/错误包裹）
      expect(response.body).toBe('null');
      expect(JSON.parse(response.body)).toBeNull();
    });

    it('returns 404 when plan 不存在（v0.9：404 语义收敛为资源不存在）', async () => {
      vi.mocked(planService.getFeedback).mockRejectedValue(new NotFoundError('Plan tp12-not-exist not found'));
      const response = await app.inject({
        method: 'GET',
        url: '/api/plans/tp12-not-exist/feedback',
        cookies: { access_token: 'test-token' },
      });
      expect(response.statusCode).toBe(404);
    });

    it('returns 200 with mealSlot query (v0.12 按餐取最新，C-5 各餐独立)', async () => {
      vi.mocked(planService.getFeedback).mockResolvedValue({
        didCook: true, taste: 'ok', willRepeat: false, mealSlot: 'lunch',
        submittedAt: new Date('2026-10-18T12:00:00'),
      });
      const response = await app.inject({
        method: 'GET',
        url: '/api/plans/test-plan-id/feedback?mealSlot=lunch',
        cookies: { access_token: 'test-token' },
      });
      expect(response.statusCode).toBe(200);
      const body = parseResponse(response.body);
      expect(() => FeedbackResponseSchema.parse(body)).not.toThrow();
      expect(planService.getFeedback).toHaveBeenCalledWith('test-plan-id', 'lunch');
    });

    it('returns 400 with invalid mealSlot query value', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/plans/test-plan-id/feedback?mealSlot=snack',
        cookies: { access_token: 'test-token' },
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

    it('returns 200 with date query (v0.12 按日查三餐计划)', async () => {
      vi.mocked(planService.listPlans).mockResolvedValue([mockPlan]);
      const response = await app.inject({
        method: 'GET',
        url: '/api/plans?date=2026-10-19',
        cookies: { access_token: 'test-token' },
      });
      expect(response.statusCode).toBe(200);
      const body = parseResponse(response.body);
      expect(() => PlanListResponseSchema.parse(body)).not.toThrow();
      expect(planService.listPlans).toHaveBeenCalledWith('2026-10-19');
    });

    it('returns 400 with invalid date format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/plans?date=2026/10/19',
        cookies: { access_token: 'test-token' },
      });
      expect(response.statusCode).toBe(400);
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
