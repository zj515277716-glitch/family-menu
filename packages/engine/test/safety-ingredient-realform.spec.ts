// packages/engine/test/safety-ingredient-realform.spec.ts
// T-C07-FIX 回归用例：INGREDIENT 通道「食材名 ≠ 品类/标签」真实形态（T-C07 缺口防回退）
//
// 背景（T-C07 评估定案 evidence/T-C07-dev-2026-09-13.md）：真实库中「花生」相关食材的
// name='花生米'、aliases=['熟花生米','油炸花生米']、category='调料'——食材名与品类词
//（'花生'）完全不同。checkTagScope 只匹配 dish.flavorTags.includes(tag) 与
// ing.category === tag（safety.ts L104-127），不读食材名/别名，因此 HARD+TAG('花生')
// 规则对这类菜拦截力为零；只有 HARD+INGREDIENT 行（targetName/targetAliases 注入）
// 才能按名拦截。本文件固化该真实形态的拦截口径，既有 taboo.spec.ts 用例零改动。
//
// S-1 口径说明（review 移交）：既有 TAG 用例为 flavorTags（'内脏'）与食材 category
//（'水产'）两类构造场景；本文件补的是「名称词 ∉ {flavorTags, category}」的第三类真实形态。
import { describe, it, expect } from 'vitest';
import { safetyFilter } from '../src/index.js';
import type { DishView, DishIngredientView, ExclusionView, MenuView } from '../src/index.js';

// ───── 内联 fixtures（复刻真实库形态，不改动既有 fixtures/index.ts） ─────

// 花生米：id=cuid 形态、name≠品类（category='调料'），别名与名称不同词
const ING_PEANUT: Omit<DishIngredientView, 'qty' | 'unit' | 'optional'> = {
  ingredientId: 'ing-peanut-real',
  ingredientName: '花生米',
  aliases: ['熟花生米', '油炸花生米'],
  category: '调料',
  defaultUnit: 'g',
};

// 花生油：名称含"花生"但精确等值不命中"花生米"规则（防误伤口径）
const ING_PEANUT_OIL: Omit<DishIngredientView, 'qty' | 'unit' | 'optional'> = {
  ingredientId: 'ing-peanut-oil',
  ingredientName: '花生油',
  aliases: [],
  category: '调料',
  defaultUnit: 'g',
};

// 熟花生米：不同 id、名称=目标规则别名（别名归一拦截口径）
const ING_COOKED_PEANUT: Omit<DishIngredientView, 'qty' | 'unit' | 'optional'> = {
  ingredientId: 'ing-peanut-cooked-other-id',
  ingredientName: '熟花生米',
  aliases: [],
  category: '调料',
  defaultUnit: 'g',
};

const ING_CHICKEN: Omit<DishIngredientView, 'qty' | 'unit' | 'optional'> = {
  ingredientId: 'ing-chicken',
  ingredientName: '鸡胸肉',
  aliases: [],
  category: '肉类',
  defaultUnit: 'g',
};

const ING_LETTUCE: Omit<DishIngredientView, 'qty' | 'unit' | 'optional'> = {
  ingredientId: 'ing-lettuce',
  ingredientName: '生菜',
  aliases: [],
  category: '蔬菜',
  defaultUnit: 'g',
};

function di(
  ing: Omit<DishIngredientView, 'qty' | 'unit' | 'optional'>,
  qty: number,
  unit: string,
  optional = false,
): DishIngredientView {
  return { ...ing, qty, unit, optional };
}

// 宫保鸡丁真实形态：菜名与 flavorTags 均不含"花生"二字，花生米 optional=false
const DISH_KONGBAO: DishView = {
  id: 'dish-kongbao-chicken',
  name: '宫保鸡丁',
  mealRole: 'MAIN',
  cuisine: '川菜',
  flavorTags: ['香辣', '下饭'],
  spicyLevel: 2,
  splitFlavor: false,
  activeMinutes: 20,
  totalMinutes: 25,
  equipment: ['wok'],
  steps: [{ order: 1, text: '爆炒' }],
  status: 'PUBLISHED',
  ingredients: [di(ING_CHICKEN, 200, 'g'), di(ING_PEANUT, 50, 'g')],
};

