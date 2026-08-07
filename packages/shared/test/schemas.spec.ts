// packages/shared/test/schemas.spec.ts
// shared 契约单元测试：合法输入通过、非法输入拒绝
// 覆盖枚举校验、必填校验、类型校验、JSON 字段精确定义、默认值
import { describe, it, expect } from 'vitest';
import {
  // family
  FamilySchema,
  FamilyRuleSchema,
  ExclusionRuleSchema,
  SeveritySchema,
  ExclusionScopeSchema,
  // dish
  DishSchema,
  DishIngredientSchema,
  IngredientSchema,
  SubstitutionSchema,
  MealRoleSchema,
  ContentStatusSchema,
  ContentOriginSchema,
  // menu
  MenuSchema,
  MenuDishSchema,
  CookLogSchema,
  MenuSceneSchema,
  // plan
  PlanSchema,
  EventSchema,
  PlanStatusSchema,
  EventTypeSchema,
  // api
  RecommendRequestSchema,
  SwapPlanRequestSchema,
  FeedbackRequestSchema,
  PatchShoppingListRequestSchema,
  PutFamilyRulesRequestSchema,
  PutExclusionsRequestSchema,
  GetExclusionsResponseSchema,
  CookResultSchema,
  RecommendResponseSchema,
  // constants
  CATEGORIES,
  EQUIPMENT,
  TIME_BUDGETS,
  PACKAGE_NAME,
} from '../src/index.js';

