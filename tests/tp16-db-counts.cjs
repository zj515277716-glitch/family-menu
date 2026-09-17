// tests/tp16-db-counts.cjs
// T-P16 七表计数实测脚本（AC8 seed 重放验证 / AC9 teardown 基线登记）
// 用法：node tests/tp16-db-counts.cjs [connectionString]
//   缺省连接串 = postgresql://postgres@127.0.0.1:54329/family_menu
// 输出：七表计数（Dish/Menu/MenuDish/Ingredient/Plan/Event/CookLog）+ 关键纠偏字段抽查
'use strict';
const path = require('node:path');
const API_NM = path.resolve(__dirname, '../apps/api/node_modules');
require(path.join(API_NM, 'dotenv')).config({ path: path.resolve(__dirname, '../.env') });
const { Pool } = require(path.join(API_NM, 'pg'));

const connectionString = process.argv[2] || 'postgresql://postgres@127.0.0.1:54329/family_menu';
const pool = new Pool({ connectionString });

const TABLES = ['Dish', 'Menu', 'MenuDish', 'Ingredient', 'Plan', 'Event', 'CookLog'];

async function main() {
  const counts = {};
  for (const t of TABLES) {
    const r = await pool.query(`select count(*)::int as c from "${t}"`);
    counts[t] = r.rows[0].c;
  }
  console.log('=== seven-table counts ===');
  console.log(JSON.stringify(counts, null, 2));

  // AC8 纠偏抽查：4 道排骨菜 status / 2 汤 mealRole
  const ribs = await pool.query(
    `select id, name, "mealRole", status, origin from "Dish"
     where id in ('seed-dish-potato-ribs','cmtvk2erk0000nopg3y2tqytq','cmtvkq3dl00009cpgaeksvumo','cmtvkqlfh000080pggqq7f7p0')
     order by id`
  );
  console.log('=== ribs dishes (AC8) ===');
  for (const row of ribs.rows) {
    console.log(`${row.id} | ${row.status} | ${row.mealRole} | ${row.origin} | ${row.name}`);
  }

  const ribsMenus = await pool.query(
    `select m.id, m.name, m.status, m."totalActiveMinutes",
            (select count(*)::int from "MenuDish" md where md."menuId" = m.id) as dish_count
     from "Menu" m where m.id like 'ribs-menu-%' order by m.id`
  );
  console.log('=== ribs menus (AC8) ===');
  for (const row of ribsMenus.rows) {
    console.log(`${row.id} | ${row.status} | ${row.totalActiveMinutes}min | dishes=${row.dish_count} | ${row.name}`);
  }

  // 幂等重放验证口径：seed 标识行计数
  const seedIng = await pool.query(`select count(*)::int as c from "Ingredient" where id like 'seed-%'`);
  const seedDish = await pool.query(`select count(*)::int as c from "Dish" where id like 'seed-%'`);
  const fetchDish = await pool.query(`select count(*)::int as c from "Dish" where origin = 'FETCHED'`);
  console.log('=== seed markers ===');
  console.log(JSON.stringify({ seedIngredients: seedIng.rows[0].c, seedDishes: seedDish.rows[0].c, fetchedDishes: fetchDish.rows[0].c }));
}

main()
  .then(() => pool.end())
  .catch((e) => {
    console.error('COUNTS-FAIL:', e.message);
    pool.end().finally(() => process.exit(1));
  });
