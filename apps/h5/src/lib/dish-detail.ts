// apps/h5/src/lib/dish-detail.ts
// S-09 菜品做法纯逻辑（T-Q13，C-5）：用量按（成人+儿童）/ BASE_SERVINGS 缩放凑整、
// 分步排序、同餐同日上一道/下一道、要点 chips 与 S-09 路由拼装。
// 缩放规则复用 list-merger（PD-005/DEC-014），不手写另一套公式。
import type { Dish, DishStep, DayPlanDish, MealSlot } from '@family-menu/shared'
import { BASE_SERVINGS, roundPurchase } from '@family-menu/list-merger'

/** 菜谱用量缩放：qty ×（成人+儿童）/ 4，再按购买量凑整（向上取整、最小 1） */
export function scaleIngredientQty(qty: number, adults: number, children: number): number {
  return roundPurchase((qty * (adults + children)) / BASE_SERVINGS)
}

/** 人数口径「2 大 1 小」 */
export function peopleLabel(adults: number, children: number): string {
  return `${adults} 大 ${children} 小`
}

/** 分步按 order 升序（不改原数组） */
export function orderedSteps(steps: readonly DishStep[]): DishStep[] {
  return [...steps].sort((a, b) => a.order - b.order)
}

export interface DishNav {
  index: number
  prev: DayPlanDish | null
  next: DayPlanDish | null
}

/** 同餐同日换道：只用 plan.dayPlan 该 slot 的菜序；找不到时两端都为「没有了」 */
export function findDishNav(dishes: readonly DayPlanDish[], dishId: string): DishNav {
  const index = dishes.findIndex((d) => d.id === dishId)
  if (index < 0) return { index: -1, prev: null, next: null }
  return {
    index,
    prev: index > 0 ? dishes[index - 1] : null,
    next: index < dishes.length - 1 ? dishes[index + 1] : null,
  }
}

export interface DishChip {
  text: string
  /** 动火时间 = 主色热 chip（PD-016 方向 A） */
  hot: boolean
}

/** 大图遮罩上的要点 chips：动火时间（热）+ 菜系 + 口味标签；空值不上屏 */
export function dishChips(dish: Pick<Dish, 'activeMinutes' | 'cuisine' | 'flavorTags'>): DishChip[] {
  const chips: DishChip[] = [{ text: `动火 ${dish.activeMinutes} 分钟`, hot: true }]
  if (dish.cuisine && dish.cuisine.trim()) chips.push({ text: dish.cuisine.trim(), hot: false })
  for (const tag of dish.flavorTags) {
    if (tag && tag.trim()) chips.push({ text: tag.trim(), hot: false })
  }
  return chips
}

/** S-09 路由（参数一律 encode；切道用 redirectTo 替换当前页，避免栈膨胀） */
export function buildDishPageUrl(params: {
  date: string
  planId: string
  slot: MealSlot
  dishId: string
}): string {
  return (
    `/pages/dish/index?date=${encodeURIComponent(params.date)}` +
    `&planId=${encodeURIComponent(params.planId)}` +
    `&slot=${encodeURIComponent(params.slot)}` +
    `&dishId=${encodeURIComponent(params.dishId)}`
  )
}
