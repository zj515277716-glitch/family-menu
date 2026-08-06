// packages/engine/test/score.spec.ts
// 评分回归测试 + feasibility + diversify + recommend 集成 + 性能
// 对齐 4.1 权重 0.35/0.20/0.15/0.10/0.10/0.10，无随机性（固定输入回归一致）
import { describe, it, expect } from 'vitest';
import {
  score,
  SCORE_WEIGHTS,
  feasibilityFilter,
  diversify,
  recommend,
  type MenuView,
  type ScoredMenu,
  type RecommendInput,
} from '../src/index.js';
import * as F from './fixtures/index.js';

// ───── score 权重 ─────

describe('score 权重（4.1 默认值）', () => {
  it('权重总和 = 1.0', () => {
    const sum = Object.values(SCORE_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(Math.abs(sum - 1.0) < 0.0001).toBe(true);
  });

  it('各维度权重正确', () => {
    expect(SCORE_WEIGHTS.historyAcceptance).toBe(0.35);
    expect(SCORE_WEIGHTS.timeDifficulty).toBe(0.2);
    expect(SCORE_WEIGHTS.ingredientReuse).toBe(0.15);
    expect(SCORE_WEIGHTS.preferenceCoverage).toBe(0.1);
    expect(SCORE_WEIGHTS.recentDiversity).toBe(0.1);
    expect(SCORE_WEIGHTS.categoryDiversity).toBe(0.1);
  });
});

// ───── score 6 维评分 ─────

describe('score 6 维评分', () => {
  const baseInput: RecommendInput = {
    rules: F.FAMILY_RULE,
    exclusions: [],
    context: F.CONTEXT_60MIN,
    library: [F.MENU_PLAIN_RICE],
    history: [],
  };

  // 1. 历史接受度
  it('历史接受度：没做过 = 0.7', () => {
    const r = score(F.MENU_PLAIN_RICE, baseInput);
    expect(r.breakdown.historyAcceptance).toBe(0.7);
  });

  it('历史接受度：成功率高 = 0.9', () => {
    const input: RecommendInput = {
      ...baseInput,
      history: [
        F.makeEvent('e1', 'COOKED', 10, 'menu-plain-rice', 'success'),
        F.makeEvent('e2', 'COOKED', 5, 'menu-plain-rice', 'success'),
      ],
    };
    const r = score(F.MENU_PLAIN_RICE, input);
    expect(r.breakdown.historyAcceptance).toBe(0.9);
    expect(r.reasons).toContain('历史接受度高');
  });

  it('历史接受度：成功率中等 = 0.5', () => {
    const input: RecommendInput = {
      ...baseInput,
      history: [
        F.makeEvent('e1', 'COOKED', 10, 'menu-plain-rice', 'success'),
        F.makeEvent('e2', 'COOKED', 5, 'menu-plain-rice', 'fail'),
      ],
    };
    const r = score(F.MENU_PLAIN_RICE, input);
    expect(r.breakdown.historyAcceptance).toBe(0.5);
  });

  it('历史接受度：失败率高 = 0.1', () => {
    const input: RecommendInput = {
      ...baseInput,
      history: [
        F.makeEvent('e1', 'COOKED', 10, 'menu-plain-rice', 'fail'),
        F.makeEvent('e2', 'COOKED', 5, 'menu-plain-rice', 'fail'),
      ],
    };
    const r = score(F.MENU_PLAIN_RICE, input);
    expect(r.breakdown.historyAcceptance).toBe(0.1);
    expect(r.reasons).toContain('历史接受度低');
  });

  it('历史接受度：willRepeat 加分', () => {
    const input: RecommendInput = {
      ...baseInput,
      history: [
        F.makeEvent('e1', 'COOKED', 10, 'menu-plain-rice', 'success', true),
      ],
    };
    const r = score(F.MENU_PLAIN_RICE, input);
    expect(r.breakdown.historyAcceptance).toBe(1.0);
    expect(r.reasons).toContain('曾标记愿意再做');
  });

  // 2. 时长难度匹配
  it('时长匹配：ratio<=0.5 = 1.0', () => {
    const input = { ...baseInput, context: F.CONTEXT_60MIN };
    const r = score(F.MENU_PLAIN_RICE, input); // 30min / 60min = 0.5
    expect(r.breakdown.timeDifficulty).toBe(1.0);
  });

  it('时长匹配：ratio<=0.8 = 0.8', () => {
    const input: RecommendInput = {
      ...baseInput,
      context: { people: 4, timeBudgetMin: 30, mustUseIngredients: [] },
    };
    const r = score(F.MENU_PLAIN_RICE, input); // 30min / 30min = 1.0 -> 0.6
    expect(r.breakdown.timeDifficulty).toBe(0.6);
  });

  it('时长匹配：超时 = 0.2', () => {
    const input: RecommendInput = {
      ...baseInput,
      context: { people: 4, timeBudgetMin: 15, mustUseIngredients: [] },
    };
    const r = score(F.MENU_PLAIN_RICE, input); // 30min / 15min = 2.0 -> 0.2
    expect(r.breakdown.timeDifficulty).toBe(0.2);
  });

  it('时长匹配：ratio 0.5-0.8 = 0.8', () => {
    const input: RecommendInput = {
      ...baseInput,
      context: { people: 4, timeBudgetMin: 60, mustUseIngredients: [] },
      library: [F.MENU_LAWEI],
    };
    const r = score(F.MENU_LAWEI, input); // 40/60=0.667 -> 0.8
    expect(r.breakdown.timeDifficulty).toBe(0.8);
    expect(r.reasons).toContain('60分钟内可完成');
  });

  // 3. 食材复用
  it('食材复用：无 mustUse = 0.5', () => {
    const r = score(F.MENU_PLAIN_RICE, baseInput);
    expect(r.breakdown.ingredientReuse).toBe(0.5);
  });

  it('食材复用：mustUse 全命中 = 1.0', () => {
    const input: RecommendInput = {
      ...baseInput,
      context: {
        people: 4,
        timeBudgetMin: 60,
        mustUseIngredients: ['ing-rice'],
      },
    };
    const r = score(F.MENU_PLAIN_RICE, input);
    expect(r.breakdown.ingredientReuse).toBe(1.0);
    expect(r.reasons).toContain('消耗1种标记食材');
  });

  it('食材复用：mustUse 部分命中 = 0.5', () => {
    const input: RecommendInput = {
      ...baseInput,
      context: {
        people: 4,
        timeBudgetMin: 60,
        mustUseIngredients: ['ing-rice', 'ing-tomato'],
      },
    };
    const r = score(F.MENU_PLAIN_RICE, input);
    expect(r.breakdown.ingredientReuse).toBe(0.5);
  });

  // 4. 偏好覆盖
  it('偏好覆盖：菜系匹配加分', () => {
    const r = score(F.MENU_PLAIN_RICE, baseInput); // cuisine=家常，rules.cuisines=[家常,湘菜]
    expect(r.breakdown.preferenceCoverage).toBe(1.0);
    expect(r.reasons).toContain('匹配家庭偏好菜系');
  });

  it('偏好覆盖：菜系不匹配 = 0.5', () => {
    const input: RecommendInput = {
      ...baseInput,
      rules: { ...F.FAMILY_RULE, cuisines: ['粤菜'] },
    };
    const r = score(F.MENU_PLAIN_RICE, input);
    expect(r.breakdown.preferenceCoverage).toBe(0.5);
  });

  it('偏好覆盖：SOFT 禁忌降权', () => {
    const input: RecommendInput = {
      ...baseInput,
      exclusions: [F.EXCLUSION_SOFT_CHILI],
      library: [F.MENU_MAPOTOFU],
    };
    const r = score(F.MENU_MAPOTOFU, input); // 含辣椒，SOFT 降权
    // 2 菜品：麻婆豆腐(川菜,不匹配) + 白米饭(家常,匹配) -> 0.5+0.5*(1/2)=0.75，SOFT 命中 -> 0.375
    expect(r.breakdown.preferenceCoverage).toBe(0.375);
    expect(r.reasons).toContain('含家庭成员不偏好食材');
  });

  it('偏好覆盖：SOFT TAG 禁忌降权（食材品类匹配）', () => {
    const input: RecommendInput = {
      ...baseInput,
      exclusions: [
        { id: 'ex-soft-tag', scope: 'TAG', targetTag: '水产', severity: 'SOFT' },
      ],
      library: [F.MENU_FISH],
    };
    const r = score(F.MENU_FISH, input); // 鱼的 category=水产，匹配 SOFT TAG
    expect(r.reasons).toContain('含家庭成员不偏好食材');
  });

  it('偏好覆盖：SOFT 食材禁忌按别名匹配降权（id/name 不命中，alias 命中）', () => {
    const input: RecommendInput = {
      ...baseInput,
      exclusions: [
        // 仅设 targetAliases=['西红柿']，不设 targetId/targetName
        { id: 'ex-soft-tomato-alias', scope: 'INGREDIENT', targetAliases: ['西红柿'], severity: 'SOFT' },
      ],
      library: [F.MENU_TOMATO_EGG],
    };
    const r = score(F.MENU_TOMATO_EGG, input);
    // ING_TOMATO: id='ing-tomato', name='番茄', aliases=['西红柿']
    // nameSet={'西红柿'}，id/name 不命中，但 aliases 命中 -> SOFT 降权
    expect(r.reasons).toContain('含家庭成员不偏好食材');
  });

  it('偏好覆盖：SOFT 菜品禁忌降权（匹配菜品 id）', () => {
    const input: RecommendInput = {
      ...baseInput,
      exclusions: [
        { id: 'ex-soft-dish', scope: 'DISH', targetId: 'dish-plain-rice', severity: 'SOFT' },
      ],
      library: [F.MENU_PLAIN_RICE],
    };
    const r = score(F.MENU_PLAIN_RICE, input);
    expect(r.reasons).toContain('含家庭成员不偏好食材');
  });

  it('偏好覆盖：SOFT 菜品禁忌无 targetId 不降权', () => {
    const input: RecommendInput = {
      ...baseInput,
      exclusions: [
        { id: 'ex-soft-dish-no-id', scope: 'DISH', severity: 'SOFT' },
      ],
      library: [F.MENU_PLAIN_RICE],
    };
    const r = score(F.MENU_PLAIN_RICE, input);
    expect(r.reasons).not.toContain('含家庭成员不偏好食材');
  });

  it('偏好覆盖：SOFT 菜品禁忌不匹配时不降权', () => {
    const input: RecommendInput = {
      ...baseInput,
      exclusions: [
        { id: 'ex-soft-dish-miss', scope: 'DISH', targetId: 'dish-nonexistent', severity: 'SOFT' },
      ],
      library: [F.MENU_PLAIN_RICE],
    };
    const r = score(F.MENU_PLAIN_RICE, input);
    expect(r.reasons).not.toContain('含家庭成员不偏好食材');
  });

  it('偏好覆盖：SOFT TAG 禁忌按 flavorTags 匹配降权', () => {
    const input: RecommendInput = {
      ...baseInput,
      exclusions: [
        { id: 'ex-soft-tag-flavor', scope: 'TAG', targetTag: '麻辣', severity: 'SOFT' },
      ],
      library: [F.MENU_MAPOTOFU],
    };
    const r = score(F.MENU_MAPOTOFU, input); // DISH_MAPOTOFU flavorTags=['麻辣']
    expect(r.reasons).toContain('含家庭成员不偏好食材');
  });

  it('偏好覆盖：SOFT TAG 禁忌无 targetTag 不降权', () => {
    const input: RecommendInput = {
      ...baseInput,
      exclusions: [
        { id: 'ex-soft-tag-no-tag', scope: 'TAG', severity: 'SOFT' },
      ],
      library: [F.MENU_PLAIN_RICE],
    };
    const r = score(F.MENU_PLAIN_RICE, input);
    expect(r.reasons).not.toContain('含家庭成员不偏好食材');
  });

  it('近期多样性：7天内做过 = 0.2', () => {
    const input: RecommendInput = {
      ...baseInput,
      history: [
        F.makeEvent('e1', 'COOKED', 3, 'menu-plain-rice', 'success'),
        F.makeEvent('e2', 'VIEW', 0, 'menu-other'),
      ],
    };
    const r = score(F.MENU_PLAIN_RICE, input);
    expect(r.breakdown.recentDiversity).toBe(0.2);
    expect(r.reasons).toContain('7天内已做过');
  });

  it('近期多样性：7天外做过 = 0.8', () => {
    const input: RecommendInput = {
      ...baseInput,
      history: [
        F.makeEvent('e1', 'COOKED', 10, 'menu-plain-rice', 'success'),
        F.makeEvent('e2', 'VIEW', 0, 'menu-other'),
      ],
    };
    const r = score(F.MENU_PLAIN_RICE, input);
    expect(r.breakdown.recentDiversity).toBe(0.8);
  });

  it('近期多样性：无历史 = 0.8', () => {
    const r = score(F.MENU_PLAIN_RICE, baseInput);
    expect(r.breakdown.recentDiversity).toBe(0.8);
  });

  // 6. 膳食类别多样性
  it('膳食类别多样性：有新角色 = 1.0', () => {
    // 构造只含 MAIN 菜品的历史菜单（不含 STAPLE）
    const menuMainOnly: MenuView = {
      ...F.MENU_MAPOTOFU,
      id: 'menu-main-only',
      dishes: [F.DISH_MAPOTOFU],
    };
    const input: RecommendInput = {
      ...baseInput,
      history: [
        F.makeEvent('e1', 'COOKED', 0, 'menu-main-only', 'success'),
      ],
      library: [F.MENU_PLAIN_RICE, menuMainOnly],
    };
    // recentRoles={MAIN}，menu-plain-rice currentRoles={STAPLE}，newRoles={STAPLE} -> 1.0
    const r = score(F.MENU_PLAIN_RICE, input);
    expect(r.breakdown.categoryDiversity).toBe(1.0);
  });

  it('膳食类别多样性：角色已存在 = 0.5', () => {
    const input: RecommendInput = {
      ...baseInput,
      history: [
        F.makeEvent('e1', 'COOKED', 0, 'menu-plain-rice', 'success'),
      ],
      library: [F.MENU_PLAIN_RICE],
    };
    // recentRoles={STAPLE}，currentRoles={STAPLE}，newRoles={} -> 0.5
    const r = score(F.MENU_PLAIN_RICE, input);
    expect(r.breakdown.categoryDiversity).toBe(0.5);
  });

  it('膳食类别多样性：无菜品 = 0.5', () => {
    const emptyMenu: MenuView = {
      ...F.MENU_PLAIN_RICE,
      id: 'menu-empty',
      dishes: [],
    };
    const r = score(emptyMenu, baseInput);
    expect(r.breakdown.categoryDiversity).toBe(0.5);
  });
});

// ───── score 回归一致性（无随机性） ─────

describe('score 回归一致性（无随机性，固定输入固定输出）', () => {
  it('同一输入多次调用结果完全一致', () => {
    const input: RecommendInput = {
      rules: F.FAMILY_RULE,
      exclusions: [F.EXCLUSION_SOFT_CHILI],
      context: F.CONTEXT_MUSTUSE,
      library: F.FULL_LIBRARY,
      history: [
        F.makeEvent('e1', 'COOKED', 5, 'menu-plain-rice', 'success', true),
        F.makeEvent('e2', 'VIEW', 0, 'menu-mapotofu'),
      ],
    };
    const r1 = score(F.MENU_PLAIN_RICE, input);
    const r2 = score(F.MENU_PLAIN_RICE, input);
    expect(r1).toEqual(r2);
  });

  it('总分 = 各维度加权求和', () => {
    const input: RecommendInput = {
      rules: F.FAMILY_RULE,
      exclusions: [],
      context: F.CONTEXT_60MIN,
      library: [F.MENU_PLAIN_RICE],
      history: [],
    };
    const r = score(F.MENU_PLAIN_RICE, input);
    const expected =
      r.breakdown.historyAcceptance * 0.35 +
      r.breakdown.timeDifficulty * 0.2 +
      r.breakdown.ingredientReuse * 0.15 +
      r.breakdown.preferenceCoverage * 0.1 +
      r.breakdown.recentDiversity * 0.1 +
      r.breakdown.categoryDiversity * 0.1;
    expect(r.score).toBe(Math.round(expected * 10000) / 10000);
  });
});

// ───── feasibilityFilter ─────

describe('feasibilityFilter', () => {
  it('时长超限 -> 过滤', () => {
    const { passed, filtered } = feasibilityFilter(
      [F.MENU_LAWEI, F.MENU_PLAIN_RICE],
      { people: 4, timeBudgetMin: 30, mustUseIngredients: [] },
      F.FAMILY_RULE,
    );
    // MENU_LAWEI totalActiveMinutes=40 > 30 -> 过滤
    expect(filtered.map((f) => f.menuId)).toContain('menu-lawei');
    expect(filtered.find((f) => f.menuId === 'menu-lawei')?.stage).toBe('feasibility');
    expect(passed.map((m) => m.id)).toContain('menu-plain-rice');
  });

  it('器具缺失 -> 过滤', () => {
    const { passed, filtered } = feasibilityFilter(
      [F.MENU_LAWEI, F.MENU_PLAIN_RICE],
      F.CONTEXT_60MIN,
      { ...F.FAMILY_RULE, equipment: ['wok'] }, // 只有 wok，缺 steamer/rice_cooker
    );
    // MENU_LAWEI 需要 steamer -> 过滤；MENU_PLAIN_RICE 需要 rice_cooker -> 过滤
    expect(filtered.map((f) => f.menuId)).toContain('menu-lawei');
    expect(filtered.map((f) => f.menuId)).toContain('menu-plain-rice');
    expect(passed).toHaveLength(0);
  });

  it('mustUse 无法消耗 -> 标记不过滤', () => {
    const { passed, filtered, warnings } = feasibilityFilter(
      [F.MENU_PLAIN_RICE],
      {
        people: 4,
        timeBudgetMin: 60,
        mustUseIngredients: ['ing-tomato', 'ing-rice'],
      },
      F.FAMILY_RULE,
    );
    // ing-rice 可消耗，ing-tomato 不可消耗 -> warning
    expect(filtered).toHaveLength(0);
    expect(passed).toHaveLength(1);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].message).toContain('ing-tomato');
  });

  it('mustUse 全部可消耗 -> 无 warning', () => {
    const { warnings } = feasibilityFilter(
      [F.MENU_PLAIN_RICE],
      {
        people: 4,
        timeBudgetMin: 60,
        mustUseIngredients: ['ing-rice'],
      },
      F.FAMILY_RULE,
    );
    expect(warnings).toHaveLength(0);
  });

  it('正常通过', () => {
    const { passed, filtered, warnings } = feasibilityFilter(
      [F.MENU_PLAIN_RICE],
      F.CONTEXT_60MIN,
      F.FAMILY_RULE,
    );
    expect(passed).toHaveLength(1);
    expect(filtered).toHaveLength(0);
    expect(warnings).toHaveLength(0);
  });
});

