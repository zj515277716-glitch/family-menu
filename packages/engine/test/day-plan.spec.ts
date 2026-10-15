// packages/engine/test/day-plan.spec.ts
// T-Q09/PD-020：一日三餐联合规划测试——餐型维度（早餐轻食池）+ 必消跨餐分配 +
// 跨餐约束（主蛋白不重复/菜系烹饪方式主食材不撞）+ 儿童餐约束 + 临时忌口 +
// 想吃的菜冲突标注 + 换一道/换一餐/换一批 + 确定性 + 空手按餐归因 + 餐次勾选。
// fixtures 为本 spec 专用（不动共享 fixtures，避免影响既有用例）。
import { describe, it, expect } from 'vitest';
import {
  planDay,
  replanMeal,
  replanAllMeals,
  swapCandidatesForSlot,
  isBreakfastDish,
  score,
  type DayPlanContext,
  type DayPlanInput,
  type DayPlanResult,
  type DishIngredientView,
  type DishView,
  type EventView,
  type FamilyRuleView,
  type MealSlot,
  type MenuView,
} from '../src/index.js';

// ───── 食材 ─────

interface IngSeed {
  ingredientId: string;
  ingredientName: string;
  category: string;
}

const ING = {
  millet: { ingredientId: 'ing-millet', ingredientName: '小米', category: '主食' },
  soy: { ingredientId: 'ing-soy', ingredientName: '黄豆', category: '豆制品' },
  egg: { ingredientId: 'ing-egg', ingredientName: '鸡蛋', category: '蛋奶' },
  flour: { ingredientId: 'ing-flour', ingredientName: '面粉', category: '主食' },
  beef: { ingredientId: 'ing-beef', ingredientName: '牛肉', category: '肉类' },
  chicken: { ingredientId: 'ing-chicken', ingredientName: '鸡肉', category: '肉类' },
  pork: { ingredientId: 'ing-pork', ingredientName: '猪肉', category: '肉类' },
  shrimp: { ingredientId: 'ing-shrimp', ingredientName: '虾', category: '水产' },
  hairtail: { ingredientId: 'ing-hairtail', ingredientName: '带鱼', category: '水产' },
  tofu: { ingredientId: 'ing-tofu', ingredientName: '豆腐', category: '豆制品' },
  potato: { ingredientId: 'ing-potato', ingredientName: '土豆', category: '蔬菜' },
  tomato: { ingredientId: 'ing-tomato', ingredientName: '番茄', category: '蔬菜' },
  cuke: { ingredientId: 'ing-cuke', ingredientName: '黄瓜', category: '蔬菜' },
  broc: { ingredientId: 'ing-broc', ingredientName: '西蓝花', category: '蔬菜' },
  wax: { ingredientId: 'ing-wax', ingredientName: '冬瓜', category: '蔬菜' },
  green: { ingredientId: 'ing-green', ingredientName: '青菜', category: '蔬菜' },
  seaweed: { ingredientId: 'ing-seaweed', ingredientName: '紫菜', category: '蔬菜' },
} satisfies Record<string, IngSeed>;

function di(ing: IngSeed, optional = false): DishIngredientView {
  return {
    ...ing,
    aliases: [],
    defaultUnit: 'g',
    qty: 100,
    unit: 'g',
    optional,
  };
}

// ───── 菜品构造 ─────

interface DishSeed {
  id: string;
  name: string;
  mealRole: DishView['mealRole'];
  ings: IngSeed[];
  minutes?: number;
  cuisine?: string;
  spicyLevel?: number;
  flavorTags?: string[];
  equipment?: string[];
  mealTypes?: MealSlot[];
}

function makeDish(seed: DishSeed): DishView {
  return {
    id: seed.id,
    name: seed.name,
    mealRole: seed.mealRole,
    mealTypes: seed.mealTypes,
    cuisine: seed.cuisine ?? '家常',
    flavorTags: seed.flavorTags ?? ['清淡'],
    spicyLevel: seed.spicyLevel ?? 0,
    splitFlavor: false,
    activeMinutes: seed.minutes ?? 15,
    totalMinutes: seed.minutes ?? 15,
    equipment: seed.equipment ?? ['wok'],
    steps: [{ order: 1, text: `做${seed.name}` }],
    status: 'PUBLISHED',
    ingredients: seed.ings.map((ing) => di(ing)),
  };
}

