/** 食材品类（3.2 Ingredient.category 取值域） */
export declare const CATEGORIES: readonly ["蔬菜", "肉类", "水产", "蛋奶", "调料", "主食"];
export type Category = (typeof CATEGORIES)[number];
/** 厨房器具（3.2 FamilyRule.equipment 取值域） */
export declare const EQUIPMENT: readonly ["wok", "rice_cooker", "steamer", "air_fryer"];
export type Equipment = (typeof EQUIPMENT)[number];
/** 常用时长档（分钟，5.1 F2 时间档：15/30/60） */
export declare const TIME_BUDGETS: readonly [15, 30, 60];
export type TimeBudget = (typeof TIME_BUDGETS)[number];
//# sourceMappingURL=index.d.ts.map