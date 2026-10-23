// apps/api/test/mealtype-pool.spec.ts
// T-Q10 回归：早餐专属菜（mealTypes=['breakfast']）不得进入旧单餐（晚餐）推荐池。
// 缺陷实证：种子补 6 道早餐菜后，loadDishViews 仅按 mealRole 过滤未按餐型排除，
// 葱花鸡蛋饼（SIDE/breakfast）进了晚餐候选组合 candidates[0]（a3-reputation B2 被污染）。
// 真实 PG 集成：PG 不可达时显式 skip（不假绿）。
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../src/db.js';
import { planService } from '../src/services/planService.js';

const canConnect = await prisma
  .$queryRaw`SELECT 1`
  .then(() => true)
  .catch(() => false);

const PREFIX = 'bf-test-';
const DISH_ID = `${PREFIX}dish-side-breakfast`;
const CTX = { people: 2, timeBudgetMin: 60, mustUse: [] as string[] };

const dynamicPlanIds: string[] = [];

async function cleanup(): Promise<void> {
  // FK 顺序：Event(planId) -> Plan -> DishIngredient -> Dish -> Ingredient
  await prisma.event.deleteMany({ where: { planId: { in: [...dynamicPlanIds, DISH_ID] } } });
  await prisma.plan.deleteMany({ where: { id: { in: dynamicPlanIds } } });
  await prisma.dishIngredient.deleteMany({ where: { dishId: DISH_ID } });
  await prisma.dish.deleteMany({ where: { id: DISH_ID } });
  await prisma.ingredient.deleteMany({ where: { id: { startsWith: PREFIX } } });
}

describe.skipIf(!canConnect)('T-Q10 早餐菜不进单餐（晚餐）推荐池', () => {
  beforeAll(async () => {
    await cleanup(); // 清失败重跑残留（幂等）
    await prisma.ingredient.create({
      data: {
        id: `${PREFIX}ing-1`,
        name: 'BF测试菜',
        aliases: [],
        category: '蔬菜',
        defaultUnit: 'g',
      },
    });
    await prisma.dish.create({
      data: {
        id: DISH_ID,
        name: 'BF早餐专属配菜',
        mealRole: 'SIDE',
        cuisine: '家常',
        flavorTags: [],
        spicyLevel: 0,
        splitFlavor: false,
        activeMinutes: 5,
        totalMinutes: 5,
        equipment: ['wok'],
        steps: [{ order: 1, text: '做BF早餐专属配菜' }],
        status: 'PUBLISHED',
        origin: 'MANUAL',
        mealTypes: ['breakfast'],
      },
    });
    await prisma.dishIngredient.create({
      data: { dishId: DISH_ID, ingredientId: `${PREFIX}ing-1`, qty: 100, unit: 'g', optional: false },
    });
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it('breakfast 专属菜不出现在任何晚餐候选组合（id 前缀排池首，必经组合切分窗口）', async () => {
    const gen = await planService.generateRecommendation(CTX);
    if (gen.planId) dynamicPlanIds.push(gen.planId);
    expect(gen.candidates.length).toBeGreaterThan(0);
    const dishIds = gen.candidates.flatMap((c) =>
      (c.menu as { dishes: Array<{ id: string }> }).dishes.map((d) => d.id),
    );
    expect(dishIds).not.toContain(DISH_ID);
  });

  it('换菜候选池同样不含 breakfast 专属菜（同一池函数，换菜不能绕过餐型约束）', async () => {
    const gen = await planService.generateRecommendation(CTX);
    if (gen.planId) dynamicPlanIds.push(gen.planId);
    expect(gen.planId).toBeTruthy();
    if (!gen.planId) throw new Error('推荐未返回 planId');
    const first = gen.candidates[0];
    expect(first).toBeDefined();
    if (!first) throw new Error('推荐未返回候选组合');
    const sideDish = (first.menu as { dishes: Array<{ id: string; mealRole: string }> }).dishes.find(
      (d) => d.mealRole === 'SIDE',
    );
    expect(sideDish).toBeDefined();
    if (!sideDish) throw new Error('候选组合缺少 SIDE 菜');

    // 旧单餐 swap-options 只接受已锁定计划：先锁首候选，再对锁定组合中的 SIDE 取候选
    await planService.lockPlan(gen.planId, first.menuId);
    const options = await planService.getSwapOptions(gen.planId, sideDish.id);
    expect(options.candidates.map((c) => c.dishId)).not.toContain(DISH_ID);
  });
});
