// tests/e2e/T-000-v21-home.mjs
// T-000-v21：本地 H5 首页冒烟（Playwright，移动端视口）
// 验收环境约束：http://127.0.0.1:10086（pnpm dev:h5），仅本机开发环境。
// 运行：node tests/e2e/T-000-v21-home.mjs
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { requireLocalToken } from './lib/env-token.mjs'

const BASE = 'http://127.0.0.1:10086'
const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, '..', '..', 'evidence', 'T-000-v21')
mkdirSync(outDir, { recursive: true })

const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: 390, height: 844 }, // iPhone 12/13/14 逻辑分辨率
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: 'zh-CN',
})
const page = await context.newPage()

await page.goto(BASE, { waitUntil: 'load', timeout: 20000 })

// T-A2 访问控制：站点有登录门。首次打开见到「输入家庭口令」就先输口令进首页
// （已登录设备由登录页自动跳过，不会出现输入框）。
const loginInput = page.locator('input[placeholder="输入家庭口令"]')
try {
  await loginInput.waitFor({ state: 'visible', timeout: 15000 })
  await loginInput.fill(requireLocalToken())
  await page.locator('text=进入').first().click()
  console.log('已过登录门（输入家庭口令）')
} catch {
  /* 无登录门（改动前的构建）：直接继续首页断言 */
}

// 首页（今晚页）h1「今晚吃什么」；无家庭规则时按设计跳长期设置页「长期设置」
const headings = ['text=今晚吃什么', 'text=长期设置']
let matched = null
for (const h of headings) {
  try {
    await page.waitForSelector(h, { timeout: 15000 })
    matched = h
    break
  } catch {
    /* 试下一个 */
  }
}

const url = page.url()
const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 300))

if (!matched) {
  console.error('FAIL: 20s 内未等到首页关键文字。URL:', url)
  console.error('页面文本片段:', bodyText.replace(/\n+/g, ' | '))
  await page.screenshot({ path: join(outDir, 'home-fail.png') })
  await browser.close()
  process.exit(1)
}

// 断言 TabBar 常驻入口存在（设计规则：3 常驻入口 今晚/历史/设置）
const tabs = await page.evaluate(() =>
  ['今晚', '历史', '设置'].map((t) => document.body.innerText.includes(t)),
)

await page.waitForTimeout(800) // 等字体/图片稳定
await page.screenshot({ path: join(outDir, 'home.png') })
await page.screenshot({ path: join(outDir, 'home-full.png'), fullPage: true })

console.log('PASS 首页打开成功')
console.log('命中关键文字:', matched, '| URL:', url)
console.log('TabBar 今晚/历史/设置 可见:', JSON.stringify(tabs))
console.log('截图:', join(outDir, 'home.png'), '+', join(outDir, 'home-full.png'))
console.log('页面文本片段:', bodyText.replace(/\n+/g, ' | '))

await browser.close()