// ───── family ─────
describe('family schemas', () => {
  it('FamilySchema 合法输入通过', () => {
    const r = FamilySchema.safeParse({
      id: 'cm1',
      name: '苏大侠家',
      createdAt: new Date('2026-08-06'),
    });
    expect(r.success).toBe(true);
  });

  it('FamilySchema 缺少必填 name 拒绝', () => {
    const r = FamilySchema.safeParse({ id: 'cm1', createdAt: new Date() });
    expect(r.success).toBe(false);
  });

  it('FamilyRuleSchema 合法输入通过且 defaultPeople 默认 4', () => {
    const r = FamilyRuleSchema.safeParse({
      id: 'r1',
      familyId: 'cm1',
      timeBudgets: [30, 60],
      equipment: ['wok', 'rice_cooker'],
      cuisines: ['湘菜', '家常'],
      updatedAt: new Date(),
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.defaultPeople).toBe(4);
  });

  it('FamilyRuleSchema timeBudgets 含字符串拒绝（类型校验）', () => {
    const r = FamilyRuleSchema.safeParse({
      id: 'r1',
      familyId: 'cm1',
      timeBudgets: [30, '60'],
      equipment: ['wok'],
      cuisines: [],
      updatedAt: new Date(),
    });
    expect(r.success).toBe(false);
  });

  it('ExclusionRuleSchema 枚举 severity=HARD 通过', () => {
    const r = ExclusionRuleSchema.safeParse({
      id: 'e1',
      familyId: 'cm1',
      scope: 'INGREDIENT',
      targetId: 'i1',
      severity: 'HARD',
      note: '爸爸不吃腊肉',
    });
    expect(r.success).toBe(true);
  });

  it('ExclusionRuleSchema 枚举 severity 非法值拒绝', () => {
    const r = ExclusionRuleSchema.safeParse({
      id: 'e1',
      familyId: 'cm1',
      scope: 'TAG',
      targetTag: '内脏',
      severity: 'CRITICAL',
    });
    expect(r.success).toBe(false);
  });

  it('SeveritySchema / ExclusionScopeSchema 枚举校验', () => {
    expect(SeveritySchema.safeParse('HARD').success).toBe(true);
    expect(SeveritySchema.safeParse('SOFT').success).toBe(true);
    expect(SeveritySchema.safeParse('X').success).toBe(false);
    expect(ExclusionScopeSchema.safeParse('INGREDIENT').success).toBe(true);
    expect(ExclusionScopeSchema.safeParse('DISH').success).toBe(true);
    expect(ExclusionScopeSchema.safeParse('TAG').success).toBe(true);
    expect(ExclusionScopeSchema.safeParse('FOO').success).toBe(false);
  });
});

// ───── dish ─────
describe('dish schemas', () => {
  const validDish = {
    id: 'd1',
    name: '番茄炒蛋',
    mealRole: 'MAIN',
    flavorTags: ['酸甜'],
    activeMinutes: 10,
    totalMinutes: 15,
    equipment: ['wok'],
    steps: [
      { order: 1, text: '打蛋', parallel: false },
      { order: 2, text: '切番茄' },
    ],
  };

  it('DishSchema 合法输入通过，默认值正确', () => {
    const r = DishSchema.safeParse(validDish);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.spicyLevel).toBe(0);
      expect(r.data.splitFlavor).toBe(false);
      expect(r.data.status).toBe('DRAFT');
      expect(r.data.origin).toBe('LLM_DRAFT');
    }
  });

  it('DishSchema mealRole 枚举非法值拒绝', () => {
    const r = DishSchema.safeParse({ ...validDish, mealRole: 'DESSERT' });
    expect(r.success).toBe(false);
  });

  it('DishSchema steps.order 非整数拒绝（JSON 精确定义）', () => {
    const r = DishSchema.safeParse({
      ...validDish,
      steps: [{ order: '1', text: '打蛋' }],
    });
    expect(r.success).toBe(false);
  });

  it('DishIngredientSchema qty 浮点通过', () => {
    const r = DishIngredientSchema.safeParse({
      id: 'di1',
      dishId: 'd1',
      ingredientId: 'i1',
      qty: 200.5,
      unit: 'g',
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.optional).toBe(false);
  });

  it('IngredientSchema 缺必填 category 拒绝', () => {
    const r = IngredientSchema.safeParse({
      id: 'i1',
      name: '番茄',
      aliases: ['西红柿'],
      defaultUnit: 'g',
    });
    expect(r.success).toBe(false);
  });

  it('SubstitutionSchema ratio 默认 1', () => {
    const r = SubstitutionSchema.safeParse({
      id: 's1',
      ingredientId: 'i1',
      substituteId: 'i2',
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.ratio).toBe(1);
  });

  it('MealRole/ContentStatus/ContentOrigin 枚举校验', () => {
    expect(MealRoleSchema.safeParse('STAPLE').success).toBe(true);
    expect(MealRoleSchema.safeParse('NOPE').success).toBe(false);
    expect(ContentStatusSchema.safeParse('PUBLISHED').success).toBe(true);
    expect(ContentStatusSchema.safeParse('ARCHIVED').success).toBe(false);
    expect(ContentOriginSchema.safeParse('MANUAL').success).toBe(true);
    expect(ContentOriginSchema.safeParse('AI').success).toBe(false);
  });
});

// ───── menu ─────
describe('menu schemas', () => {
  const validMenu = {
    id: 'm1',
    name: '番茄牛腩套餐',
    scene: 'WEEKDAY_FAST',
    totalActiveMinutes: 30,
    prepSequence: [
      { minute: 0, action: '切牛腩' },
      { minute: 5, action: '起锅焯水' },
    ],
  };

  it('MenuSchema 合法输入通过，serves 默认 4', () => {
    const r = MenuSchema.safeParse(validMenu);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.serves).toBe(4);
      expect(r.data.status).toBe('DRAFT');
    }
  });

  it('MenuSchema scene 枚举非法值拒绝', () => {
    const r = MenuSchema.safeParse({ ...validMenu, scene: 'PARTY' });
    expect(r.success).toBe(false);
  });

  it('MenuSchema prepSequence.minute 非整数拒绝（JSON 精确定义）', () => {
    const r = MenuSchema.safeParse({
      ...validMenu,
      prepSequence: [{ minute: '0', action: '切菜' }],
    });
    expect(r.success).toBe(false);
  });

  it('MenuDishSchema 合法通过', () => {
    const r = MenuDishSchema.safeParse({ menuId: 'm1', dishId: 'd1', sort: 1 });
    expect(r.success).toBe(true);
  });

  it('CookLogSchema result 枚举 success/partial/fail', () => {
    expect(CookLogSchema.safeParse({
      id: 'c1', cookedAt: new Date(), result: 'success',
    }).success).toBe(true);
    expect(CookLogSchema.safeParse({
      id: 'c1', cookedAt: new Date(), result: 'ok',
    }).success).toBe(false);
  });

  it('MenuSceneSchema 枚举校验', () => {
    expect(MenuSceneSchema.safeParse('BUDGET').success).toBe(true);
    expect(MenuSceneSchema.safeParse('HOLIDAY').success).toBe(false);
  });
});

