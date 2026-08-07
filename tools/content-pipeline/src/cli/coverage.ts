#!/usr/bin/env node
// tools/content-pipeline/src/cli/coverage.ts
// coverage CLI 入口：从 DB 读取菜品 -> 计算覆盖矩阵缺口 -> 输出
// 对齐 AC1/AC9：pnpm --filter @family-menu/content-pipeline coverage [--help] [--json]

import { Command } from 'commander';
import {
  computeCoverageGaps,
  gapToSlot,
  inferMainProtein,
  type CoverageDishView,
} from '../coverage.js';
import { createPrismaClient } from '../db.js';

const program = new Command();

program
  .name('coverage')
  .description('覆盖矩阵缺口：时长×主蛋白×器具×场景 -> 缺口清单')
  .option('--json', '以 JSON 格式输出缺口清单（默认表格）')
  .helpOption('-h, --help', '显示帮助');

program.action(async (opts: { json?: boolean }) => {
  const prisma = await createPrismaClient();
  try {
    // 从 DB 读取菜品 + 食材 + 所属菜单（场景）
    const dishes = (await (prisma.dish as {
      findMany(args: unknown): Promise<unknown[]>;
    }).findMany({
      include: {
        ingredients: { include: { ingredient: true } },
        menus: { include: { menu: true } },
      },
    })) as Array<{
      id: string;
      totalMinutes: number;
      equipment: string[];
      ingredients: Array<{ ingredient: { name: string } }>;
      menus: Array<{ menu: { scene: string } }>;
    }>;

    // 转换为覆盖矩阵视图
    const views: CoverageDishView[] = dishes.map((d) => ({
      id: d.id,
      totalMinutes: d.totalMinutes,
      equipment: d.equipment,
      mainProtein: inferMainProtein(d.ingredients.map((di) => di.ingredient.name)),
      scenes: d.menus.map((md) => md.menu.scene),
    }));

    const gaps = computeCoverageGaps(views);

    if (opts.json) {
      console.log(JSON.stringify(gaps, null, 2));
    } else {
      console.log(`覆盖矩阵缺口（共 ${gaps.length} 个）：`);
      console.log('场景 | 主蛋白 | 时长 | 器具');
      console.log('---|---|---|---');
      for (const gap of gaps) {
        console.log(`${gap.scene} | ${gap.mainProtein} | ${gap.timeBudget}min | ${gap.equipment}`);
      }
      console.log(`\n可用 slot（draft --slot）：`);
      for (const gap of gaps.slice(0, 10)) {
        console.log(`  ${gapToSlot(gap)}`);
      }
      if (gaps.length > 10) {
        console.log(`  ... 共 ${gaps.length} 个`);
      }
    }
  } finally {
    await prisma.$disconnect();
  }
});

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error('coverage 执行失败：', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
