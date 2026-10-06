#!/usr/bin/env tsx
// apps/api/scripts/publish-dish.ts
// T-A1 AC4（复盘 V2 §P0-1 / 5.1 A1）：菜品发布唯一入口。
//
// 铁令（复盘 V2 P0-2 时间线第 2 条教训：裸 SQL 批量改 status 曾让含花生菜进推荐池 8–9 小时）：
//   **菜品状态改为 PUBLISHED 只允许通过本命令完成；禁止裸 SQL / 一次性 UPDATE 改 status。**
//   本命令内部先跑 check:safety 同一核心（scripts/../src/services/safetyCheck.ts），
//   任一项不通过即拒绝发布（零写入）；发布后再全量复查，不通过自动回滚状态。
//
// 用法：
//   pnpm release:dish -- <dishId 或菜名>      # 发布（内部先跑 check:safety）
//   pnpm release:dish -- --db-url <url> <id>  # 指定库
// 退出码：0 = 已发布；1 = 拒绝发布（检查失败/菜品不存在/状态非法）；2 = 自身错误。
//
// 明令禁止（写这里也写 CURRENT.md）：psql/docker exec 手改 "Dish".status 到 PUBLISHED。
// 内容管线（fm-import）只落 DRAFT；TESTED->PUBLISHED 的人工升格一律走本命令。
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { filterSafeDishes } from '@family-menu/engine';
import {
  runSafetyCheckCore,
  formatSafetyCheckReport,
  resolveDishRef,
  validatePublishTransition,
  toExclusionViewsForCheck,
  type SafetyCheckDishRow,
  type SafetyCheckIngredientRow,
  type SafetyCheckRuleRow,
} from '../src/services/safetyCheck.js';
import { toDishView } from '../src/services/mappers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

function parseArgs(argv: string[]): { dbUrl?: string; dishRef?: string } {
  const args: { dbUrl?: string; dishRef?: string } = {};
  // pnpm run <script> -- <args> 会把裸 "--" 一并透传，容忍之
  const rest = argv.filter((a) => a !== '--');
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--db-url') {
      const v = rest[++i];
      if (!v) throw new Error('--db-url 缺少值（用法：--db-url postgresql://...）');
      args.dbUrl = v;
    } else if (rest[i] === '-h' || rest[i] === '--help') {
      console.log(
        'release:dish <dishId 或菜名> [--db-url <url>]\n' +
          '  菜品发布唯一入口：内部先跑 check:safety（悬空 targetId / PUBLISHED 违规即拒绝），\n' +
          '  发布后全量复查并自动回滚。退出码 0=已发布 / 1=拒绝 / 2=自身错误。\n' +
          '  禁止裸 SQL 改 status 到 PUBLISHED。',
      );
      process.exit(0);
    } else if (rest[i].startsWith('--')) {
      throw new Error(`未知参数：${rest[i]}（支持 --db-url / --help）`);
    } else if (!args.dishRef) {
      args.dishRef = rest[i];
    } else {
      throw new Error(`多余的位置参数：${rest[i]}（本命令只接受一个菜品引用）`);
    }
  }
  return args;
}

