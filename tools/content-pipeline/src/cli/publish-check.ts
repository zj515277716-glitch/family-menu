#!/usr/bin/env node
// tools/content-pipeline/src/cli/publish-check.ts
// R-2 AC2/AC4：fm-publish-check 只读盘点 CLI。
// 扫描 DB 中 status IN (DRAFT, TESTED) 全部菜品，按 fm-import 同口径做过敏原缺口盘点，
// 输出人类可读报告（缺省）或结构化 JSON（--json）。严格只读：仅 SELECT，零写库语句。
// 退出码约定：0 = 无缺口；2 = 有缺口（存在 HARD/SOFT 未标注命中菜）；1 = 自身错误（DB 不可达/参数非法等）。
// R-2 AC3：报告附非标 category 计数（只报告不处置）。

import { Command } from 'commander';
import { pathToFileURL } from 'node:url';
import { createPrismaClient } from '../db.js';
import { loadAllergenRules } from '../allergen.js';
import {
  normalizeStatusFilter,
  loadDishesForCheck,
  buildPublishCheckReport,
  formatReport,
  type PublishCheckPrismaLike,
} from '../publish-check.js';

const program = new Command();

program
  .name('publish-check')
  .description(
    '存量过敏原盘点（只读）：扫 status IN (DRAFT, TESTED) 全部菜，按 fm-import 同口径报告缺口与非标 category；退出码 0=无缺口 / 2=有缺口 / 1=自身错误',
  )
  .option(
    '--status <value>',
    '盘点状态过滤：逗号分隔，大小写不敏感（如 draft,tested）；缺省全扫 DRAFT+TESTED',
  )
  .option('--json', '输出结构化 JSON 报告（与人类可读报告二选一）')
  .helpOption('-h, --help', '显示帮助');

program.action(async (opts: { status?: string; json?: boolean }) => {
  // 参数归一（非法值抛错 -> parseAsync catch -> exit 1）
  const statusFilter = normalizeStatusFilter(opts.status);

  // 只读连接（本工具全程零写库语句）
  const prisma = await createPrismaClient();
  try {
    // 规则源：DB ExclusionRule 全量动态读取（与 fm-import 同源同口径）
    const { rules, ruleTargetProfiles } = await loadAllergenRules(
      prisma as unknown as Parameters<typeof loadAllergenRules>[0],
    );
    const dishes = await loadDishesForCheck(
      prisma as unknown as PublishCheckPrismaLike,
      statusFilter,
    );
    const report = buildPublishCheckReport(
      dishes,
      rules,
      ruleTargetProfiles,
      statusFilter,
      new Date().toISOString(),
    );

    if (opts.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(formatReport(report));
    }

    if (report.gapDishCount > 0) {
      process.exitCode = 2;
    }
    // 无缺口：exitCode 缺省 0
  } finally {
    await prisma.$disconnect();
  }
});

// 可测性守卫（R-2-S1）：仅主模块直跑时执行 parseAsync（argv[1] 与本模块一致）；
// vitest import 本模块不触发顶层副作用，单测复用 program 实例自行驱动 parseAsync。
const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  program.parseAsync(process.argv).catch((err: unknown) => {
    console.error('publish-check 执行失败：', err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}

export { program };
