// T-A1 验收辅助（只读）：列 DRAFT 且不含花生食材的菜，供 happy-path release 选目标。
// 用法：node tests/e2e/T-A1-verify-db-pick-draft.mjs
import { createRequire } from 'node:module'
import path from 'node:path'

const req = createRequire(path.resolve('apps/api/package.json'))
const { Client } = req('pg')
const client = new Client({ connectionString: 'postgresql://postgres@127.0.0.1:54329/family_menu' })

async function main() {
  await client.connect()
  const r = await client.query(
    `SELECT d.id, d.name, d."totalMinutes", d."mealRole" FROM "Dish" d
     WHERE d.status='DRAFT' AND NOT EXISTS (
       SELECT 1 FROM "DishIngredient" di JOIN "Ingredient" i ON i.id=di."ingredientId"
       WHERE di."dishId"=d.id AND (i.name LIKE '%花生%' OR EXISTS (SELECT 1 FROM unnest(i.aliases) a WHERE a LIKE '%花生%')))
     ORDER BY d."totalMinutes" ASC LIMIT 8`,
  )
  for (const row of r.rows) console.log(JSON.stringify(row))
  await client.end()
}
main().catch((e) => {
  console.error('QUERY FAILED:', e.message)
  process.exit(1)
})
