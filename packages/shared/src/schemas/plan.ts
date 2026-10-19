// packages/shared/src/schemas/plan.ts
// 运行数据契约，对齐实施方案 3.2 数据模型（Plan / Event）
// v0.12（2026-10-18，T-Q10/PD-020）：Plan 三餐化——新增 MealSlot/DayPlanContext/
//   DayPlan（三餐快照+必消落位+想吃的菜标注+空手归因）等结构与 Plan.dayContext/
//   dayPlan optional 字段；Event 加 mealSlot optional（反馈按餐关联，同日同餐重提覆盖）。
//   全部 optional 增量：存量单餐数据（context/candidates/lockedMenuId）与新三餐数据
//   （dayContext/dayPlan）同表共存，读取方按字段有无分流，版本兼容策略详见 api.ts 账本。
import { z } from 'zod';
import { DishSchema, MealSlotSchema } from './dish.js';

// ───── 枚举 ─────

/** 计划状态 */
export const PlanStatusSchema = z.enum(['PROPOSED', 'LOCKED', 'COOKED', 'SKIPPED']);

/** 行为事件类型（隐式反馈源+埋点，④推翻清单#4）；RESCALE=改人数重算清单（DEC-014） */
export const EventTypeSchema = z.enum([
  'GENERATE',
  'VIEW',
  'LOCK',
  'SWAP_MENU',
  'SWAP_DISH',
  'RESCALE',
  'COOKED',
  'NOT_COOKED',
  'REPEAT',
]);

// ───── 子结构（JSON 字段精确定义） ─────

/** 今晚情境：{people, timeBudgetMin, mustUse: string[]}（v0.12 起仅存量单餐计划使用） */
export const PlanContextSchema = z.object({
  people: z.number().int(),
  timeBudgetMin: z.number().int(),
  mustUse: z.array(z.string()),
});

// ───── 日计划上下文（PD-020） ─────

/** 临时忌口（当日生效，如生病不吃牛肉；与长期 HARD 分层，过滤效力同 HARD） */
export const TempAvoidanceSchema = z.object({
  ingredientId: z.string().optional(),
  ingredientName: z.string().optional(),
  aliases: z.array(z.string()).optional(),
});

/**
 * 日计划上下文（PD-020）：PlanContext 的三餐扩展，存 Plan.dayContext。
 * 新三餐计划一律用本结构；旧 people 语境不再沿用（成人/儿童分列，儿童触发餐约束）。
 */
export const DayPlanContextSchema = z.object({
  adults: z.number().int().min(1),
  children: z.number().int().min(0),
  // 常做时长档（按餐应用）：对齐引擎 DayPlanContext 的 15|30|60 字面量联合
  timeBudgetMin: z.union([z.literal(15), z.literal(30), z.literal(60)]),
  mustUseIngredients: z.array(z.string()),
  tempAvoidances: z.array(TempAvoidanceSchema).optional(),
  desiredDishIds: z.array(z.string()).optional(),
  meals: z.array(MealSlotSchema).optional(),
  avoidRecentDays: z.number().int().optional(),
});

/**
 * 候选评分明细（breakdown）。
 * 3.2 仅标注为 Json，字段结构由推荐引擎（STEP-04）决定，本步不预先固定。
 * 采用 z.record(z.string(), z.unknown()) 承载，待 STEP-04 精化。
 */
export const CandidateBreakdownSchema = z.record(z.string(), z.unknown());

/** 候选菜单：3 套候选快照之一 */
export const CandidateSchema = z.object({
  menuId: z.string(),
  score: z.number(),
  reasons: z.array(z.string()),
  breakdown: CandidateBreakdownSchema.optional(),
  menu: z.unknown().optional(),
});

/**
 * 合并后采购清单快照 + 勾选状态（DEC-014 精化，取代 record(unknown) 占位）。
 * 形态与 list-merger 输出一致；alreadyHave=已有·必消（PD-004），pantryStaple=家里常备（C-8）。
 * 两个布尔 optional 缺省=未标（旧存库 JSON 无此字段直接兼容）。
 */
export const ShoppingListItemSchema = z.object({
  ingredientId: z.string(),
  name: z.string(),
  category: z.string(),
  qty: z.number(),
  unit: z.string(),
  checked: z.boolean(),
  alreadyHave: z.boolean().optional(),
  pantryStaple: z.boolean().optional(),
});

export const ShoppingListGroupSchema = z.object({
  category: z.string(),
  items: z.array(ShoppingListItemSchema),
});

/** 备菜建议（C-4）：今晚预处理 / 明早先做 */
export const PrepAdviceSchema = z.object({
  tonight: z.array(z.string()),
  tomorrowMorning: z.array(z.string()),
});

export const ShoppingListSchema = z.object({
  groups: z.array(ShoppingListGroupSchema),
  /**
   * 备菜建议（v0.12，PD-020/C-4）：分「今晚预处理」（泡/腌/解冻工序前置）
   * 与「明早先做」（早餐工序）；条目为「菜名：工序」人话文本。旧存库清单无此字段，缺省兼容。
   */
  prepAdvice: PrepAdviceSchema.optional(),
});

// ───── 日计划快照（PD-020，对齐 engine DayPlanResult，存 Plan.dayPlan） ─────

/** 过滤轨迹（可解释性，与 engine FilterTrace 同构） */
export const FilterTraceSchema = z.object({
  menuId: z.string(),
  stage: z.enum(['safety', 'feasibility']),
  rule: z.string(),
});

