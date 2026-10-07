// tests/e2e/T-A3-verify-probe.mjs
// T-A3 验收前置探查：登录 -> 读家庭规则/禁忌/菜池/计划基线（只读，不写库）。
// 目的：确认 a3v- 测试前缀在菜池 id 排序最前、无 SOFT 禁忌误伤测试菜、记录 plans 基线供清理复核。
// 运行：node tests/e2e/T-A3-verify-probe.mjs
import { loadLocalToken } from './lib/env-token.mjs'

const API = 'http://127.0.0.1:3000'
const TOKEN = loadLocalToken()
if (!TOKEN) {
  console.error('FAIL: 未找到本地口令')
  process.exit(2)
}

// 手动管 cookie（PowerShell WebSession 不回传 Secure cookie，Node fetch + 显式头最稳）
async function login() {
  const res = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: TOKEN }),
  })
  if (!res.ok) throw new Error(`login ${res.status}`)
  const setCookie = res.headers.get('set-cookie') ?? ''
  const m = setCookie.match(/access_token=([^;]+)/)
  if (!m) throw new Error('no access_token cookie')
  return m[1]
}

const cookie = await login()
const get = async (path) => {
  const res = await fetch(`${API}${path}`, { headers: { cookie: `access_token=${cookie}` } })
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`)
  return res.json()
}

const rules = await get('/api/family/rules')
console.log(`RULES defaultPeople=${rules.defaultPeople} cuisines=[${rules.cuisines}] equipment=[${rules.equipment}]`)

const ex = await get('/api/family/exclusions')
console.log(`EXCLUSIONS ${ex.length} 条`)
for (const e of ex) {
  console.log(`  ${e.id} scope=${e.scope} sev=${e.severity} targetId=${e.targetId ?? '-'} targetTag=${e.targetTag ?? '-'} name=${e.targetName ?? '-'}`)
}

const dishes = await get('/api/dishes?status=PUBLISHED')
console.log(`PUBLISHED dishes ${dishes.length} 道`)
const byRole = {}
const byPrefix = {}
let a3vExists = 0
for (const d of dishes) {
  byRole[d.mealRole] = (byRole[d.mealRole] ?? 0) + 1
  const p = d.id.slice(0, 4)
  byPrefix[p] = (byPrefix[p] ?? 0) + 1
  if (d.id.startsWith('a3v-')) a3vExists++
}
console.log('role 分布:', JSON.stringify(byRole))
console.log('id 前4字符分布:', JSON.stringify(byPrefix))
console.log(`a3v- 残留（应为 0）: ${a3vExists}`)

// 排序核对：id 升序前 5 道与各角色池头部（决定组合轮转谁先上桌）
const sorted = [...dishes].sort((a, b) => (a.id < b.id ? -1 : 1))
console.log('id 升序前5:', sorted.slice(0, 5).map((d) => `${d.id}/${d.mealRole}/${d.name}`).join(' | '))

const plans = await get('/api/plans')
console.log(`PLANS 基线 ${plans.length} 条`)
for (const p of plans.slice(0, 8)) {
  console.log(`  ${p.id} ${p.planDate.slice(0, 10)} ${p.status} dishes=[${(p.dishNames ?? []).join('、')}]`)
}
if (plans.length > 8) console.log(`  … 其余 ${plans.length - 8} 条省略`)
