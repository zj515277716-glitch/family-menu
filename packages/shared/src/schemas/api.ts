// packages/shared/src/schemas/api.ts
// API 请求/响应契约，对齐实施方案 5.1 路由清单
// v0.2（2026-08-07）：新增 ExclusionRule 路由契约 + FeedbackRequest 扩展 cookResult/failPoints
import { z } from 'zod';
import { FamilyRuleSchema, ExclusionRuleSchema } from './family.js';
import { CandidateSchema, PlanContextSchema, PlanSchema, ShoppingListSchema } from './plan.js';

// ───── 路径参数 ─────

/** 计划相关路由的 :id 参数 */
export const PlanIdParamsSchema = z.object({
  id: z.string(),
});

// ───── 请求体枚举 ─────

/**
 * 换菜类型（POST /api/plans/:id/swap）。
 * 全换 = 整套换（对应 EventType.SWAP_MENU）；
 * 单菜换 = 单道菜换（对应 EventType.SWAP_DISH）。
 * 取值依据任务卡 5.1 路由清单 "swapType: string(全换/单菜换)"。
 */
export const SwapTypeSchema = z.enum(['全换', '单菜换']);

/**
 * 反馈结果（POST /api/plans/:id/feedback）。
 * cooked = 做了；not_cooked = 没做；repeat = 下次还做。
 * 取值依据任务卡 5.1 "result: string(cooked/not_cooked/repeat)"。
 */
export const FeedbackResultSchema = z.enum(['cooked', 'not_cooked', 'repeat']);

/**
 * 烹饪结果（POST /api/plans/:id/feedback 的 cookResult 字段）。
 * success/partial/fail，取值与 CookLogSchema.result（menu.ts）一致；
 * 反馈时由 service 写入 CookLog.result。v0.2 新增（STEP-06 契约缺口修复）。
 */
export const CookResultSchema = z.enum(['success', 'partial', 'fail']);

// ───── 请求体 schemas ─────

/** PUT /api/family/rules 请求体（即家庭规则全量写入） */
export const PutFamilyRulesRequestSchema = FamilyRuleSchema;

/**
 * PUT /api/family/exclusions 请求体（禁忌规则全量替换）。
 * 语义：整体替换该 family 的全部 ExclusionRule（非增量），与 PUT /api/family/rules 同构。
 * v0.2 新增（STEP-06 契约缺口修复：禁忌不持久化）。
 */
export const PutExclusionsRequestSchema = z.array(ExclusionRuleSchema);

/** POST /api/recommend 请求体（今晚情境） */
export const RecommendRequestSchema = PlanContextSchema;

/** POST /api/plans/:id/swap 请求体 */
export const SwapPlanRequestSchema = z.object({
  reason: z.string(),
  swapType: SwapTypeSchema,
  dishId: z.string().optional(), // 单菜换时填
});

/** PATCH /api/plans/:id/shopping-list 请求体（勾选状态） */
export const PatchShoppingListRequestSchema = z.object({
  itemId: z.string(),
  checked: z.boolean(),
});

/**
 * POST /api/plans/:id/feedback 请求体。
 * result = 用户动作（cooked/not_cooked/repeat），写 Plan Event；
 * cookResult = 烹饪结果（success/partial/fail），写 CookLog.result（result=cooked 时有意义）；
 * failPoints = 失败原因，写 CookLog.failPoints（cookResult=partial/fail 时填）。
 * cookResult/failPoints 为 v0.2 新增 optional 字段，向后兼容（v0.1 调用方不传仍通过校验）。
 */
export const FeedbackRequestSchema = z.object({
  result: FeedbackResultSchema,
  actualMinutes: z.number().int().optional(),
  cookResult: CookResultSchema.optional(),
  failPoints: z.string().optional(),
});

// ───── 响应体 schemas ─────

/** GET|PUT /api/family/rules 响应 */
export const FamilyRulesResponseSchema = FamilyRuleSchema;

/**
 * GET /api/family/exclusions 响应（该 family 的全部禁忌规则）。
 * v0.2 新增（STEP-06 契约缺口修复：禁忌不持久化）。
 */
export const GetExclusionsResponseSchema = z.array(ExclusionRuleSchema);

/** POST /api/recommend 响应（3 套候选+理由） */
export const RecommendResponseSchema = z.object({
  candidates: z.array(CandidateSchema),
});

/** 单个计划响应（lock/swap/feedback/repeat） */
export const PlanResponseSchema = PlanSchema;

/** GET /api/plans 响应（历史列表） */
export const PlanListResponseSchema = z.array(PlanSchema);

/** GET|PATCH /api/plans/:id/shopping-list 响应 */
export const ShoppingListResponseSchema = ShoppingListSchema;
