// tests/e2e/T-Q12-capability-probe.mjs
// 能力自检：验证本机 Playwright + Chromium 能在移动端视口真实打开 H5、输入、点击、断言、截图留证。
// 只读页面，不改业务代码；运行：node tests/e2e/T-Q12-capability-probe.mjs
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { requireLocalToken } from './lib/env-token.mjs'

const BASE = 'http://127.0.0.1:10086'
const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, '..', '..', 'evidence', 'T-Q12')
mkdirSync(outDir, { recursive: true })

const consoleErrors = []
const requestFails = []

const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: 375, height: 812 }, // 验收基准视口（iPhone X 逻辑分辨率）
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

const result = {
  opened: false,
  overlays: [],
  inputFilled: false,
  clickNative: false,
  clickAfterOverlayDismiss: false,
  landedUrl: '',
  homeText: false,
}

let step = 'goto'
try {
  await page.goto(BASE, { waitUntil: 'load', timeout: 20000 })
  result.opened = true
  await page.screenshot({ path: join(outDir, 'probe-01-landing.png') })

  // 页面里是否挂着 dev 错误浮层（编译错误时代码改动会被挡住点击）
  result.overlays = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#webpack-dev-server-client-overlay, #react-refresh-overlay')).map(
      (el) => el.id,
    ),
  )
  if (result.overlays.length) {
    await page.screenshot({ path: join(outDir, 'probe-02-dev-overlay.png') })
    // 仅自检用途：摘掉 dev 专属浮层（非产品元素），以便验证点击能力
    await page.evaluate(() =>
      document
        .querySelectorAll('#webpack-dev-server-client-overlay, #react-refresh-overlay')
        .forEach((el) => el.remove()),
    )
  }

  step = 'login'
  const input = page.locator('input[placeholder="请输入口令"]')
  await input.waitFor({ state: 'visible', timeout: 15000 })
  await input.fill(requireLocalToken())
  result.inputFilled = true
  await page.screenshot({ path: join(outDir, 'probe-03-filled.png') })

  step = 'click'
  const enterBtn = page.getByText('进入', { exact: false }).first()
  try {
    await enterBtn.click({ timeout: 5000 })
    result.clickNative = true
  } catch {
    // 被 dev 浮层挡住时的重试（浮层已在上面移除；若仍失败则点击能力不成立）
    await enterBtn.click({ timeout: 5000, force: true })
    result.clickAfterOverlayDismiss = true
  }
  await page.waitForTimeout(4000)

  step = 'landed'
  result.landedUrl = page.url()
  const text = await page.evaluate(() => document.body.innerText.replace(/\n+/g, ' | ').slice(0, 400))
  result.homeText = /今晚吃什么|长期设置|定明天的餐|家庭设置/.test(text)
  await page.screenshot({ path: join(outDir, 'probe-04-landed.png'), fullPage: true })

  // 交互能力：点 Tabbar「设置」→ 断言屏幕文字 → 截图
  step = 'tab-click'
  result.tabClick = false
  try {
    await page.getByText('设置', { exact: true }).first().click({ timeout: 6000 })
    await page.waitForTimeout(1500)
    result.tabText = await page.evaluate(() =>
      document.body.innerText.replace(/\n+/g, ' | ').slice(0, 300),
    )
    result.tabClick = /长期生效|默认人数|常做时长档/.test(result.tabText)
    await page.screenshot({ path: join(outDir, 'probe-05-settings-tab.png') })
  } catch (e) {
    console.log('Tabbar 点击失败:', e.message.split('\n')[0])
  }

  await page.screenshot({ path: join(outDir, 'probe-06-final.png') })

  const size = await page.evaluate(() => ({
    dpr: window.devicePixelRatio,
    w: window.innerWidth,
    h: window.innerHeight,
  }))

  console.log('=== 能力自检结果 ===')
  console.log('打开页面:', result.opened, '| dev 浮层:', JSON.stringify(result.overlays))
  console.log('输入口令:', result.inputFilled, '| 原生点击:', result.clickNative, '| 去浮层后点击:', result.clickAfterOverlayDismiss)
  console.log('登录后 URL:', result.landedUrl)
  console.log('首页关键文字命中:', result.homeText, '| 文本:', text)
  console.log('Tabbar「设置」点击成功:', result.tabClick, '| 文本:', result.tabText ?? '')
  console.log('视口:', JSON.stringify(size))
  console.log('console.error 数:', consoleErrors.length, consoleErrors.slice(0, 2))
  console.log('失败请求数:', requestFails.length, requestFails.slice(0, 2))
  console.log('截图目录:', outDir)
} catch (e) {
  console.error('FAIL 步骤', step, ':', e.message.split('\n')[0])
  try {
    await page.screenshot({ path: join(outDir, 'probe-fail.png') })
  } catch {
    /* 页面已崩 */
  }
  await browser.close()
  process.exit(1)
}

await browser.close()