export async function publishDish(prisma: {
  exclusionRule: { findMany(args: unknown): Promise<SafetyCheckRuleRow[]> };
  ingredient: { findMany(args: unknown): Promise<SafetyCheckIngredientRow[]> };
  dish: {
    findMany(args: unknown): Promise<SafetyCheckDishRow[]>;
    findUnique(args: unknown): Promise<SafetyCheckDishRow | null>;
    update(args: unknown): Promise<unknown>;
  };
}, dishRef: string): Promise<number> {
  // 1. 内部先跑 check:safety（同一核心，纯读；库里已存在问题时拒绝发布，零写入）
  const rules = await prisma.exclusionRule.findMany({ orderBy: { id: 'asc' } });
  const ingredients = await prisma.ingredient.findMany({ orderBy: { id: 'asc' } });
  const dishes = await prisma.dish.findMany({
    include: { ingredients: { include: { ingredient: true } } },
    orderBy: { id: 'asc' },
  });
  const pre = runSafetyCheckCore({ rules, ingredients, dishes, checkedAt: new Date().toISOString() });
  if (!pre.passed) {
    console.error('拒绝发布：check:safety 未通过（库里存在悬空规则或 PUBLISHED 违规，先修复再发布）。');
    console.error(formatSafetyCheckReport(pre));
    return 1;
  }

  // 2. 解析菜品引用（id 精确优先 / 菜名唯一）
  const target = resolveDishRef(dishes, dishRef);
  if (!target) {
    console.error(`拒绝发布：未找到菜品「${dishRef}」（按 id 或唯一菜名精确匹配；歧义/不存在均不猜测）`);
    return 1;
  }

  // 3. 状态机守卫：仅 DRAFT/TESTED 可发布
  const transition = validatePublishTransition(target.status);
  if (!transition.ok) {
    console.error(`拒绝发布：${transition.reason}`);
    return 1;
  }

  // 4. 目标菜自身过 HARD（零写入预拦；与发布后复查双保险）
  const exclusionViews = toExclusionViewsForCheck(rules, ingredients);
  const dishView = toDishView({
    id: target.id,
    name: target.name,
    mealRole: target.mealRole,
    cuisine: target.cuisine,
    flavorTags: target.flavorTags,
    spicyLevel: target.spicyLevel,
    splitFlavor: target.splitFlavor,
    activeMinutes: target.activeMinutes,
    totalMinutes: target.totalMinutes,
    equipment: target.equipment,
    steps: target.steps,
    status: target.status,
    origin: target.origin,
    imageUrl: target.imageUrl,
    sourceUrl: target.sourceUrl,
    sourceSite: target.sourceSite,
    licenseNote: target.licenseNote,
    ingredients: target.ingredients.map((link) => ({
      qty: link.qty,
      unit: link.unit,
      optional: link.optional,
      ingredient: link.ingredient,
    })),
  });
  const { excluded } = filterSafeDishes([dishView], exclusionViews);
  if (excluded.length > 0) {
    console.error(`拒绝发布：菜品「${target.name}」自身违反 HARD 禁忌：${excluded[0].reason}`);
    return 1;
  }

  // 5. 发布（唯一写库点：status DRAFT/TESTED -> PUBLISHED）
  await prisma.dish.update({ where: { id: target.id }, data: { status: 'PUBLISHED' } });

  // 6. 发布后全量复查；不通过 -> 回滚到原状态并拒绝（防御纵深）
  const dishesAfter = await prisma.dish.findMany({
    include: { ingredients: { include: { ingredient: true } } },
    orderBy: { id: 'asc' },
  });
  const post = runSafetyCheckCore({
    rules,
    ingredients,
    dishes: dishesAfter,
    checkedAt: new Date().toISOString(),
  });
  if (!post.passed) {
    await prisma.dish.update({ where: { id: target.id }, data: { status: target.status } });
    console.error(`发布后复查不通过，已自动回滚「${target.name}」状态至 ${target.status}。`);
    console.error(formatSafetyCheckReport(post));
    return 1;
  }

  console.log(
    `已发布：菜品「${target.name}」（dishId=${target.id}）status ${target.status} -> PUBLISHED。\n` +
      `check:safety 复查通过（PUBLISHED ${post.publishedDishCount} 道 HARD 违规 0，无悬空规则）。`,
  );
  return 0;
}

async function main(): Promise<number> {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.dishRef) {
    console.error('缺少菜品引用（用法：pnpm release:dish -- <dishId 或菜名>）');
    return 2;
  }
  const dbUrl = opts.dbUrl ?? process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('release:dish 自身错误：未提供数据库连接（DATABASE_URL 环境变量或 --db-url）');
    return 2;
  }
  const pool = new Pool({ connectionString: dbUrl });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    return await publishDish(prisma as unknown as Parameters<typeof publishDish>[0], opts.dishRef);
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
    console.error('release:dish 自身错误：', err instanceof Error ? err.message : String(err));
    process.exit(2);
  });
