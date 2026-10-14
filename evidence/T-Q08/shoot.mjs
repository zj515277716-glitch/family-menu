// T-Q08 全套屏原型截图取证：索引 + 13 屏（方向① v3 网格卡片风），375×812
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
  await page.waitForTimeout(400)
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true })
  log.push(`${name}.png  http=${resp.status()}`)
}

log.push('')
log.push('== 浏览器错误（console.error / pageerror）==')
log.push(errors.length ? errors.join('\n') : '（无）')
fs.writeFileSync(path.join(OUT, 'runtime-log.txt'), log.join('\n'), 'utf8')
console.log(log.join('\n'))
await browser.close()
