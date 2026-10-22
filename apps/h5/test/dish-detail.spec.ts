// apps/h5/test/dish-detail.spec.ts
// S-09 做法页纯逻辑单测（T-Q13）：用量按（成人+儿童）/4 缩放凑整、分步排序、
// 同餐上一道/下一道边界、要点 chips、路由拼装。
import { describe, it, expect } from 'vitest'
import type { DayPlanDish, DishStep } from '@family-menu/shared'
import {
  buildDishPageUrl,
  dishChips,
  findDishNav,
  orderedSteps,
  peopleLabel,
  scaleIngredientQty,
} from '../src/lib/dish-detail'

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

describe('用量缩放', () => {
  it('按（成人+儿童）/4 缩放后凑整', () => {
    expect(scaleIngredientQty(200, 2, 1)).toBe(150) // 200×3/4
    expect(scaleIngredientQty(1000, 2, 1)).toBe(750)
    expect(scaleIngredientQty(100, 2, 0)).toBe(50) // 100×2/4
  })

  it('不足 1 也凑整为 1（与 list-merger roundPurchase 同口径）', () => {
    expect(scaleIngredientQty(1, 1, 0)).toBe(1) // 0.25 → 1
  })

  it('人数文案「N 大 M 小」', () => {
    expect(peopleLabel(2, 1)).toBe('2 大 1 小')
  })
})

describe('分步与换道', () => {
  it('分步按 order 升序，不改原数组', () => {
    const steps: DishStep[] = [
      { order: 3, text: '第三步' },
      { order: 1, text: '第一步' },
      { order: 2, text: '第二步' },
    ]
    const ordered = orderedSteps(steps)
    expect(ordered.map((s) => s.text)).toEqual(['第一步', '第二步', '第三步'])
    expect(steps.map((s) => s.order)).toEqual([3, 1, 2])
  })

  it('同餐菜序：首道无上一道、末道无下一道', () => {
    const dishes = [dish('a'), dish('b'), dish('c')]
    expect(findDishNav(dishes, 'a')).toMatchObject({ index: 0, prev: null, next: dishes[1] })
    expect(findDishNav(dishes, 'b')).toMatchObject({ index: 1, prev: dishes[0], next: dishes[2] })
    expect(findDishNav(dishes, 'c')).toMatchObject({ index: 2, prev: dishes[1], next: null })
  })

  it('菜不在该餐：两端都为「没有了」', () => {
    expect(findDishNav([dish('a')], 'x')).toEqual({ index: -1, prev: null, next: null })
  })
})

describe('大图 chips 与路由', () => {
  it('动火时间为主色热 chip，菜系与口味随后；空值不上屏', () => {
    expect(
      dishChips({ activeMinutes: 12, cuisine: '粤式', flavorTags: ['清淡', '', '刺少'] }),
    ).toEqual([
      { text: '动火 12 分钟', hot: true },
      { text: '粤式', hot: false },
      { text: '清淡', hot: false },
      { text: '刺少', hot: false },
    ])
  })

  it('S-09 路由参数经 encode', () => {
    expect(
      buildDishPageUrl({ date: '2026-10-22', planId: 'p 1', slot: 'dinner', dishId: 'd/1' }),
    ).toBe('/pages/dish/index?date=2026-10-22&planId=p%201&slot=dinner&dishId=d%2F1')
  })
})
