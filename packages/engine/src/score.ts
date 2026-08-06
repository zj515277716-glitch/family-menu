// packages/engine/src/score.ts
// 第三层评分：6 维评分，对齐 4.1 第 271-275 行
// 权重 0.35/0.20/0.15/0.10/0.10/0.10，无随机性（固定输入回归一致）
import type {
  ExclusionView,
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

/** 构建 SOFT 禁忌命中检查函数 */
function buildSoftHitChecker(exclusions: ExclusionView[]) {
  const softExclusions = exclusions.filter((e) => e.severity === 'SOFT');
  return (menu: MenuView): boolean => {
    for (const ex of softExclusions) {
      if (ex.scope === 'INGREDIENT') {
        const nameSet = new Set<string>();
        if (ex.targetId) nameSet.add(ex.targetId);
        if (ex.targetName) nameSet.add(ex.targetName);
        if (ex.targetAliases) for (const a of ex.targetAliases) nameSet.add(a);
        if (nameSet.size === 0) continue;
        for (const dish of menu.dishes) {
          for (const ing of dish.ingredients) {
            if (
              nameSet.has(ing.ingredientId) ||
              nameSet.has(ing.ingredientName) ||
              ing.aliases.some((a) => nameSet.has(a))
            ) {
              return true;
            }
          }
        }
      } else if (ex.scope === 'DISH') {
        if (!ex.targetId) continue;
        for (const dish of menu.dishes) {
          if (dish.id === ex.targetId) return true;
        }
      } else if (ex.scope === 'TAG') {
        if (!ex.targetTag) continue;
        for (const dish of menu.dishes) {
          if (dish.flavorTags.includes(ex.targetTag)) return true;
          for (const ing of dish.ingredients) {
            if (ing.category === ex.targetTag) return true;
          }
        }
      }
    }
    return false;
  };
}

/**
 * 第三层评分（4.1 第 271-275 行）。
 * 纯函数：参考时间取 history 最新 createdAt（无 history 时近期多样性满分），无 Date.now()。
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

  // 1. 历史接受度 (0.35)
  const cookedEvents = input.history.filter(
    (e) => e.menuId === menu.id && e.type === 'COOKED',
  );
  if (cookedEvents.length === 0) {
    breakdown.historyAcceptance = 0.7; // 没做过，中性偏积极
  } else {
    const successCount = cookedEvents.filter(
      (e) => e.cookedResult === 'success',
    ).length;
    const successRate = successCount / cookedEvents.length;
    if (successRate >= 0.7) {
      breakdown.historyAcceptance = 0.9;
      reasons.push('历史接受度高');
    } else if (successRate >= 0.4) {
      breakdown.historyAcceptance = 0.5;
    } else {
      breakdown.historyAcceptance = 0.1;
      reasons.push('历史接受度低');
    }
    if (cookedEvents.some((e) => e.willRepeat)) {
      breakdown.historyAcceptance = Math.min(1, breakdown.historyAcceptance + 0.1);
      reasons.push('曾标记愿意再做');
    }
  }

  // 2. 时长难度匹配 (0.20)
  const timeRatio = menu.totalActiveMinutes / input.context.timeBudgetMin;
  if (timeRatio <= 0.5) {
    breakdown.timeDifficulty = 1.0;
    reasons.push(`${input.context.timeBudgetMin}分钟内轻松完成`);
  } else if (timeRatio <= 0.8) {
    breakdown.timeDifficulty = 0.8;
    reasons.push(`${input.context.timeBudgetMin}分钟内可完成`);
  } else if (timeRatio <= 1.0) {
    breakdown.timeDifficulty = 0.6;
  } else {
    breakdown.timeDifficulty = 0.2;
  }

  // 3. 食材复用 (0.15) - mustUse 命中
  if (input.context.mustUseIngredients.length > 0) {
    const menuIngredientIds = new Set<string>();
    for (const dish of menu.dishes) {
      for (const ing of dish.ingredients) {
        menuIngredientIds.add(ing.ingredientId);
      }
    }
    const hitCount = input.context.mustUseIngredients.filter((id) =>
      menuIngredientIds.has(id),
    ).length;
    breakdown.ingredientReuse =
      hitCount / input.context.mustUseIngredients.length;
    if (hitCount > 0) {
      reasons.push(`消耗${hitCount}种标记食材`);
    }
  } else {
    breakdown.ingredientReuse = 0.5; // 无 mustUse 时中性
  }

  // 4. 偏好覆盖 (0.10) - 菜系匹配 + SOFT 禁忌降权
  const cuisines = new Set(input.rules.cuisines);
  let prefScore = 0.5;
  if (menu.dishes.length > 0) {
    const matched = menu.dishes.filter(
      (d) => d.cuisine && cuisines.has(d.cuisine),
    ).length;
    prefScore = 0.5 + 0.5 * (matched / menu.dishes.length);
    if (matched > 0) {
      reasons.push('匹配家庭偏好菜系');
    }
  }
  if (buildSoftHitChecker(input.exclusions)(menu)) {
    prefScore *= 0.5;
    reasons.push('含家庭成员不偏好食材');
  }
  breakdown.preferenceCoverage = prefScore;

  // 5. 近期多样性 (0.10) - 7 天内做过降权
  const recentMenuIds = new Set<string>();
  if (referenceTime > 0) {
    for (const e of input.history) {
      if (
        e.menuId &&
        e.createdAt.getTime() <= referenceTime &&
        referenceTime - e.createdAt.getTime() <= SEVEN_DAYS_MS
      ) {
        recentMenuIds.add(e.menuId);
      }
    }
  }
  if (recentMenuIds.has(menu.id)) {
    breakdown.recentDiversity = 0.2;
    reasons.push('7天内已做过');
  } else {
    breakdown.recentDiversity = 0.8;
    if (referenceTime > 0) {
      reasons.push('近期未做过');
    }
  }

  // 6. 膳食类别多样性 (0.10) - 近 7 天做过的菜品角色分布
  const menuMap = new Map(input.library.map((m) => [m.id, m]));
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
  if (currentRoles.size > 0) {
    const newRoles = [...currentRoles].filter((r) => !recentRoles.has(r));
    breakdown.categoryDiversity = 0.5 + 0.5 * (newRoles.length / currentRoles.size);
    if (newRoles.length > 0 && referenceTime > 0) {
      reasons.push('补充近期未做的菜品类别');
    }
  } else {
    breakdown.categoryDiversity = 0.5;
  }

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
