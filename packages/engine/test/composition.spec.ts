// packages/engine/test/composition.spec.ts
// T-P16/PD-018：槽位组合层测试——mealRole 归池 + 槽位映射（主菜 ⌈people/2⌉/SIDE 1/SOUP 1，
// STAPLE 挂账）+ dish 级安全预过滤 + 缺槽降级 + mustUse 定向套 + 覆盖式生成保宽集。
// fixtures 复用 test/fixtures；SIDE/SOUP 角色菜为本 spec 专用补充（不动共享 fixtures，
// 避免影响既有用例——共享 fixtures 中 SIDE 仅有成分未确认的 DISH_UNKNOWN）。
import { describe, it, expect } from 'vitest';
import {
  composeMenusByRole,
  mainSlotCount,
  type DishView,
  type DishIngredientView,
} from '../src/index.js';
import {
  DISH_TOMATO_EGG,
  DISH_MAPOTOFU,
  DISH_OFFAL,
  DISH_LAWEI_HEZHENG,
  DISH_PLAIN_RICE,
  DISH_UNKNOWN,
  ING_TOMATO,
  ING_EGG,
  ING_TOFU,
  EXCLUSION_HARD_TOMATO,
  EXCLUSION_HARD_DISH,
  EXCLUSION_HARD_OFFAL_TAG,
} from './fixtures/index.js';

// ───── spec 专用 fixture（SIDE/SOUP 角色） ─────

const ING_CUKE = {
  ingredientId: 'ing-cuke',
  ingredientName: '黄瓜',
  aliases: [],
  category: '蔬菜',
  defaultUnit: 'g',
};
const ING_EGGPLANT = {
  ingredientId: 'ing-eggplant',
  ingredientName: '茄子',
  aliases: [],
  category: '蔬菜',
  defaultUnit: 'g',
};
const ING_WINTERMELON = {
  ingredientId: 'ing-wintermelon',
  ingredientName: '冬瓜',
  aliases: [],
  category: '蔬菜',
  defaultUnit: 'g',
};

function di(ing: typeof ING_CUKE, qty: number, unit = 'g', optional = false): DishIngredientView {
  return { ...ing, qty, unit, optional };
}

function makeDish(
  id: string,
  name: string,
  mealRole: DishView['mealRole'],
  activeMinutes: number,
  ingredients: DishIngredientView[],
): DishView {
  return {
    id,
    name,
    mealRole,
    cuisine: '家常',
    flavorTags: ['清淡'],
    spicyLevel: 0,
    splitFlavor: false,
    activeMinutes,
    totalMinutes: activeMinutes,
    equipment: ['wok'],
    steps: [{ order: 1, text: `做${name}` }],
    status: 'PUBLISHED',
    ingredients,
  };
}

// 拍黄瓜（SIDE，5min，含 ing-cuke）
const DISH_CUKE = makeDish('dish-cuke', '拍黄瓜', 'SIDE', 5, [di(ING_CUKE, 200)]);
// 凉拌豆腐（SIDE，8min，含 ing-tofu）
const DISH_TOFU_SIDE = makeDish('dish-tofu-side', '凉拌豆腐', 'SIDE', 8, [di(ING_TOFU, 200)]);
// 蒜蓉茄子（SIDE，12min，含 ing-eggplant）
const DISH_EGGPLANT_SIDE = makeDish('dish-eggplant-side', '蒜蓉茄子', 'SIDE', 12, [
  di(ING_EGGPLANT, 200),
]);
// 番茄蛋汤（SOUP，10min，含 ing-tomato + ing-egg）
const DISH_EGG_SOUP = makeDish('dish-egg-soup', '番茄蛋汤', 'SOUP', 10, [
  di(ING_TOMATO, 100),
  di(ING_EGG, 1, '个'),
]);
// 冬瓜汤（SOUP，12min，含 ing-wintermelon）
const DISH_MELON_SOUP = makeDish('dish-melon-soup', '冬瓜汤', 'SOUP', 12, [
  di(ING_WINTERMELON, 300),
]);

// 主用例池：4 MAIN + 1 SIDE + 1 SOUP + 1 STAPLE（顺序固定，输出确定性依赖）
const POOL_A: DishView[] = [
  DISH_TOMATO_EGG,
  DISH_MAPOTOFU,
  DISH_OFFAL,
  DISH_LAWEI_HEZHENG,
  DISH_CUKE,
  DISH_EGG_SOUP,
  DISH_PLAIN_RICE,
];

