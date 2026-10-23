// apps/api/test/dayplan-integration.spec.ts
// T-Q10 三餐计划集成测试（真实 PG，service 层全链路：引擎 + 持久化 + 读回）：
//   三餐生成 / 清单合并（跨餐去重+常备剔除+备菜建议）/ 换一餐（slot 隔离）/
//   按餐反馈覆盖（同日同餐重提取最新，C-5）。
// 数据安全：didCook=true 用例仅一个（lunch 餐），CookLog 只删本测试新写的
// breakfast/lunch 行（存量迁移回填恒 dinner，cookedAt>=startedAt 双条件精确圈定）；
// Plan/Event 按记录的 createdPlanIds 精确清理，不碰家人真实数据。
// 真实 PG 集成：PG 不可达时显式 skip（不假绿）。
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../src/db.js';
import { dayPlanService } from '../src/services/dayPlanService.js';
import { planService, FAMILY_ID } from '../src/services/planService.js';
import type { DayPlanResult } from '@family-menu/engine';
import type { MealSlot } from '@family-menu/shared';

const canConnect = await prisma
  .$queryRaw`SELECT 1`
  .then(() => true)
  .catch(() => false);

const CTX = { adults: 2, children: 1, timeBudgetMin: 30, mustUseIngredients: [] as string[] };

// 换一餐夹具（T-Q14）：干净种子库午/晚餐池不足以在「当前菜不回池」后再出一套组合。
// 4 MAIN + 2 SIDE + 2 SOUP 覆盖两套槽位（换餐至少排除 2 MAIN + 1 SIDE + 1 SOUP），
// 每道用唯一食材/用料，mealTypes 显式含 lunch/dinner；前缀精确清理，不碰真实数据。
const FIXTURE_PREFIX = 'q14-swap-';
interface SwapFixture {
  id: string;
  name: string;
  mealRole: 'MAIN' | 'SIDE' | 'SOUP';
  ingredientId: string;
  ingredientName: string;
  category: string;
}
const SWAP_FIXTURES: SwapFixture[] = [
  { id: `${FIXTURE_PREFIX}main-1`, name: 'Q14测试牛腩', mealRole: 'MAIN', ingredientId: `${FIXTURE_PREFIX}ing-main-1`, ingredientName: 'Q14测试牛腩肉', category: '肉类' },
  { id: `${FIXTURE_PREFIX}main-2`, name: 'Q14测试鸡腿', mealRole: 'MAIN', ingredientId: `${FIXTURE_PREFIX}ing-main-2`, ingredientName: 'Q14测试鸡腿肉', category: '肉类' },
  { id: `${FIXTURE_PREFIX}main-3`, name: 'Q14测试鳕鱼', mealRole: 'MAIN', ingredientId: `${FIXTURE_PREFIX}ing-main-3`, ingredientName: 'Q14测试鳕鱼柳', category: '水产' },
  { id: `${FIXTURE_PREFIX}main-4`, name: 'Q14测试肉丸', mealRole: 'MAIN', ingredientId: `${FIXTURE_PREFIX}ing-main-4`, ingredientName: 'Q14测试肉丸料', category: '肉类' },
  { id: `${FIXTURE_PREFIX}side-1`, name: 'Q14测试青菜', mealRole: 'SIDE', ingredientId: `${FIXTURE_PREFIX}ing-side-1`, ingredientName: 'Q14测试小青菜', category: '蔬菜' },
  { id: `${FIXTURE_PREFIX}side-2`, name: 'Q14测试菌菇', mealRole: 'SIDE', ingredientId: `${FIXTURE_PREFIX}ing-side-2`, ingredientName: 'Q14测试白玉菇', category: '蔬菜' },
  { id: `${FIXTURE_PREFIX}soup-1`, name: 'Q14测试番茄汤', mealRole: 'SOUP', ingredientId: `${FIXTURE_PREFIX}ing-soup-1`, ingredientName: 'Q14测试番茄料', category: '蔬菜' },
  { id: `${FIXTURE_PREFIX}soup-2`, name: 'Q14测试冬瓜汤', mealRole: 'SOUP', ingredientId: `${FIXTURE_PREFIX}ing-soup-2`, ingredientName: 'Q14测试冬瓜', category: '蔬菜' },
];

async function cleanupFixtures(): Promise<void> {
  // FK 顺序：Event(planId) -> Plan -> DishIngredient -> Dish -> Ingredient
  await prisma.event.deleteMany({ where: { planId: { startsWith: FIXTURE_PREFIX } } });
  await prisma.plan.deleteMany({ where: { id: { startsWith: FIXTURE_PREFIX } } });
  await prisma.dishIngredient.deleteMany({ where: { dishId: { startsWith: FIXTURE_PREFIX } } });
  await prisma.dish.deleteMany({ where: { id: { startsWith: FIXTURE_PREFIX } } });
  await prisma.ingredient.deleteMany({ where: { id: { startsWith: FIXTURE_PREFIX } } });
}

