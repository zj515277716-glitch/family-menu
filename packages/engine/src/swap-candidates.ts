// packages/engine/src/swap-candidates.ts
// 换菜候选过滤（TP-03/DEC-013）：单菜换的候选池筛选，纯函数零 IO
// 过滤顺序（DEC-013 裁决）：safetyFilter（单菜合成复用）-> 器具 -> 时长 -> mustUse 联动 -> 排除已在菜单
// 排序：activeMinutes 升序，同分 name 字典序（确定性）
import { safetyFilter } from './safety.js';
import type { DishView, ExclusionView, FilterTrace, MenuView } from './types.js';

export interface SwapCandidateInput {
  /** 被换下的菜（今晚菜单中用户不满意的菜） */
  outgoingDish: DishView;
  /** 换后仍在菜单的其他菜 */
  remainingDishes: DishView[];
  /** 同 mealRole 的 PUBLISHED 候选池（由调用方按角色查询后传入） */
  candidates: DishView[];
  /** 必消食材 ingredientId（已过 TP-02 名称->id 映射） */
  mustUseIngredientIds: string[];
  /** dish 级时长上限（今晚情境 timeBudgetMin） */
  timeBudgetMin: number;
  /** 家庭可用器具（rules.equipment） */
  availableEquipment: string[];
  /** 全部禁忌规则（safetyFilter 只看 HARD） */
  exclusions: ExclusionView[];
}

export interface SwapCandidateResult {
  /** 可换候选（已按 activeMinutes 升序、name 字典序排序） */
  passed: DishView[];
  /** 每个被滤除候选的首个失败原因（menuId 字段承载候选 dishId） */
  filtered: FilterTrace[];
}

/** 单菜合成菜单：仅为复用 safetyFilter（其只读 dishes 字段，其余字段为占位） */
function toSyntheticMenu(dish: DishView): MenuView {
  return {
    id: dish.id,
    name: dish.name,
    scene: 'WEEKDAY_FAST',
    serves: 0,
    totalActiveMinutes: dish.activeMinutes,
    prepSequence: [],
    status: dish.status,
    dishes: [dish],
  };
}

/**
 * 换菜候选过滤（DEC-013 架构裁决：不复用 feasibilityFilter——
 * mustUse 是菜单级全量覆盖检查，单菜候选必然被杀；须按"orphaned 必须被候选接住"的菜单级联动重写）。
 *
 * 五层顺序：
 * 1. 安全（复用 safetyFilter 单菜合成：HARD 食材/菜品/标签禁忌 + 成分未确认保守过滤）
 * 2. 器具：候选所需 equipment ⊆ 家庭可用器具
 * 3. 时长：dish 级 activeMinutes ≤ timeBudgetMin
 * 4. mustUse 联动（PD-001 不因换菜被击穿）：
 *    orphaned = 必消食材 − 换后其他菜食材并集；候选须接住全部 orphaned
 * 5. 排除已在菜单（含被换下的菜自身——换给自己无意义）
 */
export function filterSwapCandidates(input: SwapCandidateInput): SwapCandidateResult {
  const {
    outgoingDish,
    remainingDishes,
    candidates,
    mustUseIngredientIds,
    timeBudgetMin,
    availableEquipment,
    exclusions,
  } = input;

  const filtered: FilterTrace[] = [];
  const passed: DishView[] = [];
  const equipmentSet = new Set(availableEquipment);
  const inMenuIds = new Set([outgoingDish.id, ...remainingDishes.map((d) => d.id)]);

  // mustUse 联动准备：换后其他菜能消耗的食材并集
  const remainingIngredientIds = new Set<string>();
  for (const dish of remainingDishes) {
    for (const ing of dish.ingredients) remainingIngredientIds.add(ing.ingredientId);
  }
  // orphaned = 必消食材中没人接住的（必须由换入的新菜消耗）
  const orphaned = mustUseIngredientIds.filter((id) => !remainingIngredientIds.has(id));

  // 第 1 层安全过滤批量执行（复用 safetyFilter），失败文案直接取其 FilterTrace
  const safety = safetyFilter(
    candidates.map(toSyntheticMenu),
    exclusions,
  );
  const safetyPassedIds = new Set(safety.passed.map((m) => m.id));

  for (const dish of candidates) {
    // 1. 安全（HARD 禁忌 / 成分未确认保守过滤）
    if (!safetyPassedIds.has(dish.id)) {
      const trace = safety.filtered.find((f) => f.menuId === dish.id);
      filtered.push(
        trace ?? { menuId: dish.id, stage: 'safety', rule: '命中 HARD 禁忌' },
      );
      continue;
    }

    // 2. 器具：候选所需器具 ⊆ 家庭可用器具
    const missing = [...new Set(dish.equipment.filter((eq) => !equipmentSet.has(eq)))];
    if (missing.length > 0) {
      filtered.push({
        menuId: dish.id,
        stage: 'feasibility',
        rule: `缺少器具：${missing.join('、')}`,
      });
      continue;
    }

    // 3. 时长：dish 级 activeMinutes ≤ 今晚预算
    if (dish.activeMinutes > timeBudgetMin) {
      filtered.push({
        menuId: dish.id,
        stage: 'feasibility',
        rule: `单菜工时${dish.activeMinutes}分钟超出预算${timeBudgetMin}分钟`,
      });
      continue;
    }

    // 4. mustUse 联动：候选须接住全部 orphaned
    if (orphaned.length > 0) {
      const ids = new Set(dish.ingredients.map((i) => i.ingredientId));
      const uncovered = orphaned.filter((id) => !ids.has(id));
      if (uncovered.length > 0) {
        filtered.push({
          menuId: dish.id,
          stage: 'feasibility',
          rule: `未能接住必消食材：${uncovered.join('、')}`,
        });
        continue;
      }
    }

    // 5. 排除已在菜单（含被换下的菜自身）
    if (inMenuIds.has(dish.id)) {
      filtered.push({
        menuId: dish.id,
        stage: 'feasibility',
        rule: '该菜已在今晚菜单中',
      });
      continue;
    }

    passed.push(dish);
  }

  // 排序：activeMinutes 升序，同分 name 字典序（确定性）
  passed.sort(
    (a, b) =>
      a.activeMinutes - b.activeMinutes ||
      a.name.localeCompare(b.name, 'zh-Hans-CN'),
  );

  return { passed, filtered };
}
