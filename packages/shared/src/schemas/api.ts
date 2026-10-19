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
// v0.10（2026-09-12，T-P15，挂账⑧，用户已批准）：DishSchema.imageUrl 站内相对路径分支收紧为
//   /^\/images\/dishes\/[A-Za-z0-9]+\/\d+\.(webp|jpg|png|gif)$/（必须指向内容管线真实落盘结构）；
//   拍板差异：不含 jpeg（normalizeImageExt 把 jpeg 归一为 jpg，DB 无 .jpeg 实例）、保留 gif（GIF8 魔数合法输出，防管线兜底路径中断）；
//   http(s) 绝对 URL 分支与 optional 不变；DB origin='FETCHED' 29 行 100% 符合（AC5 复核在案）。
// v0.11（2026-09-16，菜谱池整改，用户已批准）：DishStepSchema 新增 optional image（步骤做法配图）——
//   仅站内相对路径 /images/dishes/<id>/N.(webp|jpg|png|gif)，口径对齐 imageUrl 站内分支（R-10）；
//   向后兼容（老数据无此字段）；dish 页做法卡「有图嵌图无图纯文字」（下厨房参考样式）。
// v0.12（2026-10-18，T-Q10/PD-020，三餐计划结构，L2）：
//   ① RecommendRequestSchema 由 PlanContext（people 口径）替换为 DayPlanContext（成人/儿童分列、
//      临时忌口/想吃的菜/餐次勾选/避开窗口），RecommendResponseSchema 由三候选报文替换为 PlanSchema
//      （三餐计划生成即落库，无三选一）——请求/响应均为 breaking（生产冻结 + UI 全量下一卡重写，
//      旧 h5 报文对新 API 400，属计划内演进，非静默不兼容）；
//   ② SwapTypeSchema 扩「换一餐」（全换=换一批三餐重推；单菜换=换一道，语义不变），SwapPlanRequestSchema
//      新增 optional slot（换一餐必填，superRefine）；旧「全换/单菜换」字面量仍合法（枚举增量非破坏）；
//   ③ FeedbackRequestSchema/FeedbackResponseSchema 新增 optional mealSlot（按餐记录，同日同餐重提覆盖；
//      存量单餐反馈不传 mealSlot，服务端按晚餐口径兼容）；
//   ④ RescaleShoppingListRequestSchema 由 {people} 替换为 {adults, children}（C-4 换算口径，breaking）；
//   ⑤ GET /api/plans 新增 optional date 查询参数（按日查三餐计划，响应仍是数组：该日计划按 createdAt
//      倒序，取首条即最新；缺省行为不变=全量历史列表）；
//   ⑥ DishSchema 新增 optional mealTypes、PlanSchema 新增 optional dayContext/dayPlan、EventSchema 新增
//      optional mealSlot、ShoppingListSchema 新增 optional prepAdvice（结构定义见各 schema，均增量）。
import { z } from 'zod';
import { MealRoleSchema, MealSlotSchema } from './dish.js';
import { FamilyRuleSchema, ExclusionRuleSchema } from './family.js';
import { DayPlanContextSchema, PlanSchema, ShoppingListSchema } from './plan.js';

// ───── 路径参数 ─────

/** 计划相关路由的 :id 参数 */
export const PlanIdParamsSchema = z.object({
  id: z.string(),
});

// ───── 请求体枚举 ─────

/**
 * 换菜类型（POST /api/plans/:id/swap）。
 * 全换 = 换一批：三餐整体重推（对应 EventType.SWAP_MENU，当前全天已用菜不回池）；
 * 换一餐 = 某餐整体重推，其他两餐不动（v0.12，PD-020/C-3a）；
 * 单菜换 = 单道菜换（对应 EventType.SWAP_DISH，语义不变）。
 */
export const SwapTypeSchema = z.enum(['全换', '单菜换', '换一餐']);

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

/**
 * POST /api/recommend 请求体（v0.12：日计划上下文，PD-020）。
 * 旧 PlanContext（people 口径）报文 v0.12 起 400 拒绝——成人/儿童分列是三餐计划
 * 的硬输入（儿童触发少辣/少刺/软烂约束），无可靠默认值可代填（不静默猜测）。
 */
export const RecommendRequestSchema = DayPlanContextSchema;

/**
 * POST /api/plans/:id/swap 请求体（v0.4，DEC-013；v0.12 扩「换一餐」）。
 * reason 可选（PD-003：换菜原因可不填，服务端未填存 null）；
 * 单菜换：dishId = 被换下的菜（语义钉死），newDishId = 换入的新菜，两者必填且不得相等；
 * 换一餐：slot = 要整体重推的餐次（必填），忽略 dishId/newDishId；
 * 全换：忽略 slot/dishId/newDishId（三餐整体重推，当前已用菜不回池）。
 */
