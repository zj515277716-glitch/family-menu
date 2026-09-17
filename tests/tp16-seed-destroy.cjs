// tests/tp16-seed-destroy.cjs
// T-P16 AC8 「teardown 后可恢复」验证第一步：人为破坏 seed 纠偏字段
//   - seed-dish-potato-ribs: status PUBLISHED -> TESTED
//   - cmtvkq3dl00009cpgaeksvumo (冬瓜排骨汤): mealRole SOUP -> MAIN
// 破坏后应执行 pnpm db:seed，再用 tests/tp16-db-counts.cjs 验证恢复。
// 用法：node tests/tp16-seed-destroy.cjs [connectionString]
'use strict';
const path = require('node:path');
const API_NM = path.resolve(__dirname, '../apps/api/node_modules');
require(path.join(API_NM, 'dotenv')).config({ path: path.resolve(__dirname, '../.env') });
const { Pool } = require(path.join(API_NM, 'pg'));

const connectionString = process.argv[2] || 'postgresql://postgres@127.0.0.1:54329/family_menu';
const pool = new Pool({ connectionString });

async function show(tag) {
  const r = await pool.query(
    `select id, status, "mealRole" from "Dish"
     where id in ('seed-dish-potato-ribs','cmtvkq3dl00009cpgaeksvumo') order by id`
  );
  for (const row of r.rows) console.log(`[${tag}] ${row.id} | ${row.status} | ${row.mealRole}`);
}

async function main() {
  await show('before-destroy');
  const r1 = await pool.query(
    `update "Dish" set status = 'TESTED' where id = 'seed-dish-potato-ribs'`
  );
  const r2 = await pool.query(
    `update "Dish" set "mealRole" = 'MAIN' where id = 'cmtvkq3dl00009cpgaeksvumo'`
  );
  console.log(`destroyed rows: status=${r1.rowCount}, mealRole=${r2.rowCount}`);
  await show('after-destroy');
}

main()
  .then(() => pool.end())
  .catch((e) => {
    console.error('DESTROY-FAIL:', e.message);
    pool.end().finally(() => process.exit(1));
  });
