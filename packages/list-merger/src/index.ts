// packages/list-merger - 采购清单合并（纯函数）
// 统一导出 mergeShoppingList + 公开类型（4.4）
export const PACKAGE_NAME = '@family-menu/list-merger';

export {
  mergeShoppingList,
  DEFAULT_PANTRY_STAPLES,
  type MergeOptions,
  type ShoppingIngredient,
  type ShoppingMenuDish,
  type ShoppingMenu,
  type ShoppingListItem,
  type ShoppingListGroup,
  type ShoppingList,
} from './merge.js';
export { normalize, type NormalizedGroup } from './normalize.js';
export {
  canConvert,
  convert,
  mergeQuantities,
  type MergedQuantity,
} from './units.js';