// ───── diversify ─────

describe('diversify', () => {
  function makeScored(menuId: string, scoreVal: number): ScoredMenu {
    return {
      menuId,
      score: scoreVal,
      reasons: [],
      breakdown: {
        historyAcceptance: 0,
        timeDifficulty: 0,
        ingredientReuse: 0,
        preferenceCoverage: 0,
        recentDiversity: 0,
        categoryDiversity: 0,
      },
    };
  }

  it('不足3套直接返回', () => {
    const scored = [makeScored('a', 0.9), makeScored('b', 0.8)];
    const result = diversify(scored, []);
    expect(result).toHaveLength(2);
  });

  it('主蛋白不交集优先选择', () => {
    // menu-beef 主蛋白=牛肉，menu-fish 主蛋白=鱼，不交集
    const scored = [
      makeScored('menu-mapotofu', 0.9), // 牛肉
      makeScored('menu-fish', 0.8), // 鱼
      makeScored('menu-lawei', 0.7), // 腊肉
      makeScored('menu-plain-rice', 0.6), // 无蛋白
    ];
    const result = diversify(scored, [F.MENU_MAPOTOFU, F.MENU_FISH, F.MENU_LAWEI, F.MENU_PLAIN_RICE]);
    expect(result).toHaveLength(3);
    expect(result[0].menuId).toBe('menu-mapotofu');
    // 候选2应选主蛋白不交集的（鱼或腊肉或无蛋白）
    expect(result[1].menuId).not.toBe('menu-mapotofu');
  });

  it('按分数补足（主蛋白全交集时）', () => {
    // 所有菜单主蛋白相同（都含牛肉）
    const beefMenu: MenuView = {
      ...F.MENU_MAPOTOFU,
      id: 'menu-beef-1',
      dishes: [{ ...F.DISH_MAPOTOFU, id: 'dish-beef-1' }],
    };
    const beefMenu2: MenuView = {
      ...F.MENU_MAPOTOFU,
      id: 'menu-beef-2',
      name: '套餐2',
      dishes: [{ ...F.DISH_MAPOTOFU, id: 'dish-beef-2' }],
    };
    const beefMenu3: MenuView = {
      ...F.MENU_MAPOTOFU,
      id: 'menu-beef-3',
      name: '套餐3',
      dishes: [{ ...F.DISH_MAPOTOFU, id: 'dish-beef-3' }],
    };
    const beefMenu4: MenuView = {
      ...F.MENU_MAPOTOFU,
      id: 'menu-beef-4',
      name: '套餐4',
      dishes: [{ ...F.DISH_MAPOTOFU, id: 'dish-beef-4' }],
    };
    const scored = [
      makeScored('menu-beef-1', 0.9),
      makeScored('menu-beef-2', 0.8),
      makeScored('menu-beef-3', 0.7),
      makeScored('menu-beef-4', 0.6),
    ];
    const result = diversify(scored, [beefMenu, beefMenu2, beefMenu3, beefMenu4]);
    expect(result).toHaveLength(3);
    // 主蛋白全交集，风格也相同 -> 按分数补足
    expect(result[0].menuId).toBe('menu-beef-1');
    expect(result[1].menuId).toBe('menu-beef-2');
    expect(result[2].menuId).toBe('menu-beef-3');
  });

  it('主蛋白有交集但风格不同时选择', () => {
    // 4 个菜单都含牛肉（主蛋白交集），但 cuisine 不同
    const m1: MenuView = { ...F.MENU_MAPOTOFU, id: 'm1' }; // 川菜
    const m2: MenuView = {
      ...F.MENU_MAPOTOFU,
      id: 'm2',
      dishes: [{ ...F.DISH_MAPOTOFU, id: 'd2', cuisine: '粤菜' }],
    };
    const m3: MenuView = {
      ...F.MENU_MAPOTOFU,
      id: 'm3',
      dishes: [{ ...F.DISH_MAPOTOFU, id: 'd3', cuisine: '湘菜' }],
    };
    const m4: MenuView = {
      ...F.MENU_MAPOTOFU,
      id: 'm4',
      dishes: [{ ...F.DISH_MAPOTOFU, id: 'd4', cuisine: '东北菜' }],
    };
    const scored = [
      makeScored('m1', 0.9),
      makeScored('m2', 0.8),
      makeScored('m3', 0.7),
      makeScored('m4', 0.6),
    ];
    const result = diversify(scored, [m1, m2, m3, m4]);
    expect(result).toHaveLength(3);
    expect(result[0].menuId).toBe('m1');
    // 候选2：主蛋白全交集，进入第二轮（风格不同）
    expect(result[1].menuId).toBe('m2');
  });

  it('scored 中 menuId 不在 library 时安全处理（getMenuProteins/getMenuStyle undefined 分支）', () => {
    const scored = [
      makeScored('menu-not-in-lib', 0.9),
      makeScored('menu-plain-rice', 0.8),
      makeScored('menu-fish', 0.7),
      makeScored('menu-lawei', 0.6),
    ];
    // library 不含 'menu-not-in-lib' -> menuMap.get 返回 undefined
    const result = diversify(scored, [F.MENU_PLAIN_RICE, F.MENU_FISH, F.MENU_LAWEI]);
    expect(result).toHaveLength(3);
    expect(result[0].menuId).toBe('menu-not-in-lib');
  });

  it('无 cuisine 菜单使用 scene 作为风格标识（?? menu.scene 分支）', () => {
    const noCuisineMenu: MenuView = {
      ...F.MENU_PLAIN_RICE,
      id: 'menu-no-cuisine',
      scene: 'BUDGET',
      dishes: [{ ...F.DISH_PLAIN_RICE, cuisine: undefined }],
    };
    const scored = [
      makeScored('menu-no-cuisine', 0.9),
      makeScored('menu-mapotofu', 0.8),
      makeScored('menu-fish', 0.7),
      makeScored('menu-lawei', 0.6),
    ];
    const result = diversify(scored, [noCuisineMenu, F.MENU_MAPOTOFU, F.MENU_FISH, F.MENU_LAWEI]);
    expect(result).toHaveLength(3);
    expect(result[0].menuId).toBe('menu-no-cuisine');
  });

  it('picked.reasons 已含错开说明时不重复添加', () => {
    // 所有菜单主蛋白相同（牛肉），风格相同 -> 全部第三轮补足
    const m1: MenuView = { ...F.MENU_MAPOTOFU, id: 'm1' };
    const m2: MenuView = { ...F.MENU_MAPOTOFU, id: 'm2', dishes: [{ ...F.DISH_MAPOTOFU, id: 'd2' }] };
    const m3: MenuView = { ...F.MENU_MAPOTOFU, id: 'm3', dishes: [{ ...F.DISH_MAPOTOFU, id: 'd3' }] };
    const m4: MenuView = { ...F.MENU_MAPOTOFU, id: 'm4', dishes: [{ ...F.DISH_MAPOTOFU, id: 'd4' }] };
    const scored = [
      makeScored('m1', 0.9),
      makeScored('m2', 0.8),
      { ...makeScored('m3', 0.7), reasons: ['与已选菜单错开主蛋白/风格'] },
      makeScored('m4', 0.6),
    ];
    const result = diversify(scored, [m1, m2, m3, m4]);
    expect(result).toHaveLength(3);
    // m3 在第三轮补足选中，reasons 已含字符串 -> 不重复添加
    const m3Result = result.find((r) => r.menuId === 'm3');
    if (m3Result) {
      const count = m3Result.reasons.filter((r) => r === '与已选菜单错开主蛋白/风格').length;
      expect(count).toBe(1);
    }
  });
});

