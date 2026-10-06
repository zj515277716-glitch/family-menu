// apps/api/src/services/safetyCheck.ts
// T-A1 AC3（复盘 V2 §P0-1 / 5.1 A1）：过敏防线只读检查核心逻辑（纯函数，零 IO）。
// 三条检查：
//   ① DANGLING_TARGET：HARD 且 scope=INGREDIENT 的规则，targetId 必须在食材表中真实存在；
//   ② PUBLISHED_VIOLATION：全库 PUBLISHED 菜逐条过全部 HARD 规则（复用 engine filterSafeDishes，
//      含 T-A1 起 TAG 食材名/别名字串宽匹配），违规必须为 0；
//   ③ TAG_ZERO_HIT：TAG 规则对全库（不限 status）零命中 -> WARN 不阻断（死规则告警，不静默）。
// 设计：输入全部是 DB 行投影（无 prisma 依赖，单测可无库运行）；CLI（scripts/check-safety.ts）
// 负责只读加载与退出码映射。severity 语义：FAIL=检查不通过（exit 1）；WARN=仅告警（exit 0）。
import { filterSafeDishes, type ExclusionView, type DishView } from '@family-menu/engine';
import { toExclusionView, toDishView } from './mappers.js';

// ───── 输入行形态（prisma 查询投影，禁止把 PrismaClient 传进本模块） ─────

export interface SafetyCheckIngredientRow {
  id: string;
  name: string;
  aliases: string[];
  category: string;
  defaultUnit: string;
}

export interface SafetyCheckDishRow {
  id: string;
  name: string;
  mealRole: string;
  cuisine: string | null;
  flavorTags: string[];
  spicyLevel: number;
  splitFlavor: boolean;
  activeMinutes: number;
  totalMinutes: number;
  equipment: string[];
  steps: unknown;
  status: string;
  origin: string;
  imageUrl: string | null;
  sourceUrl: string | null;
  sourceSite: string | null;
  licenseNote: string | null;
  ingredients: Array<{ qty: number; unit: string; optional: boolean; ingredient: SafetyCheckIngredientRow }>;
}

export interface SafetyCheckRuleRow {
  id: string;
  scope: string;
  targetId: string | null;
  targetTag: string | null;
  severity: string;
  note: string | null;
}

export interface SafetyCheckInput {
  rules: SafetyCheckRuleRow[];
  ingredients: SafetyCheckIngredientRow[];
  dishes: SafetyCheckDishRow[];
  checkedAt: string;
}

// ───── 输出形态 ─────

export type SafetyFindingKind = 'DANGLING_TARGET' | 'PUBLISHED_VIOLATION' | 'TAG_ZERO_HIT';

export interface SafetyCheckFinding {
  kind: SafetyFindingKind;
  /** FAIL = 检查不通过（exit 1）；WARN = 仅告警（不改变退出码） */
  severity: 'FAIL' | 'WARN';
  ruleId: string;
  message: string;
  dishId?: string;
  dishName?: string;
}

export interface SafetyCheckResult {
  checkedAt: string;
  ruleCounts: { total: number; hard: number; soft: number };
  scannedCount: number;
  publishedDishCount: number;
  findings: SafetyCheckFinding[];
  /** 无 FAIL finding 即通过（WARN 不阻断；fm-publish-check 的 exit 2 缺口盘点与本命令无关） */
  passed: boolean;
}

// ───── 行 -> View 投影（复用 mappers，口径与 API 推荐链路完全一致） ─────

function toExclusionViews(
  rules: SafetyCheckRuleRow[],
  ingredientMap: Map<string, SafetyCheckIngredientRow>,
): ExclusionView[] {
  return rules.map((r) =>
    toExclusionView(
      {
        id: r.id,
        scope: r.scope,
        targetId: r.targetId,
        targetTag: r.targetTag,
        severity: r.severity,
        note: r.note,
      },
      r.targetId ? (ingredientMap.get(r.targetId) ?? null) : null,
    ),
  );
}

