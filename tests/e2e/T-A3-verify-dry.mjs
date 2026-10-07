// tests/e2e/T-A3-verify-dry.mjs
// T-A3 干跑：直接调 POST /api/recommend 验证组合轮转假设（3 轮情境），不碰 UI。
// 产生的计划由 T-A3-verify-data.ts cleanup 按「候选含 a3v-」自动归删。
import { loadLocalToken } from './lib/env-token.mjs'

const API = 'http://127.0.0.1:3000'
const TOKEN = loadLocalToken()
const res = await fetch(`${API}/api/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ token: TOKEN }),
})
const cookie = (res.headers.get('set-cookie') ?? '').match(/access_token=([^;]+)/)?.[1]

const post = async (path, body) => {
  const r = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: `access_token=${cookie}` },
    body: JSON.stringify(body),
  })
  return { status: r.status, data: await r.json() }
}

const show = async (label, ctx) => {
  const { status, data } = await post('/api/recommend', { ...ctx })
  return { label, ctx, status, data }
}

for (const ctx of [
  { people: 2, timeBudgetMin: 60, mustUse: ['A3验收白菜'] },
  { people: 3, timeBudgetMin: 60, mustUse: ['A3验收萝卜'] },
]) {
  const r = await show('dry', ctx)
  console.log(`\n=== people=${ctx.people} mustUse=${ctx.mustUse} -> status ${r.status} ===`)
  for (const c of r.data.candidates) {
    console.log(
      `  ${c.menuId} score=${c.score} hist=${c.breakdown.historyAcceptance} recent=${c.breakdown.recentDiversity} [${(c.menu?.dishes ?? []).map((d) => d.name).join('、')}]`,
    )
  }
  if (r.data.planId) console.log(`  planId=${r.data.planId}`)
}