// 蚝油生菜真实形态：花生米 optional=true
const DISH_LETTUCE: DishView = {
  id: 'dish-oyster-lettuce',
  name: '蚝油生菜',
  mealRole: 'SIDE',
  cuisine: '粤菜',
  flavorTags: ['清淡'],
  spicyLevel: 0,
  splitFlavor: false,
  activeMinutes: 10,
  totalMinutes: 15,
  equipment: ['wok'],
  steps: [{ order: 1, text: '快炒' }],
  status: 'PUBLISHED',
  ingredients: [di(ING_LETTUCE, 300, 'g'), di(ING_PEANUT, 10, 'g', true)],
};

// 含花生油（非花生米）的清炒时蔬：精确等值不误伤口径
const DISH_VEG_OIL: DishView = {
  id: 'dish-veg-peanut-oil',
  name: '清炒时蔬',
  mealRole: 'SIDE',
  cuisine: '家常',
  flavorTags: ['清淡'],
  spicyLevel: 0,
  splitFlavor: false,
  activeMinutes: 8,
  totalMinutes: 10,
  equipment: ['wok'],
  steps: [{ order: 1, text: '快炒' }],
  status: 'PUBLISHED',
  ingredients: [di(ING_LETTUCE, 300, 'g'), di(ING_PEANUT_OIL, 15, 'g')],
};

// 含熟花生米（不同 id、名称=别名）的凉拌菜：别名归一口径
const DISH_COLD_CUCUMBER: DishView = {
  id: 'dish-cold-cucumber',
  name: '凉拌黄瓜',
  mealRole: 'SIDE',
  cuisine: '家常',
  flavorTags: ['清爽'],
  spicyLevel: 0,
  splitFlavor: false,
  activeMinutes: 8,
  totalMinutes: 10,
  equipment: [],
  steps: [{ order: 1, text: '拌制' }],
  status: 'PUBLISHED',
  ingredients: [di(ING_COOKED_PEANUT, 20, 'g', true)],
};

function makeMenu(id: string, dishes: DishView[]): MenuView {
  return {
    id,
    name: id + '-menu',
    scene: 'WEEKDAY_FAST',
    serves: 4,
    totalActiveMinutes: dishes.reduce((s, d) => s + d.activeMinutes, 0),
    prepSequence: [],
    status: 'PUBLISHED',
    dishes,
  };
}

const MENU_KONGBAO = makeMenu('menu-kongbao', [DISH_KONGBAO]);
const MENU_LETTUCE = makeMenu('menu-lettuce', [DISH_LETTUCE]);
const MENU_VEG_OIL = makeMenu('menu-veg-oil', [DISH_VEG_OIL]);
const MENU_COLD_CUCUMBER = makeMenu('menu-cold-cucumber', [DISH_COLD_CUCUMBER]);

// HARD+INGREDIENT 真实形态规则（同 seed-excl-peanut-ing：targetId+targetName+targetAliases）
const EX_HARD_PEANUT_ING: ExclusionView = {
  id: 'ex-hard-peanut-ing',
  scope: 'INGREDIENT',
  targetId: 'ing-peanut-real',
  targetName: '花生米',
  targetAliases: ['熟花生米', '油炸花生米'],
  severity: 'HARD',
  note: '孩子花生过敏（食材级）',
};

// HARD+TAG 缺口形态规则（同 seed-excl-peanut：标签词='花生'，而食材名/品类均非该词）
const EX_HARD_PEANUT_TAG: ExclusionView = {
  id: 'ex-hard-peanut-tag',
  scope: 'TAG',
  targetTag: '花生',
  severity: 'HARD',
  note: '孩子花生过敏（标签级，T-C07 缺口形态）',
};

