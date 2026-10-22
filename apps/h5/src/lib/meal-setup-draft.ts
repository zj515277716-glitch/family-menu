// apps/h5/src/lib/meal-setup-draft.ts
// S-04「定明天的餐」编辑会话纯逻辑（T-Q12，C-2）。
// 设计规则 5：同一次编辑会话内任何操作顺序不丢已填——草稿以「计划日」为会话键
// 存在页面外（store），各字段更新互不干扰；本模块全部纯函数，与渲染解耦便于单测。
import type { DayPlanContext, MealSlot } from '@family-menu/shared'
import { MEAL_SLOTS } from '@family-menu/shared'

/** 想吃的菜（点选入库菜，id 是数据关联所需，用户只见菜名——设计规则 1） */
export interface DesiredDish {
  id: string
  name: string
}

/** 明天计划编辑会话草稿（C-2：属「明天计划」的临时设置，与长期设置分开） */
export interface MealSetupDraft {
  /** 计划日（YYYY-MM-DD 本地）：会话键，同日重进不丢、跨日新会话 */
  date: string
  adults: number
  children: number
  /** 必消食材（用户原文名称，服务端 resolveMustUseIds 归一为库内 id） */
  mustUse: string[]
  /** 临时忌口（仅明天生效，不影响长期设置） */
  tempAvoidances: string[]
  /** 想吃的菜（选填，点选） */
  desired: DesiredDish[]
  /** 餐次勾选（默认全选） */
  meals: MealSlot[]
}

/** 新会话草稿：人数默认带出长期设置，餐次全选，其余空 */
export function defaultDraft(
  date: string,
  defaults: { adults: number; children: number },
): MealSetupDraft {
  return {
    date,
    adults: defaults.adults,
    children: defaults.children,
    mustUse: [],
    tempAvoidances: [],
    desired: [],
    meals: [...MEAL_SLOTS],
  }
}

/**
 * 重进还原：同一次编辑会话（同一计划日）返回原草稿（不丢已填）；
 * 计划日变了（过零点跨天）重建新会话，默认值取最新长期设置。
 */
export function resolveDraft(
  existing: MealSetupDraft | null,
  date: string,
  defaults: { adults: number; children: number },
): MealSetupDraft {
  if (existing && existing.date === date) {
    return existing
  }
  return defaultDraft(date, defaults)
}

/** 加标签（必消/临时忌口共用）：trim、去重（trim 后同值视为重复）、空白不加 */
export function addTag(list: readonly string[], raw: string): string[] {
  const v = raw.trim()
  if (!v || list.includes(v)) {
    return [...list]
  }
  return [...list, v]
}

/** 删标签：按值删，其它原序保留 */
export function removeTag(list: readonly string[], value: string): string[] {
  return list.filter((x) => x !== value)
}

/** 餐次勾选切换：至少保留一餐（再点最后一个不生效，C-2 默认全选可减不可清空） */
export function toggleMeal(meals: readonly MealSlot[], slot: MealSlot): MealSlot[] {
  if (meals.includes(slot)) {
    return meals.length <= 1 ? [...meals] : meals.filter((s) => s !== slot)
  }
  return [...meals, slot]
}

/** 想吃的菜：按 id 去重追加 */
export function addDesired(list: readonly DesiredDish[], dish: DesiredDish): DesiredDish[] {
  if (list.some((d) => d.id === dish.id)) {
    return [...list]
  }
  return [...list, dish]
}

/** 想吃的菜：按 id 删 */
export function removeDesired(list: readonly DesiredDish[], id: string): DesiredDish[] {
  return list.filter((d) => d.id !== id)
}

/**
 * 生成推荐载荷（POST /api/recommend 的 DayPlanContext）：
 * 临时忌口 → ingredientName（服务端按名归一）；想吃的菜 → desiredDishIds；
 * 空的可选字段不携带（契约 optional，不多发）；时长档/避开窗口取长期设置当前值。
 */
export function buildRecommendPayload(
  draft: MealSetupDraft,
  opts: { timeBudgetMin: 15 | 30 | 60; avoidRecentDays?: number },
): DayPlanContext {
  const payload: DayPlanContext = {
    adults: draft.adults,
    children: draft.children,
    timeBudgetMin: opts.timeBudgetMin,
    mustUseIngredients: [...draft.mustUse],
    meals: [...draft.meals],
  }
  if (draft.tempAvoidances.length > 0) {
    payload.tempAvoidances = draft.tempAvoidances.map((name) => ({ ingredientName: name }))
  }
  if (draft.desired.length > 0) {
    payload.desiredDishIds = draft.desired.map((d) => d.id)
  }
  if (opts.avoidRecentDays !== undefined) {
    payload.avoidRecentDays = opts.avoidRecentDays
  }
  return payload
}
