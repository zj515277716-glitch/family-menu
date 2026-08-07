#!/usr/bin/env node
// tools/content-pipeline/src/cli/import.ts
// import CLI 入口：审核通过的 JSON -> DB status=DRAFT
// 对齐 AC5/AC6/AC9：仅写入 DRAFT（双保险），强制 status=DRAFT + origin=LLM_DRAFT

import { Command } from 'commander';
import fs from 'node:fs';
import { createPrismaDraftWriter } from '../db.js';
import { importDraft, prepareDraftDish } from '../import.js';

const program = new Command();

program
  .name('import')
  .description('导入审核通过的草稿 JSON -> DB（强制 status=DRAFT，产物只落 DRAFT）')
  .argument('<file>', '草稿 JSON 文件路径（out/*.draft.json）')
  .option('--dry-run', '只校验不写入 DB')
  .helpOption('-h, --help', '显示帮助');

program.action(async (file: string, opts: { dryRun?: boolean }) => {
  if (!fs.existsSync(file)) {
    console.error(`文件不存在：${file}`);
    process.exit(1);
  }
  const content = fs.readFileSync(file, 'utf-8');

  if (opts.dryRun) {
    // 只校验（prepareDraftDish 会强制 DRAFT + 过 schema 校验）
    const input = prepareDraftDish(content);
    console.log('校验通过（dry-run，未写入 DB）：');
    console.log(`  菜品：${input.name}（${input.mealRole}）`);
    console.log(`  状态：status=${input.status} origin=${input.origin}（双保险：仅 DRAFT）`);
    console.log(`  食材：${input.ingredients.length} 个`);
    return;
  }

  const writer = await createPrismaDraftWriter();
  try {
    const result = await importDraft(content, writer);
    console.log(`导入成功：dishId=${result.dishId}（status=DRAFT, origin=LLM_DRAFT，食材 ${result.ingredientCount} 个）`);
  } finally {
    await writer.$disconnect();
  }
});

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error('import 执行失败：', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