// 早餐轻食池
const D_CONGEE = makeDish({ id: 'd-congee', name: '小米粥', mealRole: 'STAPLE', ings: [ING.millet], minutes: 10, equipment: ['pot'] });
const D_BOILED_EGG = makeDish({ id: 'd-boiled-egg', name: '白煮蛋', mealRole: 'SIDE', ings: [ING.egg], minutes: 5, cuisine: '早茶', equipment: ['pot'] });
const D_SOY_MILK = makeDish({ id: 'd-soy-milk', name: '豆浆', mealRole: 'STAPLE', ings: [ING.soy], minutes: 8, cuisine: '早茶', equipment: ['pot'] });
const D_PANCAKE = makeDish({ id: 'd-pancake', name: '鸡蛋饼', mealRole: 'STAPLE', ings: [ING.flour, ING.egg], minutes: 12, cuisine: '早茶', equipment: ['pan'] });
// 正餐
const D_TOMATO_EGG = makeDish({ id: 'd-tomato-egg', name: '番茄炒蛋', mealRole: 'MAIN', ings: [ING.tomato, ING.egg], minutes: 15 });
const D_BRAISED_BEEF = makeDish({ id: 'd-braised-beef', name: '红烧牛肉', mealRole: 'MAIN', ings: [ING.beef, ING.potato], minutes: 25 });
const D_KUNGPAAO = makeDish({ id: 'd-kungpao', name: '宫保鸡丁', mealRole: 'MAIN', ings: [ING.chicken], minutes: 15, cuisine: '川菜' });
const D_PORK_STRIPS = makeDish({ id: 'd-pork-strips', name: '青椒肉丝', mealRole: 'MAIN', ings: [ING.pork], minutes: 18 });
const D_SHRIMP = makeDish({ id: 'd-shrimp', name: '白灼虾', mealRole: 'MAIN', ings: [ING.shrimp], minutes: 12, cuisine: '粤菜', equipment: ['pot'] });
const D_CUKE = makeDish({ id: 'd-cuke', name: '拍黄瓜', mealRole: 'SIDE', ings: [ING.cuke], minutes: 5 });
const D_BROC = makeDish({ id: 'd-broc', name: '蒜蓉西蓝花', mealRole: 'SIDE', ings: [ING.broc], minutes: 10 });
const D_WAX_SOUP = makeDish({ id: 'd-wax-soup', name: '冬瓜汤', mealRole: 'SOUP', ings: [ING.wax], minutes: 10, equipment: ['pot'] });
const D_SEAWEED_SOUP = makeDish({ id: 'd-seaweed-soup', name: '紫菜蛋花汤', mealRole: 'SOUP', ings: [ING.seaweed, ING.egg], minutes: 8, equipment: ['pot'] });
// 儿童约束测试菜（辣/刺多/过硬）
const D_MAPO = makeDish({ id: 'd-mapo', name: '麻婆豆腐', mealRole: 'MAIN', ings: [ING.tofu, ING.beef], minutes: 20, cuisine: '川菜', spicyLevel: 3, flavorTags: ['麻辣'] });
const D_BONY_FISH = makeDish({ id: 'd-bony-fish', name: '清蒸带鱼', mealRole: 'MAIN', ings: [ING.hairtail], minutes: 15, flavorTags: ['刺多'], equipment: ['pot'] });
const D_TOUGH_BEEF = makeDish({ id: 'd-tough-beef', name: '酱牛肉', mealRole: 'MAIN', ings: [ING.beef], minutes: 20, flavorTags: ['过硬'], equipment: ['pot'] });

const STD_DISHES: DishView[] = [
  D_CONGEE, D_BOILED_EGG, D_SOY_MILK, D_PANCAKE,
  D_TOMATO_EGG, D_BRAISED_BEEF, D_KUNGPAAO, D_PORK_STRIPS, D_SHRIMP,
  D_CUKE, D_BROC, D_WAX_SOUP, D_SEAWEED_SOUP,
  D_MAPO, D_BONY_FISH, D_TOUGH_BEEF,
];

const STD_RULES: FamilyRuleView = {
  familyId: 'fam-1',
  defaultPeople: 2,
  timeBudgets: [30, 60],
  equipment: ['wok', 'pot', 'pan'],
  cuisines: ['家常', '川菜', '粤菜'],
};

function makeContext(partial?: Partial<DayPlanContext>): DayPlanContext {
  return {
    adults: 2,
    children: 0,
    timeBudgetMin: 60,
    mustUseIngredients: [],
    ...partial,
  };
}

function makeInput(partial?: Partial<DayPlanInput>): DayPlanInput {
  return {
    rules: STD_RULES,
    exclusions: [],
    context: makeContext(),
    dishes: STD_DISHES,
    history: [],
    ...partial,
  };
}

