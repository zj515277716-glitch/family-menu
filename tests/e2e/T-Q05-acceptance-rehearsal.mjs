// T-Q05 ④验收预演：干净库 + 生产构建 + 生产静态服务上的核心旅程（登录→定明天的餐→生成→采购清单）。
// 仅本机预演环境：H5 http://127.0.0.1:10087（apps/h5/dist），API http://127.0.0.1:3005。
// 不修改业务代码；截图存 evidence/T-Q05-acceptance/。
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { requireLocalToken } from './lib/env-token.mjs'

const BASE = 'http://127.0.0.1:10087'
const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, '..', '..', 'evidence', 'T-Q05-acceptance')
mkdirSync(outDir, { recursive: true })

const consoleErrors = []
const requestFails = []
const steps = []

function ok(name, detail = '') {
  steps.push({ name, ok: true, detail })
  console.log(`PASS ${name}${detail ? ` :: ${detail}` : ''}`)
}

const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: 375, height: 812 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: 'zh-CN',
})
const page = await context.newPage()
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text())
})
page.on('requestfailed', (r) => {
  requestFails.push(`${r.method()} ${r.url()} :: ${r.failure()?.errorText ?? 'unknown'}`)
})

try {
  await page.goto(BASE, { waitUntil: 'load', timeout: 20000 })
  await page.screenshot({ path: join(outDir, '01-login.png') })
  const input = page.locator('input[placeholder="请输入口令"]')
  await input.waitFor({ state: 'visible', timeout: 15000 })
  await input.fill(requireLocalToken())
  await page.getByText('进入', { exact: true }).first().click()
  await page.waitForURL('**/pages/home/index', { timeout: 20000 })
  await page.getByText('今天三餐', { exact: true }).first().waitFor({ timeout: 15000 })
  ok('登录并进入首页', page.url())
  await page.screenshot({ path: join(outDir, '02-home.png') })

  // 种子里已有家庭规则：没有今天计划，应显示「定明天的餐」入口
  await page.getByText('定明天的餐', { exact: true }).first().click()
  await page.getByText('推荐菜谱', { exact: true }).first().waitFor({ timeout: 15000 })
  const stepperValues = await page.locator('.step-val').allTextContents()
  ok('进入 S-04 定明天的餐', `默认人数=${stepperValues.join('/')}`)
  await page.screenshot({ path: join(outDir, '03-meal-setup.png') })

  await page.getByText('推荐菜谱', { exact: true }).first().click()
  // 骨架屏或直接完成；等服务端结果落地
  await page.waitForURL('**/pages/day-menu/index*', { timeout: 20000 })
  await page.getByText('明天三餐', { exact: true }).first().waitFor({ timeout: 30000 })
  await page.waitForTimeout(800)
  const bodyText = await page.locator('body').innerText()
  const generated = bodyText.includes('确认三餐，查看采购清单')
  ok('生成明天三餐', generated ? 'S-06 正常态' : 'S-07 空手态')
  await page.screenshot({ path: join(outDir, '04-menu.png') })

  if (generated) {
    const lastBtn = page.getByText('确认三餐，查看采购清单', { exact: true }).first()
    const box = await lastBtn.boundingBox()
    ok('最后操作按钮可见', box ? `y=${Math.round(box.y)} h=${Math.round(box.height)}` : 'missing')
    await lastBtn.click()
    await page.getByText('明日采购清单', { exact: true }).first().waitFor({ timeout: 20000 })
    const listText = await page.locator('body').innerText()
    ok('进入 S-08 采购清单', listText.includes('就按这个买') ? '含待买按钮' : '按钮文案异常')
    const buy = page.getByText('就按这个买', { exact: false }).first()
    const buyBox = await buy.boundingBox()
    ok('清单最后按钮可见', buyBox ? `y=${Math.round(buyBox.y)} h=${Math.round(buyBox.height)}` : 'missing')
    await page.screenshot({ path: join(outDir, '05-shopping-list.png') })
  }

  ok('控制台与失败请求', `console=${consoleErrors.length} reqfail=${requestFails.length}`)
} catch (e) {
  steps.push({ name: 'journey', ok: false, detail: e instanceof Error ? e.message : String(e) })
  await page.screenshot({ path: join(outDir, '99-failure.png') }).catch(() => {})
  console.error('FAIL', e)
  process.exitCode = 1
} finally {
  await browser.close()
  console.log('=== SUMMARY ===')
  console.log(JSON.stringify({ steps, consoleErrors, requestFails }, null, 2))
}
