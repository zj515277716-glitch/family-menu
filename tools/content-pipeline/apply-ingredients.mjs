#!/usr/bin/env node
/**
 * apply-ingredients.mjs — T-C05：30 道 FETCHED 菜用料初稿入库（PG）
 *
 * 职责：
 *   1. 读知识库 out/xhs/ingredients-draft.json（30 道菜，dishId+pgName+commonName+uncertain+ingredients）
 *   2. 与 out/xhs/batch-manifest.json 交叉校验 dishId 集合一致（防知识库与采集清单漂移）
 *   3. 逐菜校验 PG：Dish 存在 且 origin='FETCHED' 且 status='DRAFT'（只动 FETCHED/DRAFT 菜，
 *      既有 19 道菜 LLM_DRAFT/MANUAL 的任何行不触碰，遇非 FETCHED 直接停手）
 *   4. 幂等写入（单事务）：
 *      - 先 DELETE 该菜全部旧 DishIngredient（重跑安全）
 *      - 对每条食材：先按 name 查 Ingredient；存在则仅引用（不改既有元信息），
 *        不存在才 INSERT 新 Ingredient（语义对齐 src/import.ts 的 upsertIngredient：按 name 唯一）
 *      - INSERT DishIngredient（qty/unit/optional；知识库 role 字段不入库——DishIngredient 表无 role 列）
 *   5. 输出 summary（每菜写入条数 / 新建 Ingredient 清单 / 总计）
 *
 * 用法：
 *   node tools/content-pipeline/apply-ingredients.mjs [--dry-run]
 *
 * 退出码：0 成功；1 校验或运行失败（任何错误均回滚事务，不留半写入状态）
 *
 * 依赖：pg（tools/content-pipeline/package.json 既有依赖，零新增）；无 LLM API 调用（DEC-006）。
 */

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { Pool } = require('pg');

const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url)); // tools/content-pipeline
const REPO_ROOT = path.resolve(TOOL_DIR, '..', '..');
const DRAFT_PATH = path.join(TOOL_DIR, 'out', 'xhs', 'ingredients-draft.json');
const MANIFEST_PATH = path.join(REPO_ROOT, 'tools', 'content-pipeline', 'out', 'xhs', 'batch-manifest.json');

const log = (...m) => console.log(`[${new Date().toISOString()}]`, ...m);

/**
 * 简化 cuid 生成器（形状对齐 Prisma @default(cuid()) 既有 id，如 cmtvk1w3v0000rwpgkoxz982k）。
 * 必要性：Prisma 的 @default(cuid()) 在 client 层生成、PG DDL 层无默认值，
 * 原生 SQL INSERT 必须显式提供 id（2026-09-10 首跑实测：缺 id 违反 NOT NULL）。
 */
let cuidCounter = 0;
function makeCuid() {
  cuidCounter = (cuidCounter + 1) % 32;
  const ts = Date.now().toString(36);
  let rand = '';
  for (let i = 0; i < 16; i++) rand += Math.floor(Math.random() * 36).toString(36);
  return ('c' + ts + cuidCounter.toString(36) + rand).slice(0, 25).padEnd(25, '0');
}

/** 从仓库根 .env 提取 DATABASE_URL（本机便携 PG，trust 认证） */
function loadDatabaseUrl() {
  const envPath = path.join(REPO_ROOT, '.env');
  if (!existsSync(envPath)) throw new Error(`.env 不存在：${envPath}`);
  const m = readFileSync(envPath, 'utf-8').match(/^DATABASE_URL=(.+)$/m);
  if (!m) throw new Error('.env 中未找到 DATABASE_URL');
  return m[1].trim();
}

