// apps/h5/test/day-menu.spec.ts
// S-06 三餐菜单派生逻辑单测（T-Q12）：必消横幅（已用上/没排上如实标注）、
// 空手判定、失败归因中文文案、换菜三操作（换一道/换一餐/全部换一批）状态机。
import { describe, it, expect } from 'vitest'
import type { DayPlan, DayPlanDish, DayPlanMeal, SwapOption } from '@family-menu/shared'
import {
  buildMustUseBanner,
  dayTotalActiveMinutes,
  displayMealSlots,
  failureKindLabel,
  humanizeFailureDetail,
  isEmptyHand,
  mealDishSummary,
  mealRoleLabel,
  mustUseBannerText,
  swapReducer,
  swapTargetToRequest,
  type SwapState,
} from '../src/lib/day-menu'

// ───── 夹具 ─────

function dish(id: string, name: string, ings: [string, string][] = []): DayPlanDish {
  return {
    id,
    name,
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
    ingredients: ings.map(([iid, iname]) => ({
      ingredientId: iid,
      ingredientName: iname,
      aliases: [],
      category: '蔬菜',
      defaultUnit: 'g',
      qty: 100,
      unit: 'g',
      optional: false,
    })),
  }
}

function meal(slot: 'breakfast' | 'lunch' | 'dinner', dishes: DayPlanDish[]): DayPlanMeal {
  return {
    slot,
    menuId: `menu-${slot}`,
    dishes,
    score: 90,
    reasons: [],
    filtered: [],
    totalActiveMinutes: dishes.reduce((s, d) => s + d.activeMinutes, 0),
  }
}

const dayPlan: DayPlan = {
  meals: [
    meal('breakfast', [dish('d1', '小米粥', [['ing-millet', '小米']])]),
    meal('dinner', [
      dish('d2', '番茄蛋花汤', [
        ['ing-tomato', '番茄'],
        ['ing-egg', '鸡蛋'],
      ]),
    ]),
  ],
  mustUseAllocation: [{ ingredientId: 'ing-tomato', slot: 'dinner', dishId: 'd2', dishName: '番茄蛋花汤' }],
  desiredNotes: [],
  failures: [],
  crossMealNotes: [],
  filtered: [],
}

describe('必消横幅（C-3：已用上如实标注，未消耗如实标注）', () => {
  it('已用上：用户原文「番茄」经已排菜用料名搭桥命中分配（allocation 只有 ingredientId），带落位', () => {
    const items = buildMustUseBanner(dayPlan, ['番茄'])
    expect(items).toEqual([
      { raw: '番茄', used: true, name: '番茄', slot: 'dinner', dishName: '番茄蛋花汤' },
    ])
  })

  it('没排上：用户原文既不在分配里、也匹配不到任何已排菜用料 → used=false', () => {
    const items = buildMustUseBanner(dayPlan, ['番茄', '鸵鸟蛋'])
    expect(items[1]).toEqual({ raw: '鸵鸟蛋', used: false })
  })

  it('原文命中已排菜用料但分配表无此行 → 没排上（不假装用上）', () => {
    // 「小米」是小米粥的用料，但 mustUseAllocation 里没有 ing-millet
    const items = buildMustUseBanner(dayPlan, ['小米'])
    expect(items).toEqual([{ raw: '小米', used: false }])
  })

  it('横幅文案：已用上带餐次落位；没排上另起一行明说', () => {
    const items = buildMustUseBanner(dayPlan, ['番茄', '鸵鸟蛋'])
    const { usedText, unusedText } = mustUseBannerText(items)
    expect(usedText).toBe('✓ 必消食材已用上：番茄（晚餐 · 番茄蛋花汤）')
    expect(unusedText).toBe('必消「鸵鸟蛋」没排上，可调整后再生成')
    const empty = mustUseBannerText([])
    expect(empty).toEqual({ usedText: null, unusedText: null })
  })

  it('必消为空 → 空数组（不渲染横幅）', () => {
    expect(buildMustUseBanner(dayPlan, [])).toEqual([])
  })
})

describe('空手判定与归因文案（C-7）', () => {
  it('三餐全空 → 空手；有一餐出菜 → 非空手', () => {
    expect(isEmptyHand({ ...dayPlan, meals: [meal('breakfast', []), meal('dinner', [])] })).toBe(true)
    expect(isEmptyHand(dayPlan)).toBe(false)
    expect(isEmptyHand({ ...dayPlan, meals: [] })).toBe(true)
  })

  it('失败类型一律中文（设计规则 3）', () => {
    expect(failureKindLabel('NO_DISH')).toBe('没有符合条件的菜')
    expect(failureKindLabel('TIME_BUDGET')).toBe('来不及做')
    expect(failureKindLabel('COMBINATION')).toBe('组合冲突')
  })
})

