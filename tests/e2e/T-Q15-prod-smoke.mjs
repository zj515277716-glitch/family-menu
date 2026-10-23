// T-Q15 生产冒烟：登录门 → 首页 → 新契约 POST /api/recommend（三餐结构）→ 控制台/失败请求零容忍。
// 口令只从环境变量 FM_TOKEN 读（不入库、不打印）；BASE 由 FM_BASE_URL 覆盖，默认生产域名。
// 成功时打印 PLAN_ID_FOR_CLEANUP=<plan id>，供 deploy:release 做精确清理。
import { chromium } from '@playwright/test'

const BASE = (process.env.FM_BASE_URL || 'https://menu.jijingkongjian.xin').replace(/\/+$/, '')
const TOKEN = process.env.FM_TOKEN
if (!TOKEN) {
  console.error('缺少 FM_TOKEN（生产冒烟登录用）')
  process.exit(1)
}

const results = []
function check(name, ok, detail = '') {
  results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` | ${detail}` : ''}`)
  if (!ok) process.exitCode = 1
}

const consoleErrors = []
const requestFails = []
const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: 375, height: 812 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: 'zh-CN',
})
const page = await ctx.newPage()
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text())
})
page.on('requestfailed', (r) => {
  requestFails.push(`${r.method()} ${r.url()} :: ${r.failure()?.errorText ?? 'unknown'}`)
})

try {
  // 1. 登录门 → 首页
  await page.goto(BASE, { waitUntil: 'load', timeout: 30000 })
  const input = page.locator('input[placeholder="输入家庭口令"]')
  await input.waitFor({ state: 'visible', timeout: 15000 })
  await input.fill(TOKEN)
  await page.locator('text=进入').first().click()

  let homeShown = false
  for (const selector of ['text=今天三餐', 'text=今晚吃什么', 'text=长期设置']) {
    try {
      await page.waitForSelector(selector, { timeout: 10000 })
      homeShown = true
      break
    } catch {
      /* 试下一个首页标识 */
    }
  }
  check('登录门进入首页', homeShown, page.url())
  if (!homeShown) {
    const text = await page.evaluate(() => document.body.innerText.slice(0, 200))
    console.log('首页文本片段: ' + text.replace(/\n+/g, ' | '))
  }

  // 2. 新契约：POST /api/recommend（ctx.request 与页面共用 cookie）
  const resp = await ctx.request.post(`${BASE}/api/recommend`, {
    data: {
      adults: 2,
      children: 0,
      timeBudgetMin: 30,
      mustUseIngredients: [],
      meals: ['breakfast', 'lunch', 'dinner'],
    },
  })
  check(`POST /api/recommend = 200（实际 ${resp.status()}）`, resp.status() === 200)

  const data = await resp.json().catch(() => null)
  const dayPlan = data?.dayPlan
  const meals = dayPlan?.meals ?? []
  const failures = dayPlan?.failures ?? []
  check('响应含 dayPlan', !!dayPlan)
  check('dayPlan.meals 为数组', Array.isArray(meals))
  check('dayPlan.failures 为数组', Array.isArray(failures))

  const slots = new Set([...meals, ...failures].map((x) => x?.slot))
  const slotValid = [...slots].every((s) => ['breakfast', 'lunch', 'dinner'].includes(s))
  check(
    '三餐结构完整（meals + failures 覆盖所选三餐）',
    slots.size === 3 && slotValid,
    `meals=${meals.length} failures=${failures.length} slots=${[...slots].join(',')}`,
  )
  check('响应含 Plan id', typeof data?.id === 'string' && data.id.length > 0)

  // 3. 控制台错误与失败请求零容忍
  check(`控制台 error=0（实际 ${consoleErrors.length}）`, consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '))
  check(`失败请求=0（实际 ${requestFails.length}）`, requestFails.length === 0, requestFails.slice(0, 3).join(' | '))

  if (typeof data?.id === 'string') console.log(`PLAN_ID_FOR_CLEANUP=${data.id}`)
} catch (e) {
  check('冒烟执行未抛异常', false, e instanceof Error ? e.message : String(e))
  console.error('FAIL', e)
} finally {
  await browser.close()
  console.log(results.join('\n'))
}