/** 规则行 -> ExclusionView 投影（发布入口 publish-dish 复用；口径与 API 推荐链路一致） */
export function toExclusionViewsForCheck(
  rules: SafetyCheckRuleRow[],
  ingredients: SafetyCheckIngredientRow[],
): ExclusionView[] {
  const ingredientMap = new Map(ingredients.map((i) => [i.id, i]));
  return toExclusionViews(rules, ingredientMap);
}

function toDishViews(dishes: SafetyCheckDishRow[]): DishView[] {
  return dishes.map((d) =>
    toDishView({
      id: d.id,
      name: d.name,
      mealRole: d.mealRole,
      cuisine: d.cuisine,
      flavorTags: d.flavorTags,
      spicyLevel: d.spicyLevel,
      splitFlavor: d.splitFlavor,
      activeMinutes: d.activeMinutes,
      totalMinutes: d.totalMinutes,
      equipment: d.equipment,
      steps: d.steps,
      status: d.status,
      origin: d.origin,
      imageUrl: d.imageUrl,
      sourceUrl: d.sourceUrl,
      sourceSite: d.sourceSite,
      licenseNote: d.licenseNote,
      ingredients: d.ingredients.map((link) => ({
        qty: link.qty,
        unit: link.unit,
        optional: link.optional,
        ingredient: link.ingredient,
      })),
    }),
  );
}

// ───── TAG 命中面（口径同 engine checkTagScope：flavorTags / category / 食材名别名字串） ─────

function dishHitsTag(dish: DishView, tag: string): boolean {
  if (dish.flavorTags.includes(tag)) return true;
  for (const ing of dish.ingredients) {
    if (ing.category === tag) return true;
    if (ing.ingredientName.includes(tag)) return true;
    if (ing.aliases.some((a) => a.includes(tag))) return true;
  }
  return false;
}

// ───── 核心：组装检查结果（纯函数） ─────

export function runSafetyCheckCore(input: SafetyCheckInput): SafetyCheckResult {
  const { rules, ingredients, dishes, checkedAt } = input;
  const ingredientMap = new Map(ingredients.map((i) => [i.id, i]));
  const exclusionViews = toExclusionViewsForCheck(rules, ingredients);
  const dishViews = toDishViews(dishes);

  const findings: SafetyCheckFinding[] = [];

  // ① HARD + INGREDIENT 规则 targetId 悬空检查
  for (const rule of rules) {
    if (rule.severity !== 'HARD') continue;
    if (rule.scope !== 'INGREDIENT') continue;
    if (!rule.targetId || !ingredientMap.has(rule.targetId)) {
      findings.push({
        kind: 'DANGLING_TARGET',
        severity: 'FAIL',
        ruleId: rule.id,
        message:
          `HARD 食材禁忌规则 targetId 悬空：规则 ${rule.id} 指向 ${rule.targetId ?? '(空)'}，` +
          `食材表不存在该行（换库/未 seed 悬空即过敏防线失效，复盘 V2 §P0-1）`,
      });
    }
  }

  // ② PUBLISHED 菜过全部 HARD 规则（engine filterSafeDishes，宽匹配口径一致）
  const publishedViews = dishViews.filter((d) => d.status === 'PUBLISHED');
  const { excluded } = filterSafeDishes(publishedViews, exclusionViews);
  for (const { dish, reason } of excluded) {
    findings.push({
      kind: 'PUBLISHED_VIOLATION',
      severity: 'FAIL',
      ruleId: reason.split('#').pop() ?? '',
      dishId: dish.id,
      dishName: dish.name,
      message: `PUBLISHED 菜品「${dish.name}」（dishId=${dish.id}）违反 HARD 禁忌：${reason}`,
    });
  }

  // ③ TAG 规则全库零命中告警（死规则不静默；SOFT 的「内脏」同类问题一并暴露）
  for (const rule of rules) {
    if (rule.scope !== 'TAG' || !rule.targetTag) continue;
    const hit = dishViews.some((d) => dishHitsTag(d, rule.targetTag as string));
    if (!hit) {
      findings.push({
        kind: 'TAG_ZERO_HIT',
        severity: 'WARN',
        ruleId: rule.id,
        message:
          `TAG 规则 ${rule.id}（targetTag=${rule.targetTag}, severity=${rule.severity}）对全库 ` +
          `${dishes.length} 道菜零命中：flavorTags/食材 category/食材名别名均不匹配。` +
          `死规则不静默——请确认该忌口是否已有等价食材级规则覆盖（花生由 seed-excl-peanut-ing 食材级覆盖）`,
      });
    }
  }

  return {
    checkedAt,
    ruleCounts: {
      total: rules.length,
      hard: rules.filter((r) => r.severity === 'HARD').length,
      soft: rules.filter((r) => r.severity === 'SOFT').length,
    },
    scannedCount: dishes.length,
    publishedDishCount: publishedViews.length,
    findings,
    passed: !findings.some((f) => f.severity === 'FAIL'),
  };
}

