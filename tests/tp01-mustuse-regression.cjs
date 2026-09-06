// T-P01 必消食材输入→推荐结果回归切片（AC1/AC2，纯测试、零业务逻辑改动）
//
// 断言方式：
//   - AC1：POST /api/recommend 携带必消「西红柿」「西蓝花」→ 真实 HTTP 200 + 候选非空，
//     且候选中存在包含该食材的套餐（按 name/aliases→ingredientId 归一后经 PG 直查验证）；
//     附加 PD-001 组合口径：候选必须全覆盖全部必消（engine feasibility 第二轮硬过滤语义）。
//   - AC2：空手（不带必消）→ 200 且 candidates 非空、unmetMustUse 空/缺省（对照 TP-02 口径）；
//     不可满足「苦瓜」→ 200 + candidates:[] + unmetMustUse 含「苦瓜」原文 + 响应无 planId
//     + DB 层 Plan/Event 落库零增量（不建 Plan、不写 Event）。
//
// 真实性约束：全部经真实 HTTP（Fastify :3000，cookie 鉴权）与真实 PostgreSQL 直查，禁止 Mock。
// 用法：node tests/tp01-mustuse-regression.cjs
// 退出码：0=全部 PASS；1=存在 FAIL
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

// ── 配置：根 .env（DATABASE_URL / ACCESS_TOKEN / PORT） ──
const ROOT = path.resolve(__dirname, '..');
const envRaw = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
const ENV = {};
for (const line of envRaw.split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
  if (m) ENV[m[1]] = m[2];
}
const PORT = ENV.PORT || '3000';
const BASE = `http://127.0.0.1:${PORT}`;
const TOKEN = ENV.ACCESS_TOKEN || 'family-menu-local-2026';
const DATABASE_URL = ENV.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('FATAL: .env 中未找到 DATABASE_URL');
  process.exit(1);
}

// pg 驱动经 apps/api 的依赖解析（apps/api 已依赖 pg；根目录 .pg/bin 无 psql）
const requireFromApi = createRequire(path.join(ROOT, 'apps', 'api', 'package.json'));
const { Client } = requireFromApi('pg');

let pass = 0;
let fail = 0;
function step(name, ok, detail) {
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`[${mark}] ${name}: ${detail}`);
  if (ok) pass++;
  else fail++;
}

async function call(method, p, { body } = {}) {
  const headers = { 'content-type': 'application/json', cookie: `access_token=${TOKEN}` };
  const res = await fetch(BASE + p, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* no body */
  }
  return { status: res.status, data };
}

