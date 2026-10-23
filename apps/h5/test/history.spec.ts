// apps/h5/test/history.spec.ts
// S-11 历史读模型单测（T-Q13）：旧版跳过、今天/未来排除、同日取最新、近 14 天边界、
// 日期倒序、缺餐按 displayMealSlots 如实留行、人数未记录不猜。
import { describe, it, expect } from 'vitest'
import type { DayPlan, DayPlanDish, DayPlanMeal, MealFailure, MealSlot, Plan } from '@family-menu/shared'
import { buildHistoryDays, historyDayNote, mealSlotShortLabel } from '../src/lib/history'

function localDate(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00`)
}

function createdAt(dateStr: string, hour = 10): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d, hour)
}

function dish(id: string): DayPlanDish {
  return {
    id,
    name: `菜-${id}`,
    mealRole: 'MAIN',
    flavorTags: [],
    spicyLevel: 0,
    splitFlavor: false,
    activeMinutes: 10,
    totalMinutes: 15,
    equipment: [],
    steps: [],
    status: 'PUBLISHED',
    origin: 'MANUAL',
    ingredients: [],
  }
}

function meal(slot: MealSlot, dishIds: string[] = []): DayPlanMeal {
  return {
    slot,
    menuId: `menu-${slot}`,
    dishes: dishIds.map(dish),
    score: 90,
    reasons: [],
    filtered: [],
    totalActiveMinutes: dishIds.length * 10,
  }
}

function dayPlan(
  meals: DayPlanMeal[] = [],
  failures: MealFailure[] = [],
): DayPlan {
  return {
    meals,
    mustUseAllocation: [],
    desiredNotes: [],
    failures,
    crossMealNotes: [],
    filtered: [],
  }
}

function plan(opts: {
  id: string
  date: string
  createdAt?: Date
  adults?: number
  children?: number
  slots?: MealSlot[]
  meals?: DayPlanMeal[]
  failures?: MealFailure[]
  withDayPlan?: boolean
}): Plan {
  return {
    id: opts.id,
    familyId: 'fam-1',
    planDate: localDate(opts.date),
    dayContext:
      opts.adults === undefined
        ? undefined
        : {
            adults: opts.adults,
            children: opts.children ?? 0,
            timeBudgetMin: 30,
            mustUseIngredients: [],
            meals: opts.slots,
          },
    candidates: [],
    dayPlan: opts.withDayPlan === false ? undefined : dayPlan(opts.meals ?? [], opts.failures ?? []),
    status: 'LOCKED',
    createdAt: opts.createdAt ?? createdAt(opts.date),
  }
}

describe('历史分组', () => {
  it('旧版无 dayPlan 的计划跳过（即使它是同日更新的那一份）', () => {
    const days = buildHistoryDays(
      [
        plan({ id: 'legacy', date: '2026-10-21', withDayPlan: false, createdAt: createdAt('2026-10-21', 20) }),
        plan({ id: 'new', date: '2026-10-21', slots: ['dinner'], meals: [meal('dinner', ['d1'])], adults: 2 }),
      ],
      '2026-10-22',
    )
    expect(days).toHaveLength(1)
    expect(days[0].plan.id).toBe('new')
  })

  it('同一天多份计划：取 createdAt 最新一份', () => {
    const days = buildHistoryDays(
      [
        plan({ id: 'old', date: '2026-10-21', createdAt: createdAt('2026-10-21', 8), slots: ['dinner'], meals: [meal('dinner', ['a'])], adults: 2 }),
        plan({ id: 'latest', date: '2026-10-21', createdAt: createdAt('2026-10-21', 18), slots: ['dinner'], meals: [meal('dinner', ['b'])], adults: 2 }),
      ],
      '2026-10-22',
    )
    expect(days.map((d) => d.plan.id)).toEqual(['latest'])
  })

  it('今天与未来不进历史', () => {
    const days = buildHistoryDays(
      [
        plan({ id: 'today', date: '2026-10-22', slots: ['dinner'], meals: [meal('dinner', ['a'])], adults: 2 }),
        plan({ id: 'tomorrow', date: '2026-10-23', slots: ['dinner'], meals: [meal('dinner', ['a'])], adults: 2 }),
      ],
      '2026-10-22',
    )
    expect(days).toEqual([])
  })

  it('近 14 天边界：昨天起算的 14 个日历日内保留，再早一天排除', () => {
    const days = buildHistoryDays(
      [
        plan({ id: 'edge-in', date: '2026-10-09', slots: ['dinner'], meals: [meal('dinner', ['a'])], adults: 2 }),
        plan({ id: 'edge-out', date: '2026-10-08', slots: ['dinner'], meals: [meal('dinner', ['a'])], adults: 2 }),
        plan({ id: 'yesterday', date: '2026-10-21', slots: ['dinner'], meals: [meal('dinner', ['a'])], adults: 2 }),
      ],
      '2026-10-22',
    )
    expect(days.map((d) => d.plan.id)).toEqual(['yesterday', 'edge-in'])
  })

  it('日期倒序', () => {
    const days = buildHistoryDays(
      [
        plan({ id: 'd1', date: '2026-10-18', slots: ['dinner'], meals: [meal('dinner', ['a'])], adults: 2 }),
        plan({ id: 'd2', date: '2026-10-21', slots: ['dinner'], meals: [meal('dinner', ['a'])], adults: 2 }),
        plan({ id: 'd3', date: '2026-10-20', slots: ['dinner'], meals: [meal('dinner', ['a'])], adults: 2 }),
      ],
      '2026-10-22',
    )
    expect(days.map((d) => d.plan.id)).toEqual(['d2', 'd3', 'd1'])
  })
})

describe('日卡与餐行', () => {
  it('缺餐保留行：displayMealSlots 的勾选/失败餐如实展示「没排上」', () => {
    const failure: MealFailure = { slot: 'lunch', kind: 'NO_DISH', detail: '没有符合条件的菜', suggestions: [] }
    const days = buildHistoryDays(
      [
        plan({
          id: 'p',
          date: '2026-10-21',
          slots: ['breakfast', 'lunch', 'dinner'],
          adults: 2,
          children: 1,
          meals: [meal('breakfast', ['b1'])],
          failures: [failure],
        }),
      ],
      '2026-10-22',
    )
    const meals = days[0].meals
    expect(meals.map((m) => m.slot)).toEqual(['breakfast', 'lunch', 'dinner'])
    expect(meals[1].dishes).toEqual([])
    expect(meals[1].failure?.slot).toBe('lunch')
    expect(meals[2].dishes).toEqual([])
    expect(meals[2].failure).toBeNull()
  })

  it('日卡说明：有上下文写「N 餐 · N 大 M 小」', () => {
    const days = buildHistoryDays(
      [
        plan({
          id: 'p',
          date: '2026-10-21',
          slots: ['breakfast', 'lunch', 'dinner'],
          adults: 2,
          children: 1,
          meals: [meal('breakfast', ['a']), meal('lunch', ['b']), meal('dinner', ['c'])],
        }),
      ],
      '2026-10-22',
    )
    expect(historyDayNote(days[0])).toBe('3 餐 · 2 大 1 小')
  })

  it('人数未记录：只写餐数，不猜默认人数', () => {
    const days = buildHistoryDays(
      [plan({ id: 'p', date: '2026-10-21', meals: [meal('dinner', ['a'])] })],
      '2026-10-22',
    )
    expect(days[0].adults).toBeNull()
    expect(historyDayNote(days[0])).toBe('1 餐')
  })

  it('餐次短标签：早/中/晚', () => {
    expect(mealSlotShortLabel('breakfast')).toBe('早')
    expect(mealSlotShortLabel('lunch')).toBe('中')
    expect(mealSlotShortLabel('dinner')).toBe('晚')
  })
})
