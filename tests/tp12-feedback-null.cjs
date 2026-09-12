// T-P12 GET /api/plans/:id/feedback 空态语义回归（契约 v0.9，挂账⑤，纯测试、零业务逻辑改动）
//
// 断言方式（全部真实 HTTP + PG 直查，禁止 Mock）：
//   - 态1「plan 存在但无反馈」→ 200 且响应体严格为 null 字面量（body === 'null'，非空对象/空串/错误包裹）；
//   - 态2「有反馈」→ 200 报文形状零变化：
//       a. 新事件完整 payload：didCook/taste/willRepeat/actualMinutes/submittedAt，键集恰为 5 键；
//       b. 事件流 append-only 取最新 + v0.5 旧事件 payload 宽松解析（optional 字段如实缺省）；
//   - 态3「plan 不存在」→ 404（v0.9 语义收敛为「资源不存在」）。
// teardown：自建 Plan/Event 按精确 id 白名单（tp12- 前缀）自清，七表计数 before===after，
//   REL（Dish.imageUrl LIKE '/images/%' 迁移数据口径）不动。
//
// 真实性约束：真实 HTTP（Fastify :PORT，access_token cookie 鉴权）+ 真实 PostgreSQL 直查，禁止 Mock。
// 用法：
//   node tests/tp12-feedback-null.cjs baseline   # 仅输出七表 + REL 基线计数 JSON（开工/终态核对用）
//   node tests/tp12-feedback-null.cjs            # 完整三态回归 + 自清 + 七表终态断言
// 退出码：0=全部 PASS；1=存在 FAIL
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const ENV = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
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
const requireFromApi = require('node:module').createRequire(path.join(ROOT, 'apps', 'api', 'package.json'));
const { Client } = requireFromApi('pg');

const TABLES = ['Dish', 'Menu', 'MenuDish', 'Ingredient', 'Plan', 'Event', 'CookLog'];
const FAMILY_ID = 'seed-family'; // planService FAMILY_ID 常量口径（process.env.FAMILY_ID ?? 'seed-family'）

async function connectDb() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  return client;
}

async function countRows(client, table) {
  const r = await client.query(`SELECT COUNT(*)::int AS n FROM "${table}"`);
  return r.rows[0].n;
}

async function snapshot(client) {
  const out = {};
  for (const t of TABLES) out[t] = await countRows(client, t);
  const rel = await client.query(`SELECT COUNT(*)::int AS n FROM "Dish" WHERE "imageUrl" LIKE '/images/%'`);
  out.REL = rel.rows[0].n;
  return out;
}

// ── 真实 HTTP 调用（带 access_token cookie）──
async function call(method, p) {
  const res = await fetch(BASE + p, {
    method,
    headers: { cookie: `access_token=${TOKEN}` },
  });
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    /* 保留 data=null，由调用方断言 text */
  }
  return { status: res.status, text, data };
}

let pass = 0;
let fail = 0;
function step(name, ok, detail) {
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`[${mark}] ${name}: ${detail}`);
  if (ok) pass++;
  else fail++;
}

// 自建数据 id 白名单（tp12- 前缀，teardown 按精确 id 删除，绝不触碰其他行）
const RAND = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
const planIds = [`tp12-plan-nofb-${RAND}`, `tp12-plan-full-${RAND}`, `tp12-plan-legacy-${RAND}`];
const eventIds = [`tp12-ev-full-${RAND}`, `tp12-ev-old-${RAND}`, `tp12-ev-new-${RAND}`];

