// apps/h5/src/store/meal-setup.ts
// 「定明天的餐」编辑会话 store（T-Q12，C-2 + 设计规则 5）。
// 草稿存页面外：S-04 离开（去首页/生成失败回来/空手「调好重新生成」）再进，
// 同一计划日的已填内容原样还在；跨日自动开新会话（默认带出最新长期设置）。
// 全部字段更新走 lib 纯函数，任何操作顺序不丢已填。
import { create } from 'zustand'
import type { MealSlot } from '@family-menu/shared'
import {
  addDesired,
  addTag,
  defaultDraft,
  removeDesired,
  removeTag,
  resolveDraft,
  toggleMeal,
  type DesiredDish,
  type MealSetupDraft,
} from '../lib/meal-setup-draft'

interface MealSetupStore {
  /** 当前编辑会话草稿（null=尚未进入过 S-04） */
  draft: MealSetupDraft | null
  /** 进入 S-04 时调用：同日保留已填，跨日按最新长期设置重建 */
  ensure: (date: string, defaults: { adults: number; children: number }) => void
  setPeople: (adults: number, children: number) => void
  addMustUse: (raw: string) => void
  removeMustUse: (value: string) => void
  addTempAvoidance: (raw: string) => void
  removeTempAvoidance: (value: string) => void
  addDesiredDish: (dish: DesiredDish) => void
  removeDesiredDish: (id: string) => void
  toggleMealSlot: (slot: MealSlot) => void
}

export const useMealSetupStore = create<MealSetupStore>((set) => ({
  draft: null,

  ensure: (date, defaults) =>
    set((s) => ({ draft: resolveDraft(s.draft, date, defaults) })),

  setPeople: (adults, children) =>
    set((s) => (s.draft ? { draft: { ...s.draft, adults, children } } : s)),

  addMustUse: (raw) =>
    set((s) => (s.draft ? { draft: { ...s.draft, mustUse: addTag(s.draft.mustUse, raw) } } : s)),

  removeMustUse: (value) =>
    set((s) => (s.draft ? { draft: { ...s.draft, mustUse: removeTag(s.draft.mustUse, value) } } : s)),

  addTempAvoidance: (raw) =>
    set((s) =>
      s.draft ? { draft: { ...s.draft, tempAvoidances: addTag(s.draft.tempAvoidances, raw) } } : s,
    ),

  removeTempAvoidance: (value) =>
    set((s) =>
      s.draft ? { draft: { ...s.draft, tempAvoidances: removeTag(s.draft.tempAvoidances, value) } } : s,
    ),

  addDesiredDish: (dish) =>
    set((s) => (s.draft ? { draft: { ...s.draft, desired: addDesired(s.draft.desired, dish) } } : s)),

  removeDesiredDish: (id) =>
    set((s) => (s.draft ? { draft: { ...s.draft, desired: removeDesired(s.draft.desired, id) } } : s)),

  toggleMealSlot: (slot) =>
    set((s) => (s.draft ? { draft: { ...s.draft, meals: toggleMeal(s.draft.meals, slot) } } : s)),
}))

export { defaultDraft }
export type { MealSetupDraft }
