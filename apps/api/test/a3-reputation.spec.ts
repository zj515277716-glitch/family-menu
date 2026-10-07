// apps/api/test/a3-reputation.spec.ts
// T-A3（复盘 V2 §P0-3 / 任务卡 AC4）：真实 PG 集成回归——
//   B1 历史事件菜级投影：COOKED 事件展开为 dishId/dishRole 级 EventView（修复前仅 menuId 字面 -> 红）；
//   B2 CookLog 关联菜品：虚拟组合反馈按菜落 dishId（修复前全 null -> 红）；
//   B3 正路径：做组合 -> 反馈好吃 -> 下次含同一道菜的组合接受度上升 + 7 天降权；
//   B4 撞号错配消除：旧 seq 编号 id（virt-001…）不再出现于新推荐（修复前必现 -> 红）。
// 真实 PG（127.0.0.1:54329/family_menu，DATABASE_URL 由 src/db.ts 内 dotenv 加载），禁止 Mock 冒充。
// 测试数据一律 a3-test- 前缀；动态 cuid Plan/Event 精确记录 id 清理，不碰家人真实数据。
// 本机 PG 不可达时用例显式 skip（不假绿），处置：.pg/bin/pg_ctl.exe start -D .pg/data -o "-p 54329"

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../src/db.js';
import { planService, loadEventViews } from '../src/services/planService.js';
import type { EventView } from '@family-menu/engine';

const PREFIX = 'a3-test-';
const FAMILY_ID = 'seed-family';
const CTX = { people: 2, timeBudgetMin: 60, mustUse: [] as string[] };

/** 测试菜品 id（池序 = id 升序，a3- 排全库最前，组合切分可控） */
const M1 = `${PREFIX}dish-m1`; // MAIN 10min
const M2 = `${PREFIX}dish-m2`; // MAIN 11min
const M3 = `${PREFIX}dish-m3`; // MAIN 12min（planX 撞号组合的 MAIN）
const M4 = `${PREFIX}dish-m4`; // MAIN 13min
const S1 = `${PREFIX}dish-s1`; // SIDE 5min
const S2 = `${PREFIX}dish-s2`; // SIDE 6min（planX 撞号组合的 SIDE）
const SOU1 = `${PREFIX}dish-sou1`; // SOUP 7min
const SOU2 = `${PREFIX}dish-sou2`; // SOUP 8min（planX 撞号组合的 SOUP）
const DISH_IDS = [M1, M2, M3, M4, S1, S2, SOU1, SOU2];

/** 动态创建（cuid id）的 Plan 及其 Event，afterAll 精确清理 */
const dynamicPlanIds: string[] = [];
const PLAN_OLD_ID = `${PREFIX}plan-old`;

let dbReady = false;
let lockedMenuId = ''; // B2 锁定的虚拟组合 id
let lockedDishIds: string[] = []; // B2 锁定组合的菜品 id 集合

async function createTestContent(): Promise<void> {
  // 食材（name unique：加 A3 前缀避免与库内重名；category 蔬菜不命中 seed 禁忌）
  await prisma.ingredient.createMany({
    data: [
      { id: `${PREFIX}ing-1`, name: 'A3测试白菜', aliases: [], category: '蔬菜', defaultUnit: 'g' },
      { id: `${PREFIX}ing-2`, name: 'A3测试萝卜', aliases: [], category: '蔬菜', defaultUnit: 'g' },
    ],
  });
  const dishDef: Array<[string, string, 'MAIN' | 'SIDE' | 'SOUP', number, string]> = [
    [M1, 'A3主菜一', 'MAIN', 10, `${PREFIX}ing-1`],
    [M2, 'A3主菜二', 'MAIN', 11, `${PREFIX}ing-1`],
    [M3, 'A3主菜三', 'MAIN', 12, `${PREFIX}ing-2`],
    [M4, 'A3主菜四', 'MAIN', 13, `${PREFIX}ing-2`],
    [S1, 'A3配菜一', 'SIDE', 5, `${PREFIX}ing-1`],
    [S2, 'A3配菜二', 'SIDE', 6, `${PREFIX}ing-2`],
    [SOU1, 'A3汤一', 'SOUP', 7, `${PREFIX}ing-1`],
    [SOU2, 'A3汤二', 'SOUP', 8, `${PREFIX}ing-2`],
  ];
  // 与 prisma/seed.ts 同构：Dish 与 DishIngredient 分开建（不依赖嵌套写法）
  for (const [id, name, mealRole, minutes, ingId] of dishDef) {
    await prisma.dish.create({
      data: {
        id,
        name,
        mealRole,
        cuisine: '家常',
        flavorTags: [],
        spicyLevel: 0,
        splitFlavor: false,
        activeMinutes: minutes,
        totalMinutes: minutes,
        equipment: ['wok'],
        steps: [{ order: 1, text: `做${name}` }],
        status: 'PUBLISHED',
        origin: 'MANUAL',
      },
    });
    await prisma.dishIngredient.create({
      data: { dishId: id, ingredientId: ingId, qty: 100, unit: 'g', optional: false },
    });
  }
}

