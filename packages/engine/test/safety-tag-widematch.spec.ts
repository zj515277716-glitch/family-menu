// packages/engine/test/safety-tag-widematch.spec.ts
// T-A1（复盘 V2 §P0-1）：花生防线引擎侧宽匹配回归集。
//
// 主控决定②（2026-10-03 拍板）：花生口径 = 名称含花生都拦——HARD 规则按食材名/别名
// 宽匹配（含「花生」即拦），接受可能误伤「花生油」（安全侧零侥幸）。
//
// 背景事实（复盘 V2 P0-1）：
// - 真实库花生米 name='花生米'、aliases=['熟花生米','油炸花生米']、category='调料'，
//   由内容管线导入，各环境 id 不同（seed 写死 cuid 换库即悬空）；
// - TAG 规则（targetTag='花生'）原先只查 flavorTags 与食材 category，不查食材名，
//   对全库 49 道菜拦截为 0（T-C07 定案），09-14 生产曾因此失效 8–9 小时。
//
// 本文件口径对齐 tools/content-pipeline/src/allergen.ts（fm-import 侧 TAG 子串宽口径，
// T-C07 S-3 定案）：食材 name/aliases 任一子串含 targetTag 即命中。
import { describe, it, expect } from 'vitest';
import { safetyFilter, filterSafeDishes, recommend } from '../src/index.js';
import type { DishIngredientView, DishView, ExclusionView, MenuView } from '../src/index.js';

// ───── 真实库形态 fixtures（复刻 ingredients-draft.json / seed 花生规则） ─────

// 花生米：名称≠品类词（category='调料'），别名与名称不同词（T-C07 缺口形态）
const ING_PEANUT: Omit<DishIngredientView, 'qty' | 'unit' | 'optional'> = {
  ingredientId: 'ing-peanut-real',
  ingredientName: '花生米',
  aliases: ['熟花生米', '油炸花生米'],
  category: '调料',
  defaultUnit: 'g',
};

// 花生油：名称含「花生」但非花生米——主控决定②明确接受误伤
const ING_PEANUT_OIL: Omit<DishIngredientView, 'qty' | 'unit' | 'optional'> = {
  ingredientId: 'ing-peanut-oil',
  ingredientName: '花生油',
  aliases: [],
  category: '调料',
  defaultUnit: 'g',
};