function makeDishEvent(
  id: string,
  dishId: string,
  dishRole: DishView['mealRole'],
  daysAgo: number,
  type: EventView['type'] = 'COOKED',
): EventView {
  // 参考锚点 2026-01-31，daysAgo 天前
  return {
    id,
    type,
    dishId,
    dishRole,
    createdAt: new Date(2026, 0, 31 - daysAgo),
    cookedResult: 'success',
  };
}

function mealOf(result: DayPlanResult, slot: MealSlot) {
  return result.meals.find((m) => m.slot === slot);
}

function mealDishIds(result: DayPlanResult): Set<string> {
  return new Set(result.meals.flatMap((m) => m.dishes.map((d) => d.id)));
}

function proteinIdsOf(dishes: DishView[]): Set<string> {
  const out = new Set<string>();
  for (const d of dishes) {
    for (const ing of d.ingredients) {
      if (ing.category === '肉类') out.add(ing.ingredientId);
    }
  }
  return out;
}

// ───── ① 餐型维度：早餐轻食池 ─────

describe('餐型维度：早餐轻食池', () => {
  it('早餐只从轻食池出菜，正餐菜不进早餐', () => {
    const result = planDay(makeInput());
    const breakfast = mealOf(result, 'breakfast');
    expect(breakfast).toBeDefined();
    expect(breakfast!.dishes.length).toBeGreaterThan(0);
    for (const dish of breakfast!.dishes) {
      expect(isBreakfastDish(dish)).toBe(true);
    }
    const breakfastIds = new Set(breakfast!.dishes.map((d) => d.id));
    expect(breakfastIds.has('d-braised-beef')).toBe(false);
    expect(breakfastIds.has('d-kungpao')).toBe(false);
  });

  it('午/晚餐走 MealRole 槽位组合（主菜+配菜+汤结构）', () => {
    const result = planDay(makeInput());
    for (const slot of ['lunch', 'dinner'] as const) {
      const meal = mealOf(result, slot);
      expect(meal).toBeDefined();
      const roles = new Set(meal!.dishes.map((d) => d.mealRole));
      expect(roles.has('MAIN')).toBe(true);
    }
  });
});

// ───── ② 必消跨餐分配与全部用上 ─────

describe('必消跨餐分配（PD-001 硬要求）', () => {
  it('必消跨餐分配：小米分早餐、牛肉分正餐，全天全部用上', () => {
    const result = planDay(
      makeInput({ context: makeContext({ mustUseIngredients: ['ing-millet', 'ing-beef'] }) }),
    );
    expect(result.failures).toHaveLength(0);
    expect(result.mustUseAllocation).toHaveLength(2);
    const millet = result.mustUseAllocation.find((a) => a.ingredientId === 'ing-millet')!;
    expect(millet.slot).toBe('breakfast');
    expect(millet.dishId).toBe('d-congee');
    const beef = result.mustUseAllocation.find((a) => a.ingredientId === 'ing-beef')!;
    expect(['lunch', 'dinner']).toContain(beef.slot);
    // 全天菜品真实覆盖两样必消
    const allIngIds = new Set(
      result.meals.flatMap((m) => m.dishes.flatMap((d) => d.ingredients.map((i) => i.ingredientId))),
    );
    expect(allIngIds.has('ing-millet')).toBe(true);
    expect(allIngIds.has('ing-beef')).toBe(true);
    // 落位说明进 crossMealNotes
    expect(result.crossMealNotes.some((n) => n.includes('早餐') && n.includes('ing-millet'))).toBe(true);
  });

  it('一道菜用掉多样必消：番茄炒蛋同落番茄+鸡蛋', () => {
    const dishes = [D_TOMATO_EGG, D_CUKE, D_WAX_SOUP];
    const result = planDay(
      makeInput({
        dishes,
        context: makeContext({
          meals: ['lunch'],
          mustUseIngredients: ['ing-tomato', 'ing-egg'],
        }),
      }),
    );
    expect(result.failures).toHaveLength(0);
    expect(result.mustUseAllocation).toHaveLength(2);
    const [a, b] = result.mustUseAllocation;
    expect(a.dishId).toBe('d-tomato-egg');
    expect(b.dishId).toBe('d-tomato-egg');
    expect(result.crossMealNotes.some((n) => n.includes('一道菜用掉2样必消'))).toBe(true);
  });
});

// ───── ③ 跨餐约束：主蛋白不重复 ─────

