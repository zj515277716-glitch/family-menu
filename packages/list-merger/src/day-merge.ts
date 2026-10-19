// packages/list-merger/src/day-merge.ts
// 三餐采购清单合并（T-Q10/PD-020/C-4，纯函数零 IO）：
//   三餐食材合并去重一张清单 + 按（成人+儿童）人数换算凑整 + 必消标「已有」不删
//   + 常备调料不出现（C-4 v2 口径：非必消的常备调料直接剔除；必消命中仍保留标已有——
//     「不出现」不得击穿 PD-001 必消可见性）+ 备菜建议分「今晚预处理/明早先做」。
// 与 mergeShoppingList（单餐存量口径：常备标记保留）并存：两条 API 路径各自稳定，不互改。
import { CATEGORIES, type MealSlot } from '@family-menu/shared';
import { normalize } from './normalize.js';
import { mergeQuantities } from './units.js';
import { BASE_SERVINGS, DEFAULT_PANTRY_STAPLES, roundPurchase } from './merge.js';
import type {
  ShoppingIngredient,
  ShoppingListGroup,
  ShoppingListItem,
  ShoppingList,
} from './merge.js';

// ───── 输入类型（鸭子类型，与 engine DishView/MealPlanView 结构兼容，不依赖 engine） ─────

export interface DayShoppingDish {
  name: string;
  ingredients: ShoppingIngredient[];
  /** 工序文本（备菜建议提取源；[{order, text}]，与 DishStep 兼容） */
  steps: Array<{ order: number; text: string }>;
}

/** 单餐输入：slot + 菜品列表 */
export interface DayShoppingMenu {
  slot: MealSlot;
  dishes: DayShoppingDish[];
}

// ───── 输出类型 ─────

/** 备菜建议（C-4）：今晚预处理（泡/腌/解冻）/ 明早先做（早餐工序前置） */
export interface PrepAdvice {
  tonight: string[];
  tomorrowMorning: string[];
}

export interface DayShoppingList extends ShoppingList {
  prepAdvice: PrepAdvice;
}

export interface DayMergeOptions {
  /** 家庭常备调料集合；默认 DEFAULT_PANTRY_STAPLES（命中且非必消 → 不出现，C-4） */
  pantryStaples?: ReadonlySet<string>;
  /** 成人数；与儿童数合并为缩放口径（C-4：按成人+儿童人数换算凑整） */
  adults: number;
  /** 儿童数 */
  children: number;
  /** 必消食材 ingredientId 集合：命中的条目标 alreadyHave=true（已有·必消，PD-004） */
  alreadyHaveIds?: ReadonlySet<string>;
}

// ───── 备菜建议规则（任务卡：规则可简单） ─────

/** 今晚预处理关键词：工序文本含任一即前置到今晚（泡发/腌制/解冻都需要提前动） */
const TONIGHT_KEYWORDS = ['泡', '腌', '解冻'] as const;

/** 明早先做：早餐餐次的工序（早餐现做才好吃，不值得今晚动手） */
const TOMORROW_SLOT: MealSlot = 'breakfast';

function buildPrepAdvice(menus: DayShoppingMenu[]): PrepAdvice {
  const tonight = new Set<string>();
  const tomorrowMorning = new Set<string>();
  for (const menu of menus) {
    for (const dish of menu.dishes) {
      const ordered = [...dish.steps].sort((a, b) => a.order - b.order);
      for (const step of ordered) {
        const entry = `${dish.name}：${step.text}`;
        // 今晚关键词优先：同一道工序既是泡/腌/解冻又是早餐工序，按今晚预处理归置
        if (TONIGHT_KEYWORDS.some((k) => step.text.includes(k))) {
          tonight.add(entry);
        } else if (menu.slot === TOMORROW_SLOT) {
          tomorrowMorning.add(entry);
        }
      }
    }
  }
  return {
    tonight: [...tonight],
    tomorrowMorning: [...tomorrowMorning],
  };
}

// ───── 主函数 ─────

/**
 * 合并三餐采购清单（C-4）。
 * 职责：三餐食材归一合并去重 -> 单位换算合并 -> 按（成人+儿童）人数缩放取整
 *       -> 必消标已有 -> 常备调料剔除（非必消） -> 按 category 分组 + 备菜建议。
 */
export function mergeDayShoppingList(
  menus: DayShoppingMenu[],
  options: DayMergeOptions,
): DayShoppingList {
  const staples = options.pantryStaples ?? DEFAULT_PANTRY_STAPLES;
  const alreadyHaveIds = options.alreadyHaveIds;
  const scale = (options.adults + options.children) / BASE_SERVINGS;

  // 1. 收集三餐全部菜品食材
  const allIngredients: ShoppingIngredient[] = [];
  for (const menu of menus) {
    for (const dish of menu.dishes) {
      for (const ing of dish.ingredients) {
        allIngredients.push(ing);
      }
    }
  }

  // 2. 归一（三餐同名/别名食材合并到同一组）+ 换算合并 + 缩放取整 + 标记/剔除
  const groups = normalize(allIngredients);
  const items: ShoppingListItem[] = [];
  for (const group of groups) {
    const isPantry =
      staples.has(group.canonicalId) ||
      staples.has(group.name) ||
      group.aliases.some((a) => staples.has(a));
    const isMustUse = alreadyHaveIds?.has(group.canonicalId) ?? false;

    // C-4 v2：常备调料不出现——但必消命中时保留并标已有（PD-001 必消可见性优先于清单精简）
    if (isPantry && !isMustUse) {
      continue;
    }

    const quantities = mergeQuantities(group.entries, group.defaultUnit);
    for (const q of quantities) {
      items.push({
        ingredientId: group.canonicalId,
        name: group.name,
        category: group.category,
        qty: roundPurchase(q.qty * scale),
        unit: q.unit,
        checked: false,
        alreadyHave: isMustUse || undefined,
      });
    }
  }

  // 3. 分组（按 CATEGORIES 顺序，未分类追加末尾——与单餐口径一致，防无 ORDER BY 类问题）
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
  for (const [cat, catItems] of byCategory) {
    if (!categoryOrder.includes(cat)) {
      resultGroups.push({ category: cat, items: catItems });
    }
  }

  return {
    groups: resultGroups,
    prepAdvice: buildPrepAdvice(menus),
  };
}
