// apps/h5/src/lib/day-menu.ts
// S-06 三餐菜单派生纯逻辑（T-Q12，C-3/C-3a/C-7）：
// 必消横幅（已用上/没排上如实标注）、空手判定、失败归因文案、换菜三操作状态机。
// 与渲染解耦便于单测；不伪造任何服务端事实（crossMealNotes 含引擎内部 id，不直接上屏）。
import type {
  DayPlan,
  DayPlanMeal,
  MealFailureKind,
  MealRole,
  MealSlot,
  SwapOption,
  SwapPlanRequest,
} from '@family-menu/shared'
import { MEAL_SLOTS, MEAL_SLOT_LABELS } from '@family-menu/shared'

/** 菜品角色中文（设计规则 3：枚举一律中文；候选弹层展示用） */
const MEAL_ROLE_LABELS: Record<MealRole, string> = {
  MAIN: '主菜',
  SIDE: '配菜',
  SOUP: '汤',
  STAPLE: '主食',
}

export function mealRoleLabel(role: MealRole): string {
  return MEAL_ROLE_LABELS[role]
}

// ───── 三餐展示槽位（C-7/PD-018） ─────

/**
 * 应展示的餐次 = 用户勾选餐次 ∪ 已生成餐次 ∪ 失败归因餐次，按 MEAL_SLOTS 规范序。
 * 引擎失败餐不产 DayPlanMeal（只留 failure），只看 meals 会把失败餐整块弄丢。
 */
export function displayMealSlots(
  selected: readonly MealSlot[] | undefined,
  mealSlots: readonly MealSlot[],
  failureSlots: readonly MealSlot[],
): MealSlot[] {
  const present = new Set<MealSlot>([...(selected ?? []), ...mealSlots, ...failureSlots])
  return MEAL_SLOTS.filter((slot) => present.has(slot))
}

/**
 * 失败归因文案脱敏：引擎 detail 可能拼已 resolve 的 ingredientId（ing-*），
 * 按已排菜用料表换成人能读的食材名；未知 id 统一「该食材」，绝不把内部 id 上屏。
 */
export function humanizeFailureDetail(detail: string, dayPlan: DayPlan): string {
  const names = new Map<string, string>()
  for (const meal of dayPlan.meals) {
    for (const dish of meal.dishes) {
      for (const ing of dish.ingredients) {
        if (!names.has(ing.ingredientId)) names.set(ing.ingredientId, ing.ingredientName)
      }
    }
  }
  return detail.replace(/ing-[A-Za-z0-9_-]+/g, (id) => names.get(id) ?? '该食材')
}

// ───── 必消横幅（C-3：✓ 必消食材已用上 / 没排上如实标注） ─────

export interface MustUseBannerItem {
  /** 用户输入原文（必消标签上的字） */
  raw: string
  used: boolean
  /** 库内食材名（经菜品用料表按 id 解析；没排上时缺省，展示用原文） */
  name?: string
  slot?: MealSlot
  dishName?: string
}

interface IngredientHit {
  ingredientId: string
  ingredientName: string
}

/** 扫三餐全部菜品用料：按 id / 名 / 别名建立用户原文 → 库内食材的映射（本地可查的唯一事实源） */
function scanIngredients(dayPlan: DayPlan): {
  byId: Map<string, string>
  byName: Map<string, IngredientHit>
} {
  const byId = new Map<string, string>()
  const byName = new Map<string, IngredientHit>()
  for (const m of dayPlan.meals) {
    for (const d of m.dishes) {
      for (const ing of d.ingredients) {
        if (!byId.has(ing.ingredientId)) byId.set(ing.ingredientId, ing.ingredientName)
        const hit = { ingredientId: ing.ingredientId, ingredientName: ing.ingredientName }
        if (!byName.has(ing.ingredientName)) byName.set(ing.ingredientName, hit)
        for (const alias of ing.aliases) {
          if (!byName.has(alias)) byName.set(alias, hit)
        }
      }
    }
  }
  return { byId, byName }
}

/**
 * 必消横幅条目：dayContext.mustUseIngredients 是用户原文（名称），
 * mustUseAllocation 是服务端 resolve 后的 ingredientId——两侧靠菜品用料表（id/名/别名）搭桥。
 * 对不上分配的一律「没排上」如实标注（C-3：未消耗则如实标注，不假装用上）。
 */
export function buildMustUseBanner(dayPlan: DayPlan, mustUseRaw: readonly string[]): MustUseBannerItem[] {
  if (mustUseRaw.length === 0) return []
  const { byId, byName } = scanIngredients(dayPlan)
  const byAllocationId = new Map(dayPlan.mustUseAllocation.map((a) => [a.ingredientId, a]))
  return mustUseRaw.map((raw) => {
    // 原文本身即 id（理论兜底）或经名/别名命中已排菜用料后按 id 查分配
    const hitId = byAllocationId.has(raw) ? raw : byName.get(raw)?.ingredientId
    const alloc = hitId ? byAllocationId.get(hitId) : undefined
    if (!alloc) {
      return { raw, used: false }
    }
    return {
      raw,
      used: true,
      name: byId.get(alloc.ingredientId) ?? raw,
      slot: alloc.slot,
      dishName: alloc.dishName,
    }
  })
}

