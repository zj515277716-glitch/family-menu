// T-Q06 探针页自动化取证：渲染实测 + 交互三件套 + 共存跨页核对
// 用法：先起 pnpm dev:h5，再 node evidence/T-Q06/shoot.mjs
import { chromium } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = path.dirname(fileURLToPath(import.meta.url))
const BASE = process.env.PROBE_BASE ?? 'http://localhost:10086'
const log = []
const errors = []

const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: 375, height: 812 },
  deviceScaleFactor: 2,
})
const page = await context.newPage()
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(`[console.error] ${msg.text()}`)
})
page.on('pageerror', (err) => errors.push(`[pageerror] ${err.message}`))

// 1. 探针页渲染 + 环境实测
await page.goto(`${BASE}/#/pages/probe/tdesign/index`, { waitUntil: 'networkidle' })
await page.waitForTimeout(2500)
const metrics = await page.locator('.probe-metrics').textContent().catch(() => '(未取到 .probe-metrics)')
log.push('== .probe-metrics 实测 ==')
log.push(metrics ?? '(空)')
const brandVar = await page.evaluate(() =>
  getComputedStyle(document.documentElement).getPropertyValue('--td-brand-color').trim(),
)
const nutVar = await page.evaluate(() =>
  getComputedStyle(document.documentElement).getPropertyValue('--nutui-color-primary').trim(),
)
log.push(`--td-brand-color = ${brandVar}（期望 #C8541F）`)
log.push(`--nutui-color-primary = ${nutVar}（期望 #C8392E）`)
await page.screenshot({ path: path.join(OUT, '01-probe-full.png'), fullPage: true })
await page.screenshot({ path: path.join(OUT, '01b-probe-top.png') })

// 2. Toast
await page.getByText('弹 Toast', { exact: true }).click()
await page.waitForTimeout(400)
await page.screenshot({ path: path.join(OUT, '02-toast.png') })
await page.waitForTimeout(1400)

// 3. Dialog（命令式，portal 挂 body）
await page.getByText('开 Dialog', { exact: true }).click()
await page.waitForTimeout(700)
await page.screenshot({ path: path.join(OUT, '03-dialog.png') })
await page.locator('button:has-text("取消")').first().click().catch(() => {})
await page.waitForTimeout(500)

// 4. Popup
await page.getByText('开 Popup', { exact: true }).click()
await page.waitForTimeout(700)
await page.screenshot({ path: path.join(OUT, '04-popup.png') })
await page.getByText('关闭 Popup', { exact: true }).click().catch(() => {})
await page.waitForTimeout(500)

// 5. Picker
await page.getByText('未选择', { exact: true }).click()
await page.waitForTimeout(800)
await page.screenshot({ path: path.join(OUT, '05-picker.png') })
await page.locator('.t-picker__confirm').click().catch(() => {})
await page.waitForTimeout(500)

// 6. 共存跨页核对：探针页加载过 TD 样式后，产品页（登录页）渲染是否被污染
await page.goto(`${BASE}/#/pages/login/index`, { waitUntil: 'networkidle' })
await page.waitForTimeout(2000)
await page.screenshot({ path: path.join(OUT, '06-login-after-probe.png') })

log.push('')
log.push('== 浏览器错误（console.error / pageerror）==')
log.push(errors.length ? errors.join('\n') : '（无）')
fs.writeFileSync(path.join(OUT, 'runtime-log.txt'), log.join('\n'), 'utf8')
console.log(log.join('\n'))
await browser.close()