async function main() {
  console.log(`BASE=${BASE} DATABASE_URL=${DATABASE_URL.replace(/:[^:@/]*@/, ':***@')}`);

  // ── DB 连接 + 前置：中文名→ingredientId 归一映射（与服务层 resolveMustUseIds 同序：trim→小写→name/aliases） ──
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  const ingRes = await client.query('SELECT id, name, aliases FROM "Ingredient" ORDER BY id');
  const keyToId = new Map();
  for (const ing of ingRes.rows) {
    for (const key of [ing.name, ...(ing.aliases || [])]) {
      const normalized = String(key).trim().toLowerCase();
      if (normalized && !keyToId.has(normalized)) keyToId.set(normalized, ing.id);
    }
  }
  const tomatoRow = ingRes.rows.find((r) => r.id === keyToId.get('西红柿'));
  const broccoliRow = ingRes.rows.find((r) => r.id === keyToId.get('西蓝花'));

  step(
    '前置：必消「西红柿」经 name/aliases 归一映射到唯一 ingredientId',
    !!tomatoRow,
    `西红柿 -> ${tomatoRow ? `${tomatoRow.id}（name=${tomatoRow.name}, aliases=${JSON.stringify(tomatoRow.aliases)}）` : '(未映射)'}`,
  );
  step(
    '前置：必消「西蓝花」经 name/aliases 归一映射到唯一 ingredientId',
    !!broccoliRow,
    `西蓝花 -> ${broccoliRow ? `${broccoliRow.id}（name=${broccoliRow.name}, aliases=${JSON.stringify(broccoliRow.aliases)}）` : '(未映射)'}`,
  );
  if (!tomatoRow || !broccoliRow) {
    console.log('归一映射缺失，终止后续断言');
    process.exit(1);
  }

  // 菜单食材集合直查（MenuDish JOIN DishIngredient，DISTINCT ingredientId）
  async function menuIngredientIds(menuId) {
    const r = await client.query(
      'SELECT DISTINCT di."ingredientId" AS id FROM "MenuDish" md JOIN "DishIngredient" di ON di."dishId" = md."dishId" WHERE md."menuId" = $1',
      [menuId],
    );
    return r.rows.map((x) => x.id);
  }
  async function countRows(table) {
    const r = await client.query(`SELECT COUNT(*)::int AS n FROM "${table}"`);
    return r.rows[0].n;
  }

  // ── AC1-a：必消「西红柿」 ──
  const ra = await call('POST', '/api/recommend', {
    body: { people: 4, timeBudgetMin: 60, mustUse: ['西红柿'] },
  });
  const candA = Array.isArray(ra.data?.candidates) ? ra.data.candidates : [];
  step(
    'AC1-a 西红柿：200 且候选非空（真实 HTTP）',
    ra.status === 200 && candA.length > 0,
    `status=${ra.status} candidates=${candA.length} planId=${ra.data?.planId ?? 'undefined'}`,
  );
  let aCovered = 0;
  const aIdsByMenu = [];
  for (const c of candA) {
    const ids = await menuIngredientIds(c.menuId);
    aIdsByMenu.push(`${c.menuId}:${ids.includes(tomatoRow.id) ? '含' : '不含'}`);
    if (ids.includes(tomatoRow.id)) aCovered++;
  }
  step(
    'AC1-a 西红柿：候选中存在含该食材的套餐（DB 归一验证）',
    candA.length > 0 && aCovered > 0,
    `含西红柿候选=${aCovered}/${candA.length} [${aIdsByMenu.join(', ')}]`,
  );
  step(
    'AC1-a 西红柿：unmetMustUse 空/缺省',
    !ra.data?.unmetMustUse || ra.data.unmetMustUse.length === 0,
    `unmetMustUse=${JSON.stringify(ra.data?.unmetMustUse ?? null)}`,
  );

  // ── AC1-b：必消「西蓝花」 ──
  const rb = await call('POST', '/api/recommend', {
    body: { people: 4, timeBudgetMin: 60, mustUse: ['西蓝花'] },
  });
  const candB = Array.isArray(rb.data?.candidates) ? rb.data.candidates : [];
  step(
    'AC1-b 西蓝花：200 且候选非空（真实 HTTP）',
    rb.status === 200 && candB.length > 0,
    `status=${rb.status} candidates=${candB.length} planId=${rb.data?.planId ?? 'undefined'}`,
  );
  let bCovered = 0;
  const bIdsByMenu = [];
  for (const c of candB) {
    const ids = await menuIngredientIds(c.menuId);
    bIdsByMenu.push(`${c.menuId}:${ids.includes(broccoliRow.id) ? '含' : '不含'}`);
    if (ids.includes(broccoliRow.id)) bCovered++;
  }
  step(
    'AC1-b 西蓝花：候选中存在含该食材的套餐（DB 归一验证）',
    candB.length > 0 && bCovered > 0,
    `含西蓝花候选=${bCovered}/${candB.length} [${bIdsByMenu.join(', ')}]`,
  );
  step(
    'AC1-b 西蓝花：unmetMustUse 空/缺省',
    !rb.data?.unmetMustUse || rb.data.unmetMustUse.length === 0,
    `unmetMustUse=${JSON.stringify(rb.data?.unmetMustUse ?? null)}`,
  );

  // ── AC1-c：组合必消（PD-001 全覆盖口径；引擎语义条件断言） ──
  // 引擎 feasibility：候选必须同时覆盖全部必消；若组合无可行菜单但各食材均可被消耗，
  // 则 candidates=[] 且 unmetMustUse 缺省（数据组合可行性问题，非引擎缺陷）→ 如实记录。
  const rc = await call('POST', '/api/recommend', {
    body: { people: 4, timeBudgetMin: 60, mustUse: ['西红柿', '西蓝花'] },
  });
  const candC = Array.isArray(rc.data?.candidates) ? rc.data.candidates : [];
  if (candC.length > 0) {
    let full = 0;
    const cIdsByMenu = [];
    for (const c of candC) {
      const ids = await menuIngredientIds(c.menuId);
      const hasBoth = ids.includes(tomatoRow.id) && ids.includes(broccoliRow.id);
      cIdsByMenu.push(`${c.menuId}:${hasBoth ? '全覆盖' : '未全覆盖'}`);
      if (hasBoth) full++;
    }
    step(
      'AC1-c 西红柿+西蓝花：每个候选全覆盖全部必消（PD-001 硬过滤）',
      full === candC.length,
      `全覆盖候选=${full}/${candC.length} [${cIdsByMenu.join(', ')}]`,
    );
  } else {
    step(
      'AC1-c 西红柿+西蓝花：200（组合无可行菜单，如实空手返回）',
      rc.status === 200,
      `status=${rc.status} candidates=0 unmetMustUse=${JSON.stringify(rc.data?.unmetMustUse ?? null)} planId=${rc.data?.planId ?? 'undefined'}`,
    );
  }

  // ── AC2-a：空手回归（不带必消，对照 TP-02 口径） ──
  const re = await call('POST', '/api/recommend', {
    body: { people: 4, timeBudgetMin: 60, mustUse: [] },
  });
  const candE = Array.isArray(re.data?.candidates) ? re.data.candidates : [];
  step(
    'AC2-a 空手：200 且 candidates 非空',
    re.status === 200 && candE.length > 0,
    `status=${re.status} candidates=${candE.length} planId=${re.data?.planId ?? 'undefined'}`,
  );
  step(
    'AC2-a 空手：unmetMustUse 空/缺省',
    !re.data?.unmetMustUse || re.data.unmetMustUse.length === 0,
    `unmetMustUse=${JSON.stringify(re.data?.unmetMustUse ?? null)}`,
  );

  // ── AC2-b：不可满足回归「苦瓜」（TP-02 C-7 口径：200 + [] + 原文回传 + 不建 Plan/不写 Event） ──
  const planBefore = await countRows('Plan');
  const eventBefore = await countRows('Event');
  const rk = await call('POST', '/api/recommend', {
    body: { people: 4, timeBudgetMin: 30, mustUse: ['苦瓜'] },
  });
  const planAfter = await countRows('Plan');
  const eventAfter = await countRows('Event');
  step(
    'AC2-b 苦瓜：200（真实 HTTP）',
    rk.status === 200,
    `status=${rk.status}`,
  );
  step(
    'AC2-b 苦瓜：candidates=[]',
    Array.isArray(rk.data?.candidates) && rk.data.candidates.length === 0,
    `candidates=${rk.data?.candidates?.length ?? '?'}`,
  );
  step(
    'AC2-b 苦瓜：unmetMustUse 含「苦瓜」原文',
    Array.isArray(rk.data?.unmetMustUse) && rk.data.unmetMustUse.includes('苦瓜'),
    `unmetMustUse=${JSON.stringify(rk.data?.unmetMustUse ?? null)}`,
  );
  step(
    'AC2-b 苦瓜：响应无 planId（不建 Plan）',
    rk.data?.planId === undefined,
    `planId=${rk.data?.planId ?? 'undefined'}`,
  );
  step(
    'AC2-b 苦瓜：Plan 落库零增量',
    planAfter === planBefore,
    `Plan ${planBefore} -> ${planAfter}`,
  );
  step(
    'AC2-b 苦瓜：Event 落库零增量（不写 Event）',
    eventAfter === eventBefore,
    `Event ${eventBefore} -> ${eventAfter}`,
  );

  await client.end();
  console.log(`\n== 结果: ${pass} PASS / ${fail} FAIL ==`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('T-P01 REGRESSION FAILED:', e.message);
  process.exit(1);
});