describe('跨餐约束（PD-020 营养与多样性）', () => {
  it('一天内主蛋白不重复（有不撞组合时必选不撞）', () => {
    const beefA = makeDish({ id: 'd-beef-a', name: '红烧牛肉', mealRole: 'MAIN', ings: [ING.beef], minutes: 20 });
    const beefB = makeDish({ id: 'd-beef-b', name: '土豆炖牛肉', mealRole: 'MAIN', ings: [ING.beef, ING.potato], minutes: 25, equipment: ['pot'] });
    const chickenA = makeDish({ id: 'd-chicken-a', name: '宫保鸡丁', mealRole: 'MAIN', ings: [ING.chicken], minutes: 15, cuisine: '川菜' });
    const dishes = [beefA, beefB, chickenA, D_CUKE, D_WAX_SOUP];
    const result = planDay(
      makeInput({ dishes, context: makeContext({ meals: ['lunch', 'dinner'] }) }),
    );
    expect(result.failures).toHaveLength(0);
    const lunch = mealOf(result, 'lunch')!;
    const dinner = mealOf(result, 'dinner')!;
    const lunchProteins = proteinIdsOf(lunch.dishes);
    const dinnerProteins = proteinIdsOf(dinner.dishes);
    for (const p of lunchProteins) {
      expect(dinnerProteins.has(p)).toBe(false);
    }
    expect(result.crossMealNotes.some((n) => n.includes('主蛋白互不重复'))).toBe(true);
  });

  it('主蛋白不重复不可满足时如实标注（不伪造）', () => {
    // 两份主菜都是牛肉：两餐主蛋白必然重复
    const beefA = makeDish({ id: 'd-beef-a', name: '红烧牛肉', mealRole: 'MAIN', ings: [ING.beef], minutes: 20 });
    const beefB = makeDish({ id: 'd-beef-b', name: '土豆炖牛肉', mealRole: 'MAIN', ings: [ING.beef, ING.potato], minutes: 25, equipment: ['pot'] });
    const dishes = [beefA, beefB, D_CUKE, D_WAX_SOUP];
    const result = planDay(
      makeInput({ dishes, context: makeContext({ meals: ['lunch', 'dinner'] }) }),
    );
    expect(result.crossMealNotes.some((n) => n.includes('主蛋白跨餐重复') && n.includes('ing-beef'))).toBe(true);
  });
});

// ───── ④ 儿童 >0 约束生效 ─────

describe('儿童餐约束（儿童>0 避辣/避刺多/避过硬）', () => {
  it('儿童>0：辣菜/刺多/过硬菜全天不出现，过滤轨迹含儿童餐原因', () => {
    const result = planDay(makeInput({ context: makeContext({ children: 1 }) }));
    const ids = mealDishIds(result);
    expect(ids.has('d-mapo')).toBe(false); // 辣度 3
    expect(ids.has('d-bony-fish')).toBe(false); // 刺多
    expect(ids.has('d-tough-beef')).toBe(false); // 过硬
    for (const m of result.meals) {
      for (const d of m.dishes) {
        expect(d.spicyLevel).toBeLessThanOrEqual(1);
      }
    }
    const rules = result.filtered.map((f) => f.rule);
    expect(rules.some((r) => r.includes('儿童餐避辣'))).toBe(true);
    expect(rules.some((r) => r.includes('避刺多/避过硬'))).toBe(true);
  });

  it('对照：儿童=0 时辣菜可正常排入（必消豆腐由麻婆豆腐消耗）', () => {
    const result = planDay(
      makeInput({ context: makeContext({ mustUseIngredients: ['ing-tofu'] }) }),
    );
    expect(result.failures).toHaveLength(0);
    expect(mealDishIds(result).has('d-mapo')).toBe(true);
    expect(result.mustUseAllocation[0].dishId).toBe('d-mapo');
  });

  it('儿童>0 + 必消只有辣菜能消耗：全天组合冲突如实空手', () => {
    const result = planDay(
      makeInput({
        context: makeContext({ children: 1, mustUseIngredients: ['ing-tofu'] }),
      }),
    );
    expect(result.meals).toHaveLength(0);
    expect(result.failures.length).toBeGreaterThan(0);
    expect(result.failures.every((f) => f.kind === 'COMBINATION')).toBe(true);
    expect(result.failures[0].detail).toContain('ing-tofu');
  });
});

// ───── ⑤ 临时忌口当日生效 ─────

