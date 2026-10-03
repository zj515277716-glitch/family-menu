#!/usr/bin/env tsx
// apps/api/scripts/check-safety.ts
// T-A1 AC3（复盘 V2 §P0-1 / 5.1 A1）：pnpm check:safety —— 过敏防线只读检查 CLI。
//
// 用法：
//   pnpm check:safety                       # 检查 DATABASE_URL 指向的库（根 .env / 环境变量）
//   pnpm check:safety -- --db-url <url>     # 检查指定库（验收/CI 用）
//   pnpm check:safety -- --json             # 结构化输出（CI 消费）
//
// 退出码：0 = 通过（允许有 WARN 告警）；1 = 不通过（悬空 targetId / PUBLISHED 违规）；
//         2 = 自身错误（DB 不可达、参数非法）。fail-closed：连不上库按 2 处理，绝不假绿。
//
// 红线（本项目规则 §8）：本脚本对目标库零写入（仅 SELECT）。L3 报批前禁止对生产库执行；
// 对生产库的只读检查命令与回滚草案由主控报产品负责人审批后执行（OPS-LOG.md 记一行）。
// 与 fm-publish-check 的关系：fm-publish-check 盘点「未发布面（DRAFT/TESTED）过敏原缺口」
// （报告型，exit 2）；本命令守「发布面」：规则引用完整性 + PUBLISHED 零违规（门禁型，exit 1）。
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import {
  runSafetyCheckCore,
  formatSafetyCheckReport,
  type SafetyCheckDishRow,
  type SafetyCheckIngredientRow,
  type SafetyCheckRuleRow,
} from '../src/services/safetyCheck.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// 与 seed.ts 同口径：显式加载根 .env（Prisma 7 不自动加载）；shell 环境变量优先
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

function parseArgs(argv: string[]): { dbUrl?: string; json: boolean } {
  const args = { dbUrl: undefined as string | undefined, json: false };
  // pnpm run <script> -- <args> 会把裸 "--" 一并透传，容忍之
  const rest = argv.filter((a) => a !== '--');
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--db-url') {
      const v = rest[++i];
      if (!v) throw new Error('--db-url 缺少值（用法：--db-url postgresql://...）');
      args.dbUrl = v;
    } else if (rest[i] === '--json') {
      args.json = true;
    } else if (rest[i] === '-h' || rest[i] === '--help') {
      console.log(
        'check:safety [--db-url <url>] [--json]\n' +
          '  过敏防线只读检查：① HARD+INGREDIENT targetId 真实存在；② PUBLISHED 菜 HARD 违规=0；\n' +
          '  ③ TAG 规则全库零命中告警。退出码 0=通过 / 1=不通过 / 2=自身错误。',
      );
      process.exit(0);
    } else {
      throw new Error(`未知参数：${rest[i]}（支持 --db-url / --json / --help）`);
    }
  }
  return args;
}

async function main(): Promise<number> {
  const opts = parseArgs(process.argv.slice(2));
  const dbUrl = opts.dbUrl ?? process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('check:safety 自身错误：未提供数据库连接（DATABASE_URL 环境变量或 --db-url）');
    return 2;
  }

  const pool = new Pool({ connectionString: dbUrl });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    // 只读加载（全部 SELECT）
    const ruleRows = await prisma.exclusionRule.findMany({ orderBy: { id: 'asc' } });
    const ingredientRows = await prisma.ingredient.findMany({ orderBy: { id: 'asc' } });
    const dishRows = await prisma.dish.findMany({
      include: { ingredients: { include: { ingredient: true } } },
      orderBy: { id: 'asc' },
    });

    const result = runSafetyCheckCore({
      rules: ruleRows as unknown as SafetyCheckRuleRow[],
      ingredients: ingredientRows as unknown as SafetyCheckIngredientRow[],
      dishes: dishRows as unknown as SafetyCheckDishRow[],
      checkedAt: new Date().toISOString(),
    });

    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(formatSafetyCheckReport(result));
    }
    return result.passed ? 0 : 1;
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err: unknown) => {
    // fail-closed：DB 不可达等自身错误一律 exit 2，绝不假绿
    console.error('check:safety 自身错误（DB 不可达或参数非法）：', err instanceof Error ? err.message : String(err));
    process.exit(2);
  });
