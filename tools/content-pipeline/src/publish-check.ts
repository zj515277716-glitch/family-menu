// tools/content-pipeline/src/publish-check.ts
// R-2 AC2/AC4：fm-publish-check 只读盘点 CLI 核心逻辑。
// 扫 DB 中 status IN (DRAFT, TESTED) 的全部菜品，用与 fm-import 完全相同的过敏原检测口径
// （allergen.ts：INGREDIENT 精确等值 + TAG 子串宽口径 + flavorTags 已标注放行），
// 产出「即将进入试做/发布面的过敏原缺口」盘点报告；严格只读（仅 SELECT，零写库语句）。
// R-2 AC3：报告附非标 category 计数（消费 shared CATEGORIES，只报告不处置）。
// 运行时零 LLM API（DEC-006）；产物状态不因本工具发生任何变化。

import { CATEGORIES } from '@family-menu/shared';
import {
  checkDishAllergen,
  describeMatched,
  type AllergenFinding,
  type AllergenIngredientProfile,
  type AllergenRuleView,
} from './allergen.js';

// ───── 状态过滤归一（纯函数，可单测）─────

/** 允许盘点的状态白名单（只盘 DRAFT/TESTED 两个「未发布面」状态） */
const CHECKABLE_STATUSES = ['DRAFT', 'TESTED'] as const;

/**
 * --status 参数归一：大小写不敏感、逗号分隔；缺省 = 全扫（DRAFT+TESTED）。
 * 非法值（不在白名单内）抛错（CLI 侧转 exit 1）。
 */
export function normalizeStatusFilter(value?: string): string[] {
  if (value === undefined || value.trim() === '') return [...CHECKABLE_STATUSES];
  const parts = value
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter((s) => s.length > 0);
  if (parts.length === 0) return [...CHECKABLE_STATUSES];
  const invalid = parts.filter((p) => !(CHECKABLE_STATUSES as readonly string[]).includes(p));
  if (invalid.length > 0) {
    throw new Error(
      `--status 非法值：${invalid.join(',')}（仅允许 DRAFT/TESTED，大小写不敏感，逗号分隔）`,
    );
  }
  // 去重保序
  return [...new Set(parts)];
}

// ───── 盘点数据形态 ─────

/** 待检测食材（DB 事实：name/aliases/category + id；合成 allergen 检测画像） */
export interface PublishCheckIngredient {
  name: string;
  category: string;
  profile: AllergenIngredientProfile;
}

/** 待检测菜品行（DB 事实） */
export interface PublishCheckDish {
  id: string;
  name: string;
  origin: string;
  status: string;
  flavorTags: string[];
  ingredients: PublishCheckIngredient[];
}

/** 单道菜的缺口记录 */
export interface PublishCheckGap {
  dishId: string;
  dishName: string;
  origin: string;
  status: string;
  findings: AllergenFinding[];
}

/** 盘点报告（结构化；--json 原样输出，人类可读由 formatReport 渲染） */
export interface PublishCheckReport {
  scannedAt: string;
  statusFilter: string[];
  ruleCounts: { total: number; hard: number; soft: number };
  scannedCount: number;
  gapDishCount: number;
  gaps: PublishCheckGap[];
  /** 非标 category 食材引用（按 name+category 去重；AC3 只报告不处置） */
  nonStandardCategory: {
    count: number;
    items: { name: string; category: string }[];
  };
}

// ───── 核心纯函数：扫描缺口 + 收集非标 category（可单测）─────

/**
 * 对菜品列表按统一口径扫描过敏原缺口（与 fm-import 同口径：checkDishAllergen）。
 * 有 finding 的菜进 gaps（HARD/SOFT 均算缺口——盘点面不做豁免裁量，报告给人工）。
 */
export function scanDishesForGaps(
  dishes: PublishCheckDish[],
  rules: AllergenRuleView[],
  ruleTargetProfiles: Map<string, { name: string; aliases: string[] } | null>,
): PublishCheckGap[] {
  const gaps: PublishCheckGap[] = [];
  for (const dish of dishes) {
    const findings = checkDishAllergen(
      { name: dish.name, flavorTags: dish.flavorTags },
      dish.ingredients.map((i) => i.profile),
      rules,
      ruleTargetProfiles,
    );
    if (findings.length > 0) {
      gaps.push({
        dishId: dish.id,
        dishName: dish.name,
        origin: dish.origin,
        status: dish.status,
        findings,
      });
    }
  }
  return gaps;
}

/**
 * 收集非标 category 食材引用（AC3）：category 不在 shared CATEGORIES 六类。
 * 按 name+category 去重（同名食材被多菜引用只计一次）。
 */
export function collectNonStandardCategories(
  dishes: PublishCheckDish[],
): { count: number; items: { name: string; category: string }[] } {
  const seen = new Map<string, { name: string; category: string }>();
  for (const dish of dishes) {
    for (const ing of dish.ingredients) {
      if (!(CATEGORIES as readonly string[]).includes(ing.category)) {
        const key = `${ing.name}\u0000${ing.category}`;
        if (!seen.has(key)) {
          seen.set(key, { name: ing.name, category: ing.category });
        }
      }
    }
  }
  return { count: seen.size, items: [...seen.values()] };
}