// ───── C1：槽位映射（AC1） ─────

describe('composeMenusByRole 槽位映射（T-P16 AC1）', () => {
  it('C1a mainSlotCount：⌈people/2⌉ 向下防御（0 人按 1）', () => {
    expect(mainSlotCount(0)).toBe(1);
    expect(mainSlotCount(1)).toBe(1);
    expect(mainSlotCount(2)).toBe(1);
    expect(mainSlotCount(3)).toBe(2);
    expect(mainSlotCount(4)).toBe(2);
    expect(mainSlotCount(5)).toBe(3);
    expect(mainSlotCount(6)).toBe(3);
  });

  it('C1b people=4：每套主菜槽 ≤ 2，SIDE/SOUP 各 ≤ 1，STAPLE 不入槽（挂账）', () => {
    const result = composeMenusByRole(POOL_A, { people: 4, exclusions: [] });
    expect(result.virtualMenus.length).toBeGreaterThanOrEqual(1);
    for (const menu of result.virtualMenus) {
      const mains = menu.dishes.filter((d) => d.mealRole === 'MAIN');
      const sides = menu.dishes.filter((d) => d.mealRole === 'SIDE');
      const soups = menu.dishes.filter((d) => d.mealRole === 'SOUP');
      expect(mains.length).toBeLessThanOrEqual(2);
      expect(sides.length).toBeLessThanOrEqual(1);
      expect(soups.length).toBeLessThanOrEqual(1);
      expect(menu.dishes.some((d) => d.mealRole === 'STAPLE')).toBe(false);
    }
    // 首套（池头两道主菜 + 配菜 + 汤）：MAIN 在前、SIDE 次之、SOUP 最后
    expect(result.virtualMenus[0].dishes.map((d) => d.id)).toEqual([
      'dish-tomato-egg',
      'dish-mapotofu',
      'dish-cuke',
      'dish-egg-soup',
    ]);
    // STAPLE 挂账但计数可见
    expect(result.poolSizes.STAPLE).toBe(1);
    expect(result.poolSizes.MAIN).toBe(4);
  });

  it('C1c people=5：主菜槽 3 道一套', () => {
    const result = composeMenusByRole(POOL_A, { people: 5, exclusions: [] });
    const first = result.virtualMenus[0];
    expect(first.dishes.filter((d) => d.mealRole === 'MAIN').length).toBe(3);
  });
});

// ───── C2：dish 级安全预过滤（AC2 禁忌零回归） ─────

describe('composeMenusByRole 安全预过滤（T-P16 AC2）', () => {
  it('C2 HARD 三 scope + 成分未确认的菜全部不入槽，safetyExcluded 带原因', () => {
    // 禁：番茄食材（tomato-egg 与 egg-soup 中招）、DISH 级禁麻婆豆腐、TAG 禁内脏（offal 中招）；
    // DISH_UNKNOWN 成分未确认（ingredients 空）同被排除
    const pool = [DISH_TOMATO_EGG, DISH_MAPOTOFU, DISH_OFFAL, DISH_LAWEI_HEZHENG, DISH_UNKNOWN, DISH_CUKE, DISH_EGG_SOUP, DISH_PLAIN_RICE];
    const result = composeMenusByRole(pool, {
      people: 4,
      exclusions: [EXCLUSION_HARD_TOMATO, EXCLUSION_HARD_DISH, EXCLUSION_HARD_OFFAL_TAG],
    });

    expect(Object.keys(result.safetyExcluded).sort()).toEqual([
      'dish-egg-soup',
      'dish-mapotofu',
      'dish-offal',
      'dish-tomato-egg',
      'dish-unknown',
    ]);
    for (const reason of Object.values(result.safetyExcluded)) {
      expect(reason.length).toBeGreaterThan(0);
    }
    // 被禁菜绝不出现（AC2 一票否决口径）
    const banned = new Set(Object.keys(result.safetyExcluded));
    for (const menu of result.virtualMenus) {
      for (const dish of menu.dishes) {
        expect(banned.has(dish.id)).toBe(false);
      }
    }
    // 汤池被清空 -> 汤槽如实留空
    expect(result.poolSizes.SOUP).toBe(0);
    const shortages = Object.values(result.slotShortages).flat();
    expect(shortages.some((s) => s.includes('汤槽留空'))).toBe(true);
  });
});