/** 撞号场景：直接构造旧 seq 编号（virt-001）的已反馈计划（模拟上周 T-P16 旧口径数据） */
async function createLegacyPlan(): Promise<void> {
  const dishes = [M3, S2, SOU2].map((id, i) => ({
    id,
    name: `A3旧组合菜${i + 1}`,
    mealRole: i === 0 ? 'MAIN' : i === 1 ? 'SIDE' : 'SOUP',
    cuisine: '家常',
    flavorTags: [],
    spicyLevel: 0,
    splitFlavor: false,
    activeMinutes: 10,
    totalMinutes: 10,
    equipment: ['wok'],
    steps: [],
    status: 'PUBLISHED',
    ingredients: [],
  }));
  await prisma.plan.create({
    data: {
      id: PLAN_OLD_ID,
      familyId: FAMILY_ID,
      planDate: new Date(),
      context: CTX,
      candidates: [
        {
          menuId: 'virt-001',
          score: 0.5,
          reasons: [],
          breakdown: {},
          menu: {
            id: 'virt-001',
            name: '动态组合 #1',
            scene: 'WEEKDAY_FAST',
            serves: 2,
            totalActiveMinutes: 26,
            prepSequence: [],
            status: 'PUBLISHED',
            dishes,
          },
        },
      ],
      lockedMenuId: 'virt-001',
      status: 'COOKED',
    },
  });
  await prisma.event.create({
    data: {
      familyId: FAMILY_ID,
      planId: PLAN_OLD_ID,
      type: 'COOKED',
      payload: { taste: 'fail', willRepeat: false },
    },
  });
}

async function cleanup(): Promise<void> {
  // FK 顺序：CookLog(dishId) -> Event(planId) -> Plan -> DishIngredient -> Dish -> Ingredient
  await prisma.cookLog.deleteMany({ where: { dishId: { in: DISH_IDS } } });
  const planIds = [...dynamicPlanIds, PLAN_OLD_ID];
  await prisma.event.deleteMany({ where: { planId: { in: planIds } } });
  await prisma.plan.deleteMany({ where: { id: { in: planIds } } });
  await prisma.dishIngredient.deleteMany({ where: { dishId: { in: DISH_IDS } } });
  await prisma.dish.deleteMany({ where: { id: { in: DISH_IDS } } });
  await prisma.ingredient.deleteMany({ where: { id: { startsWith: PREFIX } } });
}

