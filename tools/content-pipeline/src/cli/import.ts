#!/usr/bin/env node
// tools/content-pipeline/src/cli/import.ts
// import CLI 入口：审核通过的 JSON -> DB status=DRAFT
// 对齐 AC5/AC6/AC9：仅写入 DRAFT（双保险）；T-C03 起支持显式授权 --origin FETCHED（R-4 处置），默认仍强制 origin=LLM_DRAFT

import { Command } from 'commander';
import fs from 'node:fs';
import { createPrismaDraftWriter } from '../db.js';
import { importDraft, prepareDraftDish, normalizeOriginOption } from '../import.js';

const program = new Command();

program
  .name('import')
  .description('导入审核通过的草稿 JSON -> DB（强制 status=DRAFT；origin 默认 LLM_DRAFT，显式授权 --origin FETCHED 供外部抓取入库）')
  .argument('<file>', '草稿 JSON 文件路径（out/*.draft.json 或 fetch2dish 产物 *.dish.json）')
  .option('--dry-run', '只校验不写入 DB')
  .option(
    '--origin <value>',
    '显式授权入库来源：仅允许 FETCHED（落 origin=FETCHED + status=DRAFT）；缺省强制 LLM_DRAFT（双保险不削弱）',
  )
  .helpOption('-h, --help', '显示帮助');

program.action(async (file: string, opts: { dryRun?: boolean; origin?: string }) => {
  if (!fs.existsSync(file)) {
    console.error(`文件不存在：${file}`);
    process.exit(1);
  }
  const content = fs.readFileSync(file, 'utf-8');

  // T-C03（R-4 处置）：显式授权归一——undefined→LLM_DRAFT；'FETCHED'→FETCHED；其余抛错拒绝。
  // 默认路径（不传 --origin）行为与 T-C03 之前完全一致。
  let origin: 'LLM_DRAFT' | 'FETCHED';
  try {
    origin = normalizeOriginOption(opts.origin);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  // 库接口口径：仅显式授权时传 { origin: 'FETCHED' }；默认路径不传 options（缺省=强制 LLM_DRAFT，
  // 与 T-C03 之前完全一致——normalizeOriginOption 拒绝显式 'LLM_DRAFT'，授权口径单一）。
  const importOptions = origin === 'FETCHED' ? ({ origin: 'FETCHED' } as const) : undefined;

  if (opts.dryRun) {
    // 只校验（prepareDraftDish 会强制 DRAFT + 过 schema 校验）
    const input = prepareDraftDish(content, importOptions);
    console.log('校验通过（dry-run，未写入 DB）：');
    console.log(`  菜品：${input.name}（${input.mealRole}）`);
    console.log(`  状态：status=${input.status} origin=${input.origin}（双保险：仅 DRAFT；${origin === 'FETCHED' ? '显式授权 FETCHED' : '默认强制 LLM_DRAFT'}）`);
    console.log(`  食材：${input.ingredients.length} 个`);
    return;
  }

  const writer = await createPrismaDraftWriter();
  try {
    const result = await importDraft(content, writer, importOptions);
    console.log(
      `导入成功：dishId=${result.dishId}（status=DRAFT, origin=${origin}${origin === 'FETCHED' ? '，显式授权 --origin FETCHED' : ''}，食材 ${result.ingredientCount} 个）`,
    );
  } finally {
    await writer.$disconnect();
  }
});

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error('import 执行失败：', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
