// apps/h5/src/api/client.ts
// API client：由 shared 契约约束的 Taro.request 封装（H5 模式下底层用 fetch）
// 12 条 API 路由对应方法，ACCESS_TOKEN cookie 鉴权（H5 同源自动带 cookie）
// 未配置 TARO_APP_API_BASE_URL 时所有请求明确失败「服务未连接」——绝不使用假数据（C-13）
import Taro from '@tarojs/taro'
import type {
  CookResult,
  ExclusionRule,
  FamilyRule,
  FeedbackResult,
  Plan,
  PlanContext,
  SwapOptionsResponse,
  SwapPlanRequest,
} from '@family-menu/shared'
import type {
  RecommendResult,
  ShoppingListData,
} from '../types'

// ───── 配置 ─────

/** API 基础地址：未配置则一切请求明确失败（不提供任何假数据） */
const BASE_URL = process.env.TARO_APP_API_BASE_URL || ''

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
  if (!BASE_URL) {
    throw new Error('服务未连接：后端地址未配置，暂时拿不到数据')
  }
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

// ───── 13 条 API 路由方法 ─────

export const api = {
  // 1. GET /api/family/rules -> FamilyRule（404 表示未设置，返回 null）
  getFamilyRules(): Promise<FamilyRule | null> {
    return request<FamilyRule | null>('/api/family/rules', { method: 'GET' }, true)
  },

  // 2. PUT /api/family/rules <- FamilyRule -> FamilyRule
  putFamilyRules(rule: FamilyRule): Promise<FamilyRule> {
    return request<FamilyRule>('/api/family/rules', { method: 'PUT', data: rule })
  },

  // 3. GET /api/family/exclusions -> ExclusionRule[]（v0.2 新增，禁忌持久化）
  getExclusions(): Promise<ExclusionRule[]> {
    return request<ExclusionRule[]>('/api/family/exclusions', { method: 'GET' })
  },

  // 4. PUT /api/family/exclusions <- ExclusionRule[] -> ExclusionRule[]（全量替换）
  putExclusions(rules: ExclusionRule[]): Promise<ExclusionRule[]> {
    return request<ExclusionRule[]>('/api/family/exclusions', { method: 'PUT', data: rules })
  },

  // 5. POST /api/recommend <- PlanContext -> { candidates, planId }
  recommend(context: PlanContext): Promise<RecommendResult> {
    return request<RecommendResult>('/api/recommend', {
      method: 'POST',
      data: context,
    })
  },

  // 6. POST /api/plans/:id/lock <- { menuId } -> Plan
  lockPlan(planId: string, menuId: string): Promise<Plan> {
    return request<Plan>(`/api/plans/${planId}/lock`, {
      method: 'POST',
      data: { menuId },
    })
  },

  // 7. POST /api/plans/:id/swap <- SwapPlanRequest（v0.4：单菜换 dishId+newDishId 必填，reason 选填） -> Plan
  swapPlan(planId: string, body: SwapPlanRequest): Promise<Plan> {
    return request<Plan>(`/api/plans/${planId}/swap`, {
      method: 'POST',
      data: body,
    })
  },

  // 13. GET /api/plans/:id/swap-options?dishId=xxx（TP-03/DEC-013；空候选=200+空数组，C-6 如实态）
  getSwapOptions(planId: string, dishId: string): Promise<SwapOptionsResponse> {
    return request<SwapOptionsResponse>(
      `/api/plans/${planId}/swap-options?dishId=${encodeURIComponent(dishId)}`,
      { method: 'GET' },
    )
  },

  // 8. GET /api/plans/:id/shopping-list -> ShoppingListData
  getShoppingList(planId: string): Promise<ShoppingListData> {
    return request<ShoppingListData>(`/api/plans/${planId}/shopping-list`, {
      method: 'GET',
    })
  },

  // 9. PATCH /api/plans/:id/shopping-list <- { itemId, checked } -> ShoppingListData
  patchShoppingList(
    planId: string,
    itemId: string,
    checked: boolean,
  ): Promise<ShoppingListData> {
    return request<ShoppingListData>(`/api/plans/${planId}/shopping-list`, {
      method: 'PATCH',
      data: { itemId, checked },
    })
  },

  // 10. POST /api/plans/:id/feedback <- { result, actualMinutes?, cookResult?, failPoints? } -> Plan
  addFeedback(
    planId: string,
    result: FeedbackResult,
    actualMinutes?: number,
    cookResult?: CookResult,
    failPoints?: string,
  ): Promise<Plan> {
    return request<Plan>(`/api/plans/${planId}/feedback`, {
      method: 'POST',
      data: { result, actualMinutes, cookResult, failPoints },
    })
  },

  // 11. GET /api/plans -> Plan[]
  listPlans(): Promise<Plan[]> {
    return request<Plan[]>('/api/plans', { method: 'GET' })
  },

  // 12. POST /api/plans/:id/repeat -> Plan
  repeatPlan(planId: string): Promise<Plan> {
    return request<Plan>(`/api/plans/${planId}/repeat`, { method: 'POST' })
  },
}
