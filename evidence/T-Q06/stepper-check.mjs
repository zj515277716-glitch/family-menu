// T-Q06 补证：TD Stepper 受控值显示与加减行为实测
// 用法：dev:h5 在 10086 运行中，node evidence/T-Q06/stepper-check.mjs
import { chromium } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = path.dirname(fileURLToPath(import.meta.url))
const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 375, height: 812 } })).newPage()
await page.goto('http://localhost:10086/#/pages/probe/tdesign/index', { waitUntil: 'networkidle' })
await page.waitForTimeout(2000)

const read = async () => {
  const inputVal = await page.locator('.t-stepper input').inputValue().catch(() => '(无 input)')
  const text = await page.locator('.t-stepper').innerText().catch(() => '(未取到)')
  return { inputVal, text: text.replace(/\n/g, ' ') }
}
const log = []
const s0 = await read()
log.push(`初始（源码 value=2）: input=${s0.inputVal} 文本=${s0.text}`)
await page.locator('.t-stepper__plus').click()
await page.waitForTimeout(400)
const s1 = await read()
log.push(`点 + 一次后: input=${s1.inputVal} 文本=${s1.text}`)
const lastAction = await page.getByText('最后操作：', { exact: false }).innerText()
log.push(`页面操作回显: ${lastAction}`)
await page.locator('.probe-sec', { has: page.locator('.t-stepper') }).screenshot({ path: path.join(OUT, '10-stepper-after-plus.png') })
console.log(log.join('\n'))
await browser.close()