async function createFixtures(): Promise<void> {
  for (const f of SWAP_FIXTURES) {
    await prisma.ingredient.create({
      data: {
        id: f.ingredientId,
        name: f.ingredientName,
        aliases: [],
        category: f.category,
        defaultUnit: 'g',
      },
    });
    await prisma.dish.create({
      data: {
        id: f.id,
        name: f.name,
        mealRole: f.mealRole,
        mealTypes: ['lunch', 'dinner'],
        cuisine: '家常',
        flavorTags: ['清淡'],
        spicyLevel: 0,
        splitFlavor: false,
        activeMinutes: 5,
        totalMinutes: 5,
        equipment: ['wok'],
        steps: [{ order: 1, text: `做${f.name}` }],
        status: 'PUBLISHED',
        origin: 'MANUAL',
      },
    });
    await prisma.dishIngredient.create({
      data: {
        dishId: f.id,
        ingredientId: f.ingredientId,
        qty: 100,
        unit: 'g',
        optional: false,
      },
    });
  }
}

const createdPlanIds: string[] = [];
const startedAt = new Date();

describe.skipIf(!canConnect)('T-Q10 三餐计划 API 集成（真实 PG）', () => {
  let planId = '';
  let dayPlan: DayPlanResult;

  beforeAll(async () => {
    await cleanupFixtures(); // 清失败重跑残留（幂等）
    await createFixtures();
    const plan = await dayPlanService.generateDayPlan(CTX);
    planId = plan.id;
    createdPlanIds.push(planId);
    dayPlan = plan.dayPlan as DayPlanResult;
  });

  afterAll(async () => {
    // CookLog：只删本测试新写的非 dinner 餐行（迁移回填存量恒 dinner，双条件精确圈定）
    await prisma.cookLog.deleteMany({
      where: {
        mealSlot: { in: ['breakfast', 'lunch'] as MealSlot[] },
        cookedAt: { gte: startedAt },
      },
    });
    await prisma.event.deleteMany({ where: { planId: { in: createdPlanIds } } });
    await prisma.plan.deleteMany({ where: { id: { in: createdPlanIds } } });
    await cleanupFixtures();
    await prisma.$disconnect();
  });

  it('三餐生成：dayPlan 三餐齐 + dayContext 落库 + 生成即 LOCKED（无三选一）', async () => {
    const slots = dayPlan.meals.map((m) => m.slot);
    expect(new Set(slots)).toEqual(new Set(['breakfast', 'lunch', 'dinner'] as MealSlot[]));
    // 菜池充足（早餐 6 道 + 午晚餐 22 道）非空手：每餐至少一道菜
    for (const meal of dayPlan.meals) {
      expect(meal.dishes.length).toBeGreaterThan(0);
    }

    const row = await prisma.plan.findUnique({ where: { id: planId } });
    expect(row).not.toBeNull();
    expect(row!.status).toBe('LOCKED');
    expect(row!.dayContext).toMatchObject({ adults: 2, children: 1, timeBudgetMin: 30 });
    expect(row!.candidates).toEqual([]); // 三餐无三选一
    expect(row!.context).toEqual({}); // 旧单餐上下文列存空对象
  });

  it('清单合并：跨餐同食材去重一行 + 常备调料不出现 + prepAdvice 两组备菜建议', async () => {
    const list = await dayPlanService.getDayShoppingList(planId);
    expect(list.groups.length).toBeGreaterThan(0);

    // 跨餐去重：同一 ingredientId 全清单只出现一次
    const items = list.groups.flatMap((g) => g.items);
    expect(items.length).toBeGreaterThan(0);
    const ids = items.map((i) => i.ingredientId);
    expect(new Set(ids).size).toBe(ids.length);

    // 常备调料不出现（C-4：非必消的常备调料直接剔除，mustUse 为空必非必消）
    const pantryNames = ['盐', '食用油', '酱油', '生抽', '老抽', '醋', '糖', '料酒', '蚝油'];
    expect(items.filter((i) => pantryNames.includes(i.name))).toEqual([]);

    // 备菜建议分「今晚预处理 / 明早先做」（C-4）
    expect(list.prepAdvice).toBeTruthy();
    expect(Array.isArray(list.prepAdvice?.tonight)).toBe(true);
    expect(Array.isArray(list.prepAdvice?.tomorrowMorning)).toBe(true);
  });

  it('换一餐：指定 slot 重推该餐，其他两餐逐字不动；缺 slot 拒绝', async () => {
    // 缺 slot -> SwapRecheckError（路由层 400）
    await expect(
      dayPlanService.swapDayPlan(planId, '换一餐'),
    ).rejects.toThrow('换一餐必须携带');

    const beforeLunch = dayPlan.meals.find((m) => m.slot === 'lunch')!;
    const beforeBreakfast = dayPlan.meals.find((m) => m.slot === 'breakfast')!;
    const beforeDinner = dayPlan.meals.find((m) => m.slot === 'dinner')!;

    const swapped = await dayPlanService.swapDayPlan(
      planId,
      '换一餐',
      undefined,
      undefined,
      'lunch',
    );
    const next = swapped.dayPlan as DayPlanResult;
    const afterLunch = next.meals.find((m) => m.slot === 'lunch')!;
    const afterBreakfast = next.meals.find((m) => m.slot === 'breakfast')!;
    const afterDinner = next.meals.find((m) => m.slot === 'dinner')!;

    // lunch 重推：换出组合内容哈希变化（引擎组合生成确定性，非同组合）
    expect(afterLunch.menuId).not.toBe(beforeLunch.menuId);
    // 当前菜不回池：换后该餐不得再出现换前任何一道菜
    const beforeLunchIds = new Set(beforeLunch.dishes.map((d) => d.id));
    expect(afterLunch.dishes.some((d) => beforeLunchIds.has(d.id))).toBe(false);
    // 其他两餐逐字不动（换一餐隔离语义，C-3a）
    expect(afterBreakfast).toEqual(beforeBreakfast);
    expect(afterDinner).toEqual(beforeDinner);

    dayPlan = next; // 后续反馈用例针对换一餐后的最新计划
  });

  it('按餐反馈：同餐重提覆盖（取最新），其他餐不受影响；didCook 写该餐 CookLog', async () => {
    const lunchDishIds = (dayPlan.meals.find((m) => m.slot === 'lunch')?.dishes ?? []).map(
      (d) => d.id,
    );
    expect(lunchDishIds.length).toBeGreaterThan(0);

    // 第一次反馈 lunch：没做（不写 CookLog）
    await dayPlanService.addDayFeedback(planId, {
      didCook: false,
      willRepeat: false,
      mealSlot: 'lunch',
    });
    let fb = await planService.getFeedback(planId, 'lunch');
    expect(fb?.didCook).toBe(false);
    expect(fb?.willRepeat).toBe(false);

    // 同餐重提：做了 + 好吃 + 还做（等效覆盖，C-5 同日同餐重提覆盖）
    await dayPlanService.addDayFeedback(planId, {
      didCook: true,
      taste: 'good',
      willRepeat: true,
      mealSlot: 'lunch',
    });
    fb = await planService.getFeedback(planId, 'lunch');
    expect(fb?.didCook).toBe(true);
    expect(fb?.willRepeat).toBe(true);

    // 其他餐不受影响：dinner 无反馈 = null（C-5 各餐独立）
    const dinnerFb = await planService.getFeedback(planId, 'dinner');
    expect(dinnerFb).toBeNull();

    // didCook=true：该餐每道菜一行 CookLog（dishId+mealSlot 按餐关联，C-5）
    const cookLogs = await prisma.cookLog.findMany({
      where: { dishId: { in: lunchDishIds }, mealSlot: 'lunch', cookedAt: { gte: startedAt } },
    });
    expect(cookLogs.length).toBe(lunchDishIds.length);
    expect(cookLogs.every((c) => c.result === 'success')).toBe(true);
    expect(cookLogs.every((c) => c.willRepeat === true)).toBe(true);
  });

  it('全换空手：当前菜不回池后无可用三餐 -> 拒绝且原计划/事件不变', async () => {
    // 用已生成计划的早餐菜快照作模板；把所有 PUBLISHED 菜都塞进这一天，
    // 全换时引擎把这些 id 全部排除，必然出不了任何一餐。
    const template = dayPlan.meals.find((m) => m.slot === 'breakfast')!.dishes[0];
    const published = await prisma.dish.findMany({
      where: { status: 'PUBLISHED' },
      select: { id: true, name: true },
    });
    expect(published.length).toBeGreaterThan(0);

    const crafted: DayPlanResult = {
      meals: [
        {
          slot: 'breakfast',
          menuId: 'crafted-all-published',
          dishes: published.map((d) => ({ ...template, id: d.id, name: d.name })),
          score: 1,
          reasons: ['测试夹具：占满全部已发布菜'],
          filtered: [],
          totalActiveMinutes: template.activeMinutes * published.length,
        },
      ],
      mustUseAllocation: [],
      desiredNotes: [],
      failures: [],
      crossMealNotes: [],
      filtered: [],
    };

    const p2 = await prisma.plan.create({
      data: {
        familyId: FAMILY_ID,
        planDate: new Date(2035, 0, 1),
        context: {},
        dayContext: { ...CTX, meals: ['breakfast'] },
        candidates: [],
        dayPlan: crafted as unknown as object,
        status: 'LOCKED',
      },
    });
    createdPlanIds.push(p2.id);

    // 修复前：replanAllMeals 返回空手，被当作成功落库；修复后必须拒绝并保持原餐
    await expect(dayPlanService.swapDayPlan(p2.id, '全换')).rejects.toThrow('已保持原餐');

    const row = await prisma.plan.findUnique({ where: { id: p2.id } });
    expect(row).not.toBeNull();
    expect(row!.dayPlan).toEqual(crafted);
    const swapEvents = await prisma.event.count({
      where: { planId: p2.id, type: 'SWAP_MENU' },
    });
    expect(swapEvents).toBe(0);
  });
});
