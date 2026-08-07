#!/usr/bin/env node
// tools/content-pipeline/src/cli/draft.ts
// draft CLI 入口：--slot=weekday_fast,chicken,30min 调豆包批量起草 -> out/*.draft.json
// 对齐 AC2/AC3/AC7/AC9：豆包API用openai SDK，JSON过DishSchema校验，失败重试3次

import { Command } from 'commander';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createArkClient } from '../ark.js';
import { draftFromSlotString } from '../draft.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const program = new Command();

program
  .name('draft')
  .description('按 slot 调豆包起草菜品 -> out/*.draft.json（产物只落 DRAFT）')
  .requiredOption('--slot <slot>', '槽位：scene,mainProtein,timeBudget（如 weekday_fast,chicken,30min）')
  .option('--out <dir>', '输出目录', path.resolve(__dirname, '../../out'))
  .helpOption('-h, --help', '显示帮助');

program.action(async (opts: { slot: string; out: string }) => {
  console.log(`起草中：slot=${opts.slot} -> ${opts.out}`);
  const arkClient = createArkClient();
  // loadPrompt 用默认路径（src/prompts/menu-draft.md），通过 draftFromSlotString 内部加载
  // 此处显式加载以支持自定义路径
  const fs = await import('node:fs');
  const promptPath = path.resolve(__dirname, '../prompts/menu-draft.md');
  const prompt = fs.readFileSync(promptPath, 'utf-8');

  const { dish, filePath, attempts } = await draftFromSlotString(
    opts.slot,
    arkClient,
    prompt,
    opts.out,
  );
  console.log(`起草成功（${attempts}/${3} 次尝试）：${filePath}`);
  console.log(`菜品：${dish.name}（${dish.mealRole}，totalMinutes=${dish.totalMinutes}，食材 ${dish.ingredients.length} 个）`);
  console.log(`状态：status=${dish.status} origin=${dish.origin}（双保险：仅 DRAFT）`);
});

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error('draft 执行失败：', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
