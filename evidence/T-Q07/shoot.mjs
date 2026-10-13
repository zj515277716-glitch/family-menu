// T-Q07 视觉方向原型截图取证：3 方向 × 3 屏 + 索引页，375×812
// 用法：先起 node tools/preview-server.mjs（8888），再 node evidence/T-Q07/shoot.mjs
import { chromium } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = path.dirname(fileURLToPath(import.meta.url))
const BASE = process.env.PROTO_BASE ?? 'http://localhost:8888/docs/design/v2/prototypes'
const pages = [
  ['00-index', '/index.html'],
  ['1a-home', '/style-1/a.html'],
  ['1b-meals', '/style-1/b.html'],
  ['1c-shopping', '/style-1/c.html'],
  ['2a-home', '/style-2/a.html'],
  ['2b-meals', '/style-2/b.html'],
  ['2c-shopping', '/style-2/c.html'],
  ['3a-home', '/style-3/a.html'],
  ['3b-meals', '/style-3/b.html'],
  ['3c-shopping', '/style-3/c.html'],
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

for (const [name, url] of pages) {
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
