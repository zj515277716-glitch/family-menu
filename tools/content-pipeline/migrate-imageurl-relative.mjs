#!/usr/bin/env node
/**
 * migrate-imageurl-relative.mjs — T-P08/AC2：Dish.imageUrl 绝对前缀剥离 → 相对路径入库
 *
 * 背景（R-10）：库中 Dish.imageUrl 此前为绝对 URL（http://127.0.0.1:3000/images/dishes/...），
 * 环境地址入库导致换环境亮图失效。本迁移把前缀剥为相对路径 /images/dishes/<noteId>/<i><ext>，
 * 绝对 URL 由前端按 TARO_APP_API_BASE_URL 渲染时拼接（与 fetch2dish.mjs R-10 改造配套）。
 *
 * 行为：
 *   1. 预检：origin='FETCHED' 且 imageUrl 非空的目标集（预期 29）；分类 ABS/REL/OTHER；
 *      非 FETCHED 且有图行数必须为 0（防御：迁移不得触碰非 FETCHED 行）
 *   2. 改写：仅 origin='FETCHED' 且 imageUrl LIKE 'http://127.0.0.1:3000/%' 的行，
 *      剥前缀为相对路径；单事务包裹
 *   3. 对账：改写行数、残留 ABS=0、REL 总数、逐条相对路径 + 静态文件存在性核对
 *      （映射 apps/api/static/<rel>）
 *   4. 幂等：已是相对路径的行不动；重复执行第二遍改写 0 行
 *
 * 用法：
 *   node migrate-imageurl-relative.mjs            # dry-run：只预检+打印计划，不写库
 *   node migrate-imageurl-relative.mjs --apply    # 实际执行写库（事务）+ 对账
 *
 * 退出码：0 成功；1 预检失败/对账不平（防御停手）
 */

import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { Client } = require('d:/codex/family-menu/apps/api/node_modules/pg');

const APPLY = process.argv.includes('--apply');
const STATIC_ROOT = 'd:/codex/family-menu/apps/api/static';
const ABS_PREFIX = 'http://127.0.0.1:3000';
const EXPECTED_FETCHED_WITH_IMG = 29;

const log = (...m) => console.log(`[${new Date().toISOString()}]`, ...m);

