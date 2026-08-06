// packages/engine/src/score.ts
// 第三层评分：6 维评分，对齐 4.1 第 271-275 行
// 权重 0.35/0.20/0.15/0.10/0.10/0.10，无随机性（固定输入回归一致）
import type {
  DishIngredientView,
  EventView,
  ExclusionView,
  FamilyRuleView,
  MenuView,
  RecommendInput,
  ScoreDim,
  ScoredMenu,
} from './types.js';

/** 评分权重，对齐 4.1 默认值 */
export const SCORE_WEIGHTS: Record<ScoreDim, number> = {
  historyAcceptance: 0.35,
  timeDifficulty: 0.2,
  ingredientReuse: 0.15,
  preferenceCoverage: 0.1,
  recentDiversity: 0.1,
  categoryDiversity: 0.1,
};

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/** 单个评分维度的计算结果 */
interface ScoreDimResult {
  value: number;
  reasons: string[];
}

/** 近期多样性计算结果（含 recentMenuIds 供类别多样性复用） */
interface RecentDiversityResult extends ScoreDimResult {
  recentMenuIds: Set<string>;
}

// ───── SOFT 禁忌命中检查（拆分自 buildSoftHitChecker，降低圈复杂度） ─────

/** 构建单个禁忌的名称匹配集（含 targetId + targetName + targetAliases） */
function buildExclusionNameSet(ex: ExclusionView): Set<string> {
  const names = new Set<string>();
  if (ex.targetId) names.add(ex.targetId);
  if (ex.targetName) names.add(ex.targetName);
  if (ex.targetAliases) for (const a of ex.targetAliases) names.add(a);
  return names;
}

/** 判断单个食材是否命中禁忌名称集（id + 名称 + 别名） */
function ingredientMatchesNameSet(
  ing: DishIngredientView,
  nameSet: Set<string>,
): boolean {
  return (
    nameSet.has(ing.ingredientId) ||
    nameSet.has(ing.ingredientName) ||
    ing.aliases.some((a) => nameSet.has(a))
  );
}

/** SOFT+INGREDIENT 检查：菜单食材命中禁忌成分 -> true */
function menuHitsSoftIngredient(menu: MenuView, ex: ExclusionView): boolean {
  const nameSet = buildExclusionNameSet(ex);
  if (nameSet.size === 0) return false;
  for (const dish of menu.dishes) {
    for (const ing of dish.ingredients) {
      if (ingredientMatchesNameSet(ing, nameSet)) return true;
    }
  }
  return false;
}

/** SOFT+DISH 检查：菜单含目标菜品 -> true */
function menuHitsSoftDish(menu: MenuView, ex: ExclusionView): boolean {
  if (!ex.targetId) return false;
  for (const dish of menu.dishes) {
    if (dish.id === ex.targetId) return true;
  }
  return false;
}

/** SOFT+TAG 检查：菜品 flavorTags 或食材 category 命中标签 -> true */
function menuHitsSoftTag(menu: MenuView, ex: ExclusionView): boolean {
  if (!ex.targetTag) return false;
  for (const dish of menu.dishes) {
    if (dish.flavorTags.includes(ex.targetTag)) return true;
    for (const ing of dish.ingredients) {
      if (ing.category === ex.targetTag) return true;
    }
  }
  return false;
}

/** 检查菜单是否命中单个 SOFT 禁忌（按 scope 分发） */
function menuHitsSoftExclusion(menu: MenuView, ex: ExclusionView): boolean {
  if (ex.scope === 'INGREDIENT') return menuHitsSoftIngredient(menu, ex);
  if (ex.scope === 'DISH') return menuHitsSoftDish(menu, ex);
  if (ex.scope === 'TAG') return menuHitsSoftTag(menu, ex);
  return false;
}

/** 构建 SOFT 禁忌命中检查函数 */
function buildSoftHitChecker(exclusions: ExclusionView[]) {
  const softExclusions = exclusions.filter((e) => e.severity === 'SOFT');
  return (menu: MenuView): boolean => {
    for (const ex of softExclusions) {
      if (menuHitsSoftExclusion(menu, ex)) return true;
    }
    return false;
  };
}

// ───── 6 维评分子函数（拆分自 score，降低圈复杂度） ─────

