// T-Q06 局部核对：Form 区（Stepper 初值/Input）+ TabBar 区 + List 区
import { chromium } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = path.dirname(fileURLToPath(import.meta.url))
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })
page.on('pageerror', (err) => console.log('[pageerror]', err.message))
await page.goto('http://localhost:10086/#/pages/probe/tdesign/index', { waitUntil: 'networkidle' })
await page.waitForTimeout(2000)

const stepperInfo = await page.evaluate(() => {
  const input = document.querySelector('.t-stepper input')
  const minusDisabled = !!document.querySelector('.t-stepper__minus--disabled')
  return {
    inputValue: input?.value ?? '(no input)',
    inputExists: !!input,
    stepperHtml: document.querySelector('.t-stepper')?.outerHTML.slice(0, 400) ?? '(none)',
  }
})
console.log('Stepper:', JSON.stringify(stepperInfo, null, 2))

// Form 区截图（含 Stepper/Input/时间预算 cell）
const formSec = page.locator('.probe-sec', { hasText: 'Form 系' })
await formSec.screenshot({ path: path.join(OUT, '07-form-section.png') })
const tabSec = page.locator('.probe-sec', { hasText: 'TabBar' })
await tabSec.screenshot({ path: path.join(OUT, '08-tabbar-section.png') })
const listSec = page.locator('.probe-sec', { hasText: 'List / Loading / Empty' })
await listSec.screenshot({ path: path.join(OUT, '09-list-section.png') })

// 点一下 Stepper + 看受控是否工作
await page.locator('.t-stepper__plus').click()
await page.waitForTimeout(400)
const after = await page.evaluate(() => document.querySelector('.t-stepper input')?.value)
const lastAction = await page.locator('.probe-sec', { hasText: '操作反馈' }).textContent()
console.log('Stepper after +:', after, '| 反馈区:', lastAction?.slice(-60))
await formSec.screenshot({ path: path.join(OUT, '10-stepper-after-plus.png') })
await browser.close()