describe('safetyFilter INGREDIENT 通道「食材名≠品类」真实形态（T-C07-FIX 防回退）', () => {
  it('HARD 食材级规则按食材名拦截：食材名(花生米)≠品类(调料)，菜名/标签均不含"花生"，optional=false 被拦', () => {
    const { passed, filtered } = safetyFilter([MENU_KONGBAO], [EX_HARD_PEANUT_ING]);
    expect(filtered.map((f) => f.menuId)).toContain('menu-kongbao');
    expect(passed.map((m) => m.id)).not.toContain('menu-kongbao');
    const trace = filtered.find((f) => f.menuId === 'menu-kongbao')!;
    expect(trace.stage).toBe('safety');
    expect(trace.rule).toContain('花生米');
    expect(trace.rule).toContain('#ex-hard-peanut-ing');
  });

  it('optional=true 的花生米同样被拦：HARD 食材级禁忌不区分 optional（蚝油生菜形态）', () => {
    const { passed, filtered } = safetyFilter([MENU_LETTUCE], [EX_HARD_PEANUT_ING]);
    expect(filtered.map((f) => f.menuId)).toContain('menu-lettuce');
    expect(passed.map((m) => m.id)).not.toContain('menu-lettuce');
    expect(filtered.find((f) => f.menuId === 'menu-lettuce')!.rule).toContain('花生米');
  });

  it('按别名拦截：不同 id 的食材名称=目标别名(熟花生米)仍被拦（别名归一）', () => {
    const { passed, filtered } = safetyFilter([MENU_COLD_CUCUMBER], [EX_HARD_PEANUT_ING]);
    expect(filtered.map((f) => f.menuId)).toContain('menu-cold-cucumber');
    expect(passed.map((m) => m.id)).not.toContain('menu-cold-cucumber');
    expect(filtered.find((f) => f.menuId === 'menu-cold-cucumber')!.rule).toContain('熟花生米');
  });

  it('精确等值不误伤：花生油≠花生米规则，含花生油的菜不被拦', () => {
    const { passed, filtered } = safetyFilter([MENU_VEG_OIL], [EX_HARD_PEANUT_ING]);
    expect(filtered).toHaveLength(0);
    expect(passed.map((m) => m.id)).toContain('menu-veg-oil');
  });

  it('规则仅含 targetId（装配未注入名称）时仍按食材 id 等值拦截', () => {
    const idOnly: ExclusionView = {
      id: 'ex-hard-peanut-id-only',
      scope: 'INGREDIENT',
      targetId: 'ing-peanut-real',
      severity: 'HARD',
    };
    const { passed, filtered } = safetyFilter([MENU_KONGBAO], [idOnly]);
    expect(filtered.map((f) => f.menuId)).toContain('menu-kongbao');
    expect(passed.map((m) => m.id)).not.toContain('menu-kongbao');
  });

  it('口径边界固化（T-C07 缺口形态）：HARD+TAG("花生") 对食材名(花生米)/品类(调料)/flavorTags 均不含"花生"的菜零拦截', () => {
    // 固化现状口径：checkTagScope 只匹配 flavorTags 与食材 category（safety.ts L104-127）。
    // 该零拦截正是 T-C07 缺口，须由 INGREDIENT 规则行补位（见上用例）；若未来 TAG 通道语义
    // 变更（如纳入食材名匹配），本用例应同步更新而非视为回归。
    const { passed, filtered } = safetyFilter(
      [MENU_KONGBAO, MENU_LETTUCE],
      [EX_HARD_PEANUT_TAG],
    );
    expect(filtered).toHaveLength(0);
    expect(passed.map((m) => m.id)).toEqual(['menu-kongbao', 'menu-lettuce']);
  });
});
