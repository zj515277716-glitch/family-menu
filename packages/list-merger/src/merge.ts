// packages/list-merger/src/merge.ts
// 采购清单合并器主函数：归一 -> 换算 -> 分组 -> 去常备（4.4）
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

// ───── 输出类型（4.4 ShoppingList 具体结构，shared v0.1 为 z.record(z.unknown())，本包精化） ─────

export interface ShoppingListItem {
  ingredientId: string;
  name: string;
  category: string;
  qty: number;
  unit: string;
  checked: boolean;
}

export interface ShoppingListGroup {
  category: string;
  items: ShoppingListItem[];
}

export interface ShoppingList {
  groups: ShoppingListGroup[];
}

// ───── 配置 ─────

/** 家庭常备调料默认清单（可配置，4.4 "去除家庭常备调料"） */
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

export interface MergeOptions {
  /** 去除家庭常备调料的食材 id/名称集合；默认 DEFAULT_PANTRY_STAPLES */
  pantryStaples?: ReadonlySet<string>;
}

// ───── 主函数 ─────

/**
 * 合并采购清单（4.4）。
 * 职责：同食材合并(经 aliases 归一) -> 单位换算(unit 表) -> 按 category 分组 -> 去除家庭常备调料(可配置)
 */
export function mergeShoppingList(
  menu: ShoppingMenu,
  options?: MergeOptions,
): ShoppingList {
  const staples = options?.pantryStaples ?? DEFAULT_PANTRY_STAPLES;

  // 收集所有菜品食材
  const allIngredients: ShoppingIngredient[] = [];
  for (const dish of menu.dishes) {
    for (const ing of dish.ingredients) {
      allIngredients.push(ing);
    }
  }

  // 1. 归一（经 aliases 归一合并同一食材）
  const groups = normalize(allIngredients);

  // 2. 换算 + 合并 + 去常备
  const items: ShoppingListItem[] = [];
  for (const group of groups) {
    // 去常备：按 canonicalId / name / aliases 检查
    if (
      staples.has(group.canonicalId) ||
      staples.has(group.name) ||
      group.aliases.some((a) => staples.has(a))
    ) {
      continue;
    }

    const quantities = mergeQuantities(group.entries, group.defaultUnit);
    for (const q of quantities) {
      items.push({
        ingredientId: group.canonicalId,
        name: group.name,
        category: group.category,
        qty: q.qty,
        unit: q.unit,
        checked: false,
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
