// packages/engine/test/shortage-rank.spec.ts
// T-P17/AC1：缺槽罚分排序——完整可行套存在时排进 top-3；
// 罚分仅影响排序键（score - SHORTAGE_PENALTY × 缺槽计数），score/breakdown 展示值不动；
// 不传 menuShortageCounts（老调用方）时行为与基线逐位一致。
import { describe, it, expect } from 'vitest';
import {
  recommend,
  SHORTAGE_PENALTY,
  type DishView,
  type DishIngredientView,
  type MenuView,
  type RecommendInput,
} from '../src/index.js';
import { FAMILY_RULE } from './fixtures/index.js';

// ───── spec 专用 fixture（主蛋白互不相同的 4 道主菜 + 1 配菜 + 1 汤） ─────

const ING_RIBS = {
  ingredientId: 'ing-ribs',
  ingredientName: '排骨',
  aliases: [],
  category: '肉类',
  defaultUnit: 'g',
};
const ING_CHICKEN = {
  ingredientId: 'ing-chicken',
  ingredientName: '鸡肉',
  aliases: [],
  category: '肉类',
  defaultUnit: 'g',
};
const ING_BEEF = {
  ingredientId: 'ing-beef',
  ingredientName: '牛肉',
  aliases: [],
  category: '肉类',
  defaultUnit: 'g',
};
const ING_FISH = {
  ingredientId: 'ing-fish',
  ingredientName: '鲈鱼',
  aliases: [],
  category: '肉类',
  defaultUnit: 'g',
};
const ING_GREENS = {
  ingredientId: 'ing-greens',
  ingredientName: '青菜',
  aliases: [],
  category: '蔬菜',
  defaultUnit: 'g',
};
const ING_EGG = {
  ingredientId: 'ing-egg',
  ingredientName: '鸡蛋',
  aliases: [],
  category: '蛋奶',
  defaultUnit: '个',
};