async function main() {
  const mode = process.argv[2] || '';

  // ── baseline 模式：仅输出七表 + REL 计数（开工基线 / teardown 终态核对） ──
  if (mode === 'baseline') {
    const client = await connectDb();
    const snap = await snapshot(client);
    await client.end();
    console.log(JSON.stringify(snap));
    // 不用 process.exit()：Node v24/Windows 下 exit() 与 libuv 句柄关闭竞态会崩出 0xC0000409 伪退出码
    process.exitCode = 0;
    return;
  }

  console.log(`BASE=${BASE} DATABASE_URL=${DATABASE_URL.replace(/:[^:@/]*@/, ':***@')}`);
  const client = await connectDb();

  // ── 前置：family 存在 + 基线快照 ──
  const fam = await client.query(`SELECT id FROM "Family" WHERE id = $1`, [FAMILY_ID]);
  step(
    '前置：seed family 存在（自建 Plan 外键依赖）',
    fam.rows.length === 1,
    `familyId=${FAMILY_ID} rows=${fam.rows.length}`,
  );
  const before = await snapshot(client);
  step(
    '前置：七表基线快照记录',
    true,
    `Dish=${before.Dish} Menu=${before.Menu} MenuDish=${before.MenuDish} Ingredient=${before.Ingredient} Plan=${before.Plan} Event=${before.Event} CookLog=${before.CookLog} REL=${before.REL}`,
  );

  // ── 自建 3 个 Plan（PG 直查 INSERT，最小合法字段） ──
  for (const pid of planIds) {
    await client.query(
      `INSERT INTO "Plan" (id, "familyId", "planDate", context, candidates, status) VALUES ($1, $2, CURRENT_DATE, $3::jsonb, $4::jsonb, 'PROPOSED')`,
      [pid, FAMILY_ID, JSON.stringify({ people: 2, timeBudgetMin: 30, mustUse: [] }), JSON.stringify([])],
    );
  }
  const inserted = await client.query(`SELECT COUNT(*)::int AS n FROM "Plan" WHERE id = ANY($1)`, [planIds]);
  step(
    '前置：自建 3 个无反馈 Plan（tp12- 前缀白名单）',
    inserted.rows[0].n === 3,
    `inserted=${inserted.rows[0].n}/3`,
  );

  // ── 态1：plan 存在但无反馈 -> 200 + 响应体严格 null 字面量（v0.9 核心行为） ──
  const rNofb = await call('GET', `/api/plans/${planIds[0]}/feedback`);
  step(
    '态1 无反馈：HTTP 200（真实请求，原为 404）',
    rNofb.status === 200,
    `status=${rNofb.status}（契约 v0.9 要求 200）`,
  );
  step(
    '态1 无反馈：响应体严格为 null 字面量',
    rNofb.text === 'null' && rNofb.data === null,
    `body=${JSON.stringify(rNofb.text)}（要求 'null'，非 '{}'/'""'/错误包裹）`,
  );

  // ── 态2-a：有反馈（新事件完整 payload）-> 200 报文形状零变化 ──
  await client.query(
    `INSERT INTO "Event" (id, "familyId", "planId", type, payload, "createdAt") VALUES ($1, $2, $3, 'COOKED', $4::jsonb, now())`,
    [eventIds[0], FAMILY_ID, planIds[1], JSON.stringify({ taste: 'good', willRepeat: true, actualMinutes: 30 })],
  );
  const rFull = await call('GET', `/api/plans/${planIds[1]}/feedback`);
  step(
    '态2-a 有反馈：HTTP 200（形状回归前置）',
    rFull.status === 200,
    `status=${rFull.status}`,
  );
  step(
    '态2-a 有反馈：didCook/taste/willRepeat/actualMinutes 与事件 payload 一致',
    rFull.data?.didCook === true && rFull.data?.taste === 'good' && rFull.data?.willRepeat === true && rFull.data?.actualMinutes === 30,
    `didCook=${rFull.data?.didCook} taste=${rFull.data?.taste} willRepeat=${rFull.data?.willRepeat} actualMinutes=${rFull.data?.actualMinutes}`,
  );
  const submittedOk =
    typeof rFull.data?.submittedAt === 'string' && !Number.isNaN(new Date(rFull.data.submittedAt).getTime());
  step(
    '态2-a 有反馈：submittedAt 为可解析 ISO 时间（= 事件创建时间）',
    submittedOk,
    `submittedAt=${rFull.data?.submittedAt ?? 'undefined'}`,
  );
  const keys = rFull.data && typeof rFull.data === 'object' ? Object.keys(rFull.data).sort() : [];
  const expectKeys = JSON.stringify(['actualMinutes', 'didCook', 'submittedAt', 'taste', 'willRepeat']);
  step(
    '态2-a 有反馈：报文键集恰为 5 键（形状零变化，无新增/缺失键）',
    JSON.stringify(keys) === expectKeys,
    `keys=${JSON.stringify(keys)}`,
  );

  // ── 态2-b：事件流 append-only 取最新 + 旧事件 payload 宽松解析（optional 如实缺省） ──
  await client.query(
    `INSERT INTO "Event" (id, "familyId", "planId", type, payload, "createdAt")
     VALUES ($1, $2, $3, 'COOKED', $4::jsonb, now() - interval '10 minutes')`,
    [eventIds[1], FAMILY_ID, planIds[2], JSON.stringify({ taste: 'ok', willRepeat: false, actualMinutes: 45 })],
  );
  await client.query(
    `INSERT INTO "Event" (id, "familyId", "planId", type, payload, "createdAt") VALUES ($1, $2, $3, 'NOT_COOKED', $4::jsonb, now())`,
    [eventIds[2], FAMILY_ID, planIds[2], JSON.stringify({ actualMinutes: 20 })],
  );
  const rLegacy = await call('GET', `/api/plans/${planIds[2]}/feedback`);
  step(
    '态2-b 取最新：HTTP 200 且返回后插入的 NOT_COOKED 事件（createdAt desc 语义）',
    rLegacy.status === 200 && rLegacy.data?.didCook === false,
    `status=${rLegacy.status} didCook=${rLegacy.data?.didCook}`,
  );
  step(
    '态2-b 旧 payload 宽松：taste/willRepeat 如实缺省（undefined，不编造）',
    rLegacy.data?.taste === undefined && rLegacy.data?.willRepeat === undefined,
    `taste=${JSON.stringify(rLegacy.data?.taste ?? null)} willRepeat=${JSON.stringify(rLegacy.data?.willRepeat ?? null)}`,
  );
  step(
    '态2-b 旧 payload 宽松：actualMinutes=20（旧事件 payload 如实保留）',
    rLegacy.data?.actualMinutes === 20,
    `actualMinutes=${rLegacy.data?.actualMinutes}`,
  );

  // ── 态3：plan 不存在 -> 404（语义收敛为资源不存在） ──
  const r404 = await call('GET', `/api/plans/tp12-nonexistent-${RAND}/feedback`);
  step(
    '态3 plan 不存在：HTTP 404（v0.9 保持不变）',
    r404.status === 404,
    `status=${r404.status} body=${JSON.stringify(r404.text)}`,
  );

  // ── teardown：自建 Event/Plan 按精确 id 白名单自清 ──
  const delEvents = await client.query(`DELETE FROM "Event" WHERE id = ANY($1) RETURNING id`, [eventIds]);
  const delPlans = await client.query(`DELETE FROM "Plan" WHERE id = ANY($1) RETURNING id`, [planIds]);
  step(
    'teardown：自建 Event 按白名单精确删除',
    delEvents.rowCount === 3,
    `deleted=${delEvents.rowCount}/3 [${delEvents.rows.map((r) => r.id).join(', ')}]`,
  );
  step(
    'teardown：自建 Plan 按白名单精确删除',
    delPlans.rowCount === 3,
    `deleted=${delPlans.rowCount}/3 [${delPlans.rows.map((r) => r.id).join(', ')}]`,
  );
  const residual = await client.query(
    `SELECT
       (SELECT COUNT(*)::int FROM "Plan" WHERE id = ANY($1))
     + (SELECT COUNT(*)::int FROM "Event" WHERE id = ANY($2)) AS n`,
    [planIds, eventIds],
  );
  step('teardown：残留行 = 0', residual.rows[0].n === 0, `residual=${residual.rows[0].n}`);

  // ── 七表 + REL 终态断言（before === after） ──
  const after = await snapshot(client);
  const tableOk = TABLES.every((t) => after[t] === before[t]);
  step(
    'teardown：七表计数回基线',
    tableOk,
    `Dish=${after.Dish}/${before.Dish} Menu=${after.Menu}/${before.Menu} MenuDish=${after.MenuDish}/${before.MenuDish} Ingredient=${after.Ingredient}/${before.Ingredient} Plan=${after.Plan}/${before.Plan} Event=${after.Event}/${before.Event} CookLog=${after.CookLog}/${before.CookLog}`,
  );
  step('teardown：REL（imageUrl LIKE /images/%）不动', after.REL === before.REL, `REL=${after.REL}/${before.REL}`);

  await client.end();
  console.log(`\n== 结果: ${pass} PASS / ${fail} FAIL ==`);
  // 不用 process.exit()：Node v24/Windows 下 exit() 与 libuv 句柄关闭竞态会崩出 0xC0000409 伪退出码；
  // exitCode + 自然退出，断言结果已全部落盘输出。
  process.exitCode = fail === 0 ? 0 : 1;
}

main().catch((e) => {
  console.error('T-P12 REGRESSION FAILED:', e.message);
  process.exitCode = 1;
});