/** 快照菜品用料行（与 engine DishIngredientView 同构；换一餐时恢复引擎输入需完整用料） */
export const DayPlanDishIngredientSchema = z.object({
  ingredientId: z.string(),
  ingredientName: z.string(),
  aliases: z.array(z.string()),
  category: z.string(),
  defaultUnit: z.string(),
  qty: z.number(),
  unit: z.string(),
  optional: z.boolean(),
});

/**
 * 快照菜品 = Dish 全字段 + mealTypes + 用料。快照即历史事实：存生成当时投影
 * （含 ingredients），换一餐时据此恢复引擎 current 输入，不因菜品后续下架/编辑而失真。
 */
export const DayPlanDishSchema = DishSchema.extend({
  ingredients: z.array(DayPlanDishIngredientSchema),
});

/** 单餐计划（所选餐次各一套；道数随人数伸缩，缺槽如实标注） */
export const DayPlanMealSchema = z.object({
  slot: MealSlotSchema,
  /** 内容稳定哈希 id（同组合跨批次同 id，T-A3 口径） */
  menuId: z.string(),
  dishes: z.array(DayPlanDishSchema),
  score: z.number(),
  reasons: z.array(z.string()),
  filtered: z.array(FilterTraceSchema),
  totalActiveMinutes: z.number().int(),
});

/** 必消跨餐分配落位（哪个必消分到了哪餐哪道菜） */
export const MustUseAllocationSchema = z.object({
  ingredientId: z.string(),
  slot: MealSlotSchema,
  dishId: z.string(),
  dishName: z.string(),
});

/** 想吃的菜排入情况（与忌口/必消冲突时如实标注，不硬凑） */
export const DesiredDishNoteSchema = z.object({
  dishId: z.string(),
  dishName: z.string(),
  included: z.boolean(),
  slot: MealSlotSchema.optional(),
  reason: z.string(),
});

/** 单餐空手归因类型（PD-017 两型 + PD-014 组合口径扩展） */
export const MealFailureKindSchema = z.enum(['NO_DISH', 'TIME_BUDGET', 'COMBINATION']);

/** 单餐空手归因：哪一餐、因为什么出不了、调整出路 */
export const MealFailureSchema = z.object({
  slot: MealSlotSchema,
  kind: MealFailureKindSchema,
  detail: z.string(),
  suggestions: z.array(z.string()),
});

/**
 * 日计划快照（三餐×菜单 + 必消落位 + 想吃的菜标注 + 空手归因 + 跨餐说明）。
 * 结构与 engine DayPlanResult 同构（v0.12 对齐基准 = t-q09-engine-dayplan 67bccb1）。
 */
export const DayPlanSchema = z.object({
  meals: z.array(DayPlanMealSchema),
  mustUseAllocation: z.array(MustUseAllocationSchema),
  desiredNotes: z.array(DesiredDishNoteSchema),
  failures: z.array(MealFailureSchema),
  crossMealNotes: z.array(z.string()),
  filtered: z.array(FilterTraceSchema),
});

/**
 * 事件 payload（如 swap 时记 {reason: "太麻烦"}）。
 * 不同 EventType 的 payload 结构不同，3.2 仅标注为 Json，
 * 采用 z.record(z.string(), z.unknown()) 承载，按需在业务层细化。
 */
export const EventPayloadSchema = z.record(z.string(), z.unknown());

// ───── 模型 ─────

/**
 * 计划：一次"今晚吃什么"（存量单餐）/ "明天吃什么"（v0.12 起三餐）的完整快照。
 * 单餐计划：context + candidates + lockedMenuId；三餐计划：dayContext + dayPlan
 * （生成即落库，无三选一，故 status 直接 LOCKED）。读取方按字段有无分流。
 */
export const PlanSchema = z.object({
  id: z.string(),
  familyId: z.string(),
  planDate: z.date(),
  /** 存量单餐上下文（people 口径）；三餐计划该字段缺省 */
  context: PlanContextSchema.optional(),
  /** 三餐上下文（PD-020 成人/儿童口径）；存量单餐计划该字段缺省 */
  dayContext: DayPlanContextSchema.optional(),
  /**
   * 存量单餐三候选；三餐计划无三选一，输出恒空数组。default 保持输出类型必填
   * （消费面 h5 plan.candidates.find() 依赖非空类型，破坏性变更是下一卡 UI 的事）。
   */
  candidates: z.array(CandidateSchema).default([]),
  /** 三餐计划快照（引擎 DayPlanResult 全量投影） */
  dayPlan: DayPlanSchema.optional(),
  lockedMenuId: z.string().optional(),
  /** 锁定菜单的真实菜名列表（按 sort 排序；历史页展示用，未锁定=undefined） */
  dishNames: z.array(z.string()).optional(),
  shoppingList: ShoppingListSchema.optional(),
  status: PlanStatusSchema.default('PROPOSED'),
  createdAt: z.date(),
});

/** 行为事件（埋点）；mealSlot = 反馈所属餐次（v0.12 按餐关联，存量事件缺省=晚餐） */
export const EventSchema = z.object({
  id: z.string(),
  familyId: z.string(),
  planId: z.string().optional(),
  type: EventTypeSchema,
  payload: EventPayloadSchema.optional(),
  mealSlot: MealSlotSchema.optional(),
  createdAt: z.date(),
});
