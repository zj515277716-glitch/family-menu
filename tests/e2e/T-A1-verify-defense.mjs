// tests/e2e/T-A1-verify-defense.mjs
// T-A1 页面验收（fm-verify · 2026-10-03）：花生防线端到端体验（产品负责人可感知路径）。
// 前置：pnpm dev:api（:3000）+ pnpm dev:h5（:10086）在跑；本机 PG :54329 本地库（真实数据）。
// 口令来源：tests/e2e/lib/env-token.mjs（只进内存填表，绝不打印、绝不写文件/报告）。
// 用法：node tests/e2e/T-A1-verify-defense.mjs <mode>
//   journey       防线生效全套旅程：首页→设置（忌口花生）→推荐→候选→锁定→菜单/清单→反馈页→历史
//   mustuse-on    防线生效 + 必消=花生米 → 期望空手明示（不硬凑、不违忌）
//   mustuse-off   防线被破坏（规则失活，复刻 09-14 失效形态）→ 期望花生菜出现在候选（对照证据）
//   final         防线恢复后再推荐 → 期望候选再次无花生菜
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { requireLocalToken } from './lib/env-token.mjs'

const BASE = 'http://127.0.0.1:10086'
const MODE = process.argv[2] || 'journey'
const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, '..', '..', 'evidence', 'T-A1')
mkdirSync(outDir, { recursive: true })
const TOKEN = requireLocalToken()