describe('临时忌口（当日生效，与长期 HARD 同效但独立标注）', () => {
  it('临时忌口牛肉：全天无牛肉菜，轨迹独立标注「临时忌口」', () => {
    const result = planDay(
      makeInput({
        context: makeContext({
          tempAvoidances: [{ ingredientId: 'ing-beef', ingredientName: '牛肉' }],
        }),
      }),
    );
    const allIngIds = new Set(
      result.meals.flatMap((m) => m.dishes.flatMap((d) => d.ingredients.map((i) => i.ingredientId))),
    );
    expect(allIngIds.has('ing-beef')).toBe(false);
    const rules = result.filtered.map((f) => f.rule);
    expect(rules.some((r) => r.includes('临时忌口「牛肉」（当日生效）'))).toBe(true);
    // 与长期硬禁忌分层：不写成「HARD 食材禁忌#temp-avoid-」
    expect(rules.every((r) => !r.includes('#temp-avoid-'))).toBe(true);
  });

  it('无临时忌口时必消牛肉正常排入（对照）', () => {
    const result = planDay(
      makeInput({ context: makeContext({ mustUseIngredients: ['ing-beef'] }) }),
    );
    expect(result.failures).toHaveLength(0);
    const allIngIds = new Set(
      result.meals.flatMap((m) => m.dishes.flatMap((d) => d.ingredients.map((i) => i.ingredientId))),
    );
    expect(allIngIds.has('ing-beef')).toBe(true);
  });
});

// ───── ⑥ 想吃的菜（选填，冲突如实标注不硬凑） ─────

describe('想吃的菜（选填）', () => {
  it('想吃的菜与临时忌口冲突：如实标注未排入', () => {
    const result = planDay(
      makeInput({
        context: makeContext({
          tempAvoidances: [{ ingredientId: 'ing-beef', ingredientName: '牛肉' }],
          desiredDishIds: ['d-braised-beef'],
        }),
      }),
    );
    expect(mealDishIds(result).has('d-braised-beef')).toBe(false);
    const note = result.desiredNotes.find((n) => n.dishId === 'd-braised-beef')!;
    expect(note.included).toBe(false);
    expect(note.reason).toContain('与临时忌口冲突');
    expect(note.reason).toContain('未排入');
  });

  it('想吃的安全菜：排入并标注所在餐次', () => {
    const result = planDay(
      makeInput({
        rules: { ...STD_RULES, cuisines: ['川菜'] },
        context: makeContext({ meals: ['dinner'], desiredDishIds: ['d-kungpao'] }),
      }),
    );
    expect(mealDishIds(result).has('d-kungpao')).toBe(true);
    const note = result.desiredNotes.find((n) => n.dishId === 'd-kungpao')!;
    expect(note.included).toBe(true);
    expect(note.slot).toBe('dinner');
  });

  it('想吃的菜不在菜库：如实说明', () => {
    const result = planDay(
      makeInput({ context: makeContext({ desiredDishIds: ['d-ghost'] }) }),
    );
    const note = result.desiredNotes.find((n) => n.dishId === 'd-ghost')!;
    expect(note.included).toBe(false);
    expect(note.reason).toContain('不在菜库');
  });

  it('想吃的菜餐型不在所选餐次内：如实说明', () => {
    const yogurt = makeDish({
      id: 'd-yogurt',
      name: '酸奶杯',
      mealRole: 'STAPLE',
      ings: [ING.soy],
      minutes: 3,
      mealTypes: ['breakfast'],
    });
    const result = planDay(
      makeInput({
        dishes: [...STD_DISHES, yogurt],
        context: makeContext({ meals: ['dinner'], desiredDishIds: ['d-yogurt'] }),
      }),
    );
    const note = result.desiredNotes.find((n) => n.dishId === 'd-yogurt')!;
    expect(note.included).toBe(false);
    expect(note.reason).toContain('餐型不在所选餐次内');
  });
});

// ───── ⑦ 调整语义：换一餐 / 换一批 / 换一道 ─────