/** 知识库形状校验（字段形状对齐 src/import.ts DishIngredientLinkInput + DraftIngredientSchema） */
function validateDraft(draft) {
  const errs = [];
  if (!draft || typeof draft !== 'object' || !Array.isArray(draft.dishes)) {
    throw new Error('知识库结构非法：缺少 dishes 数组');
  }
  if (draft.dishes.length !== 30) {
    errs.push(`dishes 数量=${draft.dishes.length}，应为 30`);
  }
  const seenIds = new Set();
  for (const dish of draft.dishes) {
    const tag = dish.commonName || dish.dishId;
    if (!dish.dishId || typeof dish.dishId !== 'string') errs.push(`${tag}: dishId 缺失`);
    else if (seenIds.has(dish.dishId)) errs.push(`${tag}: dishId 重复 ${dish.dishId}`);
    else seenIds.add(dish.dishId);
    if (typeof dish.uncertain !== 'boolean') errs.push(`${tag}: uncertain 非布尔`);
    if (!Array.isArray(dish.ingredients) || dish.ingredients.length === 0) {
      errs.push(`${tag}: ingredients 为空或非数组`);
      continue;
    }
    const seenNames = new Set();
    for (const ing of dish.ingredients) {
      const itag = `${tag}/${ing.name || '?'}`;
      if (typeof ing.name !== 'string' || !ing.name.trim()) errs.push(`${itag}: name 非法`);
      else {
        if (seenNames.has(ing.name)) errs.push(`${itag}: 菜内食材名重复`);
        seenNames.add(ing.name);
      }
      if (!Array.isArray(ing.aliases)) errs.push(`${itag}: aliases 非数组`);
      if (typeof ing.category !== 'string' || !ing.category.trim()) errs.push(`${itag}: category 非法`);
      if (typeof ing.defaultUnit !== 'string' || !ing.defaultUnit.trim()) errs.push(`${itag}: defaultUnit 非法`);
      if (typeof ing.qty !== 'number' || !(ing.qty > 0)) errs.push(`${itag}: qty 非法`);
      if (typeof ing.unit !== 'string' || !ing.unit.trim()) errs.push(`${itag}: unit 非法`);
      if (ing.role !== '主料' && ing.role !== '调料') errs.push(`${itag}: role 值域外（仅 主料|调料）`);
      if (typeof ing.optional !== 'boolean') errs.push(`${itag}: optional 非布尔`);
    }
  }
  if (errs.length > 0) {
    throw new Error('知识库校验失败（共 ' + errs.length + ' 处）：\n' + errs.map((e) => '  - ' + e).join('\n'));
  }
}

