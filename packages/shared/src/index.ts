// packages/shared - 契约（zod schema + 类型 + 常量），v0.1 冻结
// 单一事实源：所有 schema/类型/常量统一导出

// schemas
export * from './schemas/family.js';
export * from './schemas/dish.js';
export * from './schemas/menu.js';
export * from './schemas/plan.js';
export * from './schemas/api.js';

// types（z.infer 推导类型）
export * from './types/index.js';

// constants
export * from './constants/index.js';

/** 兼容现有 engine/list-merger 对 shared 的 PACKAGE_NAME 导出 */
export const PACKAGE_NAME = '@family-menu/shared';
