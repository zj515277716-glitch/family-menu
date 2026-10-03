// T-A1 验收辅助（本地库受控破坏/恢复）：复刻 09-14 失效形态以实证防线，全部可 restore。
// 用法（仓库根目录）：
//   node tests/e2e/T-A1-verify-db-mutate.mjs snapshot            # 留底 Plan/Event 现状（清残留用）
//   node tests/e22e/T-A1-verify-db-mutate.mjs publish-gongbao    # 裸 SQL 直改 PUBLISHED（复刻 09-14，check:safety 应 FAIL）
//   node tests/e2e/T-A1-verify-db-mutate.mjs unpublish-gongbao   # 还原为 DRAFT
//   node tests/e2e/T-A1-verify-db-mutate.mjs dangling-ing        # 花生 INGREDIENT 规则 targetId 悬空（复刻 P0-1）
//   node tests/e2e/T-A1-verify-db-mutate.mjs restore-ing         # 还原花生 INGREDIENT 规则 targetId
//   node tests/e2e/T-A1-verify-db-mutate.mjs neutralize-tag      # 花生 TAG 规则 targetTag 改名失活（模拟规则全灭形态之一）
//   node tests/e2e/T-A1-verify-db-mutate.mjs restore-tag         # 还原花生 TAG 规则
//   node tests/e2e/T-A1-verify-db-mutate.mjs state               # 打印规则/含花生菜/状态分布/残留面
//   node tests/e2e/T-A1-verify-db-mutate.mjs cleanup-residue     # 删除验收新建的 Plan/Event（对照 snapshot）
// 注意：仅连本机 127.0.0.1:54329 本地库；不含口令；破坏动作均带 restore，验收闭环后库状态还原。
import { createRequire } from 'node:module'
import path from 'node:path'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const req = createRequire(path.resolve('apps/api/package.json'))
const { Client } = req('pg')

const GONGBAO_ID = 'cmtvkmre4000020pglsqyzak8' // 巨入味！清甜酸甜口宫保鸡丁！口感封（DRAFT，含花生米 50g）
const PEANUT_ING_RULE = 'seed-excl-peanut-ing'
const PEANUT_ING_TARGET = 'cmtvnuvxvc2oy5fdrzhpxxe69' // 花生米（本机库 cuid）
const PEANUT_TAG_RULE = 'seed-excl-peanut'
const PEANUT_TAG = '花生'
const DANGLING_ID = 'cmtdanglingtest000000000000'
const SNAP_DIR = path.resolve('evidence/T-A1')

const client = new Client({ connectionString: 'postgresql://postgres@127.0.0.1:54329/family_menu' })