/** 1. 历史接受度 (权重 0.35)：没做过中性偏积极；成功率>=0.7 高接受度；>=0.4 中等；<0.4 低；willRepeat 加分 */
function calcHistoryAcceptance(
  menu: MenuView,
  history: EventView[],
): ScoreDimResult {
  const reasons: string[] = [];
  const cookedEvents = history.filter(
    (e) => e.menuId === menu.id && e.type === 'COOKED',
  );

  if (cookedEvents.length === 0) {
    return { value: 0.7, reasons };
  }

  const successCount = cookedEvents.filter(
    (e) => e.cookedResult === 'success',
  ).length;
  const successRate = successCount / cookedEvents.length;
  let value: number;

  if (successRate >= 0.7) {
    value = 0.9;
    reasons.push('历史接受度高');
  } else if (successRate >= 0.4) {
    value = 0.5;
  } else {
    value = 0.1;
    reasons.push('历史接受度低');
  }

  if (cookedEvents.some((e) => e.willRepeat)) {
    value = Math.min(1, value + 0.1);
    reasons.push('曾标记愿意再做');
  }

  return { value, reasons };
}

/** 2. 时长难度匹配 (权重 0.20)：activeMinutes/timeBudget 比值越小越轻松 */
function calcTimeMatch(
  menu: MenuView,
  timeBudgetMin: number,
): ScoreDimResult {
  const reasons: string[] = [];
  const timeRatio = menu.totalActiveMinutes / timeBudgetMin;
  let value: number;

  if (timeRatio <= 0.5) {
    value = 1.0;
    reasons.push(`${timeBudgetMin}分钟内轻松完成`);
  } else if (timeRatio <= 0.8) {
    value = 0.8;
    reasons.push(`${timeBudgetMin}分钟内可完成`);
  } else if (timeRatio <= 1.0) {
    value = 0.6;
  } else {
    value = 0.2;
  }

  return { value, reasons };
}

/** 3. 食材复用 (权重 0.15)：mustUse 命中率；无 mustUse 时中性 0.5 */
function calcIngredientReuse(
  menu: MenuView,
  mustUseIngredients: string[],
): ScoreDimResult {
  if (mustUseIngredients.length === 0) {
    return { value: 0.5, reasons: [] };
  }

  const reasons: string[] = [];
  const menuIngredientIds = new Set<string>();
  for (const dish of menu.dishes) {
    for (const ing of dish.ingredients) {
      menuIngredientIds.add(ing.ingredientId);
    }
  }
  const hitCount = mustUseIngredients.filter((id) =>
    menuIngredientIds.has(id),
  ).length;
  const value = hitCount / mustUseIngredients.length;

  if (hitCount > 0) {
    reasons.push(`消耗${hitCount}种标记食材`);
  }

  return { value, reasons };
}

/** 4. 偏好覆盖 (权重 0.10)：菜系匹配 + SOFT 禁忌降权 */
function calcPreferenceCoverage(
  menu: MenuView,
  rules: FamilyRuleView,
  softHitChecker: (menu: MenuView) => boolean,
): ScoreDimResult {
  const reasons: string[] = [];
  const cuisines = new Set(rules.cuisines);
  let value = 0.5;

  if (menu.dishes.length > 0) {
    const matched = menu.dishes.filter(
      (d) => d.cuisine && cuisines.has(d.cuisine),
    ).length;
    value = 0.5 + 0.5 * (matched / menu.dishes.length);
    if (matched > 0) {
      reasons.push('匹配家庭偏好菜系');
    }
  }

  if (softHitChecker(menu)) {
    value *= 0.5;
    reasons.push('含家庭成员不偏好食材');
  }

  return { value, reasons };
}

/** 5. 近期多样性 (权重 0.10)：7 天内做过降权；同时输出 recentMenuIds 供维度6复用 */
function calcRecentDiversity(
  menu: MenuView,
  history: EventView[],
  referenceTime: number,
): RecentDiversityResult {
  const reasons: string[] = [];
  const recentMenuIds = new Set<string>();

  if (referenceTime > 0) {
    for (const e of history) {
      if (
        e.menuId &&
        e.createdAt.getTime() <= referenceTime &&
        referenceTime - e.createdAt.getTime() <= SEVEN_DAYS_MS
      ) {
        recentMenuIds.add(e.menuId);
      }
    }
  }

  let value: number;
  if (recentMenuIds.has(menu.id)) {
    value = 0.2;
    reasons.push('7天内已做过');
  } else {
    value = 0.8;
    if (referenceTime > 0) {
      reasons.push('近期未做过');
    }
  }

  return { value, reasons, recentMenuIds };
}

