// packages/engine/src/feasibility.ts
// 第二层可行性过滤：时长/器具硬过滤 + mustUse 硬过滤（PD-001：必消食材必须用上，用不上的方案不出现）
import type { FamilyRuleView, FilterTrace, MenuView, TonightContext } from './types.js';

export interface FeasibilityFilterResult {
  passed: MenuView[];
  filtered: FilterTrace[];
  /** 没有任何可达菜单能消耗的必消食材（ingredientId）——非空即注定空手 */
  unsatisfiable: string[];
}

function menuIngredientIds(menu: MenuView): Set<string> {
  const ids = new Set<string>();
  for (const dish of menu.dishes) {
    for (const ing of dish.ingredients) {
      ids.add(ing.ingredientId);
    }
  }
  return ids;
}

/**
 * 第二层可行性过滤。
 * - 时长硬过滤：menu.totalActiveMinutes > context.timeBudgetMin -> 过滤
 * - 器具硬过滤：菜品所需 equipment 不在 rules.equipment 中 -> 过滤
 * - mustUse 硬过滤（PD-001）：菜单食材不能覆盖全部必消 -> 过滤（推荐必须用上全部必消）
 * - unsatisfiable 判定：按第一轮可达菜单统计，覆盖数为 0 的必消食材
 *   （必消只出现在超时/缺器具菜单中时，同样注定无法消耗）
 */
export function feasibilityFilter(
  library: MenuView[],
  context: TonightContext,
  rules: FamilyRuleView,
): FeasibilityFilterResult {
  const availableEquipment = new Set(rules.equipment);

  // 第一轮：时长/器具硬过滤 -> 可达菜单
  const reachable: MenuView[] = [];
  const filtered: FilterTrace[] = [];
  for (const menu of library) {
    // 1. 时长硬过滤
    if (menu.totalActiveMinutes > context.timeBudgetMin) {
      filtered.push({
        menuId: menu.id,
        stage: 'feasibility',
        rule: `总工时${menu.totalActiveMinutes}分钟超出预算${context.timeBudgetMin}分钟`,
      });
      continue;
    }

    // 2. 器具硬过滤
    const missing = new Set<string>();
    for (const dish of menu.dishes) {
      for (const eq of dish.equipment) {
        if (!availableEquipment.has(eq)) {
          missing.add(eq);
        }
      }
    }
    if (missing.size > 0) {
      filtered.push({
        menuId: menu.id,
        stage: 'feasibility',
        rule: `缺少器具：${[...missing].join('、')}`,
      });
      continue;
    }

    reachable.push(menu);
  }

  // unsatisfiable 判定：没有任何可达菜单能消耗的必消食材
  const unsatisfiable: string[] = [];
  if (context.mustUseIngredients.length > 0) {
    const reachableIngredientIds = new Set<string>();
    for (const menu of reachable) {
      for (const id of menuIngredientIds(menu)) {
        reachableIngredientIds.add(id);
      }
    }
    for (const mustUseId of context.mustUseIngredients) {
      if (!reachableIngredientIds.has(mustUseId)) {
        unsatisfiable.push(mustUseId);
      }
    }
  }

  // 第二轮：mustUse 硬过滤（PD-001）
  const passed: MenuView[] = [];
  for (const menu of reachable) {
    if (context.mustUseIngredients.length > 0) {
      const ids = menuIngredientIds(menu);
      const unconsumed = context.mustUseIngredients.filter((id) => !ids.has(id));
      if (unconsumed.length > 0) {
        filtered.push({
          menuId: menu.id,
          stage: 'feasibility',
          rule: `未能消耗必消食材：${unconsumed.join('、')}`,
        });
        continue;
      }
    }
    passed.push(menu);
  }

  return { passed, filtered, unsatisfiable };
}