async function main() {
  const action = process.argv[2]
  await client.connect()
  if (action === 'snapshot') {
    const plans = await client.query('SELECT id FROM "Plan" ORDER BY id')
    const events = await client.query('SELECT id FROM "Event" ORDER BY id')
    writeFileSync(path.join(SNAP_DIR, 'pre-verify-plan-ids.txt'), plans.rows.map((r) => r.id).join('\n'))
    writeFileSync(path.join(SNAP_DIR, 'pre-verify-event-ids.txt'), events.rows.map((r) => r.id).join('\n'))
    console.log(`snapshot -> plans=${plans.rows.length} events=${events.rows.length}`)
  } else if (action === 'publish-gongbao') {
    const r = await client.query(
      `UPDATE "Dish" SET status='PUBLISHED' WHERE id=$1 AND status='DRAFT' RETURNING id, name, status`,
      [GONGBAO_ID],
    )
    console.log('deliberate bare-SQL publish（复刻 09-14） ->', JSON.stringify(r.rows))
  } else if (action === 'unpublish-gongbao') {
    const r = await client.query(
      `UPDATE "Dish" SET status='DRAFT' WHERE id=$1 RETURNING id, name, status`,
      [GONGBAO_ID],
    )
    console.log('restore gongbao ->', JSON.stringify(r.rows))
  } else if (action === 'dangling-ing') {
    const r = await client.query(
      `UPDATE "ExclusionRule" SET "targetId"=$1 WHERE id=$2 RETURNING id, "targetId"`,
      [DANGLING_ID, PEANUT_ING_RULE],
    )
    console.log('deliberate dangling（复刻 P0-1 悬空） ->', JSON.stringify(r.rows))
  } else if (action === 'restore-ing') {
    const r = await client.query(
      `UPDATE "ExclusionRule" SET "targetId"=$1 WHERE id=$2 RETURNING id, "targetId"`,
      [PEANUT_ING_TARGET, PEANUT_ING_RULE],
    )
    console.log('restore peanut ING rule ->', JSON.stringify(r.rows))
  } else if (action === 'neutralize-tag') {
    const r = await client.query(
      `UPDATE "ExclusionRule" SET "targetTag"=$1 WHERE id=$2 RETURNING id, "targetTag"`,
      ['花生X', PEANUT_TAG_RULE],
    )
    console.log('neutralize peanut TAG rule（失活，无人命中） ->', JSON.stringify(r.rows))
  } else if (action === 'restore-tag') {
    const r = await client.query(
      `UPDATE "ExclusionRule" SET "targetTag"=$1 WHERE id=$2 RETURNING id, "targetTag"`,
      [PEANUT_TAG, PEANUT_TAG_RULE],
    )
    console.log('restore peanut TAG rule ->', JSON.stringify(r.rows))
  } else if (action === 'state') {
    const rules = await client.query('SELECT id, scope, "targetId", "targetTag", severity FROM "ExclusionRule" ORDER BY id')
    console.log('rules:', JSON.stringify(rules.rows))
    const stats = await client.query('SELECT status, count(*)::int AS n FROM "Dish" GROUP BY status ORDER BY status')
    console.log('dish stats:', JSON.stringify(stats.rows))
    const gongbao = await client.query('SELECT id, name, status FROM "Dish" WHERE id=$1', [GONGBAO_ID])
    console.log('gongbao:', JSON.stringify(gongbao.rows))
  } else if (action === 'cleanup-residue') {
    const planIds = existsSync(path.join(SNAP_DIR, 'pre-verify-plan-ids.txt'))
      ? readFileSync(path.join(SNAP_DIR, 'pre-verify-plan-ids.txt'), 'utf8').split('\n').filter(Boolean)
      : []
    const eventIds = existsSync(path.join(SNAP_DIR, 'pre-verify-event-ids.txt'))
      ? readFileSync(path.join(SNAP_DIR, 'pre-verify-event-ids.txt'), 'utf8').split('\n').filter(Boolean)
      : []
    const newPlans = await client.query(
      planIds.length
        ? 'SELECT id FROM "Plan" WHERE id <> ALL($1) ORDER BY id'
        : 'SELECT id FROM "Plan" ORDER BY id',
      planIds.length ? [planIds] : [],
    )
    const newEvents = await client.query(
      eventIds.length
        ? 'SELECT id FROM "Event" WHERE id <> ALL($1) ORDER BY id'
        : 'SELECT id FROM "Event" ORDER BY id',
      eventIds.length ? [eventIds] : [],
    )
    const np = newPlans.rows.map((r) => r.id)
    const ne = newEvents.rows.map((r) => r.id)
    if (np.length) {
      await client.query('DELETE FROM "Event" WHERE "planId" = ANY($1)', [np])
      await client.query('DELETE FROM "Plan" WHERE id = ANY($1)', [np])
    }
    if (ne.length) await client.query('DELETE FROM "Event" WHERE id = ANY($1)', [ne])
    console.log(`cleanup-residue -> removed plans=${np.length} events=${ne.length}`)
  } else {
    console.error('未知动作：snapshot | publish-gongbao | unpublish-gongbao | dangling-ing | restore-ing | neutralize-tag | restore-tag | state | cleanup-residue')
    process.exitCode = 2
  }
  await client.end()
}

main().catch((e) => {
  console.error('MUTATE FAILED:', e.message)
  process.exit(1)
})