export const SwapPlanRequestSchema = z
  .object({
    reason: z.string().optional(),
    swapType: SwapTypeSchema,
    dishId: z.string().optional(), // 单菜换时必填（superRefine 校验）
    newDishId: z.string().optional(), // 单菜换时必填（superRefine 校验）
    slot: MealSlotSchema.optional(), // 换一餐时必填（superRefine 校验）
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
    if (data.swapType === '换一餐' && !data.slot) {
      ctx.addIssue({ code: 'custom', path: ['slot'], message: '换一餐必须携带要重推的餐次 slot' });
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
 * POST /api/plans/:id/shopping-list/rescale 请求体（v0.5 DEC-014 {people}；v0.12 三餐口径替换）。
 * adults/children = 改后的成人/儿童人数；服务端按（成人+儿童）人数重算清单并持久化，
 * 同步更新 plan.dayContext，按 ingredientId 保留勾选状态，写 Event RESCALE。
 * 旧 {people} 报文 v0.12 起 400 拒绝（成人/儿童分列口径，无法从合并人数反推）。
 */
export const RescaleShoppingListRequestSchema = z.object({
  adults: z.number().int().min(1),
  children: z.number().int().min(0),
});

/**
 * POST /api/plans/:id/feedback 请求体（v0.6 三问模型，DEC-015；v0.12 按餐关联，PD-020/C-5）。
 * didCook = 第①问「做了吗」（必填）；
 * taste = 第②问「味道怎么样」（didCook=true 必填、false 禁传，superRefine 校验）；
 * willRepeat = 第③问「下次还做吗」（必填——没做也可答不做了，C-11 灰标签规则）；
 * actualMinutes = 实际耗时选填（PD-006）；
 * mealSlot = 反馈所属餐次（v0.12：三餐计划必填——评价按餐独立；不传视为晚餐，
 * 兼容存量单餐计划与旧客户端）。同日同餐重提覆盖（C-5 失败恢复口径）。
 * 写入映射（裁决 2/3，DEC-015）：didCook=true -> Event COOKED（payload 含三问+耗时）+ CookLog
 * （taste 映射 result：good->success / ok->partial / fail->fail）；didCook=false -> Event
 * NOT_COOKED（payload 无 taste），不写 CookLog。
 */
export const FeedbackRequestSchema = z
  .object({
    didCook: z.boolean(),
    taste: TasteSchema.optional(),
    willRepeat: z.boolean(),
    actualMinutes: z.number().int().optional(),
    mealSlot: MealSlotSchema.optional(),
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
 * mealSlot = 该条反馈所属餐次（v0.12；存量事件无此字段如实缺省）。
 * 查询参数 mealSlot 可选：传了按该餐过滤最新一条，不传=全计划最新一条（旧行为）。
 * v0.9（T-P12，挂账⑤）：本 schema 描述「有反馈」报文形状；plan 存在但无反馈时
 * 路由层直接返回 200 + JSON null（响应体即 null 字面量）；plan 不存在时仍 404。
 */
export const FeedbackResponseSchema = z.object({
  didCook: z.boolean(),
  taste: TasteSchema.optional(),
  willRepeat: z.boolean().optional(),
  actualMinutes: z.number().int().optional(),
  mealSlot: MealSlotSchema.optional(),
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
 * POST /api/recommend 响应（v0.12：三餐计划本体，生成即落库）。
 * plan.dayPlan 携带三餐菜单/必消落位/想吃的菜标注；空手归因在 plan.dayPlan.failures
 * （PD-017 两型+PD-014 组合口径）。仍会建 Plan 行（含空手归因快照，供当日重进与调整出路）。
 * 旧三候选报文（candidates/unmetMustUse/unmetReasons 顶层字段）v0.12 起移除。
 */
export const RecommendResponseSchema = PlanSchema;

/** 单个计划响应（lock/swap/feedback/repeat） */
export const PlanResponseSchema = PlanSchema;

/**
 * GET /api/plans 查询参数（v0.12）：date 可选（YYYY-MM-DD，本地日界）。
 * 缺省 = 全量历史列表（旧行为不变）；传了 = 只返回该日期的计划（同日多行按 createdAt 倒序，
 * 首条即最新——append 模型下重进取最新一份，对齐 C-3「同一天重进看到同一份三餐」）。
 */
export const PlanListQuerySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date 必须是 YYYY-MM-DD')
    .optional(),
});

/** GET /api/plans 响应（历史列表；date 过滤后仍是数组语义） */
export const PlanListResponseSchema = z.array(PlanSchema);

/** GET|PATCH /api/plans/:id/shopping-list 响应 */
export const ShoppingListResponseSchema = ShoppingListSchema;
