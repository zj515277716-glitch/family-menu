// tests/e2e/T-A2-auth-login.mjs
// T-A2（AC3/AC4）登录冒烟（Playwright，移动端视口）：
//   1. 首次打开显示「输入家庭口令」页（登录门）
//   2. 错误口令有明确错误反馈且不进首页
//   3. 正确口令进入首页
//   4. 浏览器级核对 cookie：HttpOnly + Secure + SameSite=Lax + 长期（>=30 天）
//   5. document.cookie 读不到口令（HttpOnly 生效，前端零口令）
//   6. 刷新后仍在首页（cookie 持续有效，家人不用重复输）
//   7. 无 cookie 直连业务 API → 401（AC3 破坏性场景，网络级复现）
// 前置：pnpm dev:api（:3000，ACCESS_TOKEN 来自根 .env）+ pnpm dev:h5（:10086）。
// 口令来源：tests/e2e/lib/env-token.mjs（根 .env / 环境变量，只进内存不外泄）。
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { requireLocalToken } from './lib/env-token.mjs'

const BASE = 'http://127.0.0.1:10086'
const API_BASE = 'http://127.0.0.1:3000'
const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, '..', '..', 'evidence', 'T-A2')
mkdirSync(outDir, { recursive: true })
const TOKEN = requireLocalToken()

const checks = []
function check(name, ok, detail = '') {
  checks.push(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` | ${detail}` : ''}`)
  if (!ok) process.exitCode = 1
}

const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: 390, height: 844 }, // iPhone 12/13/14 逻辑分辨率
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: 'zh-CN',
})
const page = await context.newPage()

await page.goto(BASE, { waitUntil: 'load', timeout: 20000 })

// ── 1. 登录门 ──
const loginInput = page.locator('input[placeholder="输入家庭口令"]')
let loginShown = false
try {
  await loginInput.waitFor({ state: 'visible', timeout: 15000 })
  loginShown = true
} catch {
  /* 未见登录门 */
}
check('1 首次打开显示「输入家庭口令」页', loginShown, `URL=${page.url()}`)
if (!loginShown) {
  console.error('页面文本片段:', (await page.evaluate(() => document.body.innerText)).slice(0, 200))
  await browser.close()
  process.exit(1)
}
await page.waitForTimeout(500)
await page.screenshot({ path: join(outDir, 'login-gate.png') })

// ── 2. 错误口令：明确反馈、停在登录页 ──
await loginInput.fill('definitely-wrong-token-a2')
await page.locator('text=进入').first().click()
let wrongFeedback = false
try {
  await page.locator('text=口令不正确').waitFor({ timeout: 8000 })
  wrongFeedback = true
} catch {
  /* 未见错误提示 */
}
check('2 错误口令有反馈且不进首页', wrongFeedback && page.url().includes('login'), `URL=${page.url()}`)
await page.waitForTimeout(500)
await page.screenshot({ path: join(outDir, 'login-wrong.png') })

// ── 3. 正确口令 → 首页 ──
await loginInput.fill(TOKEN)
await page.locator('text=进入').first().click()
let homeShown = false
for (const h of ['text=今晚吃什么', 'text=长期设置']) {
  try {
    await page.waitForSelector(h, { timeout: 15000 })
    homeShown = true
    break
  } catch {
    /* 试下一个 */
  }
}
check('3 正确口令后进入首页', homeShown, `URL=${page.url()}`)
if (!homeShown) {
  console.error('页面文本片段:', (await page.evaluate(() => document.body.innerText)).slice(0, 200))
  await browser.close()
  process.exit(1)
}
await page.waitForTimeout(1000)
await page.screenshot({ path: join(outDir, 'home-after-login.png') })
await page.screenshot({ path: join(outDir, 'home-after-login-full.png'), fullPage: true })

// ── 4. cookie 属性（浏览器级） ──
// 注意：不带 URL 过滤取全部 cookie——Playwright 按 URL 过滤匹配不到 IP 主机（127.0.0.1）的 host-only cookie
const cookie = (await context.cookies()).find((c) => c.name === 'access_token')
check('4a cookie access_token 已下发', !!cookie)
check('4b cookie HttpOnly', !!cookie && cookie.httpOnly === true)
check('4c cookie Secure', !!cookie && cookie.secure === true)
check('4d cookie SameSite=Lax', !!cookie && cookie.sameSite === 'Lax', cookie ? `sameSite=${cookie.sameSite}` : '')
const remainDays =
  cookie && typeof cookie.expires === 'number'
    ? Math.round((cookie.expires * 1000 - Date.now()) / 86400000)
    : -1
check('4e cookie 长期有效（>=30 天）', remainDays >= 30, `剩余 ${remainDays} 天`)

// ── 5. HttpOnly 实证：页面 JS 读不到口令 ──
const jsCookie = await page.evaluate(() => document.cookie)
check('5 document.cookie 读不到 access_token', !jsCookie.includes('access_token'), `document.cookie="${jsCookie}"`)

// ── 6. 刷新后仍在首页（cookie 持续有效） ──
await page.reload({ waitUntil: 'load' })
let persisted = false
for (const h of ['text=今晚吃什么', 'text=长期设置']) {
  try {
    await page.waitForSelector(h, { timeout: 15000 })
    persisted = true
    break
  } catch {
    /* 试下一个 */
  }
}
check('6 刷新后仍在首页（免重复输口令）', persisted, `URL=${page.url()}`)

// ── 7. 无 cookie 直连业务 API → 401 ──
const fresh = await browser.newContext({ locale: 'zh-CN' })
const noCookie = await fresh.request.get(`${API_BASE}/api/family/rules`)
check('7 无 cookie 调 GET /api/family/rules 返回 401', noCookie.status() === 401, `status=${noCookie.status()}`)
const noCookiePut = await fresh.request.put(`${API_BASE}/api/family/exclusions`, { data: [] })
check('7b 无 cookie 调 PUT /api/family/exclusions 返回 401', noCookiePut.status() === 401, `status=${noCookiePut.status()}`)
await fresh.close()

console.log(checks.join('\n'))
console.log('截图:', join(outDir, 'login-gate.png'), '+', join(outDir, 'login-wrong.png'), '+', join(outDir, 'home-after-login.png'), '+', join(outDir, 'home-after-login-full.png'))
await browser.close()
process.exit(process.exitCode ?? 0)
