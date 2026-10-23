// tests/e2e/T-Q13-journey-check.mjs
// T-Q13 核心旅程补充（只读）：今天的真实计划 → 三餐菜单 → 采购清单/备菜建议。
// 前置：T-Q13-verify.mjs 已建好今天计划。不做任何写操作。
// 运行：node tests/e2e/T-Q13-journey-check.mjs
import { chromium } from '@playwright/test'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { requireLocalToken } from './lib/env-token.mjs'

const BASE = 'http://127.0.0.1:10086'
const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, '..', '..', 'evidence', 'T-Q13')
const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: 375, height: 812 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: 'zh-CN',
})
const page = await context.newPage()
let failed = 0
const check = (name, ok, detail = '') => {
  if (!ok) failed += 1
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` | ${detail}` : ''}`)
}
const waitBody = (t, ms = 20000) =>
  page.waitForFunction((x) => document.body.innerText.includes(x), t, { timeout: ms })
try {
  await page.goto(BASE, { waitUntil: 'load', timeout: 30000 })
  await page.waitForFunction(
    () =>
      !!document.querySelector('input[placeholder="请输入口令"]') ||
      document.body.innerText.includes('今天三餐'),
    null,
    { timeout: 25000 },
  )
  if (await page.locator('input[placeholder="请输入口令"]').count()) {
    await page.locator('input[placeholder="请输入口令"]').fill(requireLocalToken())
    await page.locator('.btn-main').filter({ hasText: '进入' }).first().click()
  }
  await waitBody('今天三餐')

  const today = await page.evaluate(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  await page.goto(`${BASE}/#/pages/day-menu/index?date=${today}`, { waitUntil: 'load', timeout: 30000 })
  await waitBody('确认三餐，查看采购清单', 30000)
  await page.locator('.stickybar .btn-main').filter({ hasText: '确认三餐，查看采购清单' }).first().click()
  await waitBody('采购清单', 30000)
  await page.waitForFunction(
    () =>
      document.body.innerText.includes('今晚预处理') ||
      document.body.innerText.includes('明早先做'),
    null,
    { timeout: 20000 },
  )
  // 等新页真正绘制（Taro 页面切换会短暂保留上一页 DOM）
  await page.locator('.item').first().waitFor({ state: 'visible', timeout: 20000 })
  await page
    .locator('.stickybar .btn-main')
    .filter({ hasText: '就按这个买' })
    .first()
    .waitFor({ state: 'visible', timeout: 20000 })
  await page.waitForTimeout(1500)
  const text = await page.evaluate(() => document.body.innerText.replace(/\n+/g, ' | '))
  check('核心旅程：锁定清单可进入', text.includes('采购清单'))
  check('核心旅程：备菜信息可读（今晚预处理/明早先做）', /今晚预处理|明早先做/.test(text))
  check('核心旅程：清单条目非空', (await page.locator('.item').count()) > 0, `items=${await page.locator('.item').count()}`)
  await page.screenshot({ path: join(outDir, 'S-08-journey-shopping.png') })
  console.log('SHOT S-08-journey-shopping.png')
  // 滚到底看备菜建议
  await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('.taro_page'))
    const el = els.find(
      (e) =>
        e instanceof HTMLElement &&
        e.scrollHeight > e.clientHeight + 10 &&
        getComputedStyle(e).display !== 'none',
    )
    if (el) el.scrollTop = el.scrollHeight
  })
  await page.waitForTimeout(700)
  await page.screenshot({ path: join(outDir, 'S-08-journey-prep.png') })
  console.log('SHOT S-08-journey-prep.png')
} catch (e) {
  failed += 1
  console.error('FATAL', e)
} finally {
  console.log(`SUMMARY journey-check failed=${failed}`)
  if (failed > 0) process.exitCode = 1
  await browser.close()
}
