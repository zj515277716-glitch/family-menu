// T-Q11 三屏截图取证（375×812，真实 API + 真实库，不假数据）
// 用法（口令不落盘：证据口令只经环境变量传递， red line「口令不进证据文件」）：
//   1) 构建：TARO_APP_API_BASE_URL=http://localhost:3000 pnpm --filter @family-menu/h5 build
//   2) 起 API（证据口令覆盖，不读 .env 口令）：ACCESS_TOKEN=<本次自取证据口令> pnpm --filter @family-menu/api exec tsx src/server.ts
//   3) 本脚本：SHOT_TOKEN=<同上证据口令> node evidence/t-q11/shoot.mjs
// 本脚本自带 dist 静态服务（:10086，CORS 白名单源）；拍完好还原不动库数据（保存按钮回写同值，幂等）。
import { chromium } from '@playwright/test'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = path.dirname(fileURLToPath(import.meta.url))
const DIST = path.resolve(OUT, '../../apps/h5/dist')
const WEB = 'http://localhost:10086'
const API = 'http://localhost:3000'
const TOKEN = process.env.SHOT_TOKEN
if (!TOKEN) {
  console.error('缺少 SHOT_TOKEN 环境变量（与起 API 时的 ACCESS_TOKEN 同一个本次自取证据口令）')
  process.exit(1)
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
}

// dist 静态服务：Taro h5 hash 路由，/ 与静态资产直出，其余落 index.html
const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0])
  let filePath = path.resolve(DIST, '.' + urlPath)
  if (!filePath.startsWith(DIST)) {
    res.writeHead(403); res.end(); return
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(DIST, 'index.html')
  }
  const ext = path.extname(filePath).toLowerCase()
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
  fs.createReadStream(filePath).pipe(res)
})
await new Promise((r) => server.listen(10086, r))

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

// fullPage 拼接会把 fixed 吸底栏/Tabbar 钉在首屏底部遮挡内容；
// 整页截图前临时转 static 还原布局（吸底行为由 CSS 保证，另拍视口图证明按钮可见）
const UNFIX = '.stickybar,.nut-tabbar-fixed{position:static !important}'

async function shot(name, { fullPage = true } = {}) {
  if (fullPage) await page.addStyleTag({ content: UNFIX })
  await page.waitForTimeout(500)
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage })
  log.push(`${name}.png${fullPage ? '' : '（视口截图）'}`)
}

// ── S-01 登录门（未登录态）──
await page.goto(`${WEB}/#/pages/login/index`, { waitUntil: 'networkidle' })
await page.waitForSelector('input[placeholder="请输入口令"]', { timeout: 15000 })
await shot('s01-login')

// 错误口令 → 错误提示态（限速 10 次/10 分钟，仅 1 次）
await page.fill('input[placeholder="请输入口令"]', 'wrong-token-000')
await page.click('text=进入')
await page.waitForSelector('text=口令不正确', { timeout: 15000 })
await shot('s01-login-wrong')

// ── 真实登录（API 拿 HttpOnly cookie，Chromium 视 localhost 为安全源可写 Secure cookie）──
const loginRes = await context.request.post(`${API}/api/auth/login`, { data: { token: TOKEN } })
log.push(`login http=${loginRes.status()}`)

// ── S-02 冷启动引导 ──
await page.goto(`${WEB}/#/pages/onboarding/index`, { waitUntil: 'networkidle' })
await page.waitForSelector('text=只要 3 步', { timeout: 15000 })
await shot('s02-onboarding')

// ── S-12 设置（真实规则行渲染）──
await page.goto(`${WEB}/#/pages/settings/index`, { waitUntil: 'networkidle' })
await page.waitForSelector('text=已吃菜避开窗口', { timeout: 15000 })
await page.waitForSelector('.seg-item.on', { timeout: 15000 })
await shot('s12-settings')

// 视口真实布局（吸底保存栏 + 磨砂 Tabbar 同屏，最后操作按钮完全可见）
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('text=已吃菜避开窗口', { timeout: 15000 })
await page.evaluate(() => window.scrollTo(0, 9999))
await shot('s12-settings-viewport', { fullPage: false })

// 保存 → 「已保存 HH:mm」反馈（回写同值幂等，不动库数据）
await page.click('.stickybar .nut-button')
await page.waitForSelector('.stickybar-note.ok', { timeout: 15000 })
await shot('s12-settings-saved', { fullPage: false })

log.push('')
log.push('== 浏览器错误（console.error / pageerror）==')
log.push(errors.length ? errors.join('\n') : '（无）')
fs.writeFileSync(path.join(OUT, 'runtime-log.txt'), log.join('\n'), 'utf8')
console.log(log.join('\n'))
await browser.close()
server.close()
