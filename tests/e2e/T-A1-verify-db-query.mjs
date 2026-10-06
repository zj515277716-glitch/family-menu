// T-A1 验收辅助（只读查询）：确认本地库真实数据面（花生食材 / 含花生菜 / 规则行）。
// 用法：node tests/e2e/T-A1-verify-db-query.mjs   （只 SELECT，零写入）
import { createRequire } from 'node:module'
import path from 'node:path'

const req = createRequire(path.resolve('apps/api/package.json'))
const { Client } = req('pg')

const client = new Client({ connectionString: 'postgresql://postgres@127.0.0.1:54329/family_menu' })

async function main() {
  await client.connect()
  const rules = await client.query(
    `SELECT id, scope, "targetId", "targetTag", severity, note FROM "ExclusionRule" ORDER BY id`,
  )
  console.log('== ExclusionRule ==')
  for (const r of rules.rows) console.log(JSON.stringify(r))

  const peanutIngs = await client.query(
    `SELECT id, name, aliases, category FROM "Ingredient" WHERE name LIKE '%花生%' OR EXISTS (
      SELECT 1 FROM unnest(aliases) a WHERE a LIKE '%花生%') ORDER BY id`,
  )
  console.log('== 含花生食材 ==')
  for (const r of peanutIngs.rows) console.log(JSON.stringify(r))

  const peanutDishes = await client.query(
    `SELECT d.id, d.name, d.status, d."flavorTags" FROM "Dish" d WHERE d.status='PUBLISHED' AND EXISTS (
      SELECT 1 FROM "DishIngredient" di JOIN "Ingredient" i ON i.id=di."ingredientId" WHERE di."dishId"=d.id AND (i.name LIKE '%花生%' OR EXISTS (SELECT 1 FROM unnest(i.aliases) a WHERE a LIKE '%花生%'))
    ) ORDER BY d.id`,
  )
  console.log('== PUBLISHED 中含花生的菜 ==')
  for (const r of peanutDishes.rows) console.log(JSON.stringify(r))

  const anyPeanutDishes = await client.query(
    `SELECT d.id, d.name, d.status FROM "Dish" d WHERE EXISTS (
      SELECT 1 FROM "DishIngredient" di JOIN "Ingredient" i ON i.id=di."ingredientId" WHERE di."dishId"=d.id AND (i.name LIKE '%花生%' OR EXISTS (SELECT 1 FROM unnest(i.aliases) a WHERE a LIKE '%花生%'))
    ) ORDER BY d.status, d.id`,
  )
  console.log('== 任意状态中含花生的菜 ==')
  for (const r of anyPeanutDishes.rows) console.log(JSON.stringify(r))

  const stats = await client.query(
    `SELECT status, count(*)::int AS n FROM "Dish" GROUP BY status ORDER BY status`,
  )
  console.log('== Dish 状态分布 ==')
  for (const r of stats.rows) console.log(JSON.stringify(r))
  await client.end()
}

main().catch((e) => {
  console.error('QUERY FAILED:', e.message)
  process.exit(1)
})