describe('派生展示', () => {
  it('三餐合计动手时长', () => {
    expect(dayTotalActiveMinutes(dayPlan)).toBe(20)
  })
  it('一餐菜名摘要', () => {
    expect(mealDishSummary(dayPlan.meals[1])).toBe('番茄蛋花汤')
    expect(mealDishSummary(meal('breakfast', []))).toBe('')
  })
})

// ───── 换菜三操作状态机 ─────

const candidates: SwapOption[] = [
  { dishId: 'c1', name: '紫菜蛋花汤', mealRole: 'SOUP', flavorTags: [], spicyLevel: 0, activeMinutes: 5, totalMinutes: 10, equipment: [] },
  { dishId: 'c2', name: '冬瓜丸子汤', mealRole: 'SOUP', flavorTags: [], spicyLevel: 0, activeMinutes: 15, totalMinutes: 25, equipment: [] },
]

describe('换一道（弹层选候选→确认→提交）', () => {
  it('成功路径：打开→候选到达→选中→确认→提交中→成功回 idle', () => {
    let s: SwapState = { phase: 'idle' }
    s = swapReducer(s, { type: 'open-dish', dishId: 'd2' })
    expect(s).toEqual({ phase: 'loading', dishId: 'd2' })
    s = swapReducer(s, { type: 'options-loaded', dishId: 'd2', candidates })
    expect(s).toEqual({ phase: 'picking', dishId: 'd2', candidates, selectedId: null, reason: '' })
    // 未选中候选时确认 = 无操作（禁止静默失败，保持弹层）
    s = swapReducer(s, { type: 'confirm-dish' })
    expect(s).toMatchObject({ phase: 'picking' })
    s = swapReducer(s, { type: 'select', dishId: 'c2' })
    s = swapReducer(s, { type: 'reason', text: '太麻烦' })
    s = swapReducer(s, { type: 'confirm-dish' })
    expect(s).toEqual({
      phase: 'submitting',
      target: { kind: 'dish', dishId: 'd2', newDishId: 'c2', reason: '太麻烦' },
    })
    s = swapReducer(s, { type: 'succeeded' })
    expect(s).toEqual({ phase: 'idle' })
  })

  it('原因选填：空串原因提交为 undefined', () => {
    let s: SwapState = { phase: 'idle' }
    s = swapReducer(s, { type: 'open-dish', dishId: 'd2' })
    s = swapReducer(s, { type: 'options-loaded', dishId: 'd2', candidates })
    s = swapReducer(s, { type: 'select', dishId: 'c1' })
    s = swapReducer(s, { type: 'confirm-dish' })
    expect(s).toEqual({
      phase: 'submitting',
      target: { kind: 'dish', dishId: 'd2', newDishId: 'c1', reason: undefined },
    })
  })

  it('候选加载失败 → 弹层错误态可重试；共 0 个候选如实停留 picking 空列表', () => {
    let s: SwapState = { phase: 'idle' }
    s = swapReducer(s, { type: 'open-dish', dishId: 'd9' })
    s = swapReducer(s, { type: 'options-failed', dishId: 'd9', message: '网络不稳定' })
    expect(s).toEqual({ phase: 'load-error', dishId: 'd9', message: '网络不稳定' })
    // 重试 = 重新打开
    s = swapReducer(s, { type: 'open-dish', dishId: 'd9' })
    s = swapReducer(s, { type: 'options-loaded', dishId: 'd9', candidates: [] })
    expect(s).toMatchObject({ phase: 'picking', candidates: [] })
  })

  it('提交失败（没换成）→ submit-error 保留 target 可再试，成功后才回 idle', () => {
    let s: SwapState = { phase: 'idle' }
    s = swapReducer(s, { type: 'open-dish', dishId: 'd2' })
    s = swapReducer(s, { type: 'options-loaded', dishId: 'd2', candidates })
    s = swapReducer(s, { type: 'select', dishId: 'c1' })
    s = swapReducer(s, { type: 'confirm-dish' })
    s = swapReducer(s, { type: 'failed', message: '不能换成这道菜：儿童餐约束' })
    expect(s).toEqual({
      phase: 'submit-error',
      target: { kind: 'dish', dishId: 'd2', newDishId: 'c1', reason: undefined },
      message: '不能换成这道菜：儿童餐约束',
    })
    // 再试：同一 target 重新提交
    s = swapReducer(s, { type: 'retry' })
    expect(s).toMatchObject({ phase: 'submitting' })
    s = swapReducer(s, { type: 'failed', message: '网络不稳定' })
    s = swapReducer(s, { type: 'close' })
    expect(s).toEqual({ phase: 'idle' })
  })
})