// ───── plan ─────
describe('plan schemas', () => {
  const validPlan = {
    id: 'p1',
    familyId: 'cm1',
    planDate: new Date('2026-08-06'),
    createdAt: new Date('2026-08-06'),
    context: { people: 4, timeBudgetMin: 30, mustUse: ['番茄'] },
    candidates: [
      { menuId: 'm1', score: 0.9, reasons: ['快'] },
      { menuId: 'm2', score: 0.8, reasons: ['便宜'], breakdown: { cost: 20 } },
    ],
  };

  it('PlanSchema 合法输入通过，status 默认 PROPOSED', () => {
    const r = PlanSchema.safeParse(validPlan);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.status).toBe('PROPOSED');
      expect(r.data.lockedMenuId).toBeUndefined();
    }
  });

  it('PlanSchema status 枚举非法值拒绝', () => {
    const r = PlanSchema.safeParse({ ...validPlan, status: 'DONE' });
    expect(r.success).toBe(false);
  });

  it('PlanSchema context.people 缺失拒绝（JSON 精确定义）', () => {
    const r = PlanSchema.safeParse({
      ...validPlan,
      context: { timeBudgetMin: 30, mustUse: [] },
    });
    expect(r.success).toBe(false);
  });

  it('PlanSchema candidates[].reasons 非数组拒绝', () => {
    const r = PlanSchema.safeParse({
      ...validPlan,
      candidates: [{ menuId: 'm1', score: 0.9, reasons: '快' }],
    });
    expect(r.success).toBe(false);
  });

  it('EventSchema 合法通过，payload 可选', () => {
    const r = EventSchema.safeParse({
      id: 'ev1',
      familyId: 'cm1',
      type: 'GENERATE',
      createdAt: new Date(),
    });
    expect(r.success).toBe(true);
  });

  it('EventTypeSchema 枚举校验', () => {
    expect(EventTypeSchema.safeParse('SWAP_DISH').success).toBe(true);
    expect(EventTypeSchema.safeParse('DELETE').success).toBe(false);
  });

  it('PlanStatusSchema 枚举校验', () => {
    expect(PlanStatusSchema.safeParse('LOCKED').success).toBe(true);
    expect(PlanStatusSchema.safeParse('PENDING').success).toBe(false);
  });
});

