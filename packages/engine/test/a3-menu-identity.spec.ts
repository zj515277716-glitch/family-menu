// packages/engine/test/a3-menu-identity.spec.ts
// T-A3（复盘 V2 §P0-3）：虚拟菜单 identity 与口碑/多样性按菜品聚合回归。
// 三个先红后绿的断言组：
// - A1 内容稳定哈希：同一菜品集合的组合在任何生成批次中 id 相同（修复前按 seq 编号必不同）；
// - A2 历史口碑按 dishId：反馈作用于做过的那道菜（含旧格式 menuId 事件不再错配同 id 新组合）；
// - A3/A4 近期多样性与膳食类别多样性同样按 dishId/dishRole 聚合。
import { describe, it, expect } from 'vitest';
import {
  composeMenusByRole,
  score,
  type DishView,
  type DishIngredientView,
  type EventView,
  type MenuView,
  type RecommendInput,
} from '../src/index.js';
import { FAMILY_RULE, ING_TOMATO, ING_EGG } from './fixtures/index.js';

// ───── spec 专用 fixture ─────

function di(ing: typeof ING_TOMATO, qty: number): DishIngredientView {
  return { ...ing, qty, unit: 'g', optional: false };
}

function makeDish(
  id: string,
  name: string,
  mealRole: DishView['mealRole'],
  activeMinutes: number,
): DishView {
  return {
    id,
    name,
    mealRole,
    cuisine: '家常',
    flavorTags: [],
    spicyLevel: 0,
    splitFlavor: false,
    activeMinutes,
    totalMinutes: activeMinutes,
    equipment: ['wok'],
    steps: [{ order: 1, text: `做${name}` }],
    status: 'PUBLISHED',
    ingredients: [di(id.startsWith('dish-soup') ? ING_EGG : ING_TOMATO, 100)],
  };
}

// 菜品级事件（T-A3 菜级聚合口径；daysAgo 语义与 fixtures.makeEvent 一致：ref=2026-01-31）
function makeDishEvent(
  id: string,
  type: EventView['type'],
  daysAgo: number,
  dishId: string,
  dishRole: DishView['mealRole'],
  cookedResult?: 'success' | 'partial' | 'fail',
  willRepeat?: boolean,
): EventView {
  const createdAt = new Date(2026, 0, 1 + 30 - daysAgo);
  return { id, type, dishId, dishRole, createdAt, cookedResult, willRepeat };
}

const DISH_A = makeDish('dish-a', '菜A', 'MAIN', 10);
const DISH_B = makeDish('dish-b', '菜B', 'MAIN', 12);
const DISH_SIDE_A = makeDish('dish-side-a', '配菜A', 'SIDE', 5);
const DISH_SIDE_B = makeDish('dish-side-b', '配菜B', 'SIDE', 6);
const DISH_SOUP_A = makeDish('dish-soup-a', '汤A', 'SOUP', 8);
const DISH_SOUP_B = makeDish('dish-soup-b', '汤B', 'SOUP', 10);

function makeMenu(id: string, dishes: DishView[]): MenuView {
  return {
    id,
    name: `测试组合 ${id}`,
    scene: 'WEEKDAY_FAST',
    serves: 2,
    totalActiveMinutes: dishes.reduce((s, d) => s + d.activeMinutes, 0),
    prepSequence: [],
    status: 'PUBLISHED',
    dishes,
  };
}

function baseInput(history: EventView[], library: MenuView[]): RecommendInput {
  return {
    rules: FAMILY_RULE,
    exclusions: [],
    context: { people: 2, timeBudgetMin: 60, mustUseIngredients: [] },
    library,
    history,
  };
}

function dishIds(menu: MenuView): string[] {
  return [...menu.dishes.map((d) => d.id)].sort();
}

// ───── A1：虚拟菜单 id = 内容稳定哈希 ─────

describe('A1 虚拟菜单内容稳定哈希（T-A3 AC1）', () => {
  const POOL = [DISH_A, DISH_B, DISH_SIDE_A, DISH_SIDE_B, DISH_SOUP_A, DISH_SOUP_B];

  it('同一菜品集合的组合在不同生成批次（全池 vs 剔除部分菜）中 id 相同', () => {
    const full = composeMenusByRole(POOL, { people: 2, exclusions: [] });
    const reduced = composeMenusByRole(POOL, {
      people: 2,
      exclusions: [],
      excludeDishIds: ['dish-a', 'dish-side-a', 'dish-soup-a'],
    });
    const target = (m: MenuView) =>
      dishIds(m).join('|') === ['dish-b', 'dish-side-b', 'dish-soup-b'].join('|');
    const inFull = full.virtualMenus.find(target);
    const inReduced = reduced.virtualMenus.find(target);
    expect(inFull, '全池生成中应存在 [B,配菜B,汤B] 组合').toBeDefined();
    expect(inReduced, '剔除后生成中应存在 [B,配菜B,汤B] 组合').toBeDefined();
    // 修复前：seq 编号（virt-002 vs virt-001）随生成批次漂移 -> 不等 -> 红
    expect(inFull!.id, '同一内容组合的 id 必须与生成批次无关').toBe(inReduced!.id);
    expect(inFull!.id.startsWith('virt-')).toBe(true);
  });

  it('同一批次内不同组合 id 互不相同（哈希不坍缩）', () => {
    const result = composeMenusByRole(POOL, { people: 2, exclusions: [] });
    expect(result.virtualMenus.length).toBeGreaterThanOrEqual(2);
    const ids = new Set(result.virtualMenus.map((m) => m.id));
    expect(ids.size).toBe(result.virtualMenus.length);
  });
});