describe('换一餐 / 全部换一批', () => {
  it('换一餐：只带 slot（其他两餐不动由服务端保证）', () => {
    let s: SwapState = { phase: 'idle' }
    s = swapReducer(s, { type: 'start-meal', slot: 'breakfast' })
    expect(s).toEqual({ phase: 'submitting', target: { kind: 'meal', slot: 'breakfast' } })
    s = swapReducer(s, { type: 'succeeded' })
    expect(s).toEqual({ phase: 'idle' })
  })

  it('全部换一批：target kind=all', () => {
    let s: SwapState = { phase: 'idle' }
    s = swapReducer(s, { type: 'start-all' })
    expect(s).toEqual({ phase: 'submitting', target: { kind: 'all' } })
  })

  it('换一餐失败：原菜单保持（状态回 submit-error 可再试/关闭）', () => {
    let s: SwapState = { phase: 'idle' }
    s = swapReducer(s, { type: 'start-meal', slot: 'lunch' })
    s = swapReducer(s, { type: 'failed', message: '换一餐失败，已保持原餐' })
    expect(s).toEqual({
      phase: 'submit-error',
      target: { kind: 'meal', slot: 'lunch' },
      message: '换一餐失败，已保持原餐',
    })
    s = swapReducer(s, { type: 'close' })
    expect(s).toEqual({ phase: 'idle' })
  })
})

describe('换菜三操作 → API 报文（C-3a：语义一一对应，不多发字段）', () => {
  it('换一道：单菜换带 dishId/newDishId，reason 有则带、无则不带', () => {
    expect(swapTargetToRequest({ kind: 'dish', dishId: 'd1', newDishId: 'd2', reason: '太麻烦' })).toEqual({
      swapType: '单菜换',
      dishId: 'd1',
      newDishId: 'd2',
      reason: '太麻烦',
    })
    const noReason = swapTargetToRequest({ kind: 'dish', dishId: 'd1', newDishId: 'd2' })
    expect(noReason).toEqual({ swapType: '单菜换', dishId: 'd1', newDishId: 'd2' })
    expect('reason' in noReason).toBe(false)
  })

  it('换一餐：只带 swapType + slot；全部换一批：只带 swapType', () => {
    expect(swapTargetToRequest({ kind: 'meal', slot: 'dinner' })).toEqual({
      swapType: '换一餐',
      slot: 'dinner',
    })
    expect(swapTargetToRequest({ kind: 'all' })).toEqual({ swapType: '全换' })
  })
})

describe('菜品角色中文（候选弹层展示）', () => {
  it('枚举一律中文', () => {
    expect(mealRoleLabel('MAIN')).toBe('主菜')
    expect(mealRoleLabel('SOUP')).toBe('汤')
  })
})

describe('三餐展示槽位（失败餐不产 meal 也要显示）', () => {
  it('部分失败：勾选/已生成/归因三者并集，补齐失败餐', () => {
    // 用户勾了三餐，引擎只出了早餐，午餐失败（无 meal 条目）
    expect(displayMealSlots(['breakfast', 'lunch', 'dinner'], ['breakfast'], ['lunch'])).toEqual([
      'breakfast',
      'lunch',
      'dinner',
    ])
  })

  it('规范序：乱序输入仍按早/中/晚返回', () => {
    expect(displayMealSlots(['dinner', 'breakfast'], ['lunch'], [])).toEqual([
      'breakfast',
      'lunch',
      'dinner',
    ])
  })

  it('空输入返回空数组；selected 缺省时只看已生成与失败', () => {
    expect(displayMealSlots([], [], [])).toEqual([])
    expect(displayMealSlots(undefined, [], ['dinner'])).toEqual(['dinner'])
  })
})

describe('失败归因文案脱敏（内部 ingredientId 不上屏）', () => {
  it('已知 id → 菜名（已排菜用料表解析）', () => {
    expect(humanizeFailureDetail('必消 ing-tomato 与忌口冲突', dayPlan)).toBe(
      '必消 番茄 与忌口冲突',
    )
  })

  it('未知 id → 该食材，不残留 ing-*', () => {
    const out = humanizeFailureDetail('组合冲突：ing-unknown 与 ing-ghost_2 相克', dayPlan)
    expect(out).toBe('组合冲突：该食材 与 该食材 相克')
    expect(out).not.toMatch(/ing-/)
  })

  it('无 id 原样返回', () => {
    const text = '符合要求的菜最少要 50 分钟'
    expect(humanizeFailureDetail(text, dayPlan)).toBe(text)
  })
})
