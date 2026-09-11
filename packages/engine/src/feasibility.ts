// packages/engine/src/feasibility.ts
// 第二层可行性过滤：时长/器具硬过滤 + mustUse 硬过滤（PD-001：必消食材必须用上，用不上的方案不出现）
import type {
  FamilyRuleView,
  FilterTrace,
  MenuView,
  MustUseUnmetReason,
  TonightContext,
} from './types.js';

export interface FeasibilityFilterResult {
  passed: MenuView[];
  filtered: FilterTrace[];
  /** 没有任何可达菜单能消耗的必消食材（ingredientId）——非空即注定空手 */
  unsatisfiable: string[];
  /** 空手原因分类（T-P10）：与 unsatisfiable 同键集。宽集=器具齐全（且经上游安全过滤）菜单的食材并集，不限时长；
   *  ∈宽集 -> TIME_BUDGET（加时长可能有出路），∉宽集 -> NO_DISH（缺器具/无含该食材菜单不进宽集） */
  unsatisfiableReasons: Record<string, MustUseUnmetReason>;
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
 * - unsatisfiableReasons 归类（T-P10）：必消 ∈ 宽集（器具齐全且不限时长菜单的食材并集）
 *   -> TIME_BUDGET（加时长可能有出路）；∉宽集 -> NO_DISH（缺器具菜单不进宽集）
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
  // 宽集（T-P10）：器具齐全（且经上游安全过滤）菜单的食材并集，不限时长——用于区分空手原因。
  // 缺器具菜单不进宽集（D-2 口径）：就算加时长也做不了，出路暗示必须真实。
  const wideIngredientIds = new Set<string>();
  const addWideIngredientIds = (menu: MenuView): void => {
    for (const id of menuIngredientIds(menu)) {
      wideIngredientIds.add(id);
    }
  };
  for (const menu of library) {
    // 器具检查提前计算（trace push 条件与顺序不变：时长 trace 仍先于器具 trace，菜单按库序）
    const missing = new Set<string>();
    for (const dish of menu.dishes) {
      for (const eq of dish.equipment) {
        if (!availableEquipment.has(eq)) {
          missing.add(eq);
        }
      }
    }

    // 1. 时长硬过滤
    if (menu.totalActiveMinutes > context.timeBudgetMin) {
      filtered.push({
        menuId: menu.id,
        stage: 'feasibility',
        rule: `总工时${menu.totalActiveMinutes}分钟超出预算${context.timeBudgetMin}分钟`,
      });
      // 器具齐全的超时菜单进宽集：换更长时间长也许能排上（TIME_BUDGET 依据）
      if (missing.size === 0) {
        addWideIngredientIds(menu);
      }
      continue;
    }

    // 2. 器具硬过滤
    if (missing.size > 0) {
      filtered.push({
        menuId: menu.id,
        stage: 'feasibility',
        rule: `缺少器具：${[...missing].join('、')}`,
      });
      continue;
    }

    addWideIngredientIds(menu);
    reachable.push(menu);
  }

  // unsatisfiable 判定：没有任何可达菜单能消耗的必消食材
  const unsatisfiable: string[] = [];
  const unsatisfiableReasons: Record<string, MustUseUnmetReason> = {};
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
        // 二次归类（T-P10）：∈宽集=时长型（有含它的器具齐全菜单、只是超时）；∉宽集=无菜型
        unsatisfiableReasons[mustUseId] = wideIngredientIds.has(mustUseId)
          ? 'TIME_BUDGET'
          : 'NO_DISH';
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

  return { passed, filtered, unsatisfiable, unsatisfiableReasons };
}
