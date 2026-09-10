// apps/api/test/projection-order.spec.ts
// T-P07 投影亮图链路 + orderBy 挂账测试（AC1/AC2/AC3）
// 1) DB 集成（乱序写入读出按序）：真实插入 MenuDish 乱序 sort 行（物理写入序与 sort 序交叉），
//    断言 loadMenuViews / hydrateLockedMenu（懒水合路径）读出 dishes 数组序 = sort 升序（=备菜顺序）
// 2) 纯函数（防御层）：toMenuView 乱序 MenuDishRow 输入仍输出有序数组
// 3) 投影（AC1）：Dish 三媒体字段 imageUrl/sourceUrl/sourceSite 透传进 View；
//    null -> undefined，JSON 序列化后键消失（前端按缺省走无图降级，不编造）
// 本机 PG 不可达时整组 skip（不挂无 DB 环境；夹具 tp07-spec- 前缀，afterAll 清理还原）

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../src/db.js';
import { loadMenuViews, hydrateLockedMenu } from '../src/services/planService.js';
import { toMenuView, toDishView } from '../src/services/mappers.js';

const PREFIX = 'tp07-spec-';
const menuId = `${PREFIX}menu-1`;
const dishIds = {
  a: `${PREFIX}dish-a`, // sort=0，有图（FETCHED 实拍字段全带）
  b: `${PREFIX}dish-b`, // sort=1，无图
  c: `${PREFIX}dish-c`, // sort=2，无图
};

async function cleanup() {
  await prisma.menuDish.deleteMany({ where: { menuId: { startsWith: PREFIX } } });
  await prisma.menu.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await prisma.dish.deleteMany({ where: { id: { startsWith: PREFIX } } });
}

async function seedFixture() {
  // 三道 PUBLISHED 菜：A 全媒体字段，B/C 三字段全 null（无图降级路径）
  await prisma.dish.createMany({
    data: [
      {
        id: dishIds.a, name: 'tp07 有图菜', mealRole: 'MAIN', cuisine: '家常',
        flavorTags: ['咸香'], spicyLevel: 0, splitFlavor: false,
        activeMinutes: 15, totalMinutes: 20, equipment: ['wok'],
        steps: [{ order: 1, text: '热锅下肉' }], status: 'PUBLISHED',
        imageUrl: 'http://127.0.0.1:3000/static/dishes/tp07-spec.jpg',
        sourceUrl: 'https://www.xiachufang.com/recipe/tp07-spec/',
        sourceSite: 'xiachufang',
      },
      {
        id: dishIds.b, name: 'tp07 无图菜B', mealRole: 'SIDE', cuisine: '家常',
        flavorTags: ['清淡'], spicyLevel: 0, splitFlavor: false,
        activeMinutes: 10, totalMinutes: 12, equipment: [],
        steps: [], status: 'PUBLISHED',
        imageUrl: null, sourceUrl: null, sourceSite: null,
      },
      {
        id: dishIds.c, name: 'tp07 无图菜C', mealRole: 'SOUP', cuisine: '家常',
        flavorTags: ['清淡'], spicyLevel: 0, splitFlavor: false,
        activeMinutes: 20, totalMinutes: 30, equipment: [],
        steps: [], status: 'PUBLISHED',
        imageUrl: null, sourceUrl: null, sourceSite: null,
      },
    ],
  });
  await prisma.menu.create({
    data: {
      id: menuId, name: 'tp07 夹具菜单', scene: 'WEEKDAY_FAST', serves: 4,
      totalActiveMinutes: 30, prepSequence: [{ minute: 0, action: '淘米煮饭' }],
      status: 'PUBLISHED',
    },
  });
  // 乱序写入：物理插入序 C(2), A(0), B(1)——行序与 sort 序双重乱序
  await prisma.menuDish.create({ data: { menuId, dishId: dishIds.c, sort: 2 } });
  await prisma.menuDish.create({ data: { menuId, dishId: dishIds.a, sort: 0 } });
  await prisma.menuDish.create({ data: { menuId, dishId: dishIds.b, sort: 1 } });
}

