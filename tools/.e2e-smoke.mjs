// TP-01 链路冒烟：本机 API(3000) → 便携 PG(54329) 完整走通 推荐→锁定→清单
// 同时验证：无令牌请求返回 401（鉴权无硬编码兜底）；/health /health/db 免鉴权
import process from 'node:process'

const BASE = 'http://127.0.0.1:3000'
const TOKEN = process.env.ACCESS_TOKEN || 'family-menu-local-2026'
let pass = 0
let fail = 0

function step(name, ok, detail) {
  const mark = ok ? 'PASS' : 'FAIL'
  console.log(`[${mark}] ${name}: ${detail}`)
  if (ok) pass++
  else fail++
}

async function call(method, path, { body, withToken = true } = {}) {
  const headers = { 'content-type': 'application/json' }
  if (withToken) headers.cookie = `access_token=${TOKEN}`
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  let data = null
  try {
    data = await res.json()
  } catch {
    /* no body */
  }
  return { status: res.status, data }
}

async function main() {
  // 0. 无令牌 → 401（鉴权生效）
  const r0 = await call('GET', '/api/family/rules', { withToken: false })
  step('无令牌访问受保护接口', r0.status === 401, `status=${r0.status}`)

  // 1. /health 免鉴权
  const r1 = await call('GET', '/health', { withToken: false })
  step('GET /health', r1.status === 200 && r1.data?.status === 'ok', `status=${r1.status} status_field=${r1.data?.status}`)

  // 2. /health/db 真实 PG 连接
  const r2 = await call('GET', '/health/db', { withToken: false })
  step('GET /health/db（真实 PostgreSQL）', r2.status === 200 && r2.data?.db === 'connected', `status=${r2.status} db=${r2.data?.db}`)

  // 3. 推荐：POST /api/recommend
  const r3 = await call('POST', '/api/recommend', {
    body: { people: 4, timeBudgetMin: 60, mustUse: [] },
  })
  const planId = r3.data?.planId
  const menuId = r3.data?.candidates?.[0]?.menuId
  step(
    'POST /api/recommend（建 Plan + 引擎推荐）',
    r3.status === 200 && !!planId && Array.isArray(r3.data.candidates),
    `status=${r3.status} planId=${planId} candidates=${r3.data?.candidates?.length ?? 0} first_menu=${menuId}`
  )
  if (!planId || !menuId) {
    console.log('推荐失败，终止后续步骤')
    process.exit(1)
  }
  console.log('  候选菜单名:', r3.data.candidates.map((c) => c.name ?? c.menuId).join(' | '))

  // 4. 锁定：POST /api/plans/:id/lock
  const r4 = await call('POST', `/api/plans/${planId}/lock`, { body: { menuId } })
  step('POST /api/plans/:id/lock（锁定菜单）', r4.status === 200, `status=${r4.status} locked_menu=${r4.data?.menuId ?? r4.data?.menu?.id ?? '(see body)'}`)

  // 5. 清单：GET /api/plans/:id/shopping-list（响应为 groups[].items[] 分组结构）
  const r5 = await call('GET', `/api/plans/${planId}/shopping-list`)
  const groups = Array.isArray(r5.data?.groups) ? r5.data.groups : []
  const items = groups.reduce((n, g) => n + (g.items?.length ?? 0), 0)
  const cats = groups.map((g) => `${g.category}:${g.items?.length ?? 0}`).join(', ')
  step(
    'GET /api/plans/:id/shopping-list（采购清单）',
    r5.status === 200 && items > 0,
    `status=${r5.status} 分组=${groups.length} 条目=${items} [${cats}]`
  )

  // 6. TP-02 空手场景（C-7）：必消"苦瓜"菜库里没有 → 200 + candidates=[] + unmetMustUse 原文回传，不建 Plan
  const r6 = await call('POST', '/api/recommend', {
    body: { people: 4, timeBudgetMin: 30, mustUse: ['苦瓜'] },
  })
  step(
    'POST /api/recommend 空手（C-7：不建 Plan，unmetMustUse 原文回传）',
    r6.status === 200 &&
      Array.isArray(r6.data?.candidates) &&
      r6.data.candidates.length === 0 &&
      Array.isArray(r6.data?.unmetMustUse) &&
      r6.data.unmetMustUse.includes('苦瓜') &&
      r6.data?.planId === undefined,
    `status=${r6.status} candidates=${r6.data?.candidates?.length ?? '?'} unmetMustUse=${JSON.stringify(r6.data?.unmetMustUse)} planId=${r6.data?.planId ?? 'undefined'}`
  )

  console.log(`\n== 结果: ${pass} PASS / ${fail} FAIL ==`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('SMOKE FAILED:', e.message)
  process.exit(1)
})
