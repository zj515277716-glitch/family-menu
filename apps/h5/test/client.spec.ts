// apps/h5/test/client.spec.ts
// 统一请求封装单测（设计规则 6）：超时 / 网络错误 / 401 / 404 / 业务错误一处处理。
// Taro 运行时在 node 环境不存在，vi.mock 掉 @tarojs/taro；
// BASE_URL 在模块加载时读取，故各用例重置模块注册表后按场景设置环境变量再动态导入。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockRequest = vi.fn()
const mockReLaunch = vi.fn()

vi.mock('@tarojs/taro', () => ({
  default: {
    request: (...args: unknown[]) => mockRequest(...args),
    reLaunch: (...args: unknown[]) => mockReLaunch(...args),
    showToast: vi.fn(),
  },
}))

const ORIGINAL_BASE = process.env.TARO_APP_API_BASE_URL

async function importClient(baseUrl = 'http://api.test') {
  process.env.TARO_APP_API_BASE_URL = baseUrl
  return await import('../src/api/client')
}

beforeEach(() => {
  vi.resetModules()
  mockRequest.mockReset()
  mockReLaunch.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
  if (ORIGINAL_BASE === undefined) {
    delete process.env.TARO_APP_API_BASE_URL
  } else {
    process.env.TARO_APP_API_BASE_URL = ORIGINAL_BASE
  }
})

describe('请求封装：配置与网络分支', () => {
  it('未配置 BASE_URL：一切请求明确失败「服务未连接」（不假数据兜底）', async () => {
    const { api } = await importClient('')
    await expect(api.getFamilyRules()).rejects.toThrow('服务未连接')
    expect(mockRequest).not.toHaveBeenCalled()
  })

  it('网络错误：收敛为一句人话（导向重试）', async () => {
    const { api } = await importClient()
    mockRequest.mockRejectedValue(new Error('network down'))
    await expect(api.getFamilyRules()).rejects.toThrow('连不上服务')
  })

  it('超时：竞速兜底，报「没响应…请重试」', async () => {
    vi.useFakeTimers()
    const { api } = await importClient()
    mockRequest.mockReturnValue(new Promise(() => {})) // 永不 resolve 模拟挂起
    const pending = api.getFamilyRules()
    const assertion = expect(pending).rejects.toThrow('没响应')
    await vi.advanceTimersByTimeAsync(16000)
    await assertion
  })
})

describe('请求封装：状态码分支', () => {
  it('401：抛 UnauthorizedError 且统一 reLaunch 回登录页', async () => {
    const { api, UnauthorizedError } = await importClient()
    mockRequest.mockResolvedValue({ statusCode: 401, data: {} })
    await expect(api.getFamilyRules()).rejects.toBeInstanceOf(UnauthorizedError)
    expect(mockReLaunch).toHaveBeenCalledWith({ url: '/pages/login/index' })
  })

  it('并发多处 401 只导一次登录页', async () => {
    const { api } = await importClient()
    mockRequest.mockResolvedValue({ statusCode: 401, data: {} })
    await Promise.allSettled([api.getExclusions(), api.getFamilyRules()])
    expect(mockReLaunch).toHaveBeenCalledTimes(1)
  })

  it('404：getFamilyRules 按约定转 null（冷启动判定依据）', async () => {
    const { api } = await importClient()
    mockRequest.mockResolvedValue({ statusCode: 404, data: {} })
    await expect(api.getFamilyRules()).resolves.toBeNull()
  })

  it('业务错误（≥400）：优先透传服务端 error 文案', async () => {
    const { api } = await importClient()
    mockRequest.mockResolvedValue({ statusCode: 500, data: { error: '服务器开小差' } })
    await expect(api.getExclusions()).rejects.toThrow('服务器开小差')
  })

  it('成功：原样返回响应体', async () => {
    const { api } = await importClient()
    const rule = { id: 'r1', familyId: 'seed-family' }
    mockRequest.mockResolvedValue({ statusCode: 200, data: rule })
    await expect(api.getFamilyRules()).resolves.toEqual(rule)
  })
})

describe('auth：登录语义', () => {
  it('口令错误 401 → 「口令不正确，再试一次」；限速 429 → 稍候再试', async () => {
    const { auth } = await importClient()
    mockRequest.mockResolvedValueOnce({ statusCode: 401, data: {} })
    await expect(auth.login('wrong')).rejects.toThrow('口令不正确')
    mockRequest.mockResolvedValueOnce({ statusCode: 429, data: {} })
    await expect(auth.login('wrong')).rejects.toThrow('十分钟后再试')
  })

  it('登录成功（200）：resolve；status() 按 authenticated 布尔返回', async () => {
    const { auth } = await importClient()
    mockRequest.mockResolvedValueOnce({ statusCode: 200, data: {} })
    await expect(auth.login('right')).resolves.toBeUndefined()
    mockRequest.mockResolvedValueOnce({ statusCode: 200, data: { authenticated: true } })
    await expect(auth.status()).resolves.toBe(true)
    mockRequest.mockResolvedValueOnce({ statusCode: 200, data: { authenticated: false } })
    await expect(auth.status()).resolves.toBe(false)
  })

  it('登录成功后 401 跳转守卫复位（再次 401 仍会导回登录页）', async () => {
    const { api, auth } = await importClient()
    mockRequest.mockResolvedValueOnce({ statusCode: 401, data: {} })
    await Promise.allSettled([api.getExclusions()])
    expect(mockReLaunch).toHaveBeenCalledTimes(1)
    mockRequest.mockResolvedValueOnce({ statusCode: 200, data: {} })
    await auth.login('right')
    mockRequest.mockResolvedValueOnce({ statusCode: 401, data: {} })
    await Promise.allSettled([api.getExclusions()])
    expect(mockReLaunch).toHaveBeenCalledTimes(2)
  })
})