describe('T-A3 口碑/多样性按菜品聚合 + 虚拟菜单内容哈希（真实 PG）', () => {
  beforeAll(async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbReady = true;
    } catch (e) {
      dbReady = false;
      const reason = e instanceof Error ? e.message : String(e);
      console.warn(
        `[a3-reputation] PG 不可达（${reason}）：本文件用例 skip。` +
          `修复：.pg/bin/pg_ctl.exe start -D .pg/data -o "-p 54329"`,
      );
      return;
    }
    await cleanup(); // 清失败重跑残留（幂等）
    await createTestContent();
  });

  afterAll(async () => {
    if (dbReady) {
      await cleanup();
      // 终态零残留复核：a3-test- 菜品与食材全清、动态 Plan 全清
      expect(await prisma.dish.count({ where: { id: { startsWith: PREFIX } } })).toBe(0);
      expect(await prisma.ingredient.count({ where: { id: { startsWith: PREFIX } } })).toBe(0);
      expect(await prisma.plan.count({ where: { id: { in: [...dynamicPlanIds, PLAN_OLD_ID] } } })).toBe(0);
    }
    await prisma.$disconnect();
  });

  // ── B2：真链路 做组合（锁定虚拟菜单）→ 反馈好吃 → CookLog 关联菜品（修复前红） ──
  it('B2 虚拟组合反馈：CookLog 按菜品落 dishId，menuId 不伪造（修复前 dishId 全 null）', async ({ skip }) => {
    if (!dbReady) return skip('PG 不可达，真实 PG 集成断言跳过');
    const gen = await planService.generateRecommendation(CTX);
    expect(gen.planId).toBeDefined();
    dynamicPlanIds.push(gen.planId!);
    expect(gen.candidates.length).toBeGreaterThan(0);

    // 锁定第一个候选（虚拟组合）
    const locked = await planService.lockPlan(gen.planId!, gen.candidates[0].menuId);
    lockedMenuId = locked.lockedMenuId ?? '';
    expect(lockedMenuId.startsWith('virt-')).toBe(true);
    lockedDishIds = (gen.candidates[0].menu as { dishes: Array<{ id: string }> }).dishes.map(
      (d) => d.id,
    );
    expect(lockedDishIds.length).toBeGreaterThan(0);

    // 反馈：做了 + 好吃 + 还做
    await planService.addFeedback(gen.planId!, {
      didCook: true,
      taste: 'good',
      willRepeat: true,
      actualMinutes: 30,
    });

    // CookLog 断言：每道菜一行、dishId 集合 = 锁定组合菜品、menuId 不伪造（FK 到 Menu，虚拟 id 不可写）
    const cookLogs = await prisma.cookLog.findMany({ where: { dishId: { in: DISH_IDS } } });
    // 修复前：virt-* 一律 menuId=null 且 dishId=null -> 此处查到 0 行 -> 红
    expect(cookLogs.length, 'CookLog 行数应等于锁定组合菜品数').toBe(lockedDishIds.length);
    expect(cookLogs.map((c) => c.dishId).sort()).toEqual([...lockedDishIds].sort());
    expect(cookLogs.every((c) => c.menuId === null)).toBe(true);
    expect(cookLogs.every((c) => c.result === 'success')).toBe(true);
    expect(cookLogs.every((c) => c.willRepeat === true)).toBe(true);
  });

  // ── B3：正路径（AC4 字面）——下次推荐中含同一道菜的组合得分上升 + 7 天降权 ──
  it('B3 反馈好吃后：含同一道菜的组合接受度上升至 1.0 且 7 天内降权 0.2', async ({ skip }) => {
    if (!dbReady) return skip('PG 不可达，真实 PG 集成断言跳过');
    const gen = await planService.generateRecommendation(CTX);
    expect(gen.planId).toBeDefined();
    dynamicPlanIds.push(gen.planId!);

    // 同 context 同菜池 -> B2 锁定的组合必然重新生成且 id（内容哈希）一致，应进候选
    const sameMenu = gen.candidates.find((c) => c.menuId === lockedMenuId);
    expect(sameMenu, '锁定组合应再次出现在候选中').toBeDefined();
    const bd = sameMenu!.breakdown as Record<string, number>;
    // 0.9（成功率高）+ 0.1（曾标记愿意再做）= 1.0；7 天内做过 -> 0.2
    expect(bd.historyAcceptance).toBe(1.0);
    expect(bd.recentDiversity).toBe(0.2);

    // 对照：候选中不含任何反馈菜的组合保持中性 0.7 / 0.8（7 天降权不外溢）
    const feedbackDishIds = new Set(lockedDishIds);
    const untouched = gen.candidates.filter(
      (c) =>
        !(c.menu as { dishes: Array<{ id: string }> }).dishes.some((d) =>
          feedbackDishIds.has(d.id),
        ),
    );
    for (const c of untouched) {
      const b = c.breakdown as Record<string, number>;
      expect(b.historyAcceptance).toBe(0.7);
      expect(b.recentDiversity).toBe(0.8);
    }
  });

  // ── B1：历史事件菜级投影（loadEventViews）——修复前 COOKED 仅带 menuId 字面值（红） ──
  it('B1 COOKED/LOCK 事件按锁定组合展开为 dishId+dishRole 菜级事件', async ({ skip }) => {
    if (!dbReady) return skip('PG 不可达，真实 PG 集成断言跳过');
    // B2 真链路产生的 COOKED 事件（plan.lockedMenuId + candidates 快照俱在）
    const planId = dynamicPlanIds[0];
    const cookedEvent = await prisma.event.findFirst({
      where: { planId, type: 'COOKED' },
      orderBy: { createdAt: 'desc' },
    });
    expect(cookedEvent).toBeDefined();
    const lockEvent = await prisma.event.findFirst({
      where: { planId, type: 'LOCK' },
      orderBy: { createdAt: 'desc' },
    });
    expect(lockEvent).toBeDefined();

    const views = await loadEventViews(FAMILY_ID);
    // 展开后每道菜一条，id = `${eventId}:${dishId}`（T-A3 菜级投影约定）
    const cookedViews = views.filter((v) => v.id.startsWith(`${cookedEvent!.id}:`));
    // 修复前：单条 menuId 事件、无 dishId -> 展开条数 0 -> 红
    expect(cookedViews.length, 'COOKED 应按锁定组合菜品逐菜展开').toBe(lockedDishIds.length);
    expect(cookedViews.map((v) => v.dishId).sort()).toEqual([...lockedDishIds].sort());
    for (const v of cookedViews) {
      expect(v.type).toBe('COOKED');
      expect(v.cookedResult).toBe('success');
      expect(v.willRepeat).toBe(true);
      expect(['MAIN', 'SIDE', 'SOUP', 'STAPLE']).toContain(v.dishRole);
    }
    const lockViews = views.filter((v) => v.id.startsWith(`${lockEvent!.id}:`));
    expect(lockViews.length, 'LOCK 事件同样展开菜级（近期多样性口径）').toBe(lockedDishIds.length);
    for (const v of lockViews) {
      expect(v.cookedResult).toBeUndefined(); // 锁定不是做饭，不携带口碑
    }
  });

  // ── B4：撞号错配消除——旧 seq 编号 id 不再出现在新推荐（修复前必现 virt-001…，红） ──
  it('B4 旧 seq 编号虚拟菜单 id 消失，无菜品关联的组合不受旧 virt-001 反馈影响', async ({ skip }) => {
    if (!dbReady) return skip('PG 不可达，真实 PG 集成断言跳过');
    await createLegacyPlan(); // 上周 virt-001（M3+S2+SOU2）难吃反馈（旧口径数据）

    const gen = await planService.generateRecommendation(CTX);
    expect(gen.planId).toBeDefined();
    dynamicPlanIds.push(gen.planId!);
    expect(gen.candidates.length).toBeGreaterThan(0);

    // 修复前：所有虚拟菜单 id 均为 virt-001/002… 顺序编号 -> 此断言红
    const legacySeqId = /^virt-\d+$/;
    for (const c of gen.candidates) {
      expect(
        legacySeqId.test(c.menuId),
        `候选 id ${c.menuId} 不应再是生成顺序编号`,
      ).toBe(false);
    }

    // 行为验证：旧 virt-001 的差评只作用于 M3/S2/SOU2；完全不含这些菜的组合保持中性
    const legacyDishIds = new Set([M3, S2, SOU2]);
    const unrelated = gen.candidates.filter(
      (c) =>
        !(c.menu as { dishes: Array<{ id: string }> }).dishes.some((d) =>
          legacyDishIds.has(d.id),
        ) &&
        !(c.menu as { dishes: Array<{ id: string }> }).dishes.some((d) =>
          new Set(lockedDishIds).has(d.id),
        ),
    );
    for (const c of unrelated) {
      const b = c.breakdown as Record<string, number>;
      expect(b.historyAcceptance, '与两批反馈菜均无关的组合不得吃到旧口碑').toBe(0.7);
      expect(b.recentDiversity).toBe(0.8);
    }

    // 旧计划（virt-001 难吃）在菜级投影下可被还原（B1 同口径，直查 planX 事件）
    const oldEvent = await prisma.event.findFirst({
      where: { planId: PLAN_OLD_ID, type: 'COOKED' },
    });
    const views: EventView[] = await loadEventViews(FAMILY_ID);
    const oldViews = views.filter((v) => v.id.startsWith(`${oldEvent!.id}:`));
    expect(oldViews.length).toBe(3);
    expect(oldViews.map((v) => v.dishId).sort()).toEqual([M3, S2, SOU2].sort());
    expect(oldViews.every((v) => v.cookedResult === 'fail')).toBe(true);
  });
});