/** 与采集 manifest 交叉校验：知识库 dishId 集合 = manifest 中 imported=true 的 dishId 集合 */
function crossCheckManifest(draft) {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));
  const manifestIds = manifest.items
    .filter((it) => it.imported && it.dishId)
    .map((it) => it.dishId);
  const draftIds = draft.dishes.map((d) => d.dishId);
  const onlyInManifest = manifestIds.filter((id) => !draftIds.includes(id));
  const onlyInDraft = draftIds.filter((id) => !manifestIds.includes(id));
  if (onlyInManifest.length > 0 || onlyInDraft.length > 0) {
    throw new Error(
      `知识库与 batch-manifest.json 的 dishId 集合不一致：仅 manifest 有 [${onlyInManifest}]，仅知识库有 [${onlyInDraft}]`,
    );
  }
  if (manifestIds.length !== 30) {
    throw new Error(`manifest 中 imported=true 的 dishId 数=${manifestIds.length}，应为 30`);
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  log(`T-C05 用料入库启动${dryRun ? '（dry-run：只校验不写入）' : ''}`);

  // 1. 读知识库 + 校验
  const draft = JSON.parse(readFileSync(DRAFT_PATH, 'utf-8'));
  validateDraft(draft);
  crossCheckManifest(draft);
  const totalItems = draft.dishes.reduce((s, d) => s + d.ingredients.length, 0);
  log(`知识库校验通过：${draft.dishes.length} 道菜 / ${totalItems} 条用料 / uncertain=${draft.dishes.filter((d) => d.uncertain).length} 道`);

  // 2. 连库
  const pool = new Pool({ connectionString: loadDatabaseUrl() });
  const client = await pool.connect();
  const createdIngredients = [];
  const summary = { dishes: [], skipped: [], totalWritten: 0, newIngredients: createdIngredients, dryRun };

  try {
    await client.query('BEGIN');
    if (!dryRun) log('事务已开启（BEGIN）');

    for (const dish of draft.dishes) {
      const tag = `${dish.commonName}(${dish.dishId})`;

      // 3. 校验 Dish：必须存在 + origin=FETCHED + status=DRAFT（只动 FETCHED/DRAFT 菜）
      const dishRow = await client.query(
        `SELECT id, name, origin, status FROM "Dish" WHERE id = $1`,
        [dish.dishId],
      );
      if (dishRow.rowCount === 0) {
        throw new Error(`${tag}: PG 中不存在该 dishId（停手，不猜测）`);
      }
      const d = dishRow.rows[0];
      if (d.origin !== 'FETCHED') {
        throw new Error(`${tag}: origin=${d.origin}，仅允许 origin='FETCHED'（既有既有菜不可触碰，停手）`);
      }
      if (d.status !== 'DRAFT') {
        throw new Error(`${tag}: status=${d.status}，仅允许 status='DRAFT'（停手）`);
      }
      if (d.name !== dish.pgName) {
        log(`警告：${tag} pgName 与 DB name 不一致（继续，匹配键为 dishId）`);
        log(`  pgName=${JSON.stringify(dish.pgName)}`);
        log(`  dbName=${JSON.stringify(d.name)}`);
      }

      if (dryRun) {
        summary.dishes.push({ dishId: dish.dishId, name: dish.commonName, count: dish.ingredients.length });
        summary.totalWritten += dish.ingredients.length;
        continue;
      }

      // 4a. 幂等：先清该菜旧 DishIngredient
      const del = await client.query(`DELETE FROM "DishIngredient" WHERE "dishId" = $1`, [dish.dishId]);
      if (del.rowCount > 0) log(`${tag}: 已清除旧 DishIngredient ${del.rowCount} 条（幂等重写）`);

      // 4b. 逐条食材：先查名，缺则建；再写关联
      let written = 0;
      for (const ing of dish.ingredients) {
        const name = ing.name.trim();
        const found = await client.query(`SELECT id FROM "Ingredient" WHERE name = $1`, [name]);
        let ingredientId;
        if (found.rowCount > 0) {
          ingredientId = found.rows[0].id; // 已存在：仅引用，不改既有元信息
        } else {
          const ins = await client.query(
            `INSERT INTO "Ingredient" (id, name, aliases, category, "defaultUnit")
             VALUES ($1, $2, $3, $4, $5) RETURNING id`,
            [makeCuid(), name, ing.aliases ?? [], ing.category.trim(), ing.defaultUnit.trim()],
          );
          ingredientId = ins.rows[0].id;
          createdIngredients.push(`${name}(${ing.category}/${ing.defaultUnit})`);
          log(`${tag}: 新建 Ingredient「${name}」`);
        }
        await client.query(
          `INSERT INTO "DishIngredient" (id, "dishId", "ingredientId", qty, unit, optional)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [makeCuid(), dish.dishId, ingredientId, ing.qty, ing.unit.trim(), ing.optional],
        );
        written += 1;
      }
      summary.dishes.push({ dishId: dish.dishId, name: dish.commonName, count: written, uncertain: dish.uncertain });
      summary.totalWritten += written;
      log(`${tag}: 写入 ${written} 条 DishIngredient${dish.uncertain ? '（uncertain）' : ''}`);
    }

    if (dryRun) {
      await client.query('ROLLBACK');
      log(`dry-run 完成：将写入 ${summary.totalWritten} 条（未动库）`);
    } else {
      await client.query('COMMIT');
      log(`事务已提交：共写入 ${summary.totalWritten} 条 DishIngredient，新建 Ingredient ${createdIngredients.length} 个`);
    }
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* 忽略回滚错误 */ }
    console.error('执行失败，事务已回滚：', err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }

  console.log('=== SUMMARY ===');
  console.log(JSON.stringify(summary, null, 2));
}

main();