// ───── 发布入口守卫（AC4：菜品发布唯一命令内部先跑本检查；纯函数可单测） ─────

/** 解析菜品引用（id 精确优先，菜名精确唯一次之；歧义/未命中返回 null） */
export function resolveDishRef<T extends { id: string; name: string }>(
  rows: T[],
  ref: string,
): T | null {
  const byId = rows.find((r) => r.id === ref);
  if (byId) return byId;
  const byName = rows.filter((r) => r.name === ref);
  if (byName.length === 1) return byName[0];
  return null; // 0 个=未命中；≥2 个=菜名不唯一，拒绝猜测（设计规则 1：不让用户猜系统编号）
}

/** 发布状态机守卫：仅 DRAFT/TESTED 可 -> PUBLISHED；已是 PUBLISHED 拒绝（no-op 不算发布） */
export function validatePublishTransition(current: string): { ok: boolean; reason?: string } {
  if (current === 'DRAFT' || current === 'TESTED') return { ok: true };
  if (current === 'PUBLISHED') {
    return { ok: false, reason: '该菜品已是 PUBLISHED（无需重复发布；如内容有更新请走对应微调流程）' };
  }
  return { ok: false, reason: `非法起始状态：${current}（仅 DRAFT/TESTED 可发布为 PUBLISHED）` };
}

// ───── 人类可读报告 ─────

export function formatSafetyCheckReport(result: SafetyCheckResult): string {
  const lines: string[] = [];
  lines.push('=== check:safety 过敏防线只读检查报告 ===');
  lines.push(`检查时间：${result.checkedAt}（对目标库零写入，仅 SELECT）`);
  lines.push(
    `规则源：DB ExclusionRule 全量 ${result.ruleCounts.total} 行（HARD ${result.ruleCounts.hard} / SOFT ${result.ruleCounts.soft}）`,
  );
  lines.push(`扫描范围：全库 ${result.scannedCount} 道菜（任意状态，供 TAG 命中面）+ PUBLISHED ${result.publishedDishCount} 道（过 HARD 规则）`);
  lines.push('');

  const fails = result.findings.filter((f) => f.severity === 'FAIL');
  const warns = result.findings.filter((f) => f.severity === 'WARN');

  lines.push(`失败项：${fails.length}`);
  for (const f of fails) {
    lines.push(`  [FAIL:${f.kind}] ${f.message}`);
  }
  lines.push(`告警项：${warns.length}（不改变退出码）`);
  for (const w of warns) {
    lines.push(`  [WARN:${w.kind}] ${w.message}`);
  }
  lines.push('');
  lines.push(
    result.passed
      ? '结论：通过（exit 0）。菜品发布唯一入口 = pnpm release:dish（内部先跑本检查，失败拒绝）；禁止裸 SQL 改 status。'
      : `结论：不通过（exit 1）。存在 ${fails.length} 项失败——修复前不得发布任何菜品。`,
  );
  return lines.join('\n');
}