// 油炸花生米：不同 id、名称=目标别名（别名归一变形）
const ING_FRIED_PEANUT: Omit<DishIngredientView, 'qty' | 'unit' | 'optional'> = {
  ingredientId: 'ing-fried-peanut-other-id',
  ingredientName: '油炸花生米',
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

const ING_TOMATO: Omit<DishIngredientView, 'qty' | 'unit' | 'optional'> = {
  ingredientId: 'ing-tomato',
  ingredientName: '番茄',
  aliases: ['西红柿'],
  category: '蔬菜',
  defaultUnit: 'g',
};

const ING_EGG: Omit<DishIngredientView, 'qty' | 'unit' | 'optional'> = {
  ingredientId: 'ing-egg',
  ingredientName: '鸡蛋',
  aliases: [],
  category: '蛋奶',
  defaultUnit: '个',
};

function di(
  ing: Omit<DishIngredientView, 'qty' | 'unit' | 'optional'>,
  qty: number,
  unit: string,
  optional = false,
): DishIngredientView {
  return { ...ing, qty, unit, optional };
}

function makeDish(id: string, name: string, ings: DishIngredientView[], flavorTags: string[] = []): DishView {
  return {
    id,
    name,
    mealRole: 'MAIN',
    cuisine: '家常',
    flavorTags,
    spicyLevel: 0,
    splitFlavor: false,
    activeMinutes: 15,
    totalMinutes: 20,
    equipment: ['wok'],
    steps: [{ order: 1, text: '烹制' }],
    status: 'PUBLISHED',
    ingredients: ings,
  };
}

function makeMenu(id: string, dishes: DishView[]): MenuView {
  return {
    id,
    name: id + '-menu',
    scene: 'WEEKDAY_FAST',
    serves: 4,
    totalActiveMinutes: 25,
    prepSequence: [],
    status: 'PUBLISHED',
    dishes,
  };
}

// 宫保鸡丁真实形态：菜名/flavorTags/category 均不含「花生」，花生米 optional=false
const DISH_KONGBAO = makeDish('dish-kongbao', '宫保鸡丁', [di(ING_CHICKEN, 200, 'g'), di(ING_PEANUT, 50, 'g')]);
// 蚝油生菜形态：花生米 optional=true
const DISH_LETTUCE = makeDish('dish-lettuce', '蚝油生菜', [di(ING_PEANUT, 10, 'g', true)]);
// 清炒时蔬：含花生油（非花生米）——决定②误伤接受口径
const DISH_VEG_OIL = makeDish('dish-veg-oil', '清炒时蔬', [di(ING_PEANUT_OIL, 15, 'ml')]);
// 凉拌菜：别名变形（不同 id、名称=油炸花生米）
const DISH_COLD = makeDish('dish-cold', '凉拌花生', [di(ING_FRIED_PEANUT, 20, 'g', true)]);
// 安全对照：番茄炒蛋
const DISH_TOMATO_EGG = makeDish('dish-tomato-egg', '番茄炒蛋', [di(ING_TOMATO, 200, 'g'), di(ING_EGG, 2, '个')], ['清淡']);

const MENU_KONGBAO = makeMenu('menu-kongbao', [DISH_KONGBAO]);
const MENU_LETTUCE = makeMenu('menu-lettuce', [DISH_LETTUCE]);
const MENU_VEG_OIL = makeMenu('menu-veg-oil', [DISH_VEG_OIL]);
const MENU_COLD = makeMenu('menu-cold', [DISH_COLD]);
const MENU_TOMATO_EGG = makeMenu('menu-tomato-egg', [DISH_TOMATO_EGG]);

// ───── 规则形态：复刻 seed-data.ts 现状（修复前悬空 / 修复后稳定 ID） ─────

// seed-excl-peanut：HARD+TAG('花生')
const EX_HARD_PEANUT_TAG: ExclusionView = {
  id: 'seed-excl-peanut',
  scope: 'TAG',
  targetTag: '花生',
  severity: 'HARD',
  note: '孩子花生过敏',
};

// seed-excl-peanut-ing 悬空形态：新库上 targetId 指向不存在的 cuid，join 不到食材行
// -> targetName/targetAliases 缺省，nameSet 仅含 targetId（= P0-1 失守形态）
const EX_HARD_PEANUT_ING_DANGLING: ExclusionView = {
  id: 'seed-excl-peanut-ing',
  scope: 'INGREDIENT',
  targetId: 'cmtvnuvxvc2oy5fdrzhpxxe69',
  severity: 'HARD',
  note: '孩子花生过敏（食材级：花生米/熟花生米/油炸花生米）',
};

const HARD_SET = [EX_HARD_PEANUT_TAG, EX_HARD_PEANUT_ING_DANGLING];

const FAMILY_RULE = {
  familyId: 'seed-family',
  defaultPeople: 4,
  timeBudgets: [30, 60],
  equipment: ['wok', 'rice_cooker', 'steamer'],
  cuisines: ['家常', '湘菜'],
};

describe('HARD 花生宽匹配：名称含「花生」即拦（主控决定② / T-A1）', () => {
  it('悬空 targetId 现状下，含花生米的菜单仍被 TAG 宽匹配拦（安全层）', () => {
    // 修复前：TAG 不查食材名 + INGREDIENT nameSet 仅含悬空 targetId -> 0 拦截（P0-1 失守形态）
    const { passed, filtered } = safetyFilter([MENU_KONGBAO, MENU_TOMATO_EGG], HARD_SET);
    expect(filtered.map((f) => f.menuId)).toContain('menu-kongbao');
    expect(passed.map((m) => m.id)).not.toContain('menu-kongbao');
    expect(passed.map((m) => m.id)).toContain('menu-tomato-egg');
    const trace = filtered.find((f) => f.menuId === 'menu-kongbao')!;
    expect(trace.stage).toBe('safety');
    expect(trace.rule).toContain('花生米');
    expect(trace.rule).toContain('#seed-excl-peanut');
  });

  it('候选/换菜池 dish 级同样被拦（filterSafeDishes，T-P16 组合层预过滤口径）', () => {
    const { passed, excluded } = filterSafeDishes([DISH_KONGBAO, DISH_TOMATO_EGG], HARD_SET);
    expect(excluded.map((e) => e.dish.id)).toContain('dish-kongbao');
    expect(passed.map((d) => d.id)).not.toContain('dish-kongbao');
    expect(excluded.find((e) => e.dish.id === 'dish-kongbao')!.reason).toContain('花生米');
  });

  it('optional=true 的花生米同样被拦（蚝油生菜形态）', () => {
    const { passed, filtered } = safetyFilter([MENU_LETTUCE], HARD_SET);
    expect(filtered.map((f) => f.menuId)).toContain('menu-lettuce');
    expect(passed).toHaveLength(0);
  });

  it('别名宽匹配：不同 id 的「油炸花生米」（名称=目标别名）被拦', () => {
    const { passed, filtered } = safetyFilter([MENU_COLD], HARD_SET);
    expect(filtered.map((f) => f.menuId)).toContain('menu-cold');
    expect(passed).toHaveLength(0);
    expect(filtered[0].rule).toContain('油炸花生米');
  });

  it('主控决定②误伤口径固化：含花生油的菜也被拦（安全侧零侥幸）', () => {
    const { passed, filtered } = safetyFilter([MENU_VEG_OIL], HARD_SET);
    expect(filtered.map((f) => f.menuId)).toContain('menu-veg-oil');
    expect(passed).toHaveLength(0);
    expect(filtered[0].rule).toContain('花生油');
  });

  it('推荐主链路：含花生米的菜单不进入 candidates（安全层先于评分）', () => {
    const result = recommend({
      rules: FAMILY_RULE,
      exclusions: HARD_SET,
      context: { people: 4, timeBudgetMin: 60, mustUseIngredients: [] },
      library: [MENU_KONGBAO, MENU_TOMATO_EGG],
      history: [],
    });
    expect(result.candidates.map((c) => c.menuId)).not.toContain('menu-kongbao');
    expect(result.filtered.find((f) => f.menuId === 'menu-kongbao')?.stage).toBe('safety');
  });

  it('不过过滤扩大化：非花生菜（番茄炒蛋）在宽匹配下照常通过', () => {
    const { passed } = safetyFilter([MENU_TOMATO_EGG], HARD_SET);
    expect(passed.map((m) => m.id)).toEqual(['menu-tomato-egg']);
  });

  it('SOFT TAG 宽匹配不生效（HARD-only 口径不变，SOFT 仍只降权不过滤）', () => {
    const softTag: ExclusionView = { ...EX_HARD_PEANUT_TAG, id: 'seed-excl-peanut-soft', severity: 'SOFT' };
    const { passed, filtered } = safetyFilter([MENU_KONGBAO], [softTag]);
    expect(filtered).toHaveLength(0);
    expect(passed.map((m) => m.id)).toContain('menu-kongbao');
  });
});
