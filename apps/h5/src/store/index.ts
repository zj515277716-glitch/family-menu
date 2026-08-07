// apps/h5/src/store/index.ts
// Zustand 全局 store：tonight 情境状态保持 + plan 状态 + familyRules 缓存
// 对齐 wireframes 第411行：tonight 情境跳 candidates 返回不丢
import { create } from 'zustand'
import type { FamilyRule, PlanContext } from '@family-menu/shared'
import type { CandidateView, MenuSnapshot } from '../types'

interface AppState {
  // ── tonight 情境（状态保持，跳 candidates 返回不丢） ──
  tonightContext: PlanContext
  setTonightPeople: (people: number) => void
  setTonightTimeBudget: (min: number) => void
  setTonightMustUse: (mustUse: string[]) => void
  resetTonightContext: (rule: FamilyRule) => void

  // ── 推荐结果 + 当前 planId ──
  candidates: CandidateView[]
  currentPlanId: string | null
  setCandidates: (c: CandidateView[]) => void
  setCurrentPlanId: (id: string | null) => void

  // ── familyRules 缓存（首次启动检测 + tonight 预填默认值） ──
  familyRule: FamilyRule | null
  familyRuleLoaded: boolean
  setFamilyRule: (rule: FamilyRule | null) => void

  // ── 当前锁定的 menuId + menu 快照（plan 页用） ──
  lockedMenuId: string | null
  lockedMenu: MenuSnapshot | null
  setLockedMenu: (menuId: string, menu?: MenuSnapshot) => void
}

const DEFAULT_TONIGHT: PlanContext = {
  people: 4,
  timeBudgetMin: 30,
  mustUse: [],
}

export const useStore = create<AppState>((set) => ({
  tonightContext: DEFAULT_TONIGHT,
  setTonightPeople: (people) =>
    set((s) => ({ tonightContext: { ...s.tonightContext, people } })),
  setTonightTimeBudget: (min) =>
    set((s) => ({ tonightContext: { ...s.tonightContext, timeBudgetMin: min } })),
  setTonightMustUse: (mustUse) =>
    set((s) => ({ tonightContext: { ...s.tonightContext, mustUse } })),
  resetTonightContext: (rule) =>
    set({
      tonightContext: {
        people: rule.defaultPeople,
        timeBudgetMin: rule.timeBudgets[0] ?? 30,
        mustUse: [],
      },
    }),

  candidates: [],
  currentPlanId: null,
  setCandidates: (c) => set({ candidates: c }),
  setCurrentPlanId: (id) => set({ currentPlanId: id }),

  familyRule: null,
  familyRuleLoaded: false,
  setFamilyRule: (rule) => set({ familyRule: rule, familyRuleLoaded: true }),

  lockedMenuId: null,
  lockedMenu: null,
  setLockedMenu: (menuId, menu) =>
    set({ lockedMenuId: menuId, lockedMenu: menu ?? null }),
}))
