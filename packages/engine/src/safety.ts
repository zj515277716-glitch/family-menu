// packages/engine/src/safety.ts
// 第一层安全过滤：HARD 禁忌过滤，成分未确认滤除，产出 FilterTrace
// 铁律：安全层永远先于评分，不可被任何权重覆盖（4.2）
import type { ExclusionView, FilterTrace, MenuView } from './types.js';

/** 构建 HARD+INGREDIENT 禁忌的匹配名称集合（含 targetName + targetAliases + targetId） */
function buildHardIngredientNameSets(
  exclusions: ExclusionView[],
): Map<string, Set<string>> {
  const sets = new Map<string, Set<string>>();
  for (const ex of exclusions) {
    if (ex.severity === 'HARD' && ex.scope === 'INGREDIENT') {
      const names = new Set<string>();
      if (ex.targetId) names.add(ex.targetId);
      if (ex.targetName) names.add(ex.targetName);
      if (ex.targetAliases) for (const a of ex.targetAliases) names.add(a);
      sets.set(ex.id, names);
    }
  }
  return sets;
}

/** 判断单个食材是否命中禁忌名称集（精确 id + 名称/别名匹配） */
function ingredientHitsExclusion(
  ingredientId: string,
  ingredientName: string,
  aliases: string[],
  nameSet: Set<string>,
): boolean {
  if (nameSet.has(ingredientId)) return true;
  if (nameSet.has(ingredientName)) return true;
  for (const a of aliases) {
    if (nameSet.has(a)) return true;
  }
  return false;
}

export interface SafetyFilterResult {
  passed: MenuView[];
  filtered: FilterTrace[];
}

/** 检查成分未确认（存在 HARD 食材禁忌时，菜品 ingredients 为空 -> 保守过滤） */
function checkUnconfirmedIngredients(
  menu: MenuView,
  hasHardIngredient: boolean,
): FilterTrace | null {
  if (!hasHardIngredient) return null;
  const unconfirmed = menu.dishes.find((d) => d.ingredients.length === 0);
  if (!unconfirmed) return null;
  return {
    menuId: menu.id,
    stage: 'safety',
    rule: `菜品「${unconfirmed.name}」成分未确认，保守过滤（存在 HARD 食材禁忌）`,
  };
}

/** HARD+INGREDIENT 检查：菜品食材（含 optional）命中禁忌成分 -> 过滤（支持别名归一） */
function checkIngredientScope(
  ex: ExclusionView,
  menu: MenuView,
  ingredientNameSets: Map<string, Set<string>>,
): { blocked: boolean; reason: string } {
  const nameSet = ingredientNameSets.get(ex.id);
  if (!nameSet) return { blocked: false, reason: '' };
  for (const dish of menu.dishes) {
    for (const ing of dish.ingredients) {
      if (
        ingredientHitsExclusion(
          ing.ingredientId,
          ing.ingredientName,
          ing.aliases,
          nameSet,
        )
      ) {
        return {
          blocked: true,
          reason: `含${ing.ingredientName}，命中 HARD 食材禁忌#${ex.id}`,
        };
      }
    }
  }
  return { blocked: false, reason: '' };
}

/** HARD+DISH 检查：菜单含目标菜品 -> 过滤 */
function checkDishScope(
  ex: ExclusionView,
  menu: MenuView,
): { blocked: boolean; reason: string } {
  if (!ex.targetId) return { blocked: false, reason: '' };
  for (const dish of menu.dishes) {
    if (dish.id === ex.targetId) {
      return {
        blocked: true,
        reason: `含菜品「${dish.name}」，命中 HARD 菜品禁忌#${ex.id}`,
      };
    }
  }
  return { blocked: false, reason: '' };
}

/** HARD+TAG 检查：菜品 flavorTags 或食材 category 命中标签 -> 过滤 */
function checkTagScope(
  ex: ExclusionView,
  menu: MenuView,
): { blocked: boolean; reason: string } {
  const tag = ex.targetTag;
  if (!tag) return { blocked: false, reason: '' };
  for (const dish of menu.dishes) {
    if (dish.flavorTags.includes(tag)) {
      return {
        blocked: true,
        reason: `菜品「${dish.name}」标签含「${tag}」，命中 HARD 标签禁忌#${ex.id}`,
      };
    }
    for (const ing of dish.ingredients) {
      if (ing.category === tag) {
        return {
          blocked: true,
          reason: `食材「${ing.ingredientName}」品类为「${tag}」，命中 HARD 标签禁忌#${ex.id}`,
        };
      }
    }
  }
  return { blocked: false, reason: '' };
}

/** HARD 禁忌逐条检查（按 exclusion 顺序遍历 INGREDIENT/DISH/TAG 三种 scope） */
function checkHardExclusions(
  menu: MenuView,
  hardExclusions: ExclusionView[],
  ingredientNameSets: Map<string, Set<string>>,
): { blocked: boolean; reason: string } {
  for (const ex of hardExclusions) {
    let result: { blocked: boolean; reason: string };
    if (ex.scope === 'INGREDIENT') {
      result = checkIngredientScope(ex, menu, ingredientNameSets);
    } else if (ex.scope === 'DISH') {
      result = checkDishScope(ex, menu);
    } else if (ex.scope === 'TAG') {
      result = checkTagScope(ex, menu);
    } else {
      continue;
    }
    if (result.blocked) return result;
  }
  return { blocked: false, reason: '' };
}

/**
 * 第一层安全过滤（4.1 第 269 行）。
 * - HARD+INGREDIENT：菜品食材（含 optional）命中禁忌成分 -> 过滤（支持别名归一：番茄/西红柿）
 * - HARD+DISH：菜单含目标菜品 -> 过滤
 * - HARD+TAG：菜品 flavorTags 或食材 category 命中标签 -> 过滤
 * - 成分未确认：存在 HARD 食材禁忌时，菜品 ingredients 为空 -> 保守过滤
 * 安全层永远先于评分，不可被任何权重覆盖。
 */
export function safetyFilter(
  library: MenuView[],
  exclusions: ExclusionView[],
): SafetyFilterResult {
  const passed: MenuView[] = [];
  const filtered: FilterTrace[] = [];

  const hardExclusions = exclusions.filter((e) => e.severity === 'HARD');
  const hasHardIngredient = hardExclusions.some((e) => e.scope === 'INGREDIENT');
  const ingredientNameSets = buildHardIngredientNameSets(exclusions);

  for (const menu of library) {
    // 1. 成分未确认检查（仅当存在 HARD 食材禁忌时，保守过滤）
    const unconfirmedTrace = checkUnconfirmedIngredients(menu, hasHardIngredient);
    if (unconfirmedTrace) {
      filtered.push(unconfirmedTrace);
      continue;
    }

    // 2. HARD 禁忌逐条检查（INGREDIENT/DISH/TAG）
    const { blocked, reason } = checkHardExclusions(
      menu,
      hardExclusions,
      ingredientNameSets,
    );

    if (blocked) {
      filtered.push({ menuId: menu.id, stage: 'safety', rule: reason });
    } else {
      passed.push(menu);
    }
  }

  return { passed, filtered };
}
