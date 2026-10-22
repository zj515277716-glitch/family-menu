// apps/h5/test/meal-setup-draft.spec.ts
// S-04「定明天的餐」编辑会话纯逻辑单测（T-Q12）。
// 核心验收（设计规则 5）：同一次编辑会话内任何操作顺序不丢已填内容——
// 各字段操作互不干扰，混合操作序列后无关字段原样保留。
import { describe, it, expect } from 'vitest'
import {
  addDesired,
  addTag,
  buildRecommendPayload,
  defaultDraft,
  removeDesired,
  removeTag,
  resolveDraft,
  toggleMeal,
  type MealSetupDraft,
} from '../src/lib/meal-setup-draft'

const DATE = '2026-10-20'

describe('草稿初始化与同日重进', () => {
  it('默认带出长期设置（成人/儿童），餐次默认全选，标签全空', () => {
    const d = defaultDraft(DATE, { adults: 4, children: 1 })
    expect(d).toEqual({
      date: DATE,
      adults: 4,
      children: 1,
      mustUse: [],
      tempAvoidances: [],
      desired: [],
      meals: ['breakfast', 'lunch', 'dinner'],
    })
  })

  it('resolveDraft：同一次编辑会话（同一计划日）重进保留已填；跨日重建', () => {
    const filled: MealSetupDraft = {
      ...defaultDraft(DATE, { adults: 2, children: 0 }),
      mustUse: ['番茄'],
      tempAvoidances: ['牛肉'],
      desired: [{ id: 'dish-1', name: '可乐鸡翅' }],
      meals: ['dinner'],
    }
    // 同日重进：原样保留（不丢已填）
    expect(resolveDraft(filled, DATE, { adults: 4, children: 2 })).toBe(filled)
    // 跨日：新会话重建（默认值可以来自更新后的长期设置）
    const next = resolveDraft(filled, '2026-10-21', { adults: 4, children: 2 })
    expect(next.date).toBe('2026-10-21')
    expect(next.adults).toBe(4)
    expect(next.children).toBe(2)
    expect(next.mustUse).toEqual([])
    expect(next.meals).toEqual(['breakfast', 'lunch', 'dinner'])
  })
})

describe('标签增删（必消 / 临时忌口共用语义）', () => {
  it('addTag：trim、去重、空白不加', () => {
    expect(addTag([], ' 番茄 ')).toEqual(['番茄'])
    expect(addTag(['番茄'], '番茄')).toEqual(['番茄'])
    expect(addTag(['番茄'], ' 番茄 ')).toEqual(['番茄'])
    expect(addTag(['番茄'], '')).toEqual(['番茄'])
    expect(addTag(['番茄'], '   ')).toEqual(['番茄'])
    expect(addTag(['番茄'], '鸡蛋')).toEqual(['番茄', '鸡蛋'])
  })

  it('removeTag：按值删，其它不动', () => {
    expect(removeTag(['番茄', '鸡蛋'], '番茄')).toEqual(['鸡蛋'])
    expect(removeTag(['番茄'], '不存在')).toEqual(['番茄'])
  })
})

describe('餐次勾选', () => {
  it('点选切换；至少保留一餐（再点最后一个不生效）', () => {
    expect(toggleMeal(['breakfast', 'lunch', 'dinner'], 'lunch')).toEqual(['breakfast', 'dinner'])
    expect(toggleMeal(['breakfast', 'dinner'], 'lunch')).toEqual(['breakfast', 'dinner', 'lunch'])
    expect(toggleMeal(['dinner'], 'dinner')).toEqual(['dinner'])
  })
})

describe('想吃的菜（点选，按 id 去重）', () => {
  it('addDesired：同 id 不重复；removeDesired 按 id 删', () => {
    const a = { id: 'dish-1', name: '可乐鸡翅' }
    const b = { id: 'dish-2', name: '番茄炒蛋' }
    expect(addDesired([a], a)).toEqual([a])
    expect(addDesired([a], b)).toEqual([a, b])
    expect(removeDesired([a, b], 'dish-1')).toEqual([b])
  })
})

describe('编辑会话不丢已填（任何操作顺序）', () => {
  it('混合操作序列：各字段互不干扰', () => {
    let d = defaultDraft(DATE, { adults: 2, children: 0 })
    // 顺序 1：先加必消 → 改人数 → 加忌口 → 勾餐次 → 选想吃的菜
    d = { ...d, mustUse: addTag(d.mustUse, '番茄') }
    d = { ...d, adults: 3 }
    d = { ...d, tempAvoidances: addTag(d.tempAvoidances, '虾') }
    d = { ...d, meals: toggleMeal(d.meals, 'lunch') }
    d = { ...d, desired: addDesired(d.desired, { id: 'dish-1', name: '可乐鸡翅' }) }
    expect(d.mustUse).toEqual(['番茄'])
    expect(d.adults).toBe(3)
    expect(d.tempAvoidances).toEqual(['虾'])
    expect(d.meals).toEqual(['breakfast', 'dinner'])
    expect(d.desired).toEqual([{ id: 'dish-1', name: '可乐鸡翅' }])

    // 继续乱序：删必消、加第二个忌口、再勾回中餐、改儿童数——其余字段原样
    d = { ...d, mustUse: removeTag(d.mustUse, '番茄') }
    d = { ...d, tempAvoidances: addTag(d.tempAvoidances, '牛肉') }
    d = { ...d, meals: toggleMeal(d.meals, 'lunch') }
    d = { ...d, children: 2 }
    expect(d.mustUse).toEqual([])
    expect(d.tempAvoidances).toEqual(['虾', '牛肉'])
    expect(d.meals).toEqual(['breakfast', 'dinner', 'lunch'])
    expect(d.desired).toEqual([{ id: 'dish-1', name: '可乐鸡翅' }])
    expect(d.adults).toBe(3)
  })
})

describe('生成推荐载荷（POST /api/recommend 的 DayPlanContext）', () => {
  it('字段映射：临时忌口→ingredientName，想吃的菜→desiredDishIds，餐次原样', () => {
    const d: MealSetupDraft = {
      date: DATE,
      adults: 3,
      children: 2,
      mustUse: ['番茄', '鸡蛋'],
      tempAvoidances: ['牛肉'],
      desired: [{ id: 'dish-1', name: '可乐鸡翅' }],
      meals: ['breakfast', 'dinner'],
    }
    const payload = buildRecommendPayload(d, { timeBudgetMin: 30, avoidRecentDays: 5 })
    expect(payload).toEqual({
      adults: 3,
      children: 2,
      timeBudgetMin: 30,
      mustUseIngredients: ['番茄', '鸡蛋'],
      tempAvoidances: [{ ingredientName: '牛肉' }],
      desiredDishIds: ['dish-1'],
      meals: ['breakfast', 'dinner'],
      avoidRecentDays: 5,
    })
  })

  it('空的可选字段不携带（契约 optional，不多发）', () => {
    const d = defaultDraft(DATE, { adults: 2, children: 0 })
    const payload = buildRecommendPayload(d, { timeBudgetMin: 60 })
    expect(payload).toEqual({
      adults: 2,
      children: 0,
      timeBudgetMin: 60,
      mustUseIngredients: [],
      meals: ['breakfast', 'lunch', 'dinner'],
    })
    expect('tempAvoidances' in payload).toBe(false)
    expect('desiredDishIds' in payload).toBe(false)
    expect('avoidRecentDays' in payload).toBe(false)
  })
})
