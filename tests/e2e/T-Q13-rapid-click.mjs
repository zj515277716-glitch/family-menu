// tests/e2e/T-Q13-rapid-click.mjs
// T-Q13 补充专项：S-10 记一笔「快速连续点击提交」不重复写。
// 前置：`node tests/e2e/T-Q13-verify.mjs` 已建好今天计划（本机验收库），或本机已有今天计划。
// 做法：真实打开首页 → 晚餐「记一笔」→ 选好吃 → 在提交按钮同一坐标快速点两次；
//       统计 POST /api/plans/:id/feedback 次数，期望恰好 1 次；截图存 evidence/T-Q13/S-10-rapid-click.png。
// 运行：node tests/e2e/T-Q13-rapid-click.mjs
import { chromium } from '@playwright/test'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { requireLocalToken } from './lib/env-token.mjs'

const BASE = 'http://127.0.0.1:10086'
const API = 'http://127.0.0.1:3000'
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
const waitBody = (t, ms = 20000) =>
  page.waitForFunction((x) => document.body.innerText.includes(x), t, { timeout: ms })

let failed = 0
function check(name, ok, detail = '') {
  if (!ok) failed += 1
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` | ${detail}` : ''}`)
}

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
  await page.waitForFunction(() => !!document.querySelector('.meal-block'), null, { timeout: 20000 })

  const plan = await page.evaluate(async () => {
    const d = new Date()
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    const r = await fetch(`http://127.0.0.1:3000/api/plans?date=${y}-${m}-${day}`, {
      credentials: 'include',
    })
    const j = await r.json()
    return j[0]
  })
  if (!plan?.id) {
    check('前置：今天有真实计划', false, '未找到今天计划，请先跑 T-Q13-verify.mjs')
    throw new Error('BLOCKER: 无今天计划')
  }

  let posts = 0
  const feedbackRe = new RegExp(`/api/plans/${plan.id}/feedback$`)
  await page.route(feedbackRe, async (route) => {
    if (route.request().method() === 'POST') {
      posts += 1
      console.log('POST', posts, route.request().postData())
    }
    await route.continue()
  })

  const dinner = page.locator('.meal-block').filter({ has: page.getByText('晚餐', { exact: true }) }).first()
  await dinner.locator('.btn-plain').filter({ hasText: '记一笔' }).click()
  const sheet = page.locator('.nut-popup:visible').filter({ has: page.locator('.sheet-title') }).first()
  await sheet.waitFor({ state: 'visible', timeout: 8000 })
  await page.waitForTimeout(400)
  console.log('PREFILL', (await sheet.locator('.opt.on').allTextContents()).join(','))

  await sheet.locator('.opt').filter({ hasText: /^好吃$/ }).first().click()
  await page.waitForTimeout(200)
  const btn = sheet.locator('.btn-main').first()
  const box = await btn.boundingBox()
  check('提交按钮有可见坐标', !!box, box ? JSON.stringify(box) : 'no box')
  if (!box) throw new Error('提交按钮不可见')

  // 同一坐标快速点两次（模拟快速连续点击）
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await page.waitForTimeout(4500)

  check('快速连续点击提交：POST 恰好 1 次', posts === 1, `posts=${posts}`)
  check('提交后弹层关闭', (await page.locator('.nut-popup:visible').count()) === 0)
  check('晚餐标签已更新为好吃', (await dinner.locator('.tag').first().innerText()) === '好吃')
  await page.screenshot({ path: join(outDir, 'S-10-rapid-click.png') })
  console.log('SHOT S-10-rapid-click.png')
} catch (e) {
  failed += 1
  console.error('FATAL', e)
} finally {
  console.log(`SUMMARY rapid-click failed=${failed}`)
  if (failed > 0) process.exitCode = 1
  await browser.close()
}
