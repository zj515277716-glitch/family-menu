// T-A1 验收清理：把 happy-path 发布目标还原为 DRAFT（仅撤销验收引起的变更，AC4 禁止的是
// 把裸 SQL 当发布路径；此处是撤回本验收自己造成的唯一一次发布，回到验收前状态）。
// 用法：node tests/e2e/T-A1-verify-db-restore-dish.mjs <dishId>
import { createRequire } from 'node:module'
import path from 'node:path'

const req = createRequire(path.resolve('apps/api/package.json'))
const { Client } = req('pg')
const client = new Client({ connectionString: 'postgresql://postgres@127.0.0.1:54329/family_menu' })

async function main() {
  const id = process.argv[2]
  if (!id) {
    console.error('缺少 dishId')
    process.exit(2)
  }
  await client.connect()
  const r = await client.query(
    'UPDATE "Dish" SET status=\'DRAFT\' WHERE id=$1 AND status=\'PUBLISHED\' RETURNING id, name, status',
    [id],
  )
  console.log('验收清理：还原 ->', JSON.stringify(r.rows))
  await client.end()
}
main().catch((e) => {
  console.error('FAILED:', e.message)
  process.exit(1)
})