/** 横幅文案行：已用上「✓ 必消已用上：番茄（晚餐 · 番茄蛋花汤）」；没排上另起一行明说 */
export function mustUseBannerText(items: readonly MustUseBannerItem[]): { usedText: string | null; unusedText: string | null } {
  const used = items.filter((i) => i.used)
  const unused = items.filter((i) => !i.used)
  const usedText =
    used.length > 0
      ? `✓ 必消食材已用上：${used
          .map((i) => `${i.name ?? i.raw}（${MEAL_SLOT_LABELS[i.slot as MealSlot]} · ${i.dishName}）`)
          .join('、')}`
      : null
  const unusedText =
    unused.length > 0 ? `必消「${unused.map((i) => i.raw).join('」「')}」没排上，可调整后再生成` : null
  return { usedText, unusedText }
}

// ───── 空手判定与归因（C-7） ─────

/** 空手 = 所选餐次一餐都没出（全部 0 道菜或 meals 为空） */
export function isEmptyHand(dayPlan: DayPlan): boolean {
  return dayPlan.meals.every((m) => m.dishes.length === 0)
}

/** 失败归因类型中文文案（设计规则 3；PD-017 两型 + PD-014 组合口径） */
export function failureKindLabel(kind: MealFailureKind): string {
  switch (kind) {
    case 'NO_DISH':
      return '没有符合条件的菜'
    case 'TIME_BUDGET':
      return '来不及做'
    case 'COMBINATION':
      return '组合冲突'
  }
}

// ───── 派生展示 ─────

/** 三餐合计动手时长（换菜后同步更新，C-3a） */
export function dayTotalActiveMinutes(dayPlan: DayPlan): number {
  return dayPlan.meals.reduce((sum, m) => sum + m.totalActiveMinutes, 0)
}

/** 一餐菜名摘要（首页明天摘要大卡：红豆薏米粥 · 胡萝卜鸡蛋饼 · 拌豆腐丝） */
export function mealDishSummary(meal: DayPlanMeal): string {
  return meal.dishes.map((d) => d.name).join(' · ')
}

// ───── 换菜三操作状态机（C-3a：换一道 / 换一餐 / 全部换一批） ─────

/** 提交目标：单菜换须带被换下 dishId + 换入 newDishId（原因选填）；换一餐只带 slot；全换无参 */
export type SwapTarget =
  | { kind: 'dish'; dishId: string; newDishId: string; reason?: string }
  | { kind: 'meal'; slot: MealSlot }
  | { kind: 'all' }

/** 状态机目标 → POST /api/plans/:id/swap 报文（C-3a 三语义一一对应，不多发字段） */
export function swapTargetToRequest(target: SwapTarget): SwapPlanRequest {
  switch (target.kind) {
    case 'dish':
      return {
        swapType: '单菜换',
        dishId: target.dishId,
        newDishId: target.newDishId,
        ...(target.reason ? { reason: target.reason } : {}),
      }
    case 'meal':
      return { swapType: '换一餐', slot: target.slot }
    case 'all':
      return { swapType: '全换' }
  }
}

export type SwapState =
  | { phase: 'idle' }
  | { phase: 'loading'; dishId: string }
  | {
      phase: 'picking'
      dishId: string
      candidates: SwapOption[]
      selectedId: string | null
      reason: string
    }
  | { phase: 'load-error'; dishId: string; message: string }
  | { phase: 'submitting'; target: SwapTarget }
  | { phase: 'submit-error'; target: SwapTarget; message: string }

export type SwapEvent =
  | { type: 'open-dish'; dishId: string }
  | { type: 'options-loaded'; dishId: string; candidates: SwapOption[] }
  | { type: 'options-failed'; dishId: string; message: string }
  | { type: 'select'; dishId: string }
  | { type: 'reason'; text: string }
  | { type: 'confirm-dish' }
  | { type: 'start-meal'; slot: MealSlot }
  | { type: 'start-all' }
  | { type: 'succeeded' }
  | { type: 'failed'; message: string }
  | { type: 'retry' }
  | { type: 'close' }

/**
 * 状态流转铁律（C-3a）：
 * - 未选中候选确认 = 无操作（不静默失败，弹层保持）；
 * - 提交失败 → submit-error 保留 target（没换成，原菜单保持可再试）；
 * - 成功 / 关闭才回 idle。
 */
export function swapReducer(state: SwapState, ev: SwapEvent): SwapState {
  switch (ev.type) {
    case 'open-dish':
      return { phase: 'loading', dishId: ev.dishId }
    case 'options-loaded':
      return { phase: 'picking', dishId: ev.dishId, candidates: ev.candidates, selectedId: null, reason: '' }
    case 'options-failed':
      return { phase: 'load-error', dishId: ev.dishId, message: ev.message }
    case 'select':
      return state.phase === 'picking' ? { ...state, selectedId: ev.dishId } : state
    case 'reason':
      return state.phase === 'picking' ? { ...state, reason: ev.text } : state
    case 'confirm-dish': {
      if (state.phase !== 'picking' || !state.selectedId) return state
      const reason = state.reason.trim()
      return {
        phase: 'submitting',
        target: {
          kind: 'dish',
          dishId: state.dishId,
          newDishId: state.selectedId,
          reason: reason || undefined,
        },
      }
    }
    case 'start-meal':
      return { phase: 'submitting', target: { kind: 'meal', slot: ev.slot } }
    case 'start-all':
      return { phase: 'submitting', target: { kind: 'all' } }
    case 'succeeded':
      return { phase: 'idle' }
    case 'failed':
      return state.phase === 'submitting'
        ? { phase: 'submit-error', target: state.target, message: ev.message }
        : state
    case 'retry':
      return state.phase === 'submit-error' ? { phase: 'submitting', target: state.target } : state
    case 'close':
      return { phase: 'idle' }
  }
}
