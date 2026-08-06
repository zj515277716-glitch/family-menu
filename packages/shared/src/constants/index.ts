// packages/shared/src/constants/index.ts
// 常量表，对齐实施方案 3.2（品类/器具）与 5.1（时长档）

/** 食材品类（3.2 Ingredient.category 取值域） */
export const CATEGORIES = ['蔬菜', '肉类', '水产', '蛋奶', '调料', '主食'] as const;
export type Category = (typeof CATEGORIES)[number];

/** 厨房器具（3.2 FamilyRule.equipment 取值域） */
export const EQUIPMENT = ['wok', 'rice_cooker', 'steamer', 'air_fryer'] as const;
export type Equipment = (typeof EQUIPMENT)[number];

/** 常用时长档（分钟，5.1 F2 时间档：15/30/60） */
export const TIME_BUDGETS = [15, 30, 60] as const;
export type TimeBudget = (typeof TIME_BUDGETS)[number];
