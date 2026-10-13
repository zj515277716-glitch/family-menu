// T-Q07 视觉方向原型截图取证：3 方向 × 3 屏 + 索引页，375×812
// 用法：先起 node tools/preview-server.mjs（8888），再 node evidence/T-Q07/shoot.mjs [逗号分隔名前缀]
// 2026-10-13 迭代：方向①配示意菜品图后支持按名筛选，如 node evidence/T-Q07/shoot.mjs 1a,1b,1c
import { chromium } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = path.dirname(fileURLToPath(import.meta.url))
const BASE = process.env.PROTO_BASE ?? 'http://localhost:8888/docs/design/v2/prototypes'
const ALL = [
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
  // 方向①大图版变体（2026-10-13 迭代）：2v=杂志风 3v=网格风，避免覆盖 v1 图
  ['00-index-v23', '/index.html'],
  ['2v-a-home', '/style-1/v2/a.html'],
  ['2v-b-meals', '/style-1/v2/b.html'],
  ['2v-c-shopping', '/style-1/v2/c.html'],
  ['3v-a-home', '/style-1/v3/a.html'],
  ['3v-b-meals', '/style-1/v3/b.html'],
  ['3v-c-shopping', '/style-1/v3/c.html'],
]
const only = (process.argv[2] ?? '').split(',').map((s) => s.trim()).filter(Boolean)
const pages = only.length ? ALL.filter(([n]) => only.some((p) => n.startsWith(p))) : ALL

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
