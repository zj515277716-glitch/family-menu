// apps/h5/src/api/client.ts
// API client：由 shared 契约约束的 Taro.request 封装（H5 模式下底层用 fetch）
// 10 条 API 路由对应方法，ACCESS_TOKEN cookie 鉴权（H5 同源自动带 cookie）
// 先 Mock 后真 API：TARO_APP_API_BASE_URL 未配置时走 Mock，配置后走真 API
import Taro from '@tarojs/taro'
import type {
  FamilyRule,
  FeedbackResult,
  Plan,
  PlanContext,
  SwapType,
} from '@family-menu/shared'
import type {
  RecommendResult,
  ShoppingListData,
} from '../types'
import { mockApi } from './mock'

// ───── 配置 ─────

/** API 基础地址：未配置则走 Mock 模式 */
const BASE_URL = process.env.TARO_APP_API_BASE_URL || ''
const USE_MOCK = !BASE_URL

// ───── 请求封装 ─────

interface RequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH'
  data?: unknown
}

/** 发起真 API 请求；404 返回 null（供 getFamilyRules 等），其他错误抛异常 */
async function request<T>(
  path: string,
  options: RequestOptions,
  notFoundAsNull = false,
): Promise<T> {
  const res = await Taro.request({
    url: `${BASE_URL}${path}`,
    method: options.method,
    data: options.data as Record<string, unknown> | undefined,
    header: { 'Content-Type': 'application/json' },
    credentials: 'include',
  })
  if (res.statusCode === 404 && notFoundAsNull) {
    return null as T
  }
  if (res.statusCode >= 400) {
    const msg =
      (res.data as { error?: string } | null)?.error ||
      `请求失败(${res.statusCode})`
    throw new Error(msg)
  }
  return res.data as T
}

// ───── 10 条 API 路由方法 ─────

export const api = {
  // 1. GET /api/family/rules -> FamilyRule（404 表示未设置，返回 null）
  getFamilyRules(): Promise<FamilyRule | null> {
    if (USE_MOCK) return mockApi.getFamilyRules()
    return request<FamilyRule | null>('/api/family/rules', { method: 'GET' }, true)
  },

  // 2. PUT /api/family/rules <- FamilyRule -> FamilyRule
  putFamilyRules(rule: FamilyRule): Promise<FamilyRule> {
    if (USE_MOCK) return mockApi.putFamilyRules(rule)
    return request<FamilyRule>('/api/family/rules', { method: 'PUT', data: rule })
  },

  // 3. POST /api/recommend <- PlanContext -> { candidates, planId }
  recommend(context: PlanContext): Promise<RecommendResult> {
    if (USE_MOCK) return mockApi.recommend()
    return request<RecommendResult>('/api/recommend', {
      method: 'POST',
      data: context,
    })
  },

  // 4. POST /api/plans/:id/lock <- { menuId } -> Plan
  lockPlan(planId: string, menuId: string): Promise<Plan> {
    if (USE_MOCK) return mockApi.lockPlan(planId, menuId)
    return request<Plan>(`/api/plans/${planId}/lock`, {
      method: 'POST',
      data: { menuId },
    })
  },

  // 5. POST /api/plans/:id/swap <- { reason, swapType, dishId? } -> Plan
  swapPlan(
    planId: string,
    swapType: SwapType,
    reason: string,
    dishId?: string,
  ): Promise<Plan> {
    if (USE_MOCK) return mockApi.swapPlan(planId)
    return request<Plan>(`/api/plans/${planId}/swap`, {
      method: 'POST',
      data: { reason, swapType, dishId },
    })
  },

  // 6. GET /api/plans/:id/shopping-list -> ShoppingListData
  getShoppingList(planId: string): Promise<ShoppingListData> {
    if (USE_MOCK) return mockApi.getShoppingList()
    return request<ShoppingListData>(`/api/plans/${planId}/shopping-list`, {
      method: 'GET',
    })
  },

  // 7. PATCH /api/plans/:id/shopping-list <- { itemId, checked } -> ShoppingListData
  patchShoppingList(
    planId: string,
    itemId: string,
    checked: boolean,
  ): Promise<ShoppingListData> {
    if (USE_MOCK) {
      // Mock 模式下本地更新后返回
      return mockApi.getShoppingList().then((list) => {
        const updated: ShoppingListData = {
          groups: list.groups.map((g) => ({
            ...g,
            items: g.items.map((it) =>
              it.ingredientId === itemId ? { ...it, checked } : it,
            ),
          })),
        }
        return mockApi.patchShoppingList(updated)
      })
    }
    return request<ShoppingListData>(`/api/plans/${planId}/shopping-list`, {
      method: 'PATCH',
      data: { itemId, checked },
    })
  },

  // 8. POST /api/plans/:id/feedback <- { result, actualMinutes? } -> Plan
  addFeedback(
    planId: string,
    result: FeedbackResult,
    actualMinutes?: number,
  ): Promise<Plan> {
    if (USE_MOCK) return mockApi.addFeedback(planId, result, actualMinutes)
    return request<Plan>(`/api/plans/${planId}/feedback`, {
      method: 'POST',
      data: { result, actualMinutes },
    })
  },

  // 9. GET /api/plans -> Plan[]
  listPlans(): Promise<Plan[]> {
    if (USE_MOCK) return mockApi.listPlans()
    return request<Plan[]>('/api/plans', { method: 'GET' })
  },

  // 10. POST /api/plans/:id/repeat -> Plan
  repeatPlan(planId: string): Promise<Plan> {
    if (USE_MOCK) return mockApi.repeatPlan()
    return request<Plan>(`/api/plans/${planId}/repeat`, { method: 'POST' })
  },
}

/** 当前是否 Mock 模式（页面提示用） */
export const isMockMode = USE_MOCK