// ───── C3：缺槽降级（AC5 留空不凑数） ─────

describe('composeMenusByRole 缺槽降级（T-P16 AC5）', () => {
  it('C3a 配菜/汤池全空：槽留空 + slotShortages 如实标注，不拿禁菜/STAPLE 凑数', () => {
    const pool = [DISH_TOMATO_EGG, DISH_MAPOTOFU, DISH_PLAIN_RICE];
    const result = composeMenusByRole(pool, { people: 2, exclusions: [] });

    // people=2 -> 主菜槽 1，MAIN 2 道 -> 2 套轮转
    expect(result.virtualMenus.length).toBe(2);
    for (const menu of result.virtualMenus) {
      expect(menu.dishes.some((d) => d.mealRole === 'SIDE')).toBe(false);
      expect(menu.dishes.some((d) => d.mealRole === 'SOUP')).toBe(false);
      expect(menu.dishes.some((d) => d.mealRole === 'STAPLE')).toBe(false);
      const shortages = result.slotShortages[menu.id] ?? [];
      expect(shortages.some((s) => s.includes('配菜槽留空'))).toBe(true);
      expect(shortages.some((s) => s.includes('汤槽留空'))).toBe(true);
    }
    expect(result.poolSizes).toEqual({ MAIN: 2, SIDE: 0, SOUP: 0, STAPLE: 1 });
  });

  it('C3b 主菜不足槽位：缺N道如实标注（池仅1道、槽2道）', () => {
    const result = composeMenusByRole([DISH_TOMATO_EGG, DISH_CUKE], { people: 4, exclusions: [] });
    expect(result.virtualMenus.length).toBe(1);
    const shortages = result.slotShortages[result.virtualMenus[0].id] ?? [];
    expect(shortages.some((s) => s.includes('主菜槽缺1道') && s.includes('仅1道可用'))).toBe(true);
  });

  it('C3c 全池被禁：不出任何套（空桌不产出）', () => {
    const result = composeMenusByRole([DISH_TOMATO_EGG, DISH_EGG_SOUP], {
      people: 4,
      exclusions: [EXCLUSION_HARD_TOMATO],
    });
    expect(result.virtualMenus).toEqual([]);
    expect(result.poolSizes).toEqual({ MAIN: 0, SIDE: 0, SOUP: 0, STAPLE: 0 });
  });
});

// ───── C4：时长档（AC4 明文口径：组合菜单各菜时长之和） ─────

describe('composeMenusByRole 时长口径（T-P16 AC4）', () => {
  it('C4 totalActiveMinutes = 各菜之和，prepSequence 串行展开', () => {
    const result = composeMenusByRole(POOL_A, { people: 4, exclusions: [] });
    const first = result.virtualMenus[0];
    // 15(番茄炒蛋) + 20(麻婆豆腐) + 5(拍黄瓜) + 10(番茄蛋汤) = 50
    expect(first.totalActiveMinutes).toBe(50);
    // 每菜 1 步 -> 4 项；串行分钟游标单调不减
    expect(first.prepSequence.length).toBe(4);
    for (let i = 1; i < first.prepSequence.length; i++) {
      expect(first.prepSequence[i].minute).toBeGreaterThanOrEqual(first.prepSequence[i - 1].minute);
    }
  });
});

// ───── C5：mustUse 定向套（AC3 回归） ─────

