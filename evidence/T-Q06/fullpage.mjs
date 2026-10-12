// T-Q06 补证：真整页截图。Taro H5 滚动容器是内层 div，Playwright fullPage 只会拿到视口。
// 做法：量出页面内容实际高度，把视口拉高到该高度后再截。
import { chromium } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = path.dirname(fileURLToPath(import.meta.url))
const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })).newPage()
await page.goto('http://localhost:10086/#/pages/probe/tdesign/index', { waitUntil: 'networkidle' })
await page.waitForTimeout(2500)
const h = await page.evaluate(() => {
  const el = document.querySelector('.probe-page')
  return el ? el.scrollHeight : document.body.scrollHeight
})
console.log('内容实际高度:', h)
await page.setViewportSize({ width: 375, height: Math.ceil(h) })
await page.waitForTimeout(800)
await page.screenshot({ path: path.join(OUT, '01-probe-full.png') })
console.log('已覆盖 01-probe-full.png（视口拉高整页）')
await browser.close()