describe('T-P07 projection & orderBy (AC1/AC2/AC3)', () => {
  let dbReady = false;

  beforeAll(async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbReady = true;
    } catch {
      dbReady = false; // 无 PG 环境：DB 用例经各自上下文 skip，不挂测试
      return;
    }
    await cleanup(); // 清残留（失败重跑幂等）
    await seedFixture();
  });

  afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await prisma.$disconnect();
    }
  });

  // ── AC3：loadMenuViews 查询层 orderBy——乱序写入读出按 sort 升序 ──
  it('loadMenuViews returns fixture dishes in sort asc order despite shuffled inserts', async ({ skip }) => {
    if (!dbReady) return skip('PG 不可达，DB 集成断言跳过');
    const menus = await loadMenuViews();
    const fixture = menus.find((m) => m.id === menuId);
    expect(fixture).toBeDefined();
    expect(fixture!.dishes.map((d) => d.id)).toEqual([dishIds.a, dishIds.b, dishIds.c]);
  });

  // ── AC3：hydrateLockedMenu 懒水合路径（快照缺失）同样按 sort 升序 ──
  it('hydrateLockedMenu lazy-hydration path returns dishes in sort asc order', async ({ skip }) => {
    if (!dbReady) return skip('PG 不可达，DB 集成断言跳过');
    // 快照缺失（candidates 的 menu 字段不带 dishes）-> 走 DB 懒水合
    const plan = {
      id: `${PREFIX}plan-1`,
      familyId: 'seed-family',
      planDate: new Date('2026-09-10T00:00:00Z'),
      context: { people: 4, timeBudgetMin: 30, mustUse: [] },
      candidates: [{ menuId, score: 1, reasons: ['夹具'] }], // menu 快照缺省
      lockedMenuId: menuId,
      shoppingList: null,
      status: 'LOCKED',
      createdAt: new Date('2026-09-10T00:00:00Z'),
    } as Parameters<typeof hydrateLockedMenu>[0];
    const { menuView } = await hydrateLockedMenu(plan);
    expect(menuView.dishes.map((d) => d.id)).toEqual([dishIds.a, dishIds.b, dishIds.c]);
  });

  // ── AC3 防御层：toMenuView 纯函数对乱序输入仍输出有序数组 ──
  it('toMenuView sorts shuffled MenuDishRow input by sort asc (defensive layer)', () => {
    const dishRow = (id: string, name: string) => ({
      id, name, mealRole: 'MAIN', cuisine: null, flavorTags: [], spicyLevel: 0,
      splitFlavor: false, activeMinutes: 10, totalMinutes: 10, equipment: [],
      steps: [], status: 'PUBLISHED', imageUrl: null, sourceUrl: null, sourceSite: null,
      ingredients: [],
    });
    const menuRow = {
      id: 'row-menu', name: '行菜单', scene: 'WEEKDAY_FAST', serves: 4,
      totalActiveMinutes: 10, prepSequence: [], status: 'PUBLISHED',
      dishes: [
        { sort: 2, dish: dishRow('dish-2', '老三') },
        { sort: 0, dish: dishRow('dish-0', '老大') },
        { sort: 1, dish: dishRow('dish-1', '老二') },
      ],
    };
    const view = toMenuView(menuRow);
    expect(view.dishes.map((d) => d.id)).toEqual(['dish-0', 'dish-1', 'dish-2']);
    // 不改输入（纯函数，[...row.dishes] 拷贝后排序）
    expect(menuRow.dishes.map((md) => md.sort)).toEqual([2, 0, 1]);
  });

  // ── AC1 投影：三媒体字段透传 + null -> undefined ──
  it('toDishView passes media fields through and maps null to undefined', () => {
    const baseRow = {
      flavorTags: [], spicyLevel: 0, splitFlavor: false, activeMinutes: 10,
      totalMinutes: 10, equipment: [], steps: [], status: 'PUBLISHED',
      ingredients: [] as never[],
    };
    const withMedia = toDishView({
      id: 'd1', name: '有图', mealRole: 'MAIN', cuisine: null, ...baseRow,
      imageUrl: 'http://x/y.jpg', sourceUrl: 'https://s/1', sourceSite: 'xiachufang',
    });
    expect(withMedia.imageUrl).toBe('http://x/y.jpg');
    expect(withMedia.sourceUrl).toBe('https://s/1');
    expect(withMedia.sourceSite).toBe('xiachufang');

    const noMedia = toDishView({
      id: 'd2', name: '无图', mealRole: 'MAIN', cuisine: null, ...baseRow,
      imageUrl: null, sourceUrl: null, sourceSite: null,
    });
    expect(noMedia.imageUrl).toBeUndefined();
    expect(noMedia.sourceUrl).toBeUndefined();
    expect(noMedia.sourceSite).toBeUndefined();
    // 序列化后键消失（缺省即降级，不编造）
    expect(Object.keys(JSON.parse(JSON.stringify(noMedia)) as object)).not.toContain('imageUrl');
  });

  // ── AC1 端到端：loadMenuViews 输出里夹具有图菜带媒体字段、无图菜缺省 ──
  it('loadMenuViews projects media fields: with-image dish carries all three, others omit', async ({ skip }) => {
    if (!dbReady) return skip('PG 不可达，DB 集成断言跳过');
    const menus = await loadMenuViews();
    const fixture = menus.find((m) => m.id === menuId)!;
    const withImage = fixture.dishes.find((d) => d.id === dishIds.a)!;
    expect(withImage.imageUrl).toContain('tp07-spec.jpg');
    expect(withImage.sourceSite).toBe('xiachufang');
    expect(withImage.sourceUrl).toContain('xiachufang.com');

    const noImage = fixture.dishes.find((d) => d.id === dishIds.b)!;
    expect(noImage.imageUrl).toBeUndefined();
    // 序列化后不出现 imageUrl 键（candidates.menu 快照 JSON 透传口径一致）
    const keys = Object.keys(JSON.parse(JSON.stringify(noImage)) as object);
    expect(keys).not.toContain('imageUrl');
    expect(keys).not.toContain('sourceUrl');
    expect(keys).not.toContain('sourceSite');
  });
});
