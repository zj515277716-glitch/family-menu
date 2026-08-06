// packages/list-merger/src/normalize.ts
// 食材归一：按 name/aliases 匹配合并同一食材（即使 ingredientId 不同，如 番茄/西红柿）
import type { ShoppingIngredient } from './merge.js';

/** 归一后的食材分组（同一 canonicalId，含多个 qty/unit 条目） */
export interface NormalizedGroup {
  canonicalId: string;
  name: string;
  aliases: string[];
  category: string;
  defaultUnit: string;
  entries: Array<{ qty: number; unit: string; optional: boolean }>;
}

/**
 * 归一食材：按 name/aliases 交叉匹配，将同一食材合并到同一 canonicalId。
 * 4.4 要求：同食材合并(经 aliases 归一)。
 * 算法：构建 名称->canonicalId 映射，若两个食材的 name/aliases 有交集则归一为同一 id。
 */
export function normalize(ingredients: ShoppingIngredient[]): NormalizedGroup[] {
  // 第一遍：建立 名称 -> canonicalId 映射
  const nameToCanonical = new Map<string, string>();
  for (const ing of ingredients) {
    const names = [ing.ingredientName, ...ing.aliases];
    let canonical = ing.ingredientId;
    for (const name of names) {
      const existing = nameToCanonical.get(name);
      if (existing) {
        canonical = existing;
        break;
      }
    }
    for (const name of names) {
      nameToCanonical.set(name, canonical);
    }
  }

  // 第二遍：按 canonicalId 分组（第一遍已为所有食材 name 建立映射，此处一定命中）
  const groups = new Map<string, NormalizedGroup>();
  for (const ing of ingredients) {
    const canonical = nameToCanonical.get(ing.ingredientName)!;
    if (!groups.has(canonical)) {
      groups.set(canonical, {
        canonicalId: canonical,
        name: ing.ingredientName,
        aliases: ing.aliases,
        category: ing.category,
        defaultUnit: ing.defaultUnit,
        entries: [],
      });
    }
    groups.get(canonical)!.entries.push({
      qty: ing.qty,
      unit: ing.unit,
      optional: ing.optional,
    });
  }

  return [...groups.values()];
}
