// apps/h5/src/store/index.ts
// Zustand 全局 store：tonight 情境状态保持 + plan 状态 + familyRules 缓存
// 对齐 wireframes 第411行：tonight 情境跳 candidates 返回不丢
// C-3a「刷新/重进=看到最后换出的那套」：当晚会话持久化到 localStorage，跨天自动失效
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
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

  // ── 当晚会话标记（持久化恢复用；YYYY-MM-DD，跨天即失效清空） ──
  planDateKey: string | null
  clearTonightSession: () => void
}

const DEFAULT_TONIGHT: PlanContext = {
  people: 4,
  timeBudgetMin: 30,
  mustUse: [],
}

// 本地日期键（YYYY-MM-DD），与会话所属"当晚"对齐
export function todayKey(): string {
  const d = new Date()
  const mm = `${d.getMonth() + 1}`.padStart(2, '0')
  const dd = `${d.getDate()}`.padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

// 持久化白名单：只存"当晚未完成的会话"。
// familyRule/familyRuleLoaded 不持久化——每次启动由 tonight 页重新拉取（防长期缓存失真）
type PersistedState = Pick<
  AppState,
  | 'tonightContext'
  | 'candidates'
  | 'currentPlanId'
  | 'planDateKey'
  | 'lockedMenuId'
  | 'lockedMenu'
>

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      tonightContext: DEFAULT_TONIGHT,
      // 用户动今晚设置即视为"今晚的会话"延续到今天（C-2 同一天重进不丢），
      // 同时把会话日期戳推到今天，供跨天判断使用
      setTonightPeople: (people) =>
        set((s) => ({
          tonightContext: { ...s.tonightContext, people },
          planDateKey: todayKey(),
        })),
      setTonightTimeBudget: (min) =>
        set((s) => ({
          tonightContext: { ...s.tonightContext, timeBudgetMin: min },
          planDateKey: todayKey(),
        })),
      setTonightMustUse: (mustUse) =>
        set((s) => ({
          tonightContext: { ...s.tonightContext, mustUse },
          planDateKey: todayKey(),
        })),
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
      // 写入 planId 即视为"今晚的会话"开始，盖上当天日期戳
      setCurrentPlanId: (id) =>
        set({ currentPlanId: id, planDateKey: id ? todayKey() : null }),

      familyRule: null,
      familyRuleLoaded: false,
      setFamilyRule: (rule) => set({ familyRule: rule, familyRuleLoaded: true }),

      lockedMenuId: null,
      lockedMenu: null,
      setLockedMenu: (menuId, menu) =>
        set({ lockedMenuId: menuId, lockedMenu: menu ?? null }),

      planDateKey: null,
      clearTonightSession: () =>
        set({
          candidates: [],
          currentPlanId: null,
          planDateKey: null,
          lockedMenuId: null,
          lockedMenu: null,
        }),
    }),
    {
      name: 'family-menu-session',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s): PersistedState => ({
        tonightContext: s.tonightContext,
        candidates: s.candidates,
        currentPlanId: s.currentPlanId,
        planDateKey: s.planDateKey,
        lockedMenuId: s.lockedMenuId,
        lockedMenu: s.lockedMenu,
      }),
    },
  ),
)

// 跨天保护：恢复出来的是今天以前的会话 -> 立即清空（C-3a 只承诺"当晚"）。
// localStorage 为同步注水，此处清理先于任何页面首次渲染。
const restored = useStore.getState()
if (restored.planDateKey && restored.planDateKey !== todayKey()) {
  restored.clearTonightSession()
}
