/** 食材品类（3.2 Ingredient.category 取值域） */
export declare const CATEGORIES: readonly ["蔬菜", "肉类", "水产", "蛋奶", "调料", "主食"];
export type Category = (typeof CATEGORIES)[number];
/** 厨房器具（3.2 FamilyRule.equipment 取值域） */
export declare const EQUIPMENT: readonly ["wok", "rice_cooker", "steamer", "air_fryer"];
export type Equipment = (typeof EQUIPMENT)[number];
/** 常用时长档（分钟，5.1 F2 时间档：15/30/60） */
export declare const TIME_BUDGETS: readonly [15, 30, 60];
export type TimeBudget = (typeof TIME_BUDGETS)[number];
/**
 * 餐次规范顺序（PD-020）：全天计划、分配落位、组合枚举一律按此序，保确定性。
 * 与 engine MEAL_SLOTS 字面重复声明（shared 不得依赖 engine，否则契约反向耦合计算层）。
 * MealSlot 类型不从本模块导出（唯一来源 = schemas/dish MealSlotSchema 的 z.infer，
 * 两处 `export *` 同名类型会触发 TS2308 歧义）。
 */
export declare const MEAL_SLOTS: readonly ["breakfast", "lunch", "dinner"];
/** 餐次中文标签（设计规则 3：枚举一律中文） */
export declare const MEAL_SLOT_LABELS: Record<(typeof MEAL_SLOTS)[number], string>;
//# sourceMappingURL=index.d.ts.map