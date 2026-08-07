// apps/h5/src/types/index.ts
// 前端扩展类型：基于 shared v0.1 契约 + 展示层扩展（Menu/Dish 快照）
// 设计假设：Candidate 契约只含 menuId/score/reasons/breakdown，不含菜单详情；
// 前端用 CandidateView 承载可选的 MenuSnapshot（Mock 模式提供，真 API 降级）。

import type {
  Candidate,
  FamilyRule,
  Plan,
  PlanContext,
  ShoppingList,
} from '@family-menu/shared'

// ───── shared 契约类型再导出（页面便捷引用） ─────
export type {
  Candidate,
  FamilyRule,
  Plan,
  PlanContext,
  ShoppingList,
}
export type {
  ExclusionRule,
  ExclusionScope,
  Severity,
  SwapType,
  FeedbackResult,
  PlanStatus,
  MealRole,
  PrepSequenceItem,
} from '@family-menu/shared'

// ───── 展示层扩展：菜单/菜品快照 ─────

/** 菜品快照（候选卡/备菜展示用，从 engine DishView 投影） */
export interface DishSnapshot {
  id: string
  name: string
  mealRole: string
  cuisine?: string
  flavorTags: string[]
  spicyLevel: number
  activeMinutes: number
  equipment: string[]
}

/** 菜单快照（候选卡展示用，从 engine MenuView 投影） */
export interface MenuSnapshot {
  id: string
  name: string
  scene: string
  totalActiveMinutes: number
  prepSequence: { minute: number; action: string }[]
  dishes: DishSnapshot[]
}

/** 候选视图 = 契约 Candidate + 可选菜单详情 */
export interface CandidateView extends Candidate {
  menu?: MenuSnapshot
}

// ───── ShoppingList 精化结构（对齐 list-merger 输出） ─────
// shared v0.1 ShoppingListSchema 为 z.record(z.unknown())，此处精化为 list-merger 实际结构

/** 采购清单单项 */
export interface ShoppingListItem {
  ingredientId: string
  name: string
  category: string
  qty: number
  unit: string
  checked: boolean
}

/** 采购清单分组 */
export interface ShoppingListGroup {
  category: string
  items: ShoppingListItem[]
}

/** 采购清单（精化结构） */
export interface ShoppingListData {
  groups: ShoppingListGroup[]
}

// ───── API 响应扩展类型 ─────

/** POST /api/recommend 响应（契约 {candidates} + 额外 planId，STEP-05 设计假设#2） */
export interface RecommendResult {
  candidates: CandidateView[]
  planId: string
}

// ───── 静态资源模块声明（Taro webpack 图片 import） ─────
declare module '*.png' {
  const src: string
  export default src
}
declare module '*.jpg' {
  const src: string
  export default src
}
declare module '*.jpeg' {
  const src: string
  export default src
}
declare module '*.webp' {
  const src: string
  export default src
}
