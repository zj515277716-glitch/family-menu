// packages/shared/src/schemas/dish.ts
// 内容资产契约，对齐实施方案 3.2 数据模型（Dish / DishIngredient / Ingredient / Substitution）
// 契约版本账本见 schemas/api.ts 头部（v0.2 起；v0.3 无专行，记于 api.ts unmetMustUse 字段注。T-P11 账本收敛）。
import { z } from 'zod';

// ───── 枚举 ─────

/** 菜品角色 */
export const MealRoleSchema = z.enum(['MAIN', 'SIDE', 'SOUP', 'STAPLE']);

/**
 * 内容状态三态：DRAFT -> TESTED -> PUBLISHED。
 * 只有 PUBLISHED 进入推荐池（安全底线，DEC-006 运行时零LLM）。
 */
export const ContentStatusSchema = z.enum(['DRAFT', 'TESTED', 'PUBLISHED']);

/**
 * 内容来源：LLM_DRAFT（内容管线起草）| MANUAL（人工录入）| FETCHED（外部站点抓取，T-C01）
 */
export const ContentOriginSchema = z.enum(['LLM_DRAFT', 'MANUAL', 'FETCHED']);

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
  // v0.7（T-P09）：http(s) 绝对 URL 或 /images/ 开头站内相对路径，二选一（R-10 方案 B：DB 存相对路径，前端拼 TARO_APP_API_BASE_URL 基址）；空串两分支均不匹配，仍拒绝
  // v0.10（2026-09-12，T-P15，挂账⑧，用户已批准）：站内分支收紧为 /^\/images\/dishes\/[A-Za-z0-9]+\/\d+\.(webp|jpg|png|gif)$/（内容管线真实落盘结构）；拍板：不含 jpeg（normalizeImageExt 归一为 jpg）、保留 gif
  imageUrl: z
    .union([z.string().url(), z.string().regex(/^\/images\/dishes\/[A-Za-z0-9]+\/\d+\.(webp|jpg|png|gif)$/)])
    .optional(), // 菜品图片（可选，内容轨道抓取/人工录入，T-C01；sourceUrl 不动）
  sourceUrl: z.string().url().optional(), // 外部来源原帖地址（可选，便于回查与微调对照）
  sourceSite: z.string().optional(), // 来源站点（约定值 xiachufang/xiaohongshu，先宽松后收紧）
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
