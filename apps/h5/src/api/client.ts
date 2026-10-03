// apps/h5/src/api/client.ts
// API client：由 shared 契约约束的 Taro.request 封装（H5 模式下底层用 XHR/fetch）
// 统一封装（项目规则第 6 节）：超时 / 网络错误 / 401 只在这里处理一次——
//   401 → 导回登录页重新输家庭口令（UnauthorizedError，业务页 catch 到时人已在登录页）；
//   网络错误 / 超时 → 收敛为一句人话，页面只负责展示与重试。
// 登录态（T-A2）：口令只经服务端 POST /api/auth/login 校验，成功后服务端下发 HttpOnly
// cookie，同源请求 credentials:'include' 自动携带；前端不存、不读任何口令。
// 未配置 TARO_APP_API_BASE_URL 时所有请求明确失败「服务未连接」——绝不使用假数据（C-13）
import Taro from '@tarojs/taro'
import type {
  ExclusionRule,
  FamilyRule,
  FeedbackRequest,
  FeedbackResponse,
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

/** 统一超时（ms）：Taro.request 的 timeout 参数在 H5 端不生效，这里用竞速兜底 */
const REQUEST_TIMEOUT_MS = 15000

/** 登录页路由：401 统一导回这里重新输家庭口令 */
const LOGIN_PAGE_URL = '/pages/login/index'

// ───── 请求封装 ─────

interface RequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH'
  data?: unknown
}

/** 401 专用错误：抛出时用户已被导回登录页，业务层无需（也不能）再处理跳转 */
export class UnauthorizedError extends Error {
  constructor() {
    super('登录状态已失效，请重新输入家庭口令')
    this.name = 'UnauthorizedError'
  }
}

// 并发多处 401 只导一次登录页；登录成功后复位。登录页自身不调业务接口，无死循环风险。
let redirectingToLogin = false

function redirectToLogin(): void {
  if (redirectingToLogin) return
  redirectingToLogin = true
  Taro.reLaunch({ url: LOGIN_PAGE_URL })
}

/** 网络类错误收敛为一句人话（超时单独区分，都导向重试） */
function friendlyNetworkError(e: unknown): Error {
  const msg = e instanceof Error ? e.message : String(e)
  if (/timeout|超时/i.test(msg)) {
    return new Error('等了一会儿服务没响应，可能是网络不稳定，请重试')
  }
  return new Error('网络不稳定，连不上服务，请检查网络后重试')
}

/** 底层请求：统一超时 + 网络错误人话化；不含任何业务状态码判断 */
async function rawRequest(
  path: string,
  options: RequestOptions,
): Promise<{ statusCode: number; data: unknown }> {
  if (!BASE_URL) {
    throw new Error('服务未连接：后端地址未配置，暂时拿不到数据')
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      Taro.request({
        url: `${BASE_URL}${path}`,
        method: options.method,
        data: options.data as Record<string, unknown> | undefined,
        header: { 'Content-Type': 'application/json' },
        credentials: 'include',
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('request timeout')), REQUEST_TIMEOUT_MS)
      }),
    ])
  } catch (e) {
    throw friendlyNetworkError(e)
  } finally {
    clearTimeout(timer)
  }
}

/** 业务请求；404 返回 null（供 getFamilyRules 等），401 导回登录页，其他错误抛异常 */
async function request<T>(
  path: string,
  options: RequestOptions,
  notFoundAsNull = false,
): Promise<T> {
  const res = await rawRequest(path, options)
  if (res.statusCode === 401) {
    redirectToLogin()
    throw new UnauthorizedError()
  }
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

// ───── 登录相关（T-A2）─────
// 不走 request()：401/429 由登录页展示为人话，不触发跳转；me 恒 200 不会触发跳转。

export const auth = {
  /** 提交家庭口令给服务端校验；成功则服务端下发 HttpOnly cookie（后续请求自动携带） */
  async login(token: string): Promise<void> {
    const res = await rawRequest('/api/auth/login', {
      method: 'POST',
      data: { token },
    })
    if (res.statusCode === 401) throw new Error('口令不正确，再试一次')
    if (res.statusCode === 429) throw new Error('尝试次数太多，请十分钟后再试')
    if (res.statusCode >= 400) throw new Error(`登录失败(${res.statusCode})`)
    redirectingToLogin = false
  },

  /** 探测当前设备是否已通过服务端校验（200 恒真/恒假，不会 401） */
  async status(): Promise<boolean> {
    const res = await rawRequest('/api/auth/me', { method: 'GET' })
    if (res.statusCode >= 400) throw new Error(`服务异常(${res.statusCode})`)
    return (res.data as { authenticated?: boolean } | null)?.authenticated === true
  },
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

  // 14. POST /api/plans/:id/shopping-list/rescale <- { people } -> ShoppingListData（TP-04/DEC-014）
  rescaleShoppingList(planId: string, people: number): Promise<ShoppingListData> {
    return request<ShoppingListData>(`/api/plans/${planId}/shopping-list/rescale`, {
      method: 'POST',
      data: { people },
    })
  },

  // 10a. POST /api/plans/:id/feedback <- FeedbackRequest（v0.6 三问，DEC-015） -> Plan
  addFeedback(planId: string, body: FeedbackRequest): Promise<Plan> {
    return request<Plan>(`/api/plans/${planId}/feedback`, {
      method: 'POST',
      data: body,
    })
  },

  // 10b. GET /api/plans/:id/feedback -> FeedbackResponse | null
  // （v0.9/T-P12：plan 存在但无反馈时响应体即 JSON null；plan 不存在仍 404，notFoundAsNull 兜底转 null 防崩溃）
  getFeedback(planId: string): Promise<FeedbackResponse | null> {
    return request<FeedbackResponse | null>(`/api/plans/${planId}/feedback`, { method: 'GET' }, true)
  },

  // 11. GET /api/plans -> Plan[]
  listPlans(): Promise<Plan[]> {
    return request<Plan[]>('/api/plans', { method: 'GET' })
  },

  // 12. POST /api/plans/:id/repeat -> Plan
  repeatPlan(planId: string): Promise<Plan> {
    return request<Plan>(`/api/plans/${planId}/repeat`, {
      method: 'POST',
    })
  },
}
