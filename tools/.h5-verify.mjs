// TP-01 前端链路验证：按浏览器实际加载序列抓取产物并检查
// Taro4 dev 架构：index.html → 宿主(runtime/app) → remoteEntry(prebundle) → boot chunk → 页面 chunk
let pass = 0
let fail = 0
function step(name, ok, detail) {
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}: ${detail}`)
  ok ? pass++ : fail++
}
const BASE = 'http://127.0.0.1:10086'
const PAGES = ['tonight', 'history', 'setup', 'candidates', 'plan', 'dish']
async function get(path) {
  const r = await fetch(BASE + path)
  if (r.status !== 200) return { status: r.status, text: '' }
  return { status: r.status, text: await r.text() }
}
function isJs(t) { return t.length > 0 && !t.trimStart().startsWith('<') }

// 1. HTML 入口（浏览器第一跳）
const root = await get('/')
step('H5 根路径返回应用页面', root.status === 200 && root.text.includes('<div id="app">'),
  `status=${root.status} bytes=${root.text.length} 挂载点=${root.text.includes('<div id="app">')}`)

// 2. 依次抓取浏览器将加载的全部 JS 产物
const parts = []
let total = 0
async function collect(label, path) {
  const g = await get(path)
  const ok = g.status === 200 && isJs(g.text)
  total += ok ? g.text.length : 0
  if (ok) parts.push(g.text)
  console.log(`  ${label} ${path} => ${g.status} ${ok ? g.text.length + 'B' : '非JS'}`)
  return ok
}
console.log('抓取产物清单:')
const hostOk = await collect('宿主', '/js/runtime.4a2e3d1b.js')
  && await collect('宿主', '/js/app.4a2e3d1b.js')
  && await collect('预打包', '/remoteEntry.js')
  && await collect('应用', '/js/src_app_boot_js._chunkhash_.js')
let pagesOk = true
for (const p of PAGES) {
  pagesOk = (await collect(`页面:${p}`, `/js/src_pages_${p}_index_tsx._chunkhash_.js`)) && pagesOk
}
step('宿主/预打包/应用/全部 6 页 chunk 均为真实 JS 产物', hostOk && pagesOk, `全量 JS = ${total} bytes`)

const allJs = parts.join('\n')

// 3. 环境注入检查（DefinePlugin 字面量）
step('产物注入 TARO_APP_API_BASE_URL（http://127.0.0.1:3000）',
  allJs.includes('http://127.0.0.1:3000'), `出现=${allJs.includes('http://127.0.0.1:3000')}`)
step('产物注入 TARO_APP_ACCESS_TOKEN（family-menu-local-2026）',
  allJs.includes('family-menu-local-2026'), `出现=${allJs.includes('family-menu-local-2026')}`)

// 4. 无 Mock 兜底 + 明确失败提示（C-13）
step('产物包含「服务未连接」明确提示（未配置时明确失败，不造假数据）',
  allJs.includes('服务未连接'), `出现=${allJs.includes('服务未连接')}`)
step('产物无 Mock 残留（isMockMode/mockApi）',
  !allJs.includes('isMockMode') && !allJs.includes('mockApi'),
  `mock 标记=${allJs.includes('isMockMode') || allJs.includes('mockApi')}`)

// 5. 业务代码真实存在
step('产物包含业务路由与 API 调用（/api/recommend）',
  allJs.includes('pages/tonight/index') && allJs.includes('/api/recommend'),
  `路由=${allJs.includes('pages/tonight/index')} API=${allJs.includes('/api/recommend')}`)

console.log(`\n== 结果: ${pass} PASS / ${fail} FAIL ==`)
process.exit(fail === 0 ? 0 : 1)