const PEANUT_DISH = '宫保鸡丁'
const checks = []
function check(name, ok, detail = '') {
  checks.push(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` | ${detail}` : ''}`)
  if (!ok) process.exitCode = 1
}
function shot(page, file, full = false) {
  return page.screenshot({ path: join(outDir, file), fullPage: full })
}
async function clickTab(page, label) {
  // 页面上可能存在多个 tabbar 实例（含 height=0 空壳），只点可见实例（对齐 CustomTabBar 注释）
  const tab = page.locator(`.nut-tabbar-item:visible`).filter({ hasText: label })
  await tab.first().click()
}
async function login(page) {
  await page.goto(BASE, { waitUntil: 'load', timeout: 20000 })
  const loginInput = page.locator('input[placeholder="输入家庭口令"]')
  await loginInput.waitFor({ state: 'visible', timeout: 15000 })
  await loginInput.fill(TOKEN)
  await page.locator('text=进入').first().click()
  await page.waitForSelector('text=今晚吃什么', { timeout: 15000 })
  await page.waitForTimeout(900)
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

try {
  if (MODE === 'journey') {
    // ① 登录进首页：sub 行应明示忌口（花生过敏）
    await login(page)
    const subText = await page.evaluate(() => document.body.innerText)
    check('J1 首页忌口行明示花生（过敏）', subText.includes('花生'), subText.split('\n').find((l) => l.includes('忌口')) || '(未见忌口行)')
    await shot(page, 'verify-01-home-defense-on.png')

    // ② 设置页：忌口两条（花生 TAG + 花生米 食材级）均 HARD 展示
    await clickTab(page, '设置')
    await page.waitForSelector('text=长期设置', { timeout: 12000 })
    await page.waitForTimeout(800)
    const setupText = await page.evaluate(() => document.body.innerText)
    check('J2 设置页展示花生/花生米硬禁忌行', setupText.includes('花生') && setupText.includes('花生米') && setupText.includes('硬禁忌'))
    await shot(page, 'verify-02-setup-taboo-peanut.png', true)

    // ③ 今晚 → 推荐（无必消）：候选不应出现任何花生相关菜（此刻库内含花生菜已被裸改 PUBLISHED）
    await clickTab(page, '今晚')
    await page.waitForSelector('text=今晚吃什么', { timeout: 12000 })
    await page.waitForTimeout(400)
    await page.locator('text=推荐今晚吃什么').first().click()
    await page.waitForSelector('text=选出今晚的一套', { timeout: 20000 })
    await page.waitForTimeout(600)
    const dishNames = await page.$$eval('.fm-dish-name', (els) => els.map((e) => (e.innerText || '').trim()))
    const menuBody = await page.evaluate(() => document.body.innerText)
    check(
      'J3 候选菜单不含花生相关菜（防线生效；库内花生菜已 PUBLISHED 仍被拦）',
      !dishNames.some((n) => n.includes(PEANUT_DISH) || n.includes('花生')) && !menuBody.includes('花生'),
      `候选菜品=${JSON.stringify(dishNames)}`,
    )
    await shot(page, 'verify-03-candidates-no-peanut.png', true)

    // ④ 锁定第一套 → 菜单页：菜单/备菜顺序/购物清单都不应出现花生
    await page.locator('text=选定此套').first().click()
    await page.waitForSelector('text=就按这个买', { timeout: 15000 })
    await page.waitForTimeout(1200)
    const planBody = await page.evaluate(() => document.body.innerText)
    check('J4 锁定后菜单页（含购物清单）无花生', !planBody.includes('花生'), `页面含清单=${planBody.includes('购物清单')}`)
    await shot(page, 'verify-04-plan-shopping-no-peanut.png', true)

    // ⑤ 反馈三问页（只开不提交）：核心旅程过点
    await page.locator('text=做完饭回来记录一下').first().click()
    await page.waitForSelector('text=今晚吃得怎么样？', { timeout: 12000 })
    await page.waitForTimeout(500)
    await shot(page, 'verify-05-feedback-page.png')
    check('J5 反馈三问页可打开（未提交，零写入）', true)
    await page.locator('.fm-back').first().click()
    await page.waitForSelector('text=就按这个买', { timeout: 12000 })

    // ⑥ 历史页 Tab：核心旅程过点
    await clickTab(page, '历史')
    await page.waitForSelector('text=吃过的饭', { timeout: 12000 })
    await page.waitForTimeout(600)
    await shot(page, 'verify-06-history.png')
    check('J6 历史页可进入', true)
  } else if (MODE === 'mustuse-on') {
    // 防线生效：必消=花生米 → 安全层先于一切，必消无法满足 → 空手明示（绝不硬凑）
    await login(page)
    await page.locator('input[placeholder="搜索食材，如：土豆、西兰花…"]').fill('花生米')
    await page.locator('text=推荐今晚吃什么').first().click()
    await page.waitForSelector('text=今晚没有能用上「花生米」的做法', { timeout: 20000 })
    await page.waitForTimeout(500)
    await shot(page, 'verify-07-mustuse-peanut-empty-hand.png', true)
    check('J7 必消=花生米（防线生效）→ 空手明示「没有能用上「花生米」的做法」，不硬凑不违忌', true)
  } else if (MODE === 'mustuse-off') {
    // 防线被破坏（花生规则失活，复刻 09-14 失效形态）：同一输入 → 花生菜进候选（对照证据）
    // 注：30 分钟档下整桌会超时（空手-时间型），先切 60 分钟档让含花生菜的整桌可排
    await login(page)
    await page.locator('.fm-radio-chip', { hasText: '60 分钟' }).first().click()
    await page.waitForTimeout(300)
    await page.locator('input[placeholder="搜索食材，如：土豆、西兰花…"]').fill('花生米')
    await page.locator('text=推荐今晚吃什么').first().click()
    await page.waitForSelector('text=选出今晚的一套', { timeout: 20000 })
    await page.waitForTimeout(600)
    const dishNames = await page.$$eval('.fm-dish-name', (els) => els.map((e) => (e.innerText || '').trim()))
    check(
      'J8 防线失活时必消=花生米 → 含花生菜出现在候选（复刻 09-14 用户体验，对照组）',
      dishNames.some((n) => n.includes(PEANUT_DISH)),
      `候选菜品=${JSON.stringify(dishNames)}`,
    )
    await shot(page, 'verify-08-mustuse-peanut-appears-defense-off.png', true)
  } else if (MODE === 'final') {
    // 防线恢复后再推荐：候选再次无花生菜
    await login(page)
    await page.locator('text=推荐今晚吃什么').first().click()
    await page.waitForSelector('text=选出今晚的一套', { timeout: 20000 })
    await page.waitForTimeout(600)
    const dishNames = await page.$$eval('.fm-dish-name', (els) => els.map((e) => (e.innerText || '').trim()))
    const body = await page.evaluate(() => document.body.innerText)
    check(
      'J9 防线恢复后再次推荐 → 候选无花生菜',
      !dishNames.some((n) => n.includes(PEANUT_DISH) || n.includes('花生')) && !body.includes('花生'),
      `候选菜品=${JSON.stringify(dishNames)}`,
    )
    await shot(page, 'verify-09-candidates-defense-restored.png', true)
  } else {
    console.error(`未知 mode：${MODE}（journey | mustuse-on | mustuse-off | final）`)
    process.exitCode = 2
  }
} catch (e) {
  checks.push(`FAIL ${MODE} 执行异常 | ${e instanceof Error ? e.message : String(e)}`)
  process.exitCode = 1
  try {
    await shot(page, `verify-error-${MODE}.png`)
  } catch {
    /* 页面已不可用时放弃截图 */
  }
} finally {
  await browser.close()
}

console.log(`── T-A1 页面验收 mode=${MODE} ──`)
console.log(checks.join('\n'))
console.log('截图目录:', outDir)
process.exit(process.exitCode ?? 0)
