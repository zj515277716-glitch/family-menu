// packages/shared/src/schemas/plan.ts
// 运行数据契约，对齐实施方案 3.2 数据模型（Plan / Event）
import { z } from 'zod';
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
/** 今晚情境：{people, timeBudgetMin, mustUse: string[]} */
export const PlanContextSchema = z.object({
    people: z.number().int(),
    timeBudgetMin: z.number().int(),
    mustUse: z.array(z.string()),
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
export const ShoppingListSchema = z.object({
    groups: z.array(ShoppingListGroupSchema),
});
/**
 * 事件 payload（如 swap 时记 {reason: "太麻烦"}）。
 * 不同 EventType 的 payload 结构不同，3.2 仅标注为 Json，
 * 采用 z.record(z.string(), z.unknown()) 承载，按需在业务层细化。
 */
export const EventPayloadSchema = z.record(z.string(), z.unknown());
// ───── 模型 ─────
/** 计划：一次"今晚吃什么"的完整快照 */
export const PlanSchema = z.object({
    id: z.string(),
    familyId: z.string(),
    planDate: z.date(),
    context: PlanContextSchema,
    candidates: z.array(CandidateSchema),
    lockedMenuId: z.string().optional(),
    /** 锁定菜单的真实菜名列表（按 sort 排序；历史页展示用，未锁定=undefined） */
    dishNames: z.array(z.string()).optional(),
    shoppingList: ShoppingListSchema.optional(),
    status: PlanStatusSchema.default('PROPOSED'),
    createdAt: z.date(),
});
/** 行为事件（埋点） */
export const EventSchema = z.object({
    id: z.string(),
    familyId: z.string(),
    planId: z.string().optional(),
    type: EventTypeSchema,
    payload: EventPayloadSchema.optional(),
    createdAt: z.date(),
});
//# sourceMappingURL=plan.js.map