/** 组装报告（纯函数，可单测） */
export function buildPublishCheckReport(
  dishes: PublishCheckDish[],
  rules: AllergenRuleView[],
  ruleTargetProfiles: Map<string, { name: string; aliases: string[] } | null>,
  statusFilter: string[],
  scannedAt: string,
): PublishCheckReport {
  const gaps = scanDishesForGaps(dishes, rules, ruleTargetProfiles);
  return {
    scannedAt,
    statusFilter,
    ruleCounts: {
      total: rules.length,
      hard: rules.filter((r) => r.severity === 'HARD').length,
      soft: rules.filter((r) => r.severity === 'SOFT').length,
    },
    scannedCount: dishes.length,
    gapDishCount: gaps.length,
    gaps,
    nonStandardCategory: collectNonStandardCategories(dishes),
  };
}

// ───── 人类可读渲染（纯函数，可单测）─────

/** 渲染人类可读报告全文（AC4 附录原文即此输出） */
export function formatReport(report: PublishCheckReport): string {
  const lines: string[] = [];
  lines.push('=== fm-publish-check 存量过敏原盘点报告 ===');
  lines.push(`扫描时间：${report.scannedAt}（本地库只读扫描，零写入）`);
  lines.push(
    `扫描范围：status IN (${report.statusFilter.map((s) => `'${s}'`).join(', ')})，共 ${report.scannedCount} 道菜`,
  );
  lines.push(
    `规则源：DB ExclusionRule 全量 ${report.ruleCounts.total} 行（HARD ${report.ruleCounts.hard} / SOFT ${report.ruleCounts.soft}）`,
  );
  lines.push('');
  lines.push(`过敏原缺口菜品：${report.gapDishCount} 道`);
  report.gaps.forEach((gap, idx) => {
    lines.push(`  [${idx + 1}] ${gap.dishName}（status=${gap.status}, origin=${gap.origin}, dishId=${gap.dishId}）`);
    for (const f of gap.findings) {
      const target =
        f.scope === 'TAG' ? `tag=${f.targetTag ?? '-'}` : `ingredientId=${f.targetId ?? '-'}`;
      lines.push(
        `      - [${f.severity}] 规则 ${f.ruleId}（${f.scope} scope，${target}）命中 ${describeMatched(f)}` +
          (f.missingTag ? `，flavorTags 缺标注「${f.missingTag}」` : '') +
          (f.ruleNote ? `，备注：${f.ruleNote}` : ''),
      );
    }
  });
  lines.push('');
  lines.push(`非标 category 食材引用（不在六类 [${CATEGORIES.join('/')}]，去重后）：${report.nonStandardCategory.count} 个`);
  for (const item of report.nonStandardCategory.items) {
    lines.push(`  - ${item.name}=${item.category}`);
  }
  lines.push('');
  lines.push(
    report.gapDishCount > 0
      ? `结论：存在 ${report.gapDishCount} 道缺口菜品（exit 2；本工具只报告不处置）`
      : '结论：无缺口（exit 0）',
  );
  return lines.join('\n');
}

// ───── DB 只读加载 ─────

/** PrismaClient 最小接口（只读；避免编译期依赖 generated 目录，对齐 db.ts/allergen.ts 口径） */
export interface PublishCheckPrismaLike {
  dish: {
    findMany(args: unknown): Promise<
      {
        id: string;
        name: string;
        origin: string;
        status: string;
        flavorTags: string[];
        ingredients: {
          ingredient: { id: string; name: string; aliases: string[]; category: string };
        }[];
      }[]
    >;
  };
}

/**
 * 拉取待盘点菜品（只读 SELECT）：status IN (filter) + 嵌套食材行（含 optional，
 * 口径与 engine/fm-import 一致——optional 行同样参与检测，T-C07-FIX 已证实）。
 */
export async function loadDishesForCheck(
  prisma: PublishCheckPrismaLike,
  statuses: string[],
): Promise<PublishCheckDish[]> {
  const rows = await prisma.dish.findMany({
    where: { status: { in: statuses } },
    include: { ingredients: { include: { ingredient: true } } },
    orderBy: { name: 'asc' },
  });
  return rows.map((d) => ({
    id: d.id,
    name: d.name,
    origin: d.origin,
    status: d.status,
    flavorTags: d.flavorTags,
    ingredients: d.ingredients.map((link) => ({
      name: link.ingredient.name,
      category: link.ingredient.category,
      profile: {
        name: link.ingredient.name,
        aliases: link.ingredient.aliases,
        dbId: link.ingredient.id,
        dbAliases: link.ingredient.aliases,
        dbCategory: link.ingredient.category,
      },
    })),
  }));
}
