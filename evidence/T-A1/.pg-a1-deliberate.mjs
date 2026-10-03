// T-A1 验收专用（仅本地一次性库 family_menu_a1）：模拟「故意破坏」以验证 check:safety 拦截力。
// 用法：node evidence/T-A1/.pg-a1-deliberate.mjs <publish|dangling|restore>
//   publish  = 绕过发布入口直改 status= PUBLISHED（复刻 09-14 裸 SQL 场景，AC5 失败分支）
//   dangling = 把花生 INGREDIENT 规则 targetId 改成不存在的 id（复刻 P0-1 悬空场景）
//   restore  = 两者复原（验收闭环：restore 后 check:safety 应回到 exit 0）
import { createRequire } from 'node:module'
import path from 'node:path'

const req = createRequire(path.resolve('apps/api/package.json'))
const { Client } = req('pg')

const DISH_ID = 'cmurvffy300021cpgv7dpykqj' // 宫保鸡丁（T-A1 验收夹具，DRAFT）
const RULE_ID = 'seed-excl-peanut-ing'

const client = new Client({ connectionString: 'postgresql://postgres@127.0.0.1:54329/family_menu_a1' })

async function main() {
  const action = process.argv[2]
  await client.connect()
  if (action === 'publish') {
    const r = await client.query(
      `UPDATE "Dish" SET status='PUBLISHED' WHERE id=$1 RETURNING id,name,status`,
      [DISH_ID],
    )
    console.log('deliberate publish ->', JSON.stringify(r.rows))
  } else if (action === 'dangling') {
    const r = await client.query(
      `UPDATE "ExclusionRule" SET "targetId"=$1 WHERE id=$2 RETURNING id,"targetId"`,
      ['cmtdanglingtest000000000000', RULE_ID],
    )
    console.log('deliberate dangling ->', JSON.stringify(r.rows))
  } else if (action === 'restore') {
    const r1 = await client.query(
      `UPDATE "Dish" SET status='DRAFT' WHERE id=$1 RETURNING id,status`,
      [DISH_ID],
    )
    const r2 = await client.query(
      `UPDATE "ExclusionRule" SET "targetId"=$1 WHERE id=$2 RETURNING id,"targetId"`,
      ['seed-ing-peanut', RULE_ID],
    )
    console.log('restore ->', JSON.stringify([...r1.rows, ...r2.rows]))
  } else {
    console.error('未知动作：publish | dangling | restore')
    process.exitCode = 2
  }
  await client.end()
}

main().catch((e) => {
  console.error('FAILED:', e.message)
  process.exit(1)
})