/** 6. 膳食类别多样性 (权重 0.10)：近 7 天做过的菜品角色分布，新角色加分 */
function calcCategoryDiversity(
  menu: MenuView,
  library: MenuView[],
  recentMenuIds: Set<string>,
  referenceTime: number,
): ScoreDimResult {
  const reasons: string[] = [];
  const menuMap = new Map(library.map((m) => [m.id, m]));
  const recentRoles = new Set<string>();

  for (const menuId of recentMenuIds) {
    const recentMenu = menuMap.get(menuId);
    if (recentMenu) {
      for (const dish of recentMenu.dishes) {
        recentRoles.add(dish.mealRole);
      }
    }
  }

  const currentRoles = new Set(menu.dishes.map((d) => d.mealRole));
  let value: number;

  if (currentRoles.size > 0) {
    const newRoles = [...currentRoles].filter((r) => !recentRoles.has(r));
    value = 0.5 + 0.5 * (newRoles.length / currentRoles.size);
    if (newRoles.length > 0 && referenceTime > 0) {
      reasons.push('补充近期未做的菜品类别');
    }
  } else {
    value = 0.5;
  }

  return { value, reasons };
}

/**
 * 第三层评分（4.1 第 271-275 行）。
 * 纯函数：参考时间取 history 最新 createdAt（无 history 时近期多样性满分），无 Date.now()。
 * 6 维加权求和，四舍五入到 4 位小数避免浮点误差。
 */
export function score(menu: MenuView, input: RecommendInput): ScoredMenu {
  const breakdown: Record<ScoreDim, number> = {
    historyAcceptance: 0,
    timeDifficulty: 0,
    ingredientReuse: 0,
    preferenceCoverage: 0,
    recentDiversity: 0,
    categoryDiversity: 0,
  };
  const reasons: string[] = [];

  // 参考时间：history 最新 createdAt；无 history 则 0（所有菜单近期多样性满分）
  const referenceTime =
    input.history.length > 0
      ? Math.max(...input.history.map((e) => e.createdAt.getTime()))
      : 0;

  // 预构建 SOFT 禁忌检查函数（避免维度4重复构建）
  const softHitChecker = buildSoftHitChecker(input.exclusions);

  // 1. 历史接受度 (0.35)
  const historyResult = calcHistoryAcceptance(menu, input.history);
  breakdown.historyAcceptance = historyResult.value;
  reasons.push(...historyResult.reasons);

  // 2. 时长难度匹配 (0.20)
  const timeResult = calcTimeMatch(menu, input.context.timeBudgetMin);
  breakdown.timeDifficulty = timeResult.value;
  reasons.push(...timeResult.reasons);

  // 3. 食材复用 (0.15)
  const reuseResult = calcIngredientReuse(menu, input.context.mustUseIngredients);
  breakdown.ingredientReuse = reuseResult.value;
  reasons.push(...reuseResult.reasons);

  // 4. 偏好覆盖 (0.10)
  const prefResult = calcPreferenceCoverage(menu, input.rules, softHitChecker);
  breakdown.preferenceCoverage = prefResult.value;
  reasons.push(...prefResult.reasons);

  // 5. 近期多样性 (0.10)
  const recentResult = calcRecentDiversity(menu, input.history, referenceTime);
  breakdown.recentDiversity = recentResult.value;
  reasons.push(...recentResult.reasons);

  // 6. 膳食类别多样性 (0.10)
  const categoryResult = calcCategoryDiversity(
    menu,
    input.library,
    recentResult.recentMenuIds,
    referenceTime,
  );
  breakdown.categoryDiversity = categoryResult.value;
  reasons.push(...categoryResult.reasons);

  // 加权总分（四舍五入到 4 位小数，避免浮点误差导致回归不一致）
  let total = 0;
  for (const dim of Object.keys(breakdown) as ScoreDim[]) {
    total += breakdown[dim] * SCORE_WEIGHTS[dim];
  }
  total = Math.round(total * 10000) / 10000;

  return {
    menuId: menu.id,
    score: total,
    reasons: [...new Set(reasons)],
    breakdown,
  };
}
