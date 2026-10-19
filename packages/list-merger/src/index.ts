// packages/list-merger - 采购清单合并（纯函数）
// 统一导出 mergeShoppingList（单餐存量口径）+ mergeDayShoppingList（三餐，T-Q10）+ 公开类型
export const PACKAGE_NAME = '@family-menu/list-merger';

export {
  mergeShoppingList,
  DEFAULT_PANTRY_STAPLES,
  BASE_SERVINGS,
  roundPurchase,
  type MergeOptions,
  type ShoppingIngredient,
  type ShoppingMenuDish,
  type ShoppingMenu,
  type ShoppingListItem,
  type ShoppingListGroup,
  type ShoppingList,
} from './merge.js';
export {
  mergeDayShoppingList,
  type DayShoppingDish,
  type DayShoppingMenu,
  type DayMergeOptions,
  type DayShoppingList,
  type PrepAdvice,
} from './day-merge.js';
export { normalize, type NormalizedGroup } from './normalize.js';
export {
  canConvert,
  convert,
  mergeQuantities,
  type MergedQuantity,
} from './units.js';