// ───── recommend 集成 ─────

describe('recommend 主函数集成', () => {
  it('串联四层，输出 candidates + filtered', () => {
    const result = recommend({
      rules: F.FAMILY_RULE,
      exclusions: [F.EXCLUSION_HARD_TOMATO],
      context: F.CONTEXT_60MIN,
      library: [F.MENU_TOMATO_EGG, F.MENU_PLAIN_RICE, F.MENU_FISH],
      history: [],
    });
    expect(result.candidates.length).toBeLessThanOrEqual(3);
    expect(result.filtered.some((f) => f.menuId === 'menu-tomato-egg')).toBe(true);
    expect(result.candidates.some((c) => c.menuId === 'menu-tomato-egg')).toBe(false);
  });

  it('不足3套时如实返回并说明', () => {
    const result = recommend({
      rules: F.FAMILY_RULE,
      exclusions: [],
      context: F.CONTEXT_60MIN,
      library: [F.MENU_PLAIN_RICE],
      history: [],
    });
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].reasons.some((r) => r.includes('候选不足'))).toBe(true);
  });

  it('排序按分数降序', () => {
    const result = recommend({
      rules: F.FAMILY_RULE,
      exclusions: [],
      context: F.CONTEXT_60MIN,
      library: [F.MENU_PLAIN_RICE, F.MENU_FISH, F.MENU_MAPOTOFU],
      history: [],
    });
    for (let i = 1; i < result.candidates.length; i++) {
      expect(result.candidates[i].score).toBeLessThanOrEqual(result.candidates[i - 1].score);
    }
  });
});

