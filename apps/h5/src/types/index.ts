// apps/h5/src/types/index.ts
// 前端扩展类型：基于 shared v0.1 契约 + 展示层扩展（Menu/Dish 快照）
// 设计假设：Candidate 契约只含 menuId/score/reasons/breakdown，不含菜单详情；
// 前端用 CandidateView 承载可选的 MenuSnapshot（真 API 返回则带，未返回降级）。

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
  /** 用料（做法页展示用；真 API 未返回时为 undefined） */
  ingredients?: { ingredientName: string; qty: number; unit: string }[]
  /** 烹饪步骤（做法页展示用；真 API 未返回时为 undefined） */
  steps?: { order: number; text: string; parallel?: boolean }[]
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

/**
 * POST /api/recommend 响应（契约 RecommendResponse + 额外 planId，STEP-05 设计假设#2）。
 * TP-02/PD-012（契约 v0.3）：planId 改为可选 —— 必消食材无方案时空手返回（candidates=[] 且不建 Plan）；
 * unmetMustUse 非空时为无法消耗的必消食材原文（渲染 C-7 空手文案 + 「去掉『X』再试」按钮）。
 */
export interface RecommendResult {
  candidates: CandidateView[]
  planId?: string
  unmetMustUse?: string[]
}