function fileExistsForRel(rel) {
  // rel 形如 /images/dishes/<noteId>/0.webp → apps/api/static/images/dishes/<noteId>/0.webp
  const p = path.join(STATIC_ROOT, rel.replace(/^\//, ''));
  return fs.existsSync(p) ? 'OK' : 'MISSING';
}

async function main() {
  const c = new Client({ host: '127.0.0.1', port: 54329, database: 'family_menu', user: 'postgres', password: process.env.PGPASSWORD || 'postgres' });
  await c.connect();
  const q = async (sql, vals) => (await c.query(sql, vals)).rows;

  // ── 1. 预检 ──
  const targets = await q(
    `SELECT id, name, "imageUrl" FROM "Dish" WHERE origin = 'FETCHED' AND "imageUrl" IS NOT NULL ORDER BY id`,
  );
  const nonFetched = await q(
    `SELECT id, origin, "imageUrl" FROM "Dish" WHERE origin <> 'FETCHED' AND "imageUrl" IS NOT NULL`,
  );
  const nullImg = await q(`SELECT COUNT(*)::int AS n FROM "Dish" WHERE "imageUrl" IS NULL`);

  let absN = 0, relN = 0, otherN = 0;
  for (const d of targets) {
    if (d.imageUrl.startsWith(ABS_PREFIX + '/')) absN++;
    else if (d.imageUrl.startsWith('/')) relN++;
    else otherN++;
  }

  log(`PRECHECK 目标集(origin=FETCHED 且有图)=${targets.length}（预期 ${EXPECTED_FETCHED_WITH_IMG}）`);
  log(`PRECHECK 分类: ABS=${absN} REL=${relN} OTHER=${otherN}`);
  log(`PRECHECK 非 FETCHED 有图行=${nonFetched.length}（必须为 0）`);
  log(`PRECHECK imageUrl 为 NULL 行=${nullImg[0].n}（迁移不触碰）`);
  log(`MODE=${APPLY ? 'APPLY(写库)' : 'DRY-RUN(只读)'}`);

  let failed = false;
  if (targets.length !== EXPECTED_FETCHED_WITH_IMG) {
    log('PRECHECK_FAIL 目标集数量与预期不符，停手');
    failed = true;
  }
  if (nonFetched.length !== 0) {
    log('PRECHECK_FAIL 存在非 FETCHED 有图行，迁移不得触碰，停手');
    failed = true;
  }
  if (otherN !== 0) {
    log('PRECHECK_FAIL 存在既非 ABS 也非 / 开头的 OTHER 形态，人工确认后处理，停手');
    failed = true;
  }
  if (failed) {
    await c.end();
    process.exit(1);
  }

  // ── 2. 改写（--apply 才执行；单事务） ──
  let updated = 0;
  if (APPLY) {
    await c.query('BEGIN');
    try {
      const res = await c.query(
        `UPDATE "Dish" SET "imageUrl" = REPLACE("imageUrl", $1, '')
         WHERE origin = 'FETCHED' AND "imageUrl" LIKE $2 || '/%'`,
        [ABS_PREFIX, ABS_PREFIX],
      );
      updated = res.rowCount;
      await c.query('COMMIT');
      log(`UPDATE 完成：改写 ${updated} 行（事务已提交）`);
    } catch (e) {
      await c.query('ROLLBACK');
      log('UPDATE 失败已回滚：', e.message);
      await c.end();
      process.exit(1);
    }
  } else {
    updated = absN; // dry-run：预计改写数
    log(`DRY-RUN 预计改写 ${updated} 行`);
  }

  // ── 3. 对账 ──
  // dry-run：DB 未写，对「假设改写后」的内存值核对；apply：直接对 DB 实际值核对。
  const after = await q(
    `SELECT id, name, "imageUrl" FROM "Dish" WHERE origin = 'FETCHED' AND "imageUrl" IS NOT NULL ORDER BY id`,
  );
  const afterAbsRows = APPLY
    ? await q(`SELECT COUNT(*)::int AS n FROM "Dish" WHERE "imageUrl" LIKE $1 || '%'`, [ABS_PREFIX])
    : [{ n: 0 }]; // dry-run 未写库，ABS 断言不适用（写入后由 apply 重跑本脚本验证）
  let okFile = 0, missingFile = 0;
  for (const d of after) {
    // apply 模式 DB 值应为 rel；dry-run 模式对假设改写后的值核对（ABS → 内存剥前缀）
    const rel = APPLY
      ? d.imageUrl
      : (d.imageUrl.startsWith(ABS_PREFIX + '/') ? d.imageUrl.slice(ABS_PREFIX.length) : d.imageUrl);
    const st = fileExistsForRel(rel);
    if (st === 'OK') okFile++; else missingFile++;
    log(`POST ${d.id} ${rel} file=${st}${APPLY ? '' : ' (dry-run 假设值)'}`);
  }

  log(`RECONCILE 改写行数=${updated}（${APPLY ? '实际' : 'dry-run 预计'}）`);
  log(`RECONCILE 残留 ABS 前缀行=${afterAbsRows[0].n}${APPLY ? '（必须为 0）' : '（dry-run 不适用）'}`);
  log(`RECONCILE FETCHED 有图总数=${after.length}（预期 ${EXPECTED_FETCHED_WITH_IMG}）`);
  log(`RECONCILE 静态文件 OK=${okFile} MISSING=${missingFile}（MISSING 必须为 0）`);

  await c.end();

  if ((APPLY && afterAbsRows[0].n !== 0) || after.length !== EXPECTED_FETCHED_WITH_IMG || missingFile !== 0) {
    log('RECONCILE_FAIL 对账不平，停手');
    process.exit(1);
  }
  log(`MIGRATION_${APPLY ? 'APPLY' : 'DRYRUN'}_OK exit=0`);
}

main().catch((e) => { console.error('ERR', e.message); process.exit(1); });