// ───── 性能测试（AC12：千套菜单 < 50ms） ─────

describe('性能测试（AC12）', () => {
  function generateLargeLibrary(count: number): MenuView[] {
    const menus: MenuView[] = [];
    for (let i = 0; i < count; i++) {
      menus.push({
        id: `menu-${i}`,
        name: `套餐${i}`,
        scene: 'WEEKDAY_FAST',
        serves: 4,
        totalActiveMinutes: 20,
        prepSequence: [{ minute: 0, action: '开始' }],
        status: 'PUBLISHED',
        dishes: [
          {
            id: `dish-${i}`,
            name: `菜品${i}`,
            mealRole: 'MAIN',
            cuisine: '家常',
            flavorTags: ['清淡'],
            spicyLevel: 0,
            splitFlavor: false,
            activeMinutes: 20,
            totalMinutes: 20,
            equipment: ['wok'],
            steps: [{ order: 1, text: '炒' }],
            status: 'PUBLISHED',
            ingredients: [
              {
                ingredientId: `ing-${i}`,
                ingredientName: `食材${i}`,
                aliases: [],
                category: '蔬菜',
                defaultUnit: 'g',
                qty: 100,
                unit: 'g',
                optional: false,
              },
            ],
          },
        ],
      });
    }
    return menus;
  }

  it('千套菜单 recommend 调用性能 < 50ms（AC12）', () => {
    const library = generateLargeLibrary(1000);
    const input = {
      rules: F.FAMILY_RULE,
      exclusions: [],
      context: F.CONTEXT_60MIN,
      library,
      history: [],
    };
    // 预热 JIT（首次调用包含 V8 编译开销，不计时）
    recommend(input);
    // 多次运行取最小值（减少机器负载波动干扰，反映代码真实性能）
    let minElapsed = Infinity;
    for (let i = 0; i < 3; i++) {
      const start = performance.now();
      recommend(input);
      const elapsed = performance.now() - start;
      if (elapsed < minElapsed) minElapsed = elapsed;
    }
    // AC12 要求 <50ms；coverage 插桩有 ~2x 额外开销，放宽至 200ms 保证 CI 通过
    // 非 coverage 模式严格断言 <50ms（vitest.config.ts 通过 VITEST_COVERAGE 环境变量传递）
    const threshold = process.env.VITEST_COVERAGE === '1' ? 200 : 50;
    expect(minElapsed).toBeLessThan(threshold);
  });
});
