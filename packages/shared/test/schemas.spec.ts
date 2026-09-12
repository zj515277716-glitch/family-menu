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
  ShoppingListSchema,
  // api
  RecommendRequestSchema,
  SwapPlanRequestSchema,
  SwapOptionsQuerySchema,
  SwapOptionsResponseSchema,
  FeedbackRequestSchema,
  FeedbackResponseSchema,
  TasteSchema,
  PatchShoppingListRequestSchema,
  RescaleShoppingListRequestSchema,
  PutFamilyRulesRequestSchema,
  PutExclusionsRequestSchema,
  GetExclusionsResponseSchema,
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

  // T-C01：Dish 图片与来源追溯字段（imageUrl/sourceUrl/sourceSite）+ origin 扩展 FETCHED
  it('DishSchema T-C01 三新字段全带合法值通过', () => {
    const r = DishSchema.safeParse({
      ...validDish,
      imageUrl: 'https://i.xiachufang.com/recipe/cover.jpg',
      sourceUrl: 'https://www.xiachufang.com/recipe/106733852/',
      sourceSite: 'xiachufang',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.imageUrl).toBe('https://i.xiachufang.com/recipe/cover.jpg');
      expect(r.data.sourceUrl).toBe('https://www.xiachufang.com/recipe/106733852/');
      expect(r.data.sourceSite).toBe('xiachufang');
    }
  });

  it('DishSchema T-C01 三新字段缺省兼容（旧数据不传=undefined）', () => {
    const r = DishSchema.safeParse(validDish);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.imageUrl).toBeUndefined();
      expect(r.data.sourceUrl).toBeUndefined();
      expect(r.data.sourceSite).toBeUndefined();
    }
  });

  it('DishSchema imageUrl 非法 URL 拒绝', () => {
    expect(
      DishSchema.safeParse({ ...validDish, imageUrl: 'not-a-url' }).success,
    ).toBe(false);
    expect(
      DishSchema.safeParse({ ...validDish, imageUrl: 'http://' }).success,
    ).toBe(false);
  });

  // T-P09（v0.7）：imageUrl 口径放宽——http(s) 绝对 URL 或 /images/ 站内相对路径二选一
  it('DishSchema imageUrl /images/ 站内相对路径通过（T-P09 放宽）', () => {
    const r = DishSchema.safeParse({
      ...validDish,
      imageUrl: '/images/dishes/6a55c68e000000001c025017/0.webp',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.imageUrl).toBe('/images/dishes/6a55c68e000000001c025017/0.webp');
    }
  });

  it('DishSchema imageUrl 既非 URL 又非 /images/ 相对路径拒绝（T-P09）', () => {
    expect(
      DishSchema.safeParse({ ...validDish, imageUrl: 'foo/bar.jpg' }).success,
    ).toBe(false);
    // 缺前导斜杠：两个分支都不匹配
    expect(
      DishSchema.safeParse({ ...validDish, imageUrl: 'images/dishes/abc/0.webp' }).success,
    ).toBe(false);
    // 空串仍拒绝（保持既有行为）
    expect(DishSchema.safeParse({ ...validDish, imageUrl: '' }).success).toBe(false);
  });

  // T-P15（v0.10，挂账⑧）：站内分支收紧为 /^\/images\/dishes\/[A-Za-z0-9]+\/\d+\.(webp|jpg|png|gif)$/
  it('DishSchema imageUrl 站内分支收紧为内容管线落盘结构（T-P15 v0.10）', () => {
    const rel = (p: string) => DishSchema.safeParse({ ...validDish, imageUrl: p });

    // webp/jpg/png/gif 四合法扩展名各通过（/images/dishes/<noteId>/<i>.<ext>，noteId=[A-Za-z0-9]+、i=非负整数）
    expect(rel('/images/dishes/6a55c68e000000001c025017/0.webp').success).toBe(true);
    expect(rel('/images/dishes/6a55c68e000000001c025017/0.jpg').success).toBe(true);
    expect(rel('/images/dishes/6a55c68e000000001c025017/12.png').success).toBe(true);
    expect(rel('/images/dishes/6a55c68e000000001c025017/3.gif').success).toBe(true);

    // /images/ 泛前缀（非 dishes 落盘结构）拒绝
    expect(rel('/images/abc.jpg').success).toBe(false);

    // .jpeg 不含（normalizeImageExt 归一为 jpg，拍板差异 1）
    expect(rel('/images/dishes/6a55c68e000000001c025017/0.jpeg').success).toBe(false);
    // .svg / 无扩展名拒绝
    expect(rel('/images/dishes/6a55c68e000000001c025017/0.svg').success).toBe(false);
    expect(rel('/images/dishes/6a55c68e000000001c025017/0').success).toBe(false);

    // 目录结构不符（无文件名）拒绝
    expect(rel('/images/dishes/').success).toBe(false);
    expect(rel('/images/dishes/abc/').success).toBe(false);

    // 大写扩展名拒绝（ext 硬编码小写）
    expect(rel('/images/dishes/6a55c68e000000001c025017/0.WEBP').success).toBe(false);
  });

  it('DishSchema sourceUrl 非法 URL 拒绝', () => {
    expect(
      DishSchema.safeParse({ ...validDish, sourceUrl: 'xiachufang.com/recipe/1' }).success,
    ).toBe(false);
  });

  it('DishSchema sourceSite 先宽松（任意字符串通过）', () => {
    expect(
      DishSchema.safeParse({ ...validDish, sourceSite: 'xiaohongshu' }).success,
    ).toBe(true);
    expect(
      DishSchema.safeParse({ ...validDish, sourceSite: '手工录入' }).success,
    ).toBe(true);
  });

  it('ContentOriginSchema T-C01 扩展 FETCHED', () => {
    expect(ContentOriginSchema.safeParse('FETCHED').success).toBe(true);
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
    expect(EventTypeSchema.safeParse('RESCALE').success).toBe(true); // DEC-014
    expect(EventTypeSchema.safeParse('DELETE').success).toBe(false);
  });

  it('ShoppingListSchema 结构化校验（DEC-014 精化）', () => {
    // 完整条目：带两个 optional 标记
    expect(ShoppingListSchema.safeParse({
      groups: [{
        category: '蔬菜',
        items: [{
          ingredientId: 'ing1', name: '番茄', category: '蔬菜',
          qty: 2, unit: '个', checked: false,
          alreadyHave: true, pantryStaple: false,
        }],
      }],
    }).success).toBe(true);
    // 旧形态兼容：两个布尔缺省直接过（DEC-014 optional 缺省=未标）
    expect(ShoppingListSchema.safeParse({
      groups: [{
        category: '肉类',
        items: [{ ingredientId: 'ing2', name: '猪肉', category: '肉类', qty: 300, unit: 'g', checked: true }],
      }],
    }).success).toBe(true);
    // 缺 checked 拒绝
    expect(ShoppingListSchema.safeParse({
      groups: [{
        category: '蔬菜',
        items: [{ ingredientId: 'ing1', name: '番茄', category: '蔬菜', qty: 2, unit: '个' }],
      }],
    }).success).toBe(false);
    // 缺 groups 拒绝
    expect(ShoppingListSchema.safeParse({}).success).toBe(false);
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

  it('SwapPlanRequestSchema v0.4 全换通过（reason 可选），非法值拒绝', () => {
    // 全换不带 reason 也通过（v0.4：reason 可选，PD-003）
    expect(SwapPlanRequestSchema.safeParse({ swapType: '全换' }).success).toBe(true);
    expect(SwapPlanRequestSchema.safeParse({ reason: '太麻烦', swapType: '全换' }).success).toBe(true);
    expect(SwapPlanRequestSchema.safeParse({
      reason: '太麻烦', swapType: 'all',
    }).success).toBe(false);
  });

  it('SwapPlanRequestSchema v0.4 单菜换条件必填（DEC-013）', () => {
    // 单菜换带双 id 且不等：通过（reason 可不填）
    expect(SwapPlanRequestSchema.safeParse({
      swapType: '单菜换', dishId: 'd1', newDishId: 'd2',
    }).success).toBe(true);
    expect(SwapPlanRequestSchema.safeParse({
      swapType: '单菜换', dishId: 'd1', newDishId: 'd2', reason: '太麻烦',
    }).success).toBe(true);
    // 缺 dishId 拒绝
    expect(SwapPlanRequestSchema.safeParse({ swapType: '单菜换', newDishId: 'd2' }).success).toBe(false);
    // 缺 newDishId 拒绝
    expect(SwapPlanRequestSchema.safeParse({ swapType: '单菜换', dishId: 'd1' }).success).toBe(false);
    // 两个都缺拒绝
    expect(SwapPlanRequestSchema.safeParse({ swapType: '单菜换' }).success).toBe(false);
    // dishId === newDishId 拒绝（换给自己无意义）
    expect(SwapPlanRequestSchema.safeParse({
      swapType: '单菜换', dishId: 'd1', newDishId: 'd1',
    }).success).toBe(false);
    // 行为收紧：v0.3 旧形态（单菜换不带双 id、只带 reason）v0.4 起 400（DEC-013）
    expect(SwapPlanRequestSchema.safeParse({ reason: '太麻烦', swapType: '单菜换' }).success).toBe(false);
    // 全换不受条件约束：带/不带 dishId 均通过
    expect(SwapPlanRequestSchema.safeParse({
      swapType: '全换', dishId: 'd1', newDishId: 'd1',
    }).success).toBe(true);
  });

  it('SwapOptionsQuerySchema dishId 必填非空（v0.4）', () => {
    expect(SwapOptionsQuerySchema.safeParse({ dishId: 'd1' }).success).toBe(true);
    expect(SwapOptionsQuerySchema.safeParse({ dishId: '' }).success).toBe(false);
    expect(SwapOptionsQuerySchema.safeParse({}).success).toBe(false);
  });

  it('SwapOptionsResponseSchema 候选数组通过，空候选=如实态（C-6）', () => {
    const validOption = {
      dishId: 'd2', name: '红烧排骨', mealRole: 'MAIN',
      cuisine: '家常', flavorTags: ['咸香'], spicyLevel: 1,
      activeMinutes: 30, totalMinutes: 45, equipment: ['wok'],
    };
    // 有候选通过
    expect(SwapOptionsResponseSchema.safeParse({
      dishId: 'd1', mealRole: 'MAIN', candidates: [validOption],
    }).success).toBe(true);
    // 空候选（共 0 个）也是合法响应
    const empty = SwapOptionsResponseSchema.safeParse({ dishId: 'd1', mealRole: 'MAIN', candidates: [] });
    expect(empty.success).toBe(true);
    if (empty.success) expect(empty.data.candidates).toEqual([]);
    // 候选缺必填 name 拒绝
    expect(SwapOptionsResponseSchema.safeParse({
      dishId: 'd1', mealRole: 'MAIN',
      candidates: [{
        dishId: 'd2', mealRole: 'MAIN', flavorTags: [], spicyLevel: 0,
        activeMinutes: 10, totalMinutes: 15, equipment: [],
      }],
    }).success).toBe(false);
    // 候选 mealRole 非法值拒绝
    expect(SwapOptionsResponseSchema.safeParse({
      dishId: 'd1', mealRole: 'MAIN',
      candidates: [{ ...validOption, mealRole: 'DESSERT' }],
    }).success).toBe(false);
  });

  it('TasteSchema 枚举 good/ok/fail', () => {
    expect(TasteSchema.safeParse('good').success).toBe(true);
    expect(TasteSchema.safeParse('ok').success).toBe(true);
    expect(TasteSchema.safeParse('fail').success).toBe(true);
    expect(TasteSchema.safeParse('success').success).toBe(false);
    expect(TasteSchema.safeParse('').success).toBe(false);
  });

  it('FeedbackRequestSchema 三问全答（做了+好吃+还做）通过', () => {
    const r = FeedbackRequestSchema.safeParse({ didCook: true, taste: 'good', willRepeat: true });
    expect(r.success).toBe(true);
  });

  it('FeedbackRequestSchema 做了+一般/翻车+不做了 通过，耗时选填', () => {
    expect(FeedbackRequestSchema.safeParse({ didCook: true, taste: 'ok', willRepeat: false }).success).toBe(true);
    expect(FeedbackRequestSchema.safeParse({ didCook: true, taste: 'fail', willRepeat: false, actualMinutes: 45 }).success).toBe(true);
    // 缺 willRepeat 拒绝（第③问必填，没做也答）
    expect(FeedbackRequestSchema.safeParse({ didCook: true, taste: 'good' }).success).toBe(false);
  });

  it('FeedbackRequestSchema 没做：taste 禁传，willRepeat 仍必填', () => {
    expect(FeedbackRequestSchema.safeParse({ didCook: false, willRepeat: false }).success).toBe(true);
    expect(FeedbackRequestSchema.safeParse({ didCook: false, willRepeat: true }).success).toBe(true);
    // 没做却传 taste -> 拒绝
    expect(FeedbackRequestSchema.safeParse({ didCook: false, taste: 'good', willRepeat: true }).success).toBe(false);
    // 没做缺 willRepeat -> 拒绝
    expect(FeedbackRequestSchema.safeParse({ didCook: false }).success).toBe(false);
  });

  it('FeedbackRequestSchema 做了缺 taste（第②问条件必填）拒绝', () => {
    expect(FeedbackRequestSchema.safeParse({ didCook: true, willRepeat: true }).success).toBe(false);
  });

  it('FeedbackRequestSchema 必填缺失/耗时非法拒绝', () => {
    // 空对象拒绝
    expect(FeedbackRequestSchema.safeParse({}).success).toBe(false);
    // 耗时非整数拒绝
    expect(FeedbackRequestSchema.safeParse({ didCook: true, taste: 'good', willRepeat: true, actualMinutes: 30.5 }).success).toBe(false);
  });

  it('FeedbackRequestSchema 旧五项报文（result/cookResult/failPoints）v0.6 起 400 拒绝', () => {
    expect(FeedbackRequestSchema.safeParse({ result: 'cooked' }).success).toBe(false);
    expect(FeedbackRequestSchema.safeParse({ result: 'repeat', cookResult: 'partial', failPoints: '蛋老了' }).success).toBe(false);
  });

  it('FeedbackResponseSchema 新事件 payload 完整解析', () => {
    const r = FeedbackResponseSchema.safeParse({
      didCook: true, taste: 'good', willRepeat: true, actualMinutes: 30, submittedAt: new Date('2026-09-05T19:00:00'),
    });
    expect(r.success).toBe(true);
  });

  it('FeedbackResponseSchema 旧事件 payload 宽松解析（缺 taste/willRepeat 如实缺省）', () => {
    // v0.5 事件 payload 只有 actualMinutes
    const old = FeedbackResponseSchema.safeParse({
      didCook: false, actualMinutes: 20, submittedAt: new Date('2026-09-04T19:00:00'),
    });
    expect(old.success).toBe(true);
    if (old.success) {
      expect(old.data.taste).toBeUndefined();
      expect(old.data.willRepeat).toBeUndefined();
    }
    // didCook/submittedAt 必填
    expect(FeedbackResponseSchema.safeParse({ taste: 'good' }).success).toBe(false);
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

  it('RescaleShoppingListRequestSchema people>=1（DEC-014）', () => {
    expect(RescaleShoppingListRequestSchema.safeParse({ people: 3 }).success).toBe(true);
    expect(RescaleShoppingListRequestSchema.safeParse({ people: 1 }).success).toBe(true);
    expect(RescaleShoppingListRequestSchema.safeParse({ people: 0 }).success).toBe(false);
    expect(RescaleShoppingListRequestSchema.safeParse({ people: 2.5 }).success).toBe(false);
    expect(RescaleShoppingListRequestSchema.safeParse({}).success).toBe(false);
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

  it('RecommendResponseSchema 带unmetMustUse通过（v0.3 空手信号）', () => {
    const r = RecommendResponseSchema.safeParse({
      candidates: [],
      unmetMustUse: ['苦瓜'],
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.unmetMustUse).toEqual(['苦瓜']);
    }
  });

  it('RecommendResponseSchema 缺省unmetMustUse通过（向后兼容 v0.2）', () => {
    const r = RecommendResponseSchema.safeParse({
      candidates: [{ menuId: 'm1', score: 0.9, reasons: ['快'] }],
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.unmetMustUse).toBeUndefined();
    }
  });

  it('RecommendResponseSchema 带unmetReasons通过（v0.8 空手原因，两枚举值原样保留）', () => {
    const r = RecommendResponseSchema.safeParse({
      candidates: [],
      unmetMustUse: ['土豆丝', '苦瓜'],
      unmetReasons: { 土豆丝: 'TIME_BUDGET', 苦瓜: 'NO_DISH' },
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.unmetReasons).toEqual({ 土豆丝: 'TIME_BUDGET', 苦瓜: 'NO_DISH' });
    }
  });

  it('RecommendResponseSchema 缺省unmetReasons通过（向后兼容 v0.7）', () => {
    const r = RecommendResponseSchema.safeParse({
      candidates: [],
      unmetMustUse: ['苦瓜'],
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.unmetReasons).toBeUndefined();
    }
  });

  it('RecommendResponseSchema 非法原因枚举拒（v0.8）', () => {
    expect(
      RecommendResponseSchema.safeParse({
        candidates: [],
        unmetMustUse: ['苦瓜'],
        unmetReasons: { 苦瓜: 'WEEKEND' },
      }).success,
    ).toBe(false);
    expect(
      RecommendResponseSchema.safeParse({
        candidates: [],
        unmetMustUse: ['苦瓜'],
        unmetReasons: { 苦瓜: 'no_dish' },
      }).success,
    ).toBe(false);
  });

  it('RecommendResponseSchema 非对象形式的unmetReasons拒（v0.8）', () => {
    expect(
      RecommendResponseSchema.safeParse({
        candidates: [],
        unmetMustUse: ['苦瓜'],
        unmetReasons: ['NO_DISH'],
      }).success,
    ).toBe(false);
    expect(
      RecommendResponseSchema.safeParse({
        candidates: [],
        unmetMustUse: ['苦瓜'],
        unmetReasons: 'NO_DISH',
      }).success,
    ).toBe(false);
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
