// apps/h5/test/day-plan.spec.ts
// 日期/餐次纯逻辑单测（T-Q12）：本地日期串、中文日期格式、首页「下一餐置顶」时间排序。
import { describe, it, expect } from 'vitest'
import {
  formatDateCN,
  localDateStr,
  mealKindHint,
  mealTimeHint,
  nextMealView,
  todayDateStr,
  tomorrowDateStr,
} from '../src/lib/day-plan'

describe('本地日期串（YYYY-MM-DD，本地日界，供 GET /api/plans?date=）', () => {
  it('localDateStr：按本地时区拼，不前补 UTC', () => {
    expect(localDateStr(new Date(2026, 9, 19, 22, 30))).toBe('2026-10-19')
    expect(localDateStr(new Date(2026, 0, 5, 0, 30))).toBe('2026-01-05')
  })

  it('today/tomorrow：明天 = 今天 +1 本地日', () => {
    const now = new Date(2026, 9, 19, 22, 5)
    expect(todayDateStr(now)).toBe('2026-10-19')
    expect(tomorrowDateStr(now)).toBe('2026-10-20')
  })

  it('跨月边界：10月31日的明天是 11-01', () => {
    expect(tomorrowDateStr(new Date(2026, 9, 31, 23, 59))).toBe('2026-11-01')
  })
})

describe('中文日期格式（设计规则 3：枚举全中文、时间本地格式）', () => {
  it('Date 对象 → 10月14日 周三', () => {
    expect(formatDateCN(new Date(2026, 9, 14))).toBe('10月14日 周三')
  })
  it('ISO 字符串（API 报文 planDate 为 JSON 串）同样可格式化', () => {
    // 2026-10-14T00:00:00 本地零点
    expect(formatDateCN('2026-10-14T00:00:00+08:00')).toBe('10月14日 周三')
  })
  it('周日边界', () => {
    expect(formatDateCN(new Date(2026, 9, 18))).toBe('10月18日 周日')
  })
})

describe('下一餐置顶（C-5：6-10 早餐在前，过 10 点中餐在前，依此类推）', () => {
  it('6-10 点：早餐置顶，标「下一餐」', () => {
    expect(nextMealView(6)).toEqual({ order: ['breakfast', 'lunch', 'dinner'], next: 'breakfast' })
    expect(nextMealView(9)).toEqual({ order: ['breakfast', 'lunch', 'dinner'], next: 'breakfast' })
  })
  it('凌晨（<6）：早餐是今天的下一餐，同样置顶', () => {
    expect(nextMealView(3)).toEqual({ order: ['breakfast', 'lunch', 'dinner'], next: 'breakfast' })
  })
  it('过 10 点：中餐置顶', () => {
    expect(nextMealView(10)).toEqual({ order: ['lunch', 'dinner', 'breakfast'], next: 'lunch' })
    expect(nextMealView(14)).toEqual({ order: ['lunch', 'dinner', 'breakfast'], next: 'lunch' })
  })
  it('过 15 点：晚餐置顶', () => {
    expect(nextMealView(15)).toEqual({ order: ['dinner', 'breakfast', 'lunch'], next: 'dinner' })
    expect(nextMealView(20)).toEqual({ order: ['dinner', 'breakfast', 'lunch'], next: 'dinner' })
  })
  it('过 21 点：今天三餐已过完，不再标「下一餐」（晚餐保持在上=刚吃过的一餐）', () => {
    expect(nextMealView(21)).toEqual({ order: ['dinner', 'breakfast', 'lunch'], next: null })
    expect(nextMealView(23)).toEqual({ order: ['dinner', 'breakfast', 'lunch'], next: null })
  })
})

describe('餐次提示文案', () => {
  it('建议开饭时间', () => {
    expect(mealTimeHint('breakfast')).toBe('建议 7:00')
    expect(mealTimeHint('lunch')).toBe('建议 12:00')
    expect(mealTimeHint('dinner')).toBe('建议 18:00')
  })
  it('餐型：早餐轻食、午晚正餐', () => {
    expect(mealKindHint('breakfast')).toBe('轻食')
    expect(mealKindHint('lunch')).toBe('正餐')
    expect(mealKindHint('dinner')).toBe('正餐')
  })
})
