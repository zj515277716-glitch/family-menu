// tests/e2e/T-A2-prod-smoke.mjs
// T-A2 L3 上线后生产冒烟：https://menu.jijingkongjian.xin 登录门 + 进首页 + 截图
// 口令从环境变量 FM_NEW_TOKEN 读，值不写文件、不进日志、不进报告。
// 运行：$env:FM_NEW_TOKEN = (ssh fmsrv "grep '^ACCESS_TOKEN=' /opt/family-menu/.env").Split('=')[1].Trim(); node tests/e2e/T-A2-prod-smoke.mjs
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const BASE = 'https://menu.jijingkongjian.xin'
const TOKEN = process.env.FM_NEW_TOKEN
if (!TOKEN) {
  console.error('FAIL: 缺少环境变量 FM_NEW_TOKEN（从服务器 .env 读取，勿落盘）')
  process.exit(1)
}

const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, '..', '..', 'evidence', 'T-A2')
mkdirSync(outDir, { recursive: true })

const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: 'zh-CN',
})
const page = await context.newPage()
const results = []

function check(name, ok) {
  results.push(`${ok ? 'PASS' : 'FAIL'} ${name}`)
  if (!ok) process.exitCode = 1
}

// 0. 冷启动：登录门出现，且不得误报「服务异常」横幅（/api/auth/me 恒 200）
await page.goto(BASE, { waitUntil: 'load', timeout: 25000 })
await page.waitForSelector('input[placeholder="输入家庭口令"]', { timeout: 15000 })
await page.waitForTimeout(1200) // 等探测 /api/auth/me 完成
let body = await page.evaluate(() => document.body.innerText)
check('登录门出现', body.includes('家庭口令'))
check('冷启动无「服务异常」误报横幅', !body.includes('服务异常'))
await page.screenshot({ path: join(outDir, 'prod-login-gate.png') })

// 1. 输错口令有反馈
await page.fill('input[placeholder="输入家庭口令"]', 'definitely-wrong-password')
await page.click('text=进入')
await page.waitForTimeout(1500)
body = await page.evaluate(() => document.body.innerText)
check('错误口令有明确反馈', body.includes('口令不正确'))
await page.screenshot({ path: join(outDir, 'prod-wrong-password.png') })

// 2. 输入新口令进首页
await page.fill('input[placeholder="输入家庭口令"]', TOKEN)
await page.click('text=进入')
await page.waitForSelector('text=今晚吃什么', { timeout: 15000 })
check('新口令登录进首页', page.url().includes('tonight'))
await page.screenshot({ path: join(outDir, 'prod-home-after-login.png') })

// 3. HttpOnly：页面 JS 读不到 cookie
const cookieVisible = await page.evaluate(() => document.cookie)
check('document.cookie 读不到口令', !cookieVisible || !cookieVisible.includes(TOKEN))

// 4. 刷新免输
await page.reload({ waitUntil: 'load' })
await page.waitForTimeout(1500)
body = await page.evaluate(() => document.body.innerText)
check('刷新不再要口令', body.includes('今晚吃什么'))
await page.screenshot({ path: join(outDir, 'prod-after-reload.png') })

// 5. 首页真实数据（API 通）：TabBar 三入口可见
const tabs = await page.evaluate(() =>
  ['今晚', '历史', '设置'].map((t) => document.body.innerText.includes(t)),
)
check('TabBar 三项可见', tabs.every(Boolean))

// 6. 旧会话失效：全新无 cookie 上下文打 API 401
const fresh = await browser.newContext()
const resp = await fresh.request.get(`${BASE}/api/family/rules`)
check('无 cookie 访问 API = 401', resp.status() === 401)
const meResp = await fresh.request.get(`${BASE}/api/auth/me`)
check('无 cookie /api/auth/me 恒 200', meResp.status() === 200)
await fresh.close()

console.log(results.join('\n'))
console.log('截图: evidence/T-A2/prod-*.png')
await browser.close()
