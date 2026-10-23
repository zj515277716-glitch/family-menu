// apps/h5/src/lib/history.ts
// S-11 历史读模型纯逻辑（T-Q13，C-6）：GET /api/plans 全量 → 按本地日分组。
// 口径：只保留有 dayPlan 的计划；planDate < 今天；同日取 createdAt 最新一份；
// 近 14 天 = 今天往前 14 个日历日（昨天起算，含昨天）；日期倒序；旧版无 dayPlan 跳过。
import type { DayPlanDish, DayPlanMeal, MealFailure, MealSlot, Plan } from '@family-menu/shared'
import { displayMealSlots } from './day-menu'
import { localDateStr, todayDateStr } from './day-plan'

/** 历史展示窗口：今天之前 14 个日历日（today-13 ~ 昨天） */
export const HISTORY_WINDOW_DAYS = 14

export interface HistoryMeal {
  slot: MealSlot
  meal: DayPlanMeal | null
  dishes: DayPlanDish[]
  failure: MealFailure | null
}

export interface HistoryDay {
  /** 本地日期 YYYY-MM-DD */
  date: string
  plan: Plan
  adults: number | null
  children: number | null
  meals: HistoryMeal[]
}

function parseLocalDate(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00`)
}

function shiftDate(dateStr: string, days: number): string {
  const d = parseLocalDate(dateStr)
  d.setDate(d.getDate() + days)
  return localDateStr(d)
}

function timeOf(plan: Plan): number {
  const raw = plan.createdAt as Date | string
  const t = new Date(raw).getTime()
  return Number.isNaN(t) ? 0 : t
}

function planDateOf(plan: Plan): string | null {
  const raw = plan.planDate as Date | string
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : localDateStr(d)
}

function mealsOfPlan(plan: Plan): HistoryMeal[] {
  const dayPlan = plan.dayPlan
  if (!dayPlan) return []
  const slots = displayMealSlots(
    plan.dayContext?.meals,
    dayPlan.meals.map((m) => m.slot),
    dayPlan.failures.map((f) => f.slot),
  )
  return slots.map((slot) => {
    const meal = dayPlan.meals.find((m) => m.slot === slot) ?? null
    const failure = dayPlan.failures.find((f) => f.slot === slot) ?? null
    return { slot, meal, dishes: meal?.dishes ?? [], failure }
  })
}

/**
 * 全量计划 → 历史日卡（纯函数）。
 * today 由调用方传入本地日期串，便于单测固定边界；不读系统时间。
 */
export function buildHistoryDays(plans: readonly Plan[], today: string = todayDateStr()): HistoryDay[] {
  const oldest = shiftDate(today, -(HISTORY_WINDOW_DAYS - 1))
  const newestByDate = new Map<string, Plan>()

  for (const plan of plans) {
    if (!plan.dayPlan) continue // 旧版无三餐结构，跳过
    const date = planDateOf(plan)
    if (!date) continue
    if (date >= today) continue // 今天/明天不进历史
    if (date < oldest) continue // 近 14 天窗口外
    const prev = newestByDate.get(date)
    if (!prev || timeOf(plan) > timeOf(prev)) newestByDate.set(date, plan)
  }

  return [...newestByDate.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([date, plan]) => ({
      date,
      plan,
      adults: plan.dayContext?.adults ?? null,
      children: plan.dayContext?.children ?? null,
      meals: mealsOfPlan(plan),
    }))
}

/** 日卡说明：「3 餐 · 2 大 1 小」；人数未记录时只写餐数，不猜 */
export function historyDayNote(day: HistoryDay): string {
  const count = `${day.meals.length} 餐`
  if (day.adults === null || day.children === null) return count
  return `${count} · ${day.adults} 大 ${day.children} 小`
}

/** 餐次短标签（历史行左列：早/中/晚） */
export function mealSlotShortLabel(slot: MealSlot): string {
  return slot === 'breakfast' ? '早' : slot === 'lunch' ? '中' : '晚'
}
