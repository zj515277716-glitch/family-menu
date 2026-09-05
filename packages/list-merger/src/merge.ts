// packages/list-merger/src/merge.ts
// 采购清单合并器主函数：归一 -> 换算 -> 缩放取整 -> 标记 -> 分组（4.4 + DEC-014）
// 纯函数零 IO，单位合并是 9.2 点名故障点，错误率 <1% 门槛
import { CATEGORIES } from '@family-menu/shared';
import { normalize } from './normalize.js';
import { mergeQuantities } from './units.js';

// ───── 输入类型（与 engine MenuView 结构兼容，鸭子类型，不依赖 engine） ─────

export interface ShoppingIngredient {
  ingredientId: string;
  ingredientName: string;
  aliases: string[];
  category: string;
  defaultUnit: string;
  qty: number;
  unit: string;
  optional: boolean;
}

export interface ShoppingMenuDish {
  ingredients: ShoppingIngredient[];
}

export interface ShoppingMenu {
  id: string;
  name: string;
  dishes: ShoppingMenuDish[];
}

// ───── 输出类型（与 shared ShoppingListSchema v0.5 结构一致，DEC-014） ─────

export interface ShoppingListItem {
  ingredientId: string;
  name: string;
  category: string;
  qty: number;
  unit: string;
  checked: boolean;
  /** 已有·必消（PD-004）：必消食材标「已有」且不删除，防漏用 */
  alreadyHave?: boolean;
  /** 家里常备（C-8）：常备调料标「家里常备」保留展示，不买 */
  pantryStaple?: boolean;
}

export interface ShoppingListGroup {
  category: string;
  items: ShoppingListItem[];
}

export interface ShoppingList {
  groups: ShoppingListGroup[];
}

// ───── 配置 ─────

/** 家庭常备调料默认清单（可配置，4.4；TP-04 起命中者标记保留而非删除，DEC-014 裁决 4） */
export const DEFAULT_PANTRY_STAPLES: ReadonlySet<string> = new Set([
  '盐',
  '食用油',
  '酱油',
  '生抽',
  '老抽',
  '醋',
  '糖',
  '料酒',
  '蚝油',
  '姜',
  '蒜',
  '葱',
]);

/** 菜谱基准人份（PD-005：菜谱分量固定 4 人份；DEC-014 裁决 2） */
export const BASE_SERVINGS = 4;

/**
 * 购买量取整（DEC-014 裁决 2）：所有单位一律向上取整到整数、最小 1。
 * 「宁多勿少，凑整好买」——计数单位与 g/ml 统一口径，单一规则可测试。
 * 与 units.ts 的 round2（防浮点误差）职责分开、分开测。
 */
export function roundPurchase(qty: number): number {
  return Math.max(1, Math.ceil(qty));
}

export interface MergeOptions {
  /** 去除家庭常备调料的食材 id/名称集合；默认 DEFAULT_PANTRY_STAPLES（命中者标记 pantryStaple 保留） */
  pantryStaples?: ReadonlySet<string>;
  /** 今晚人数：清单分量按 qty × people / BASE_SERVINGS 缩放；缺省 4 = 不缩放（DEC-014 裁决 2） */
  people?: number;
  /** 必消食材 ingredientId 集合：命中的条目标 alreadyHave=true（已有·必消，PD-004） */
  alreadyHaveIds?: ReadonlySet<string>;
}

// ───── 主函数 ─────

/**
 * 合并采购清单（4.4 + DEC-014）。
 * 职责：同食材合并(经 aliases 归一) -> 单位换算合并(unit 表) -> 按人数缩放并取整
 *       -> 常备/必消标记 -> 按 category 分组
 */
export function mergeShoppingList(
  menu: ShoppingMenu,
  options?: MergeOptions,
): ShoppingList {
  const staples = options?.pantryStaples ?? DEFAULT_PANTRY_STAPLES;
  const people = options?.people ?? BASE_SERVINGS;
  const alreadyHaveIds = options?.alreadyHaveIds;
  const scale = people / BASE_SERVINGS;

  // 收集所有菜品食材
  const allIngredients: ShoppingIngredient[] = [];
  for (const dish of menu.dishes) {
    for (const ing of dish.ingredients) {
      allIngredients.push(ing);
    }
  }

  // 1. 归一（经 aliases 归一合并同一食材）
  const groups = normalize(allIngredients);

  // 2. 换算 + 合并 + 缩放取整 + 标记（常备调料标记保留，不再删除）
  const items: ShoppingListItem[] = [];
  for (const group of groups) {
    const isPantry =
      staples.has(group.canonicalId) ||
      staples.has(group.name) ||
      group.aliases.some((a) => staples.has(a));

    const quantities = mergeQuantities(group.entries, group.defaultUnit);
    for (const q of quantities) {
      // 缩放+取整：单位换算合并后的总量一次性处理，避免逐条目误差复合（DEC-014）
      items.push({
        ingredientId: group.canonicalId,
        name: group.name,
        category: group.category,
        qty: roundPurchase(q.qty * scale),
        unit: q.unit,
        checked: false,
        alreadyHave: alreadyHaveIds?.has(group.canonicalId) || undefined,
        pantryStaple: isPantry || undefined,
      });
    }
  }

  // 3. 分组（按 CATEGORIES 顺序）
  const categoryOrder: string[] = [...CATEGORIES];
  const byCategory = new Map<string, ShoppingListItem[]>();
  for (const item of items) {
    if (!byCategory.has(item.category)) {
      byCategory.set(item.category, []);
    }
    byCategory.get(item.category)!.push(item);
  }

  const resultGroups: ShoppingListGroup[] = [];
  for (const cat of categoryOrder) {
    const catItems = byCategory.get(cat);
    if (catItems && catItems.length > 0) {
      resultGroups.push({ category: cat, items: catItems });
    }
  }
  // 未分类的类别追加到末尾
  for (const [cat, catItems] of byCategory) {
    if (!categoryOrder.includes(cat)) {
      resultGroups.push({ category: cat, items: catItems });
    }
  }

  return { groups: resultGroups };
}
