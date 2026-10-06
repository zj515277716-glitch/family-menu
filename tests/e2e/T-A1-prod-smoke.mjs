// T-A1 生产冒烟：登录门回归 + 首页忌口行显示花生防线（只读，不下单不写库）
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const BASE = 'https://menu.jijingkongjian.xin'
const TOKEN = process.env.FM_NEW_TOKEN
if (!TOKEN) { console.error('缺少 FM_NEW_TOKEN'); process.exit(1) }
const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'evidence', 'T-A1')
mkdirSync(outDir, { recursive: true })

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'zh-CN' })
const page = await ctx.newPage()
const results = []
const check = (n, ok) => { results.push(`${ok ? 'PASS' : 'FAIL'} ${n}`); if (!ok) process.exitCode = 1 }

await page.goto(BASE, { waitUntil: 'load', timeout: 25000 })
await page.waitForSelector('input[placeholder="输入家庭口令"]', { timeout: 15000 })
let body = await page.evaluate(() => document.body.innerText)
check('登录门出现（A2 回归）', body.includes('家庭口令'))
check('冷启动无服务异常横幅', !body.includes('服务异常'))

await page.fill('input[placeholder="输入家庭口令"]', TOKEN)
await page.click('text=进入')
await page.waitForSelector('text=今晚吃什么', { timeout: 15000 })
await page.waitForTimeout(2000)
body = await page.evaluate(() => document.body.innerText)
check('进首页', body.includes('今晚吃什么'))
check('忌口行含花生（防线可见）', /花生/.test(body))
check('TabBar 三项可见', ['今晚', '历史', '设置'].every((t) => body.includes(t)))
await page.screenshot({ path: join(outDir, 'prod-a1-home-defense.png') })

const cookieStr = await page.evaluate(() => document.cookie)
check('document.cookie 读不到口令', !cookieStr || !cookieStr.includes(TOKEN))

const fresh = await browser.newContext()
const r1 = await fresh.request.get(`${BASE}/api/family/rules`)
check('无 cookie /api/family/rules = 401', r1.status() === 401)
const r2 = await fresh.request.get(`${BASE}/api/auth/me`)
check('无 cookie /api/auth/me = 200', r2.status() === 200)
await fresh.close()

console.log(results.join('\n'))
await browser.close()