describe('调整语义（确认书 C-3a）', () => {
  // 换一餐专用库：午餐唯一套（牛肉），晚餐三套（川味鸡丁/家常肉片/白灼虾）
  const L_MAIN = makeDish({ id: 'd-l-main', name: '午餐牛肉', mealRole: 'MAIN', ings: [ING.beef], minutes: 20, mealTypes: ['lunch'] });
  const L_SIDE = makeDish({ id: 'd-l-side', name: '午餐黄瓜', mealRole: 'SIDE', ings: [ING.cuke], minutes: 5, mealTypes: ['lunch'] });
  const L_SOUP = makeDish({ id: 'd-l-soup', name: '午餐冬瓜汤', mealRole: 'SOUP', ings: [ING.wax], minutes: 10, equipment: ['pot'], mealTypes: ['lunch'] });
  const D1_MAIN = makeDish({ id: 'd-d1-main', name: '川味鸡丁', mealRole: 'MAIN', ings: [ING.chicken], minutes: 15, cuisine: '川菜', mealTypes: ['dinner'] });
  const D2_MAIN = makeDish({ id: 'd-d2-main', name: '家常肉片', mealRole: 'MAIN', ings: [ING.pork], minutes: 20, mealTypes: ['dinner'] });
  const D3_MAIN = makeDish({ id: 'd-d3-main', name: '白灼虾', mealRole: 'MAIN', ings: [ING.shrimp], minutes: 12, cuisine: '粤菜', equipment: ['pot'], mealTypes: ['dinner'] });
  const D_SIDE = makeDish({ id: 'd-d-side', name: '晚餐青菜', mealRole: 'SIDE', ings: [ING.green], minutes: 8, cuisine: '粤菜', mealTypes: ['dinner'] });
  const D_SOUP = makeDish({ id: 'd-d-soup', name: '晚餐紫菜汤', mealRole: 'SOUP', ings: [ING.seaweed], minutes: 10, cuisine: '粤菜', equipment: ['pot'], mealTypes: ['dinner'] });
  const REPLAN_DISHES = [L_MAIN, L_SIDE, L_SOUP, D1_MAIN, D2_MAIN, D3_MAIN, D_SIDE, D_SOUP];

  it('换一餐：该餐真的换了，其他餐不变，跨餐约束仍成立', () => {
    const input = makeInput({
      dishes: REPLAN_DISHES,
      context: makeContext({ meals: ['lunch', 'dinner'] }),
    });
    const plan = planDay(input);
    const oldLunch = mealOf(plan, 'lunch')!;
    const oldDinner = mealOf(plan, 'dinner')!;

    const { plan: next, replaced } = replanMeal(input, plan, 'dinner');
    expect(replaced).toBe(true);
    const newLunch = mealOf(next, 'lunch')!;
    const newDinner = mealOf(next, 'dinner')!;
    // 其他餐不变
    expect(newLunch.menuId).toBe(oldLunch.menuId);
    // 该餐真的换了（当前菜不回池）
    expect(newDinner.menuId).not.toBe(oldDinner.menuId);
    const oldDinnerDishIds = new Set(oldDinner.dishes.map((d) => d.id));
    for (const d of newDinner.dishes) {
      expect(oldDinnerDishIds.has(d.id)).toBe(false);
    }
    // 跨餐约束仍成立：主蛋白不重复
    const lunchProteins = proteinIdsOf(newLunch.dishes);
    for (const p of proteinIdsOf(newDinner.dishes)) {
      expect(lunchProteins.has(p)).toBe(false);
    }
  });

  it('换一餐失败（无新组合）：保持原餐并给原因', () => {
    const only = [
      makeDish({ id: 'd-o-main', name: '独菜主', mealRole: 'MAIN', ings: [ING.beef], minutes: 20, mealTypes: ['dinner'] }),
      makeDish({ id: 'd-o-side', name: '独菜配', mealRole: 'SIDE', ings: [ING.cuke], minutes: 5, mealTypes: ['dinner'] }),
      makeDish({ id: 'd-o-soup', name: '独菜汤', mealRole: 'SOUP', ings: [ING.wax], minutes: 10, equipment: ['pot'], mealTypes: ['dinner'] }),
    ];
    const input = makeInput({ dishes: only, context: makeContext({ meals: ['dinner'] }) });
    const plan = planDay(input);
    const { plan: next, replaced, reason } = replanMeal(input, plan, 'dinner');
    expect(replaced).toBe(false);
    expect(reason).toContain('重推失败');
    expect(JSON.stringify(next)).toBe(JSON.stringify(plan));
  });

  it('换一餐失败（必消接不住）：保持原餐并给原因', () => {
    // 必消虾只有晚餐 D3 能用；换掉晚餐则全天必消失守 -> 不允许
    const input = makeInput({
      dishes: REPLAN_DISHES,
      context: makeContext({ meals: ['lunch', 'dinner'], mustUseIngredients: ['ing-shrimp'] }),
    });
    const plan = planDay(input);
    expect(mealOf(plan, 'dinner')!.dishes.some((d) => d.id === 'd-d3-main')).toBe(true);
    const { plan: next, replaced, reason } = replanMeal(input, plan, 'dinner');
    expect(replaced).toBe(false);
    expect(reason).toContain('必消');
    expect(mealOf(next, 'dinner')!.menuId).toBe(mealOf(plan, 'dinner')!.menuId);
  });

  it('换一批：全天重推，新旧全天菜品零交集', () => {
    const input = makeInput();
    const plan = planDay(input);
    const next = replanAllMeals(input, plan);
    expect(next.meals.length).toBe(plan.meals.length);
    const oldIds = mealDishIds(plan);
    const newIds = mealDishIds(next);
    for (const id of newIds) {
      expect(oldIds.has(id)).toBe(false);
    }
  });

  it('换一道：候选只来自同餐型池；儿童>0 时辣候选移入 filtered 并给原因', () => {
    // 早餐候选：正餐菜（红烧牛肉）不进早餐池
    const breakfastSwap = swapCandidatesForSlot('breakfast', {
      outgoingDish: D_BOILED_EGG,
      remainingDishes: [],
      candidates: [D_CONGEE, D_BRAISED_BEEF, D_SOY_MILK],
      mustUseIngredientIds: [],
      timeBudgetMin: 30,
      availableEquipment: ['wok', 'pot', 'pan'],
      exclusions: [],
    });
    const passedIds = breakfastSwap.passed.map((d) => d.id);
    expect(passedIds).toContain('d-congee');
    expect(passedIds).toContain('d-soy-milk');
    expect(passedIds).not.toContain('d-braised-beef');

    // 午餐 + 儿童：麻婆豆腐（辣）被移入 filtered 并带儿童餐原因
    const lunchSwap = swapCandidatesForSlot(
      'lunch',
      {
        outgoingDish: D_TOMATO_EGG,
        remainingDishes: [],
        candidates: [D_KUNGPAAO, D_MAPO],
        mustUseIngredientIds: [],
        timeBudgetMin: 60,
        availableEquipment: ['wok', 'pot', 'pan'],
        exclusions: [],
      },
      1,
    );
    expect(lunchSwap.passed.map((d) => d.id)).toEqual(['d-kungpao']);
    const mapoTrace = lunchSwap.filtered.find((f) => f.menuId === 'd-mapo');
    expect(mapoTrace).toBeDefined();
    expect(mapoTrace!.rule).toContain('儿童餐避辣');
  });
});