// ───── A2：历史口碑按 dishId 聚合 ─────

describe('A2 历史口碑按 dishId 聚合（T-A3 AC2）', () => {
  const menuAB = makeMenu('virt-aaa', [DISH_A, DISH_SIDE_A]);
  // 与历史事件同 id 但菜品完全不同的组合（T-P16 回归的错配形态）
  const menuDE = makeMenu('virt-x2', [DISH_B, DISH_SIDE_B]);

  it('做过菜 A（成功）-> 含菜 A 的组合接受度高 0.9；不含的中性 0.7', () => {
    const history = [
      makeDishEvent('e1', 'COOKED', 5, 'dish-a', 'MAIN', 'success'),
    ];
    const rAB = score(menuAB, baseInput(history, [menuAB, menuDE]));
    const rDE = score(menuDE, baseInput(history, [menuAB, menuDE]));
    // 修复前按 menuId 匹配（dish 级事件无 menuId）-> 0.7 -> 红
    expect(rAB.breakdown.historyAcceptance).toBe(0.9);
    expect(rAB.reasons).toContain('历史接受度高');
    expect(rDE.breakdown.historyAcceptance).toBe(0.7);
  });

  it('旧格式事件（仅 menuId 无 dishId）不再错配同 id 的新组合', () => {
    // 事件 menuId='virt-x2' 来自上周另一套组合；本周 virt-x2 内容已换 -> 不应吃到旧反馈
    const history: EventView[] = [
      {
        id: 'e-old',
        type: 'COOKED',
        menuId: 'virt-x2',
        createdAt: new Date(2026, 0, 24),
        cookedResult: 'success',
      },
    ];
    const rDE = score(menuDE, baseInput(history, [menuAB, menuDE]));
    // 修复前 menuId 字面匹配 -> 0.9 -> 红
    expect(rDE.breakdown.historyAcceptance).toBe(0.7);
  });
});

// ───── A3：近期多样性按 dishId 聚合 ─────

describe('A3 近期多样性按 dishId 聚合（T-A3 AC2）', () => {
  const menuAB = makeMenu('virt-aaa', [DISH_A, DISH_SIDE_A]);
  const menuDE = makeMenu('virt-x2', [DISH_B, DISH_SIDE_B]);

  it('7 天内做过菜 A -> 含 A 的组合降权 0.2，不含的 0.8', () => {
    const history = [
      makeDishEvent('e1', 'COOKED', 3, 'dish-a', 'MAIN', 'success'),
    ];
    const rAB = score(menuAB, baseInput(history, [menuAB, menuDE]));
    const rDE = score(menuDE, baseInput(history, [menuAB, menuDE]));
    // 修复前按 menuId 匹配不到 dish 级事件 -> 0.8 -> 红
    expect(rAB.breakdown.recentDiversity).toBe(0.2);
    expect(rAB.reasons).toContain('7天内已做过');
    expect(rDE.breakdown.recentDiversity).toBe(0.8);
  });
});

// ───── A4：膳食类别多样性按菜品角色聚合 ─────

describe('A4 膳食类别多样性按菜品角色聚合（T-A3 AC2）', () => {
  const staple = makeDish('dish-staple-x', '主食X', 'STAPLE', 5);
  const menuMainOnly = makeMenu('virt-main', [DISH_A]);
  const menuStapleOnly = makeMenu('virt-staple', [staple]);

  it('7 天内做过 MAIN 菜 -> 含 MAIN 的组合类别多样性 0.5，新角色组合 1.0', () => {
    const history = [
      makeDishEvent('e1', 'COOKED', 0, 'dish-a', 'MAIN', 'success'),
    ];
    const rMain = score(menuMainOnly, baseInput(history, [menuMainOnly, menuStapleOnly]));
    const rStaple = score(menuStapleOnly, baseInput(history, [menuMainOnly, menuStapleOnly]));
    // 修复前 dish 级事件无 menuId -> recentRoles 恒空 -> 1.0 -> 0.5 断言红
    expect(rMain.breakdown.categoryDiversity).toBe(0.5);
    expect(rStaple.breakdown.categoryDiversity).toBe(1.0);
    expect(rStaple.reasons).toContain('补充近期未做的菜品类别');
  });
});
