// packages/engine/src/feasibility.ts
// 第二层可行性过滤：时长/器具硬过滤；mustUse 无法消耗 -> 标记而非过滤（4.1 第 270 行）
import type { FamilyRuleView, FilterTrace, MenuView, TonightContext } from './types.js';

export interface FeasibilityWarning {
  menuId: string;
  message: string;
}

export interface FeasibilityFilterResult {
  passed: MenuView[];
  filtered: FilterTrace[];
  warnings: FeasibilityWarning[];
}

/**
 * 第二层可行性过滤（4.1 第 270 行）。
 * - 时长硬过滤：menu.totalActiveMinutes > context.timeBudgetMin -> 过滤
 * - 器具硬过滤：菜品所需 equipment 不在 rules.equipment 中 -> 过滤
 * - mustUse 无法消耗：context.mustUseIngredients 未出现在菜单食材中 -> 标记（warning），不过滤
 */
export function feasibilityFilter(
  library: MenuView[],
  context: TonightContext,
  rules: FamilyRuleView,
): FeasibilityFilterResult {
  const passed: MenuView[] = [];
  const filtered: FilterTrace[] = [];
  const warnings: FeasibilityWarning[] = [];

  const availableEquipment = new Set(rules.equipment);

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

    // 3. mustUse 无法消耗 -> 标记（不过滤）
    if (context.mustUseIngredients.length > 0) {
      const menuIngredientIds = new Set<string>();
      for (const dish of menu.dishes) {
        for (const ing of dish.ingredients) {
          menuIngredientIds.add(ing.ingredientId);
        }
      }
      const unconsumed = context.mustUseIngredients.filter(
        (id) => !menuIngredientIds.has(id),
      );
      if (unconsumed.length > 0) {
        warnings.push({
          menuId: menu.id,
          message: `未能消耗标记食材：${unconsumed.join('、')}`,
        });
      }
    }

    passed.push(menu);
  }

  return { passed, filtered, warnings };
}
