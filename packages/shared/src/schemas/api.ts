// packages/shared/src/schemas/api.ts
// API 请求/响应契约，对齐实施方案 5.1 路由清单
// v0.2（2026-08-07）：新增 ExclusionRule 路由契约 + FeedbackRequest 扩展 cookResult/failPoints
// v0.4（2026-09-04，DEC-013/TP-03）：SwapPlanRequest reason 改 optional + 新增 newDishId 条件必填（superRefine）；
//   新增 GET /api/plans/:id/swap-options 契约（SwapOptionsQuery/SwapOption/SwapOptionsResponse）
// v0.5（2026-09-04，DEC-014/TP-04）：新增 POST /api/plans/:id/shopping-list/rescale 契约（RescaleShoppingListRequest）；
//   ShoppingListSchema 精化为结构化（条目增 alreadyHave/pantryStaple optional 标记，见 plan.ts）
// v0.6（2026-09-05，DEC-015/TP-05）：反馈重写为三问模型（C-10/PD-006）——
//   FeedbackRequest = { didCook 必填, taste 条件必填（做了必填/没做禁传）, willRepeat 必填, actualMinutes 选填 }；
//   新增 TasteSchema / FeedbackResponseSchema（GET /api/plans/:id/feedback）；
//   删除 FeedbackResultSchema / CookResultSchema（旧 result/cookResult/failPoints 五项表单模型移除，breaking）。
// v0.7（2026-09-11，T-P09，用户已批准）：DishSchema.imageUrl 口径放宽为
//   「http(s) 绝对 URL 或 /images/ 开头站内相对路径」二选一（z.union）——R-10 方案 B：
//   DB 与 Plan.candidates 快照只存相对路径（fetch2dish 产物 /images/dishes/<id>/<i>.<ext>），
//   前端按 TARO_APP_API_BASE_URL 拼基址；sourceUrl 保持 z.string().url() 不动（外部原帖必为 URL）；
//   空串两个分支均不匹配，仍拒绝。（原记于 dish.ts 头部，T-P11 账本收敛移入此单一入口。）
// v0.8（2026-09-11，T-P10/PD-017，用户已批准）：RecommendResponseSchema 新增 optional unmetReasons ——
//   空手原因分类侧车字段（key=必消食材用户原文，value='TIME_BUDGET'|'NO_DISH'），
//   空手时由服务端携带：存在不可消耗必消时为非空分类对象（与 unmetMustUse 同键集）；
//   C-7a 组合必消空手时为空对象 {}；正常推荐时缺省。
// v0.9（2026-09-12，T-P12，挂账⑤）：GET /api/plans/:id/feedback 空态语义修订——
//   「plan 存在但无反馈」从 404 改为 200 + JSON null（响应体即 null 字面量，非空对象/空串）；
//   「plan 不存在」保持 404（404 语义收敛为「资源不存在」）；有反馈报文形状零变化。
import { z } from 'zod';
import { MealRoleSchema } from './dish.js';
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
 * 第②问：味道怎么样（v0.6，DEC-015）。
 * good = 好吃 / ok = 一般 / fail = 翻车。
 * didCook=true 时必填、didCook=false 时禁传（superRefine 校验，见 FeedbackRequestSchema）。
 */
export const TasteSchema = z.enum(['good', 'ok', 'fail']);

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

/**
 * POST /api/plans/:id/swap 请求体（v0.4，DEC-013）。
 * reason 改为可选（PD-003：换菜原因可不填，服务端未填存 null）；
 * 单菜换：dishId = 被换下的菜（语义钉死），newDishId = 换入的新菜，两者必填且不得相等；
 * 全换：忽略 dishId/newDishId（v0.3 形态保留，「整套换」功能已推迟但契约枚举不动）。
 * 行为收紧：v0.3 可过校验的畸形报文（单菜换缺双 id）v0.4 起 400 拒绝（杜绝假成功，非破坏性变更）。
 */
export const SwapPlanRequestSchema = z
  .object({
    reason: z.string().optional(),
    swapType: SwapTypeSchema,
    dishId: z.string().optional(), // 单菜换时必填（superRefine 校验）
    newDishId: z.string().optional(), // 单菜换时必填（superRefine 校验）
  })
  .superRefine((data, ctx) => {
    if (data.swapType === '单菜换') {
      if (!data.dishId) {
        ctx.addIssue({ code: 'custom', path: ['dishId'], message: '单菜换必须携带被换下的菜 dishId' });
      }
      if (!data.newDishId) {
        ctx.addIssue({ code: 'custom', path: ['newDishId'], message: '单菜换必须携带新菜 newDishId' });
      }
      if (data.dishId && data.newDishId && data.dishId === data.newDishId) {
        ctx.addIssue({ code: 'custom', path: ['newDishId'], message: 'newDishId 不能与 dishId 相同（换给自己无意义）' });
      }
    }
  });

/**
 * GET /api/plans/:id/swap-options 查询参数（v0.4，DEC-013）：被换下的菜 dishId 必填。
 */
export const SwapOptionsQuerySchema = z.object({ dishId: z.string().min(1) });

/**
 * GET /api/plans/:id/swap-options 响应中的单个候选（v0.4，DEC-013）。
 * 只出事实字段；「不用开火」等派生展示由前端按 equipment 计算（契约不出派生字段）。
 */
export const SwapOptionSchema = z.object({
  dishId: z.string(),
  name: z.string(),
  mealRole: MealRoleSchema,
  cuisine: z.string().optional(),
  flavorTags: z.array(z.string()),
  spicyLevel: z.number().int(),
  activeMinutes: z.number().int(),
  totalMinutes: z.number().int(),
  equipment: z.array(z.string()),
});