// ───── api ─────
describe('api schemas', () => {
  it('RecommendRequestSchema 合法通过', () => {
    const r = RecommendRequestSchema.safeParse({
      people: 4,
      timeBudgetMin: 30,
      mustUse: ['番茄', '鸡蛋'],
    });
    expect(r.success).toBe(true);
  });

  it('RecommendRequestSchema mustUse 非数组拒绝', () => {
    const r = RecommendRequestSchema.safeParse({
      people: 4,
      timeBudgetMin: 30,
      mustUse: '番茄',
    });
    expect(r.success).toBe(false);
  });

  it('SwapPlanRequestSchema swapType=全换 通过，非法值拒绝', () => {
    expect(SwapPlanRequestSchema.safeParse({
      reason: '太麻烦', swapType: '全换',
    }).success).toBe(true);
    expect(SwapPlanRequestSchema.safeParse({
      reason: '太麻烦', swapType: 'all',
    }).success).toBe(false);
  });

  it('SwapPlanRequestSchema 缺必填 reason 拒绝', () => {
    const r = SwapPlanRequestSchema.safeParse({ swapType: '单菜换' });
    expect(r.success).toBe(false);
  });

  it('FeedbackRequestSchema result 枚举 cooked/not_cooked/repeat', () => {
    expect(FeedbackRequestSchema.safeParse({ result: 'cooked' }).success).toBe(true);
    expect(FeedbackRequestSchema.safeParse({ result: 'repeat', actualMinutes: 25 }).success).toBe(true);
    expect(FeedbackRequestSchema.safeParse({ result: 'done' }).success).toBe(false);
  });

  it('FeedbackRequestSchema v0.2 cookResult/failPoints 可选字段向后兼容', () => {
    // 旧格式（无 cookResult/failPoints）仍通过--向后兼容
    expect(FeedbackRequestSchema.safeParse({ result: 'cooked' }).success).toBe(true);
    // 新字段 cookResult + failPoints 通过
    expect(FeedbackRequestSchema.safeParse({
      result: 'cooked', cookResult: 'partial', failPoints: '蛋老了',
    }).success).toBe(true);
    // cookResult 非法值拒绝
    expect(FeedbackRequestSchema.safeParse({
      result: 'cooked', cookResult: 'ok',
    }).success).toBe(false);
  });

  it('CookResultSchema 枚举 success/partial/fail', () => {
    expect(CookResultSchema.safeParse('success').success).toBe(true);
    expect(CookResultSchema.safeParse('partial').success).toBe(true);
    expect(CookResultSchema.safeParse('fail').success).toBe(true);
    expect(CookResultSchema.safeParse('ok').success).toBe(false);
  });

  it('PutExclusionsRequestSchema 禁忌数组通过，非数组/非法元素拒绝', () => {
    const valid = [
      { id: 'e1', familyId: 'cm1', scope: 'INGREDIENT', targetId: 'i1', severity: 'HARD' },
      { id: 'e2', familyId: 'cm1', scope: 'TAG', targetTag: '内脏', severity: 'SOFT' },
    ];
    expect(PutExclusionsRequestSchema.safeParse(valid).success).toBe(true);
    // 非数组拒绝
    expect(PutExclusionsRequestSchema.safeParse({ id: 'e1' }).success).toBe(false);
    // 元素非法（severity 非法）拒绝
    expect(PutExclusionsRequestSchema.safeParse([
      { id: 'e1', familyId: 'cm1', scope: 'INGREDIENT', severity: 'CRITICAL' },
    ]).success).toBe(false);
  });

  it('GetExclusionsResponseSchema 禁忌数组通过', () => {
    const r = GetExclusionsResponseSchema.safeParse([
      { id: 'e1', familyId: 'cm1', scope: 'INGREDIENT', targetId: 'i1', severity: 'HARD' },
    ]);
    expect(r.success).toBe(true);
  });

  it('PatchShoppingListRequestSchema 缺 checked 拒绝', () => {
    expect(PatchShoppingListRequestSchema.safeParse({
      itemId: 'it1', checked: true,
    }).success).toBe(true);
    expect(PatchShoppingListRequestSchema.safeParse({ itemId: 'it1' }).success).toBe(false);
  });

  it('PutFamilyRulesRequestSchema 等价于 FamilyRuleSchema', () => {
    const r = PutFamilyRulesRequestSchema.safeParse({
      id: 'r1',
      familyId: 'cm1',
      timeBudgets: [30],
      equipment: ['wok'],
      cuisines: [],
      updatedAt: new Date(),
    });
    expect(r.success).toBe(true);
  });

  it('RecommendResponseSchema 候选数组通过', () => {
    const r = RecommendResponseSchema.safeParse({
      candidates: [{ menuId: 'm1', score: 0.9, reasons: ['快'] }],
    });
    expect(r.success).toBe(true);
  });
});

// ───── constants ─────
describe('constants', () => {
  it('CATEGORIES 含 6 个品类', () => {
    expect(CATEGORIES).toHaveLength(6);
    expect(CATEGORIES).toContain('蔬菜');
    expect(CATEGORIES).toContain('主食');
  });

  it('EQUIPMENT 含 4 件器具', () => {
    expect(EQUIPMENT).toHaveLength(4);
    expect(EQUIPMENT).toContain('wok');
    expect(EQUIPMENT).toContain('air_fryer');
  });

  it('TIME_BUDGETS 为 [15, 30, 60]', () => {
    expect([...TIME_BUDGETS]).toEqual([15, 30, 60]);
  });

  it('PACKAGE_NAME 兼容导出', () => {
    expect(PACKAGE_NAME).toBe('@family-menu/shared');
  });
});