describe('composeMenusByRole 必消定向套（T-P16 AC3）', () => {
  it('C5a 必消可同桌：生成覆盖全部必消的定向套', () => {
    // ing-tomato 在 dish-tomato-egg，ing-offal 在 dish-offal（均 MAIN，槽位 2 可同桌）
    const result = composeMenusByRole(POOL_A, {
      people: 4,
      exclusions: [],
      mustUseIngredientIds: ['ing-tomato', 'ing-offal'],
    });
    const coverMenu = result.virtualMenus.find((menu) => {
      const ingIds = new Set(menu.dishes.flatMap((d) => d.ingredients.map((i) => i.ingredientId)));
      return ingIds.has('ing-tomato') && ingIds.has('ing-offal');
    });
    expect(coverMenu).toBeDefined();
    // 定向套槽位合法
    const mains = coverMenu!.dishes.filter((d) => d.mealRole === 'MAIN');
    expect(mains.length).toBeLessThanOrEqual(2);
    expect(coverMenu!.dishes.some((d) => d.mealRole === 'STAPLE')).toBe(false);
  });

  it('C5b 必消同桌必超槽位：放弃定向套（空手/缺套是真实口径，不伪造可行解）', () => {
    // people=2 -> 主菜槽 1；ing-tomato(dish-tomato-egg) 与 ing-beef(dish-mapotofu) 分属两道主菜，
    // 同桌覆盖必须 2 道主菜 > 1 槽 -> 定向套放弃
    const result = composeMenusByRole(POOL_A, {
      people: 2,
      exclusions: [],
      mustUseIngredientIds: ['ing-tomato', 'ing-beef'],
    });
    for (const menu of result.virtualMenus) {
      const mains = menu.dishes.filter((d) => d.mealRole === 'MAIN');
      expect(mains.length).toBeLessThanOrEqual(1);
      // 任何一套都不同时覆盖两个必消
      const ingIds = new Set(menu.dishes.flatMap((d) => d.ingredients.map((i) => i.ingredientId)));
      expect(ingIds.has('ing-tomato') && ingIds.has('ing-beef')).toBe(false);
    }
  });
});

// ───── C6：覆盖式生成（保 feasibility 宽集，T-P10 口径） ─────

describe('composeMenusByRole 覆盖式生成（T-P16 宽集不漏）', () => {
  it('C6 每个安全合格菜至少出现在一个虚拟菜单（轮转套数 = 覆盖所需最大值）', () => {
    // MAIN 4 + SIDE 3 + SOUP 2 -> 套数 = max(⌈4/2⌉, 3, 2) = 3
    const pool = [
      DISH_TOMATO_EGG,
      DISH_MAPOTOFU,
      DISH_OFFAL,
      DISH_LAWEI_HEZHENG,
      DISH_CUKE,
      DISH_TOFU_SIDE,
      DISH_EGGPLANT_SIDE,
      DISH_EGG_SOUP,
      DISH_MELON_SOUP,
    ];
    const result = composeMenusByRole(pool, { people: 4, exclusions: [] });
    expect(result.virtualMenus.length).toBe(3);

    const usedIds = new Set(result.virtualMenus.flatMap((m) => m.dishes.map((d) => d.id)));
    for (const dish of pool) {
      expect(usedIds.has(dish.id)).toBe(true);
    }
  });
});

// ───── C7：换一批（AC6 组合层语义：excludeDishIds 剔除不回池） ─────

describe('composeMenusByRole 换一批剔除（T-P16 AC6）', () => {
  it('C7 被剔除菜不出现在任何虚拟菜单，其余菜照常覆盖', () => {
    const result = composeMenusByRole(POOL_A, {
      people: 4,
      exclusions: [],
      excludeDishIds: ['dish-tomato-egg', 'dish-egg-soup'],
    });
    for (const menu of result.virtualMenus) {
      const ids = menu.dishes.map((d) => d.id);
      expect(ids).not.toContain('dish-tomato-egg');
      expect(ids).not.toContain('dish-egg-soup');
    }
    expect(result.poolSizes.MAIN).toBe(3);
    // 汤池被剔空 -> 汤槽留空标注
    expect(result.poolSizes.SOUP).toBe(0);
    const shortages = Object.values(result.slotShortages).flat();
    expect(shortages.some((s) => s.includes('汤槽留空'))).toBe(true);
    // 其余菜仍全覆盖
    const usedIds = new Set(result.virtualMenus.flatMap((m) => m.dishes.map((d) => d.id)));
    for (const id of ['dish-mapotofu', 'dish-offal', 'dish-lawei-hezheng', 'dish-cuke']) {
      expect(usedIds.has(id)).toBe(true);
    }
  });
});

// ───── C8：确定性（纯函数约定：同输入同输出） ─────

describe('composeMenusByRole 确定性（engine 纯函数约定）', () => {
  it('C8 同输入两次调用输出完全一致（无随机）', () => {
    const a = composeMenusByRole(POOL_A, {
      people: 4,
      exclusions: [EXCLUSION_HARD_TOMATO],
      mustUseIngredientIds: ['ing-offal'],
    });
    const b = composeMenusByRole(POOL_A, {
      people: 4,
      exclusions: [EXCLUSION_HARD_TOMATO],
      mustUseIngredientIds: ['ing-offal'],
    });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