function di(ing: typeof ING_RIBS, qty: number, unit = 'g'): DishIngredientView {
  return { ...ing, qty, unit, optional: false };
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

function makeMenu(id: string, dishes: DishView[]): MenuView {
  return {
    id,
    name: id,
    scene: 'WEEKDAY_FAST',
    serves: 4,
    totalActiveMinutes: dishes.reduce((s, d) => s + d.activeMinutes, 0),
    prepSequence: [],
    status: 'PUBLISHED',
    dishes,
  };
}

// 主菜（主蛋白各异，供 diversify 错开逻辑确定性运转）
const MAIN_RIBS_30 = makeDish('dish-ribs', '红烧排骨', 'MAIN', 30, [di(ING_RIBS, 300)]);
const MAIN_CHICKEN_10 = makeDish('dish-chicken', '炒鸡丁', 'MAIN', 10, [di(ING_CHICKEN, 200)]);
const MAIN_BEEF_15 = makeDish('dish-beef', '炖牛肉', 'MAIN', 15, [di(ING_BEEF, 200)]);
const MAIN_FISH_20 = makeDish('dish-fish', '清蒸鲈鱼', 'MAIN', 20, [di(ING_FISH, 300)]);
const SIDE_GREENS_10 = makeDish('dish-greens', '炒青菜', 'SIDE', 10, [di(ING_GREENS, 200)]);
const SOUP_EGG_10 = makeDish('dish-egg-soup', '蛋花汤', 'SOUP', 10, [di(ING_EGG, 1, '个')]);
const SIDE_GREENS_5 = makeDish('dish-greens-quick', '白灼菜心', 'SIDE', 5, [di(ING_GREENS, 150)]);
const SOUP_EGG_5 = makeDish('dish-egg-soup-quick', '快手蛋汤', 'SOUP', 5, [di(ING_EGG, 1, '个')]);

// 完整套 A：50min（tb=60 → timeRatio≈0.83 → timeDifficulty 0.6），score 0.72
const MENU_COMPLETE_A = makeMenu('menu-complete-a', [MAIN_RIBS_30, SIDE_GREENS_10, SOUP_EGG_10]);
// 缺槽短套 B：单主菜 10min（timeDifficulty 1.0），score 0.80，缺配菜+汤 2 条
const MENU_SHORT_B = makeMenu('menu-short-b', [MAIN_CHICKEN_10]);
// 缺槽短套 C：单主菜 15min，score 0.80，缺 2 条
const MENU_SHORT_C = makeMenu('menu-short-c', [MAIN_BEEF_15]);
// 完整套 E：30min（ratio 0.5 → 1.0），score 0.80，无缺槽
const MENU_COMPLETE_E = makeMenu('menu-complete-e', [MAIN_FISH_20, SIDE_GREENS_5, SOUP_EGG_5]);

const LIBRARY = [MENU_COMPLETE_A, MENU_SHORT_B, MENU_SHORT_C, MENU_COMPLETE_E];

function buildInput(
  overrides?: Partial<RecommendInput>,
): RecommendInput {
  return {
    rules: FAMILY_RULE,
    exclusions: [],
    context: { people: 4, timeBudgetMin: 60, mustUseIngredients: [] },
    library: LIBRARY,
    history: [],
    ...overrides,
  };
}

// ───── 罚分常量 ─────

describe('SHORTAGE_PENALTY 常量（T-P17 定稿）', () => {
  it('罚分系数写死 0.1（1 条缺槽 ≈ 满分差的 10%）', () => {
    expect(SHORTAGE_PENALTY).toBe(0.1);
  });
});

// ───── AC1 核心：完整可行套存在时排进 top-3 ─────

describe('缺槽罚分排序（T-P17 AC1）', () => {
  it('基线复现：不传 menuShortageCounts 时 50min 完整套（score 0.72）被缺槽短套（0.80）压出 top-3（V-1 场景）', () => {
    const result = recommend(buildInput());
    const ids = result.candidates.map((c) => c.menuId);
    // 同分 0.80 的 E/B/C 按字典序；A(0.72) 落第 4 被 diversify 挤出
    expect(ids).toEqual(['menu-complete-e', 'menu-short-b', 'menu-short-c']);
    expect(ids).not.toContain('menu-complete-a');
  });

  it('传缺槽计数后：完整可行套 menu-complete-a 排进 top-3（AC1 核心）', () => {
    const result = recommend(
      buildInput({
        menuShortageCounts: { 'menu-short-b': 2, 'menu-short-c': 2 },
      }),
    );
    const ids = result.candidates.map((c) => c.menuId);
    // rank：E 0.80 > A 0.72 > B/C 0.60；候选1=rank 最高 E，A 以 rank 第 2 进 top-3
    expect(ids).toContain('menu-complete-a');
    expect(result.candidates[0].menuId).toBe('menu-complete-e');
    expect(ids.length).toBe(3);
  });

  it('罚分仅影响排序：score 与 breakdown 展示值与基线完全一致', () => {
    const two = buildInput({ library: [MENU_COMPLETE_A, MENU_SHORT_B] });
    const twoBase = recommend(two);
    const twoPen = recommend({
      ...two,
      menuShortageCounts: { 'menu-short-b': 2 },
    });
    // 基线：B(0.80) 在前；罚分后 A(0.72) 反超，但两侧 score/breakdown 逐位相同
    expect(twoBase.candidates.map((c) => c.menuId)).toEqual(['menu-short-b', 'menu-complete-a']);
    expect(twoPen.candidates.map((c) => c.menuId)).toEqual(['menu-complete-a', 'menu-short-b']);
    expect(twoBase.candidates[0].score).toBe(twoPen.candidates[1].score);
    expect(twoBase.candidates[1].score).toBe(twoPen.candidates[0].score);
    expect(twoBase.candidates[1].breakdown).toEqual(twoPen.candidates[0].breakdown);
    expect(twoBase.candidates[0].score).toBe(0.8);
    expect(twoBase.candidates[1].score).toBe(0.72);
  });

  it('两套短缺数相同：罚分相互抵消，回到原 score 序（相对序不变）', () => {
    const two = buildInput({ library: [MENU_COMPLETE_A, MENU_SHORT_B] });
    const baseline = recommend(two);
    const samePenalty = recommend({
      ...two,
      menuShortageCounts: { 'menu-short-b': 1, 'menu-complete-a': 1 },
    });
    expect(baseline.candidates.map((c) => c.menuId)).toEqual([
      'menu-short-b',
      'menu-complete-a',
    ]);
    expect(samePenalty.candidates.map((c) => c.menuId)).toEqual(
      baseline.candidates.map((c) => c.menuId),
    );
  });

  it('不传 / 空对象 / 不相关 menuId：行为与基线逐位一致（老调用方零回归）', () => {
    const baseline = recommend(buildInput());
    const emptyCounts = recommend(buildInput({ menuShortageCounts: {} }));
    const unrelatedCounts = recommend(
      buildInput({ menuShortageCounts: { 'menu-not-in-library': 5 } }),
    );
    expect(emptyCounts.candidates).toEqual(baseline.candidates);
    expect(unrelatedCounts.candidates).toEqual(baseline.candidates);
    expect(emptyCounts.filtered).toEqual(baseline.filtered);
    expect(unrelatedCounts.filtered).toEqual(baseline.filtered);
  });

  it('1 条缺槽罚 0.1：恰好抵消 0.08 的 score 差距并反超（系数语义边界）', () => {
    // 构造分差 0.08：完整套 E'（30min → 0.80）与短套 B'（10min → 0.80）同分不行，
    // 改用 A(0.72 完整) vs B(0.80 短套缺 1 条)：rank B = 0.70 < 0.72 → A 反超
    const two = buildInput({ library: [MENU_COMPLETE_A, MENU_SHORT_B] });
    const oneShort = recommend({ ...two, menuShortageCounts: { 'menu-short-b': 1 } });
    expect(oneShort.candidates[0].menuId).toBe('menu-complete-a');
  });
});
