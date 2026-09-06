// T-P02 teardown：清理本次开发自测产生的测试 Plan/Event（fm-dev 执行，随任务卡交付）
// 策略：快照差集 + 白名单双校验，防止误删非本测试数据：
//   1) snapshot 模式：记录运行时刻全部 Plan id 到 .workflow-verify/tp02-planids-before.txt
//   2) clean 模式：仅删「不在快照内」且 status=PROPOSED 且 context.mustUse 与
//      本次测试场景白名单之一精确相等的 Plan（先删关联 Event，再删 Plan）
// pg 驱动经 apps/api 依赖解析（pnpm workspace 未提升到根，createRequire 方式）。
// 用法：node tests/tp02-cleanup-test-plans.cjs snapshot|clean
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

const ROOT = path.resolve(__dirname, '..');
const SNAPSHOT = path.join(ROOT, '.workflow-verify', 'tp02-planids-before.txt');

// pg 驱动经 apps/api 的依赖解析
const { Client } = createRequire(path.join(ROOT, 'apps', 'api', 'package.json'))('pg');

// 读根 .env 的 DATABASE_URL
const ENV = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
  if (m) ENV[m[1]] = m[2];
}
const DATABASE_URL = ENV.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('FATAL: .env 中未找到 DATABASE_URL');
  process.exit(1);
}

// 本次测试场景白名单（context.mustUse 必须与之之一全等，JSON.stringify 比较）
const ALLOWED_MUST_USE = [
  [], // tp01 AC2-a 空手回归
  ['西红柿'], // tp01 AC1-a 单食材成功
  ['西蓝花'], // tp01 AC1-b 单食材成功
  ['西红柿', '西蓝花'], // tp01 AC1-c 组合（无可行菜单时不建 Plan，防御保留）
  ['苦瓜'], // 空手场景（正常不建 Plan，防御保留）
];

async function main() {
  const mode = process.argv[2];
  if (mode !== 'snapshot' && mode !== 'clean') {
    console.error('用法: node tests/tp02-cleanup-test-plans.cjs snapshot|clean');
    process.exit(1);
  }
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  if (mode === 'snapshot') {
    const r = await client.query('SELECT id FROM "Plan"');
    fs.writeFileSync(SNAPSHOT, r.rows.map((x) => x.id).join('\n') + '\n', 'utf8');
    console.log(
      `SNAPSHOT_OK: 已记录 ${r.rows.length} 个既有 Plan id -> ${path.relative(ROOT, SNAPSHOT)}`,
    );
    await client.end();
    return;
  }

  // ── clean 模式 ──
  const before = await client.query(
    'SELECT (SELECT COUNT(*) FROM "Plan") AS plans, (SELECT COUNT(*) FROM "Event") AS events',
  );
  console.log(`BEFORE Plan=${before.rows[0].plans} Event=${before.rows[0].events}`);

  const prevIds = new Set(
    fs.existsSync(SNAPSHOT)
      ? fs
          .readFileSync(SNAPSHOT, 'utf8')
          .split(/\r?\n/)
          .filter(Boolean)
      : [],
  );
  if (prevIds.size === 0) {
    console.error('ABORT: 快照为空/缺失，先运行 snapshot 模式');
    await client.end();
    process.exitCode = 1;
    return;
  }

  // 候选 = PROPOSED 且不在快照内
  const cand = await client.query(
    `SELECT id, status, context FROM "Plan" WHERE status = 'PROPOSED'`,
  );
  const targets = [];
  const skipped = [];
  let notInSnapshot = 0;
  for (const row of cand.rows) {
    if (prevIds.has(row.id)) continue;
    notInSnapshot++;
    const mu = (row.context && row.context.mustUse) || [];
    if (ALLOWED_MUST_USE.some((w) => JSON.stringify(w) === JSON.stringify(mu))) {
      targets.push({ id: row.id, mustUse: mu });
    } else {
      skipped.push(`${row.id}: mustUse=${JSON.stringify(mu)} 不在白名单`);
    }
  }
  console.log(
    `CANDIDATES: 非快照 PROPOSED Plan=${notInSnapshot}，白名单命中=${targets.length}，跳过=${skipped.length}`,
  );
  skipped.forEach((s) => console.log('  SKIP ' + s));
  if (targets.length === 0) {
    console.log('NOTHING_TO_CLEAN: 无本次测试残留');
    await client.end();
    return;
  }

  // 逐条复核（删前校验 status=PROPOSED + mustUse 精确匹配，二次确认防竞态）
  const idList = targets.map((t) => t.id);
  const recheck = await client.query(
    `SELECT id, status, context FROM "Plan" WHERE id = ANY($1::text[])`,
    [idList],
  );
  const safe = recheck.rows.filter((row) => {
    const mu = (row.context && row.context.mustUse) || [];
    return (
      row.status === 'PROPOSED' &&
      ALLOWED_MUST_USE.some((w) => JSON.stringify(w) === JSON.stringify(mu))
    );
  });
  console.log(
    `SAFETY_OK: ${safe.length}/${idList.length} 通过 status=PROPOSED + mustUse 精确匹配复核`,
  );
  const safeIds = safe.map((r) => r.id);

  // 先删关联 Event，再删 Plan
  const delEvents = await client.query(
    `DELETE FROM "Event" WHERE "planId" = ANY($1::text[]) RETURNING id`,
    [safeIds],
  );
  const delPlans = await client.query(
    `DELETE FROM "Plan" WHERE id = ANY($1::text[]) RETURNING id`,
    [safeIds],
  );
  console.log(`DELETED Events=${delEvents.rowCount} Plans=${delPlans.rowCount}`);

  const after = await client.query(
    'SELECT (SELECT COUNT(*) FROM "Plan") AS plans, (SELECT COUNT(*) FROM "Event") AS events',
  );
  console.log(`AFTER Plan=${after.rows[0].plans} Event=${after.rows[0].events}`);
  const residual = await client.query(
    `SELECT COUNT(*)::int AS n FROM "Plan" WHERE id = ANY($1::text[])`,
    [safeIds],
  );
  console.log(`RESIDUAL_CHECK: 目标 planId 残留=${residual.rows[0].n}`);
  await client.end();
  process.exitCode =
    safe.length === idList.length &&
    residual.rows[0].n === 0 &&
    delPlans.rowCount === safeIds.length
      ? 0
      : 1;
}

main().catch((e) => {
  console.error('ERROR:', e.message);
  process.exitCode = 1;
});
