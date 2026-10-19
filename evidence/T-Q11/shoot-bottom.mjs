// T-Q11 补拍：设置页下半区（忌口组 + 已吃菜避开窗口 + 保存栏）
// 前置同 shoot.mjs（API :3000 证据口令 + 已构建 dist）。本脚本自带 dist 静态服务
//（必须 :10086——API CORS 白名单只放行该源，换端口请求会被浏览器拦）。
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
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.json': 'application/json',
}
const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0])
  let filePath = path.resolve(DIST, '.' + urlPath)
  if (!filePath.startsWith(DIST)) { res.writeHead(403); res.end(); return }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(DIST, 'index.html')
  }
  const ext = path.extname(filePath).toLowerCase()
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
  fs.createReadStream(filePath).pipe(res)
})
await new Promise((r) => server.listen(10086, r))

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })
const page = await context.newPage()
const loginRes = await context.request.post(`${API}/api/auth/login`, { data: { token: TOKEN } })
console.log('login http=', loginRes.status())

await page.goto(`${WEB}/#/pages/settings/index`, { waitUntil: 'networkidle' })
await page.waitForSelector('text=已吃菜避开窗口', { timeout: 15000 })

// 探测真实滚动容器并把忌口组滚进视口
const info = await page.evaluate(() => {
  const el = document.querySelector('.sgroup-label') // 第一组标题作参照
  const target = [...document.querySelectorAll('.sgroup-label')].find((n) => n.textContent === '忌口')
  if (target) target.scrollIntoView({ block: 'start' })
  return {
    docScrollY: window.scrollY,
    bodyScrollTop: document.body.scrollTop,
    docElScrollTop: document.documentElement.scrollTop,
    targetFound: Boolean(target),
  }
})
console.log('scroll probe:', JSON.stringify(info))
await page.waitForTimeout(400)
await page.screenshot({ path: path.join(OUT, 's12-settings-exclusions.png') })
console.log('s12-settings-exclusions.png')

// 再把避开窗口组滚到底部对齐，证明最末组与吸底保存钮同屏可见
await page.evaluate(() => {
  const target = [...document.querySelectorAll('.sgroup-label')].find((n) => n.textContent === '已吃菜避开窗口')
  if (target) target.scrollIntoView({ block: 'end' })
})
await page.waitForTimeout(400)
await page.screenshot({ path: path.join(OUT, 's12-settings-avoiddays.png') })
console.log('s12-settings-avoiddays.png')

await browser.close()
server.close()