// ───── ⑧ 确定性（同入同出） ─────

describe('确定性（同一输入同一输出）', () => {
  it('planDay 两次调用输出逐字节一致', () => {
    const input = makeInput({
      context: makeContext({
        mustUseIngredients: ['ing-millet', 'ing-beef'],
        tempAvoidances: [{ ingredientId: 'ing-shrimp', ingredientName: '虾' }],
        desiredDishIds: ['d-kungpao'],
      }),
      history: [makeDishEvent('e-1', 'd-congee', 'STAPLE', 2), makeDishEvent('e-2', 'd-cuke', 'SIDE', 0)],
    });
    const a = planDay(input);
    const b = planDay(input);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

// ───── ⑨ 空手按餐归因（无菜型/时间型/组合冲突 + 出路） ─────

describe('空手按餐归因（PD-017 两型 + PD-014 组合口径）', () => {
  it('无菜型：早餐池被临时忌口清空，早餐如实归因，午/晚照常出餐', () => {
    const result = planDay(
      makeInput({
        context: makeContext({
          tempAvoidances: [
            { ingredientId: 'ing-millet', ingredientName: '小米' },
            { ingredientId: 'ing-egg', ingredientName: '鸡蛋' },
            { ingredientId: 'ing-soy', ingredientName: '黄豆' },
            { ingredientId: 'ing-flour', ingredientName: '面粉' },
            { ingredientId: 'ing-tomato', ingredientName: '番茄' },
          ],
        }),
      }),
    );
    expect(mealOf(result, 'breakfast')).toBeUndefined();
    const failure = result.failures.find((f) => f.slot === 'breakfast')!;
    expect(failure.kind).toBe('NO_DISH');
    expect(failure.detail).toContain('早餐');
    expect(failure.suggestions).toContain('放宽临时忌口');
    // 午/晚不受早餐空手影响
    expect(mealOf(result, 'lunch')).toBeDefined();
    expect(mealOf(result, 'dinner')).toBeDefined();
  });

  it('时间型：有菜但时长档排不下，出路含换更长时长档', () => {
    const mains = [
      makeDish({ id: 'd-slow-a', name: '慢炖牛肉', mealRole: 'MAIN', ings: [ING.beef], minutes: 20 }),
      makeDish({ id: 'd-slow-b', name: '慢烧鸡', mealRole: 'MAIN', ings: [ING.chicken], minutes: 20 }),
    ];
    const side = makeDish({ id: 'd-slow-side', name: '时蔬', mealRole: 'SIDE', ings: [ING.green], minutes: 10 });
    const soup = makeDish({ id: 'd-slow-soup', name: '例汤', mealRole: 'SOUP', ings: [ING.wax], minutes: 10, equipment: ['pot'] });
    const result = planDay(
      makeInput({
        dishes: [...mains, side, soup],
        context: makeContext({ meals: ['lunch'], timeBudgetMin: 15 }),
      }),
    );
    expect(result.meals).toHaveLength(0);
    const failure = result.failures.find((f) => f.slot === 'lunch')!;
    expect(failure.kind).toBe('TIME_BUDGET');
    expect(failure.detail).toContain('15分钟');
    expect(failure.suggestions[0]).toBe('换更长的时长档再试');
  });

  it('组合冲突：必消没有任何一餐能用上，全天空手并给出路', () => {
    const result = planDay(
      makeInput({
        context: makeContext({
          meals: ['lunch', 'dinner'],
          mustUseIngredients: ['ing-shark-fin'],
        }),
      }),
    );
    expect(result.meals).toHaveLength(0);
    expect(result.failures).toHaveLength(2);
    for (const f of result.failures) {
      expect(f.kind).toBe('COMBINATION');
      expect(f.detail).toContain('ing-shark-fin');
      expect(f.suggestions).toContain('删减必消食材');
    }
  });
});

// ───── ⑩ 餐次勾选（只出所选餐次） ─────

describe('餐次勾选（早/中/晚任选）', () => {
  it('只勾晚餐：只出晚餐一套', () => {
    const result = planDay(makeInput({ context: makeContext({ meals: ['dinner'] }) }));
    expect(result.meals.map((m) => m.slot)).toEqual(['dinner']);
  });

  it('勾早+晚：只出两套，按规范序排列', () => {
    const result = planDay(
      makeInput({ context: makeContext({ meals: ['dinner', 'breakfast'] }) }),
    );
    expect(result.meals.map((m) => m.slot)).toEqual(['breakfast', 'dinner']);
  });
});

// ───── 已吃菜避开窗口（默认 7 天可调，A3 菜品级聚合沿用） ─────

describe('已吃菜避开窗口（PD-020，可调默认 7 天）', () => {
  it('score：recentWindowDays 参数化——5 天前的菜 7 天窗口内降权、3 天窗口不降权', () => {
    const menu: MenuView = {
      id: 'm-1',
      name: '测试套',
      scene: 'WEEKDAY_FAST',
      serves: 2,
      totalActiveMinutes: 15,
      prepSequence: [],
      status: 'PUBLISHED',
      dishes: [D_KUNGPAAO],
    };
    const history = [
      makeDishEvent('e-old', 'd-kungpao', 'MAIN', 5),
      makeDishEvent('e-anchor', 'd-cuke', 'SIDE', 0),
    ];
    const base = {
      rules: STD_RULES,
      exclusions: [],
      context: { people: 2, timeBudgetMin: 60 as const, mustUseIngredients: [] },
      library: [],
      history,
    };
    const inWindow = score(menu, { ...base, recentWindowDays: 7 });
    expect(inWindow.breakdown.recentDiversity).toBe(0.2);
    const outWindow = score(menu, { ...base, recentWindowDays: 3 });
    expect(outWindow.breakdown.recentDiversity).toBe(0.8);
    const legacy = score(menu, base);
    expect(legacy.breakdown.recentDiversity).toBe(0.2); // 缺省 = 7 天
  });

  it('planDay：窗口内已安排菜被避开，调窄窗口后恢复入选', () => {
    // 早餐池三道：小米粥（偏好菜系占优）/白煮蛋/豆浆；2 天前锁定安排过小米粥（LOCK
    // 只进近期多样性降权、不进历史接受度——A3 口径，隔离窗口机制单变量验证）
    const dishes = [D_CONGEE, D_BOILED_EGG, D_SOY_MILK];
    const history = [
      makeDishEvent('e-congee', 'd-congee', 'STAPLE', 2, 'LOCK'),
      makeDishEvent('e-anchor', 'd-cuke', 'SIDE', 0, 'LOCK'),
    ];
    const rules: FamilyRuleView = { ...STD_RULES, cuisines: ['家常'] };
    const recent = planDay(
      makeInput({ dishes, rules, history, context: makeContext({ meals: ['breakfast'] }) }),
    );
    expect(mealOf(recent, 'breakfast')!.dishes.some((d) => d.id === 'd-congee')).toBe(false);
    const relaxed = planDay(
      makeInput({
        dishes,
        rules,
        history,
        context: makeContext({ meals: ['breakfast'], avoidRecentDays: 1 }),
      }),
    );
    expect(mealOf(relaxed, 'breakfast')!.dishes.some((d) => d.id === 'd-congee')).toBe(true);
  });
});
