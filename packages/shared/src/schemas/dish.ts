// packages/shared/src/schemas/dish.ts
// 内容资产契约，对齐实施方案 3.2 数据模型（Dish / DishIngredient / Ingredient / Substitution）
import { z } from 'zod';

// ───── 枚举 ─────

/** 菜品角色 */
export const MealRoleSchema = z.enum(['MAIN', 'SIDE', 'SOUP', 'STAPLE']);

/**
 * 内容状态三态：DRAFT -> TESTED -> PUBLISHED。
 * 只有 PUBLISHED 进入推荐池（安全底线，DEC-006 运行时零LLM）。
 */
export const ContentStatusSchema = z.enum(['DRAFT', 'TESTED', 'PUBLISHED']);

/** 内容来源：LLM_DRAFT（内容管线起草）| MANUAL（人工录入） */
export const ContentOriginSchema = z.enum(['LLM_DRAFT', 'MANUAL']);

// ───── 子结构（JSON 字段精确定义，非 z.unknown） ─────

/** 菜品步骤：[{order, text, parallel?}] */
export const DishStepSchema = z.object({
  order: z.number().int(),
  text: z.string(),
  parallel: z.boolean().optional(),
});

// ───── 模型 ─────

/**
 * 菜品（核心壁垒资产）。
 * activeMinutes = 动手时间；totalMinutes = 含炖煮等待的总时长。
 * splitFlavor = 可拆分调味（儿童清淡/成人辣）。
 */
export const DishSchema = z.object({
  id: z.string(),
  name: z.string(),
  mealRole: MealRoleSchema,
  cuisine: z.string().optional(),
  flavorTags: z.array(z.string()), // 清淡/微辣/酸甜...
  spicyLevel: z.number().int().default(0),
  splitFlavor: z.boolean().default(false),
  activeMinutes: z.number().int(),
  totalMinutes: z.number().int(),
  equipment: z.array(z.string()),
  steps: z.array(DishStepSchema),
  status: ContentStatusSchema.default('DRAFT'),
  origin: ContentOriginSchema.default('LLM_DRAFT'),
  licenseNote: z.string().optional(), // 内容授权台账字段
});

/** 菜品-食材关联（qty 为浮点数，如 200.5） */
export const DishIngredientSchema = z.object({
  id: z.string(),
  dishId: z.string(),
  ingredientId: z.string(),
  qty: z.number(),
  unit: z.string(),
  optional: z.boolean().default(false),
});

/** 食材（name 唯一，aliases 归一：西红柿=番茄） */
export const IngredientSchema = z.object({
  id: z.string(),
  name: z.string(),
  aliases: z.array(z.string()),
  category: z.string(), // 蔬菜/肉类/水产/蛋奶/调料/主食（见 constants/CATEGORIES）
  defaultUnit: z.string(), // g/个/块...
});

/** 替换关系：ingredientId 可被 substituteId 替换，ratio 默认 1 */
export const SubstitutionSchema = z.object({
  id: z.string(),
  ingredientId: z.string(),
  substituteId: z.string(),
  ratio: z.number().default(1),
  note: z.string().optional(),
});
