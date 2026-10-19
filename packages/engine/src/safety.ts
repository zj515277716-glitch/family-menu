// packages/engine/src/safety.ts
// 第一层安全过滤：HARD 禁忌过滤，成分未确认滤除，产出 FilterTrace
// 铁律：安全层永远先于评分，不可被任何权重覆盖（4.2）
import type {
  DishIngredientView,
  DishView,
  ExclusionView,
  FilterTrace,
  MenuView,
  TempAvoidanceView,
} from './types.js';

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

/**
 * HARD+TAG 食材名/别名字串宽匹配（T-A1，主控决定②：名称含「花生」即拦）。
 * 背景（复盘 V2 P0-1）：TAG 规则原先只查 flavorTags 与食材 category，对「花生米」这类
 * 名称≠品类词的真实形态食材零拦截（09-14 生产花生防线因此失效 8–9 小时）。
 * 口径与 tools/content-pipeline/src/allergen.ts（fm-import 侧）对齐（T-C07 S-3 定案）：
 * 食材 name/aliases 任一子串含 targetTag 即命中；接受误伤「花生油」（安全侧零侥幸）。
 * 返回命中的食材行（供可解释 reason），未命中返回 null。
 */
function ingredientNameHitTag(
  dish: DishView,
  tag: string,
): DishIngredientView | null {
  for (const ing of dish.ingredients) {
    if (ing.ingredientName.includes(tag)) return ing;
    if (ing.aliases.some((a) => a.includes(tag))) return ing;
  }
  return null;
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
    const wide = ingredientNameHitTag(dish, tag);
    if (wide) {
      return {
        blocked: true,
        reason: `食材「${wide.ingredientName}」名称含「${tag}」，命中 HARD 标签禁忌#${ex.id}`,
      };
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

export interface DishSafetyResult {
  passed: DishView[];
  excluded: Array<{ dish: DishView; reason: string }>;
}

/**
 * dish 级安全过滤（T-P16/PD-018 组合层预过滤用）。
 * 判定口径与 safetyFilter 菜单级完全一致（复用同一套内部判定）：
 * - 成分未确认：存在 HARD 食材禁忌时，该菜 ingredients 为空 -> 保守排除
 * - HARD+INGREDIENT：该菜食材（含 optional）命中禁忌成分 -> 排除（支持别名归一）
 * - HARD+DISH：该菜即目标菜品 -> 排除
 * - HARD+TAG：该菜 flavorTags 或食材 category 命中标签 -> 排除
 * dish 级排除保证禁菜绝不进入任何槽位（AC2），且单菜被禁不拖累同池其他菜。
 */
export function filterSafeDishes(
  dishes: DishView[],
  exclusions: ExclusionView[],
): DishSafetyResult {
  const hardExclusions = exclusions.filter((e) => e.severity === 'HARD');
  const hasHardIngredient = hardExclusions.some((e) => e.scope === 'INGREDIENT');
  const ingredientNameSets = buildHardIngredientNameSets(exclusions);

  const passed: DishView[] = [];
  const excluded: Array<{ dish: DishView; reason: string }> = [];

  for (const dish of dishes) {
    // 1. 成分未确认（口径同菜单级 checkUnconfirmedIngredients，菜粒度投影）
    if (hasHardIngredient && dish.ingredients.length === 0) {
      excluded.push({
        dish,
        reason: `菜品「${dish.name}」成分未确认，保守过滤（存在 HARD 食材禁忌）`,
      });
      continue;
    }

    // 2. HARD 三 scope 逐条检查（INGREDIENT/DISH/TAG）
    let blocked: string | null = null;
    for (const ex of hardExclusions) {
      if (ex.scope === 'INGREDIENT') {
        const nameSet = ingredientNameSets.get(ex.id);
        if (!nameSet) continue;
        for (const ing of dish.ingredients) {
          if (
            ingredientHitsExclusion(
              ing.ingredientId,
              ing.ingredientName,
              ing.aliases,
              nameSet,
            )
          ) {
            blocked = `含${ing.ingredientName}，命中 HARD 食材禁忌#${ex.id}`;
            break;
          }
        }
      } else if (ex.scope === 'DISH') {
        if (ex.targetId && dish.id === ex.targetId) {
          blocked = `菜品「${dish.name}」命中 HARD 菜品禁忌#${ex.id}`;
        }
      } else if (ex.scope === 'TAG') {
        const tag = ex.targetTag;
        if (tag) {
          if (dish.flavorTags.includes(tag)) {
            blocked = `菜品「${dish.name}」标签含「${tag}」，命中 HARD 标签禁忌#${ex.id}`;
          } else {
            for (const ing of dish.ingredients) {
              if (ing.category === tag) {
                blocked = `食材「${ing.ingredientName}」品类为「${tag}」，命中 HARD 标签禁忌#${ex.id}`;
                break;
              }
            }
          }
          // T-A1 宽匹配（口径同菜单级 checkTagScope）：flavorTags/category 均未命中时，
          // 食材名/别名字串含 tag 仍拦（花生米形态：名称≠品类词，见 ingredientNameHitTag）
          if (!blocked) {
            const wide = ingredientNameHitTag(dish, tag);
            if (wide) {
              blocked = `食材「${wide.ingredientName}」名称含「${tag}」，命中 HARD 标签禁忌#${ex.id}`;
            }
          }
        }
      }
      if (blocked) break;
    }

    if (blocked) {
      excluded.push({ dish, reason: blocked });
    } else {
      passed.push(dish);
    }
  }

  return { passed, excluded };
}

// ───── 临时忌口（PD-020 ③，当日生效） ─────

/** 临时忌口合成禁忌 id 前缀（供上层把 trace 独立标注为「临时忌口」而非长期禁忌） */
export const TEMP_EXCLUSION_ID_PREFIX = 'temp-avoid-';

/**
 * 临时忌口 → 合成 HARD+INGREDIENT 禁忌。
 * 过滤效力与长期硬禁忌完全一致（复用别名归一等全部匹配机器）；
 * id 带 TEMP_EXCLUSION_ID_PREFIX 前缀，供 relabelTempExclusionRule 独立标注。
 */
export function tempAvoidanceToExclusions(
  tempAvoidances: TempAvoidanceView[],
): ExclusionView[] {
  return tempAvoidances.map((t, i) => ({
    id: `${TEMP_EXCLUSION_ID_PREFIX}${i}`,
    scope: 'INGREDIENT' as const,
    targetId: t.ingredientId,
    targetName: t.ingredientName,
    targetAliases: t.aliases ?? [],
    severity: 'HARD' as const,
    note: '临时忌口（当日生效）',
  }));
}

/** 判断禁忌 id 是否临时忌口合成 */
export function isTempExclusionId(id: string): boolean {
  return id.startsWith(TEMP_EXCLUSION_ID_PREFIX);
}

/**
 * 把 trace 文案中的临时忌口合成禁忌改写为「临时忌口」独立标注
 * （与长期硬禁忌分层，确认书 C-2：临时忌口独立区，仅当日生效）。
 */
export function relabelTempExclusionRule(
  rule: string,
  tempExclusions: ExclusionView[],
): string {
  for (const t of tempExclusions) {
    if (rule.includes(`#${t.id}`)) {
      const name = t.targetName ?? t.targetId ?? t.id;
      return rule.replace(
        `命中 HARD 食材禁忌#${t.id}`,
        `命中临时忌口「${name}」（当日生效）`,
      );
    }
  }
  return rule;
}

// ───── 儿童餐约束（PD-020：儿童>0 时避辣/避刺多/避过硬） ─────

/** 儿童餐可接受的最高辣度（spicyLevel 超过即拦） */
export const CHILD_MAX_SPICY_LEVEL = 1;

/** 儿童餐避开的口味标签（刺多/过硬按 flavorTags 正向命中判定） */
export const CHILD_AVOID_FLAVOR_TAGS = ['刺多', '多刺', '过硬'] as const;

export interface ChildSafeResult {
  passed: DishView[];
  excluded: Array<{ dish: DishView; reason: string }>;
}

/**
 * 儿童餐约束过滤（儿童人数 >0 时由日规划层调用，安全层扩展属性过滤）。
 * 判定只按现 DishView 可得字段的正向证据：
 * - 避辣：spicyLevel 数值字段（恒存在）> CHILD_MAX_SPICY_LEVEL -> 拦；
 * - 避刺多/避过硬：flavorTags 命中 CHILD_AVOID_FLAVOR_TAGS -> 拦。
 * 属性缺失（无对应标签）的菜视为未知，不误杀不硬拦（任务卡口径）。
 */
export function filterChildSafeDishes(dishes: DishView[]): ChildSafeResult {
  const passed: DishView[] = [];
  const excluded: Array<{ dish: DishView; reason: string }> = [];

  for (const dish of dishes) {
    if (dish.spicyLevel > CHILD_MAX_SPICY_LEVEL) {
      excluded.push({
        dish,
        reason: `「${dish.name}」辣度${dish.spicyLevel}级，儿童餐避辣`,
      });
      continue;
    }
    const hitTag = dish.flavorTags.find((tag) =>
      (CHILD_AVOID_FLAVOR_TAGS as readonly string[]).includes(tag),
    );
    if (hitTag) {
      excluded.push({
        dish,
        reason: `「${dish.name}」标签含「${hitTag}」，儿童餐避刺多/避过硬`,
      });
      continue;
    }
    passed.push(dish);
  }

  return { passed, excluded };
}
