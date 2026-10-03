// tests/e2e/T-A2-verify-scenarios.mjs
// T-A2 页面验收（fm-verify · 2026-10-03）：访问控制四场景，移动端视口实走。
// 前置：pnpm dev:api（:3000，ACCESS_TOKEN 来自本机根 .env/环境变量）+ pnpm dev:h5（:10086）。
// 口令来源：tests/e2e/lib/env-token.mjs（只进内存填表，绝不打印、绝不写文件/报告）。
// 运行：node tests/e2e/T-A2-verify-scenarios.mjs
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { requireLocalToken } from './lib/env-token.mjs'

const BASE = 'http://127.0.0.1:10086'
const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, '..', '..', 'evidence', 'T-A2')
mkdirSync(outDir, { recursive: true })
const TOKEN = requireLocalToken()

const checks = []
function check(name, ok, detail = '') {
  checks.push(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` | ${detail}` : ''}`)
  if (!ok) process.exitCode = 1
}
function shot(page, file, full = false) {
  return page.screenshot({ path: join(outDir, file), fullPage: full })
}

// 页面内实测：action bar 内所有按钮是否完整落在视口内、中心点命中自身（未被 TabBar 等遮挡）
async function measureActionButtons(page) {
  return page.evaluate(() => {
    const bar = document.querySelector('.fm-bottom-bar')
    if (!bar) return { found: false, buttons: [] }
    const btns = [...bar.querySelectorAll('.nut-button')]
      .filter((b) => (b.innerText || '').trim().length > 0 || b.getBoundingClientRect().height > 0)
    const buttons = btns.map((b) => {
      const r = b.getBoundingClientRect()
      const cx = r.left + r.width / 2
      const cy = r.top + r.height / 2
      const hit = document.elementFromPoint(cx, cy)
      const inViewport = r.top >= 0 && r.left >= 0 && r.bottom <= window.innerHeight + 0.5 && r.right <= window.innerWidth + 0.5
      return {
        text: (b.innerText || '').trim().slice(0, 12),
        inViewport,
        hitSelf: !!hit && (b === hit || b.contains(hit)),
        top: Math.round(r.top),
        bottom: Math.round(r.bottom),
      }
    })
    return { found: buttons.length > 0, buttons }
  })
}

// 实测 TabBar：存在、非零高、完整落在视口内
async function measureTabbar(page) {
  return page.evaluate(() => {
    const els = [
      ...Array.from(document.querySelectorAll('.nut-tabbar-fixed')),
      ...Array.from(document.querySelectorAll('.nut-tabbar')),
    ]
    const el = els.find((e) => e.getBoundingClientRect().height > 0) || els[0] || null
    if (!el) return { found: false }
    const r = el.getBoundingClientRect()
    return {
      found: true,
      height: Math.round(r.height),
      top: Math.round(r.top),
      bottom: Math.round(r.bottom),
      inViewport: r.height > 0 && r.top >= 0 && r.bottom <= window.innerHeight + 0.5,
    }
  })
}

const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: 'zh-CN',
})
const page = await context.newPage()

await page.goto(BASE, { waitUntil: 'load', timeout: 20000 })

// ═══ 场景① 冷启动开门：清 cookie 打开 → 登录门；错口令明确反馈；对口令进首页 ═══
const loginInput = page.locator('input[placeholder="输入家庭口令"]')
let gateShown = false
try {
  await loginInput.waitFor({ state: 'visible', timeout: 15000 })
  gateShown = true
} catch {
  /* 未见登录门 */
}
check('S1a 冷启动（无 cookie）显示「输入家庭口令」登录门', gateShown, `URL=${page.url()}`)
if (!gateShown) {
  console.error('页面文本片段:', (await page.evaluate(() => document.body.innerText)).slice(0, 200))
  await browser.close()
  process.exit(1)
}
await page.waitForTimeout(600)
await shot(page, 'login-gate.png')

// 登录门自身：最后一个操作按钮（重新检查登录状态）也应完全可见
const gateBtns = await measureActionButtons(page)
const gateLastOk =
  gateBtns.found && gateBtns.buttons.every((b) => b.inViewport && b.hitSelf)
check(
  'S1a2 登录门最后一个操作按钮完全可见',
  gateLastOk,
  gateBtns.buttons.map((b) => `「${b.text}」视口内=${b.inViewport} 命中自身=${b.hitSelf}`).join('; ') || '未找到按钮',
)

await loginInput.fill('definitely-wrong-token-verify')
await page.locator('text=进入').first().click()
let wrongFeedback = ''
let wrongBanner = false
try {
  const banner = page.locator('.fm-error-banner')
  await banner.waitFor({ state: 'visible', timeout: 8000 })
  wrongBanner = true
  wrongFeedback = ((await banner.innerText()) || '').trim()
} catch {
  /* 未见错误横幅 */
}
const stillLogin = page.url().includes('login')
check(
  'S1b 输错口令有明确反馈（非静默）且不进首页',
  wrongBanner && stillLogin && wrongFeedback.length > 0,
  `URL=${page.url()} 反馈="${wrongFeedback}"`,
)
await page.waitForTimeout(400)
await shot(page, 'wrong-password.png')

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
check('S1c 正确口令后进入首页（今晚吃什么）', homeShown, `URL=${page.url()}`)
if (!homeShown) {
  console.error('页面文本片段:', (await page.evaluate(() => document.body.innerText)).slice(0, 200))
  await browser.close()
  process.exit(1)
}
await page.waitForTimeout(900)
await shot(page, 'home-after-login.png')
await shot(page, 'home-after-login-full.png', true)

// ═══ 场景② 免重输：刷新不弹登录门（cookie 生效） ═══
await page.reload({ waitUntil: 'load' })
let gateAgain = false
try {
  await loginInput.waitFor({ state: 'visible', timeout: 6000 })
  gateAgain = true
} catch {
  /* 不弹登录门 = 预期 */
}
let stillHome = false
for (const h of ['text=今晚吃什么', 'text=长期设置']) {
  try {
    await page.waitForSelector(h, { timeout: 12000 })
    stillHome = true
    break
  } catch {
    /* 试下一个 */
  }
}
check('S2 刷新页面不弹登录门、免重复输口令', !gateAgain && stillHome, `URL=${page.url()} 又见登录门=${gateAgain}`)
await page.waitForTimeout(500)
await shot(page, 'after-reload.png')

// ═══ 场景③ 安全形态：document.cookie 读不到口令（HttpOnly 实证） ═══
const jsCookie = await page.evaluate(() => document.cookie)
check(
  'S3a document.cookie 读不到口令（名称与值均不可见）',
  !jsCookie.includes('access_token') && !jsCookie.includes(TOKEN),
  `document.cookie=${jsCookie === '' ? '空串' : '非空(未见口令)'}`,
)
const cookie = (await context.cookies()).find((c) => c.name === 'access_token')
const remainDays =
  cookie && typeof cookie.expires === 'number'
    ? Math.round((cookie.expires * 1000 - Date.now()) / 86400000)
    : -1
check(
  'S3b cookie 四属性：HttpOnly + Secure + SameSite=Lax + 长期(>=30天)',
  !!cookie && cookie.httpOnly === true && cookie.secure === true && cookie.sameSite === 'Lax' && remainDays >= 30,
  cookie ? `httpOnly=${cookie.httpOnly} secure=${cookie.secure} sameSite=${cookie.sameSite} 剩余${remainDays}天` : 'cookie 不存在',
)

// ═══ 场景④ 回归：首页 TabBar 三项可见；最后一个操作按钮完全可见；tab 可点选 ═══
const tabs = await page.evaluate(() =>
  ['今晚', '历史', '设置'].map((t) => document.body.innerText.includes(t)),
)
const tabbar = await measureTabbar(page)
check(
  'S4a TabBar 今晚/历史/设置 可见且完整落在视口内',
  tabs[0] && tabs[1] && tabs[2] && tabbar.found && tabbar.inViewport,
  `三项=${JSON.stringify(tabs)} tabbar h=${tabbar.height} bottom=${tabbar.bottom} 视口内=${tabbar.inViewport}`,
)
const homeBtns = await measureActionButtons(page)
const homeLastOk =
  homeBtns.found && homeBtns.buttons.every((b) => b.inViewport && b.hitSelf)
check(
  'S4b 首页最后一个操作按钮完全可见（视口内且中心点命中自身）',
  homeLastOk,
  homeBtns.buttons.map((b) => `「${b.text}」视口内=${b.inViewport} 命中自身=${b.hitSelf}`).join('; ') || '未找到按钮',
)
await page.waitForTimeout(400)
await shot(page, 'home-tabbar-lastbutton.png')

// tab 点选回归：历史 → 设置 → 回今晚（只读，不写任何数据）
await page.locator('.nut-tabbar-item, [class*="tabbar-item"]').filter({ hasText: '历史' }).first().click()
let historyShown = false
try {
  await page.waitForSelector('text=吃过的饭', { timeout: 12000 })
  historyShown = true
} catch {
  /* 未见历史页 */
}
check('S4c TabBar 点选「历史」进入历史页', historyShown, `URL=${page.url()}`)
if (historyShown) {
  await page.waitForTimeout(600)
  await shot(page, 'tab-history.png')
}

await page.locator('.nut-tabbar-item, [class*="tabbar-item"]').filter({ hasText: '设置' }).first().click()
let setupShown = false
try {
  await page.waitForSelector('text=长期设置', { timeout: 12000 })
  setupShown = true
} catch {
  /* 未见设置页 */
}
check('S4c2 TabBar 点选「设置」进入设置页', setupShown, `URL=${page.url()}`)
if (setupShown) {
  await page.waitForTimeout(600)
  await shot(page, 'tab-setup.png')
}

await page.locator('.nut-tabbar-item, [class*="tabbar-item"]').filter({ hasText: '今晚' }).first().click()
let backHome = false
try {
  await page.waitForSelector('text=今晚吃什么', { timeout: 12000 })
  backHome = true
} catch {
  /* 未见首页 */
}
check('S4c3 TabBar 点选「今晚」返回首页', backHome, `URL=${page.url()}`)

console.log(checks.join('\n'))
console.log(
  '截图目录:', outDir,
  '| 文件:', [
    'login-gate.png', 'wrong-password.png', 'home-after-login.png', 'home-after-login-full.png',
    'after-reload.png', 'home-tabbar-lastbutton.png', 'tab-history.png', 'tab-setup.png',
  ].join(', '),
)
await browser.close()
process.exit(process.exitCode ?? 0)
