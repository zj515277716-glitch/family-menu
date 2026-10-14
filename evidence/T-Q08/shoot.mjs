// T-Q08 全套屏原型截图取证：索引 + 13 屏（方向① v3 网格卡片风），375×812
// 迭代 2026-10-15 第三轮：做「收」（纯净浅底 #FAFAF8 弃全页渐变 / 品牌感
// 只留首页品牌渐变带 / serif 全弃、层级靠字号字重 / 白卡浅边极轻影 /
// 磨砂只留 Tabbar / 设置页 iOS 分组列表 / 换一道文本小按钮），
// 版式与屏号结构不动，同名覆盖重截；另加 1 张滚动态 sticky 白条演示。
// 用法：先起 node tools/preview-server.mjs（8888），再 node evidence/T-Q08/shoot.mjs
import { chromium } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = path.dirname(fileURLToPath(import.meta.url))
const BASE = process.env.PROTO_BASE ?? 'http://localhost:8888/docs/design/v2/prototypes'
const V3 = '/style-1/v3'
const ALL = [
  ['00-index', '/index.html'],
  ['s01-login', `${V3}/login.html`],
  ['s02-onboarding', `${V3}/onboarding.html`],
  ['s03-home', `${V3}/a.html`],
  ['s04-meal-setup', `${V3}/meal-setup.html`],
  ['s05-generating', `${V3}/generating.html`],
  ['s06-meals', `${V3}/b.html`],
  ['s07-empty-hand', `${V3}/empty-hand.html`],
  ['s08-shopping', `${V3}/c.html`],
  ['s09-dish', `${V3}/dish.html`],
  ['s10-feedback-sheet', `${V3}/feedback-sheet.html`],
  ['s11-history', `${V3}/history.html`],
  ['s12-settings', `${V3}/settings.html`],
  ['s13-home-offline', `${V3}/home-offline.html`],
]

const errors = []
const log = []
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

for (const [name, url] of ALL) {
  const resp = await page.goto(`${BASE}${url}`, { waitUntil: 'networkidle' })
  // fullPage 拼接会把 position:sticky 的吸底操作栏钉在首屏底部遮挡内容；
  // 截图时临时转 static 还原整页布局（吸底行为由 CSS 保证，不在证据图演示）
  await page.addStyleTag({ content: '.stickybar{position:static !important}' })
  await page.waitForTimeout(400)
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true })
  log.push(`${name}.png  http=${resp.status()}`)
}

// 加拍：首页滚动 300px 后 sticky 标题条的磨砂穿透效果（视口截图，非整页）
{
  const resp = await page.goto(`${BASE}${V3}/a.html`, { waitUntil: 'networkidle' })
  await page.evaluate(() => window.scrollTo(0, 300))
  await page.waitForTimeout(400)
  await page.screenshot({ path: path.join(OUT, 's03-home-sticky.png'), fullPage: false })
  log.push(`s03-home-sticky.png  http=${resp.status()}（滚动 300px 视口截图）`)
}

log.push('')
log.push('== 浏览器错误（console.error / pageerror）==')
log.push(errors.length ? errors.join('\n') : '（无）')
fs.writeFileSync(path.join(OUT, 'runtime-log.txt'), log.join('\n'), 'utf8')
console.log(log.join('\n'))
await browser.close()