/**
 * GET /api/plans/:id/swap-options 响应（v0.4，DEC-013）。
 * candidates 为空数组 = 该菜当前没有可换的候选（200 如实态而非错误，对齐确认书 C-6）。
 */
export const SwapOptionsResponseSchema = z.object({
  dishId: z.string(),
  mealRole: MealRoleSchema,
  candidates: z.array(SwapOptionSchema),
});

/** PATCH /api/plans/:id/shopping-list 请求体（勾选状态） */
export const PatchShoppingListRequestSchema = z.object({
  itemId: z.string(),
  checked: z.boolean(),
});

/**
 * POST /api/plans/:id/shopping-list/rescale 请求体（v0.5，DEC-014）。
 * people = 改后的今晚人数（>=1）；服务端按新人数重算清单并持久化，
 * 同步更新 plan.context.people，按 ingredientId 保留勾选状态，写 Event RESCALE。
 */
export const RescaleShoppingListRequestSchema = z.object({
  people: z.number().int().min(1),
});

/**
 * POST /api/plans/:id/feedback 请求体（v0.6 三问模型，DEC-015，对应 C-10/PD-006）。
 * didCook = 第①问「做了吗」（必填）；
 * taste = 第②问「味道怎么样」（didCook=true 必填、false 禁传，superRefine 校验）；
 * willRepeat = 第③问「下次还做吗」（必填——没做也可答不做了，C-11 灰标签规则）；
 * actualMinutes = 实际耗时选填（PD-006）。
 * 写入映射（裁决 2/3，DEC-015）：didCook=true -> Event COOKED（payload 含三问+耗时）+ CookLog
 * （taste 映射 result：good->success / ok->partial / fail->fail）；didCook=false -> Event
 * NOT_COOKED（payload 无 taste），不写 CookLog。
 * breaking：旧 result/cookResult/failPoints 报文 v0.6 起 400 拒绝（消费面仅自家 h5，同 PR 升级）。
 */
export const FeedbackRequestSchema = z
  .object({
    didCook: z.boolean(),
    taste: TasteSchema.optional(),
    willRepeat: z.boolean(),
    actualMinutes: z.number().int().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.didCook && !data.taste) {
      ctx.addIssue({ code: 'custom', path: ['taste'], message: '做了必须回答味道怎么样（好吃/一般/翻车）' });
    }
    if (!data.didCook && data.taste) {
      ctx.addIssue({ code: 'custom', path: ['taste'], message: '没做不能回答味道怎么样' });
    }
  });

/**
 * GET /api/plans/:id/feedback 响应（v0.6，DEC-015 裁决 4；v0.9 空态语义修订，T-P12）。
 * 返回该 plan 事件流最新一条反馈（didCook 由事件类型派生：COOKED/NOT_COOKED）；
 * taste/willRepeat/actualMinutes 取事件 payload；submittedAt = 事件创建时间。
 * 响应侧 taste/willRepeat/actualMinutes optional：v0.5 旧事件 payload 无这些字段，如实缺省不编造。
 * v0.9（T-P12，挂账⑤）：本 schema 描述「有反馈」报文形状（零变化）；plan 存在但无反馈时
 * 路由层直接返回 200 + JSON null（响应体即 null 字面量）；plan 不存在时仍 404。
 */
export const FeedbackResponseSchema = z.object({
  didCook: z.boolean(),
  taste: TasteSchema.optional(),
  willRepeat: z.boolean().optional(),
  actualMinutes: z.number().int().optional(),
  submittedAt: z.date(),
});

// ───── 响应体 schemas ─────

/** GET|PUT /api/family/rules 响应 */
export const FamilyRulesResponseSchema = FamilyRuleSchema;

/**
 * GET /api/family/exclusions 响应（该 family 的全部禁忌规则）。
 * v0.2 新增（STEP-06 契约缺口修复：禁忌不持久化）。
 */
export const GetExclusionsResponseSchema = z.array(ExclusionRuleSchema);

/**
 * POST /api/recommend 响应（3 套候选+理由）。
 * v0.3（TP-02/PD-012）：新增 optional unmetMustUse —— 必消食材硬过滤空手信号：
 * 非空 = 这些必消食材无法被任何菜单消耗，本次空手（candidates 为空数组、不建 Plan）；
 * 正常推荐时字段缺省或为空数组。向后兼容：optional 缺省不影响 v0.2 调用方（先例同 FeedbackRequestSchema.cookResult）。
 */
export const RecommendResponseSchema = z.object({
  candidates: z.array(CandidateSchema),
  unmetMustUse: z.array(z.string()).optional(), // v0.3，语义不变
  /**
   * v0.8（T-P10/PD-017）：空手原因分类。
   * key = 用户原文（与 unmetMustUse 元素一一对应）；value = TIME_BUDGET（有菜但时长档排不下）
   * 或 NO_DISH（没有菜能消耗）。空手时由服务端携带：存在不可消耗必消时为非空分类对象
   * （与 unmetMustUse 同键集）；C-7a 组合必消空手时为空对象 `{}`；正常推荐时缺省。
   * 向后兼容：optional 增量（先例同 v0.3 unmetMustUse）。
   */
  unmetReasons: z.record(z.string(), z.enum(['TIME_BUDGET', 'NO_DISH'])).optional(),
});

/** 单个计划响应（lock/swap/feedback/repeat） */
export const PlanResponseSchema = PlanSchema;

/** GET /api/plans 响应（历史列表） */
export const PlanListResponseSchema = z.array(PlanSchema);

/** GET|PATCH /api/plans/:id/shopping-list 响应 */
export const ShoppingListResponseSchema = ShoppingListSchema;
