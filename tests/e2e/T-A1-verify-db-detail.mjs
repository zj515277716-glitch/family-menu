// T-A1 验收辅助（只读查询）：含花生 DRAFT 菜的食材明细 + 花生相关 flavorTags 面。
// 用法：node tests/e2e/T-A1-verify-db-detail.mjs   （只 SELECT，零写入）
import { createRequire } from 'node:module'
import path from 'node:path'

const req = createRequire(path.resolve('apps/api/package.json'))
const { Client } = req('pg')

const client = new Client({ connectionString: 'postgresql://postgres@127.0.0.1:54329/family_menu' })

async function main() {
  await client.connect()
  const dishIds = ['cmtvkmre4000020pglsqyzak8', 'cmtz3kdhp000070pga77gl5wt']
  for (const id of dishIds) {
    const d = await client.query(
      `SELECT d.id, d.name, d.status, d.cuisine, d."flavorTags", d."mealRole" FROM "Dish" d WHERE d.id=$1`,
      [id],
    )
    console.log('== DISH ==', JSON.stringify(d.rows[0]))
    const ings = await client.query(
      `SELECT i.name, i.aliases, di.qty, di.unit, di.optional FROM "DishIngredient" di JOIN "Ingredient" i ON i.id=di."ingredientId" WHERE di."dishId"=$1 ORDER BY i.name`,
      [id],
    )
    for (const r of ings.rows) console.log('   ING:', JSON.stringify(r))
  }
  // flavorTags 含花生的菜（TAG 通道另一入口）
  const tagDishes = await client.query(
    `SELECT id, name, status, "flavorTags" FROM "Dish" WHERE EXISTS (
      SELECT 1 FROM unnest("flavorTags") t WHERE t LIKE '%花生%') ORDER BY status, id`,
  )
  console.log('== flavorTags 含花生的菜 ==')
  for (const r of tagDishes.rows) console.log(JSON.stringify(r))
  await client.end()
}

main().catch((e) => {
  console.error('QUERY FAILED:', e.message)
  process.exit(1)
})
