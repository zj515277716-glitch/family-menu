// apps/h5/src/lib/day-plan.ts
// 日期/餐次纯逻辑（T-Q12）：本地日期串（API date 参数）、中文日期格式、
// 首页「下一餐置顶」时间排序（C-5：6-10 早餐在前，过 10 点中餐在前，依此类推）。
// 与渲染解耦便于单测；餐次中文标签用 shared 常量（设计规则 3：枚举一律中文）。
import type { MealSlot } from '@family-menu/shared'
import { MEAL_SLOTS, MEAL_SLOT_LABELS } from '@family-menu/shared'

export { MEAL_SLOTS, MEAL_SLOT_LABELS }

const WEEKDAYS_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'] as const

/** 本地日期串 YYYY-MM-DD（GET /api/plans?date= 的本地日界口径） */
export function localDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** 今天本地日期串 */
export function todayDateStr(now: Date = new Date()): string {
  return localDateStr(now)
}

/** 明天本地日期串（「定明天的餐」计划日） */
export function tomorrowDateStr(now: Date = new Date()): string {
  const d = new Date(now)
  d.setDate(d.getDate() + 1)
  return localDateStr(d)
}

/**
 * 中文本地日期「10月14日 周三」（设计规则 3）。
 * API 报文里 z.date() 字段经 JSON 为 ISO 字符串，两种输入都接。
 */
export function formatDateCN(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d
  return `${date.getMonth() + 1}月${date.getDate()}日 ${WEEKDAYS_CN[date.getDay()]}`
}

// ───── 下一餐置顶（C-5） ─────

export interface NextMealView {
  /** 三餐展示顺序（下一餐在前，其余按当日先后接上） */
  order: MealSlot[]
  /** 应标「下一餐」的餐次；今天三餐已过完（≥21 点）为 null 不标 */
  next: MealSlot | null
}

/**
 * 按当前小时排三餐顺序：
 *   <10 点（含凌晨）→ 早餐置顶；10–15 点 → 中餐置顶；≥15 点 → 晚餐置顶。
 *   过 21 点今天三餐已过完，不再标「下一餐」（晚餐保持在上 = 刚吃过的一餐）。
 */
export function nextMealView(hour: number): NextMealView {
  if (hour < 10) {
    return { order: ['breakfast', 'lunch', 'dinner'], next: 'breakfast' }
  }
  if (hour < 15) {
    return { order: ['lunch', 'dinner', 'breakfast'], next: 'lunch' }
  }
  return { order: ['dinner', 'breakfast', 'lunch'], next: hour < 21 ? 'dinner' : null }
}

/** 建议开饭时间（三餐菜单/首页餐头展示） */
export function mealTimeHint(slot: MealSlot): string {
  switch (slot) {
    case 'breakfast':
      return '建议 7:00'
    case 'lunch':
      return '建议 12:00'
    case 'dinner':
      return '建议 18:00'
  }
}

/** 餐型提示：早餐轻食、午晚正餐 */
export function mealKindHint(slot: MealSlot): string {
  return slot === 'breakfast' ? '轻食' : '正餐'
}
