// T-A3 生产冒烟 v2：登录门回归 + recommend 契约体（创建→断言→报 planId 供清理）
import { chromium } from '@playwright/test'
const BASE = 'https://menu.jijingkongjian.xin'
const TOKEN = process.env.FM_NEW_TOKEN
if (!TOKEN) { console.error('缺少 FM_NEW_TOKEN'); process.exit(1) }

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'zh-CN' })
const page = await ctx.newPage()
const results = []
const check = (n, ok) => { results.push(`${ok ? 'PASS' : 'FAIL'} ${n}`); if (!ok) process.exitCode = 1 }

// 1. 登录门 + 进首页（UI 层回归）
await page.goto(BASE, { waitUntil: 'load', timeout: 25000 })
await page.waitForSelector('input[placeholder="输入家庭口令"]', { timeout: 15000 })
await page.fill('input[placeholder="输入家庭口令"]', TOKEN)
await page.click('text=进入')
await page.waitForSelector('text=今晚吃什么', { timeout: 15000 })
check('登录门进首页（A2 回归）', true)

// 2. 忌口行：等数据加载（最多 8s）
try {
  await page.waitForSelector('text=花生', { timeout: 8000 })
  check('忌口行含花生（A1 回归）', true)
} catch {
  const t = await page.evaluate(() => document.body.innerText.slice(0, 300))
  check('忌口行含花生（A1 回归）', false)
  console.log('首页文本片段: ' + t.replace(/\n+/g, ' | '))
}
const body = await page.evaluate(() => document.body.innerText)
check('无服务异常横幅', !body.includes('服务异常'))
await page.screenshot({ path: 'evidence/T-A3/prod-smoke-home.png' })

// 3. 新引擎 recommend（契约体：people+timeBudgetMin+mustUse）
const resp = await ctx.request.post(`${BASE}/api/recommend`, {
  data: { people: 2, timeBudgetMin: 30, mustUse: [] },
})
check(`POST /api/recommend = 200（实际 ${resp.status()}）`, resp.status() === 200)
const data = await resp.json().catch(() => null)
const candidates = data?.candidates ?? []
check('候选非空（T-P16 组合层 + A3 引擎）', Array.isArray(candidates) && candidates.length > 0)
const peanutHit = JSON.stringify(candidates).match(/花生|宫保鸡丁/g)
check('候选无花生菜（A1 防线）', !peanutHit)
const ids = (data?.candidates ?? []).map((c) => c?.menuId)
check('候选 id 为内容哈希形态 virt-<hex>（A3）', ids.length > 0 && ids.every((i) => /^virt-[0-9a-f]{8}$/.test(i)))
console.log(`PLAN_ID_FOR_CLEANUP=${data?.planId ?? 'none'}`)
console.log('candidates=' + ids.join(' | '))

console.log(results.join('\n'))
await browser.close()
