// tools/content-pipeline/src/allergen.ts
// R-2 过敏原纵深校验核心：规则动态加载（只读）+ 检测纯函数 + 处置分级纯函数
// 规则源 = DB ExclusionRule 全量动态读取（零硬编码规则文本；fm-import 写库前调用，
// fm-publish-check 盘点复用同口径）。
// 匹配口径（R-2 任务卡定案）：
//   - INGREDIENT 规则：食材 id/name/aliases 精确等值（规则 targetId 经 DB 食材行 join 补全
//     name/aliases，对齐 packages/engine/src/safety.ts checkIngredientScope 信息面）；
//   - TAG 规则：食材 name/aliases 子串含 targetTag（宽口径，纵深补位 engine TAG 通道不查
//     name/aliases 的已知缺口——T-C07 S-3 定案；管线侧误伤代价低，由 --allow-allergen-draft
//     显式豁免承接人工裁量）；
//   - 合规判定：菜 flavorTags 含 targetTag 即视为已标注（engine 会拦，管线放行）。
// 运行时零 LLM API（DEC-006）：纯规则检测；本模块对 DB 仅做只读 SELECT。

/** 规则视图（与 DB ExclusionRule 行对齐，去 familyId；scope=DISH 不在管线检测面，见下） */
export interface AllergenRuleView {
  id: string;
  scope: 'INGREDIENT' | 'DISH' | 'TAG';
  targetId?: string | null;
  targetTag?: string | null;
  severity: 'HARD' | 'SOFT';
  note?: string | null;
}

/**
 * 待检测食材画像。
 * name 为导入 JSON 食材名；aliases 为 JSON 自带 aliases；
 * dbId / dbAliases / dbCategory 由 DB Ingredient 行（按 name 唯一）join 补全——
 * 已入库食材带 DB 事实（id 与库内 aliases），新食材（无 DB 行）缺省 undefined。
 */
export interface AllergenIngredientProfile {
  name: string;
  aliases: string[];
  dbId?: string;
  dbAliases?: string[];
  dbCategory?: string;
}

/** 单条规则命中明细 */
export interface AllergenFinding {
  ruleId: string;
  severity: 'HARD' | 'SOFT';
  scope: 'INGREDIENT' | 'TAG';
  targetId?: string;
  targetTag?: string;
  /** TAG 规则缺口：flavorTags 缺失的标注 tag（=targetTag） */
  missingTag?: string;
  ruleNote?: string | null;
  /** 命中的食材明细（name + 具体命中值） */
  matchedIngredients: { name: string; matchedAs: string[] }[];
}

/** 处置分级结果（resolveAllergenDecision 产物） */
export interface AllergenDecision {
  /** true = 存在 HARD 命中且未显式豁免 -> CLI 默认拒绝导入（exit 非 0） */
  blocked: boolean;
  /** 警告行（SOFT 未标注 / HARD 显式豁免放行时的警告） */
  warnings: string[];
}

/**
 * INGREDIENT 规则 nameSet 构建（对齐 engine buildHardIngredientNameSets 信息面）：
 * {targetId, target行.name, ...target行.aliases}；target 行 join 不到时仅 {targetId}。
 */
function buildIngredientRuleNameSet(
  rule: AllergenRuleView,
  targetProfile: { name: string; aliases: string[] } | null | undefined,
): Set<string> {
  const nameSet = new Set<string>();
  if (rule.targetId) nameSet.add(rule.targetId);
  if (targetProfile) {
    nameSet.add(targetProfile.name);
    for (const a of targetProfile.aliases) nameSet.add(a);
  }
  return nameSet;
}

/**
 * 检测单道菜的过敏原 tag 缺口（纯函数，可单测）。
 * - INGREDIENT 规则：食材侧 names = {dbId, name, ...aliases, ...dbAliases} 与规则 nameSet
 *   精确等值求交（optional=true 与 false 一视同仁，对齐 engine checkIngredientScope——
 *   T-C07-FIX 已证实 optional 行同样被引擎拦截）；
 * - TAG 规则：食材 name/aliases（含 dbAliases）任一子串包含 targetTag 即命中检测面；
 *   菜 flavorTags 含 targetTag = 已标注，不产出 finding（放行）；
 * - DISH scope 规则不在管线检测面（卡面口径仅定义 INGREDIENT/TAG；新导入菜无稳定 id，
 *   engine checkDishScope 按 dish.id 匹配）。
 * 空规则集 -> 返回空数组（校验空转零影响）。
 */
export function checkDishAllergen(
  dish: { name: string; flavorTags: string[] },
  ingredients: AllergenIngredientProfile[],
  rules: AllergenRuleView[],
  ruleTargetProfiles: Map<string, { name: string; aliases: string[] } | null>,
): AllergenFinding[] {
  const findings: AllergenFinding[] = [];
  for (const rule of rules) {
    if (rule.scope === 'INGREDIENT' && rule.targetId) {
      const nameSet = buildIngredientRuleNameSet(rule, ruleTargetProfiles.get(rule.id));
      const matchedIngredients: { name: string; matchedAs: string[] }[] = [];
      for (const ing of ingredients) {
        const names = new Set<string>([ing.name, ...(ing.aliases ?? [])]);
        if (ing.dbId) names.add(ing.dbId);
        if (ing.dbAliases) for (const a of ing.dbAliases) names.add(a);
        const matchedAs = [...names].filter((n) => nameSet.has(n));
        if (matchedAs.length > 0) {
          matchedIngredients.push({ name: ing.name, matchedAs });
        }
      }
      if (matchedIngredients.length > 0) {
        findings.push({
          ruleId: rule.id,
          severity: rule.severity,
          scope: 'INGREDIENT',
          targetId: rule.targetId,
          ruleNote: rule.note ?? null,
          matchedIngredients,
        });
      }
    } else if (rule.scope === 'TAG' && rule.targetTag) {
      const tag = rule.targetTag;
      // 已标注放行：菜 flavorTags 含 targetTag 即视为已标注（engine 会拦，管线放行）
      if (dish.flavorTags.includes(tag)) continue;
      const matchedIngredients: { name: string; matchedAs: string[] }[] = [];
      for (const ing of ingredients) {
        const texts = [ing.name, ...(ing.aliases ?? []), ...(ing.dbAliases ?? [])];
        const matchedAs = [...new Set(texts)].filter((t) => t.includes(tag));
        if (matchedAs.length > 0) {
          matchedIngredients.push({ name: ing.name, matchedAs });
        }
      }
      if (matchedIngredients.length > 0) {
        findings.push({
          ruleId: rule.id,
          severity: rule.severity,
          scope: 'TAG',
          targetTag: tag,
          missingTag: tag,
          ruleNote: rule.note ?? null,
          matchedIngredients,
        });
      }
    }
    // scope=DISH：不在管线检测面（见函数注释），跳过
  }
  return findings;
}

/**
 * 处置分级（纯函数，可单测；AC1 五分支全在此函数与 checkDishAllergen 上可测）：
 * - 命中 HARD 且未标注 -> blocked=true（CLI 默认拒绝导入，exit 非 0）；
 * - 命中 HARD 且 allowAllergenDraft=true -> 放行 + 每条 HARD 命中打豁免警告；
 * - 命中 SOFT 且未标注 -> 放行 + 警告（不阻断）；
 * - 已标注 / 无命中 -> 放行、无警告。
 */
export function resolveAllergenDecision(
  findings: AllergenFinding[],
  options: { allowAllergenDraft?: boolean } = {},
): AllergenDecision {
  const warnings: string[] = [];
  const hardFindings = findings.filter((f) => f.severity === 'HARD');
  for (const f of findings) {
    if (f.severity === 'SOFT') {
      warnings.push(
        `[警告] SOFT 规则 ${f.ruleId}（${f.scope} ${f.targetId ?? f.targetTag ?? ''}）未标注命中：` +
          `${describeMatched(f)}。不阻断导入，供人工裁量（note: ${f.ruleNote ?? '-'}）`,
      );
    }
  }
  if (hardFindings.length > 0) {
    if (options.allowAllergenDraft) {
      for (const f of hardFindings) {
        warnings.push(
          `[豁免放行] HARD 规则 ${f.ruleId}（${f.scope} ${f.targetId ?? f.targetTag ?? ''}）未标注命中：` +
            `${describeMatched(f)}。经 --allow-allergen-draft 显式豁免导入（引擎侧推荐时仍会拦截）` +
            `（note: ${f.ruleNote ?? '-'}）`,
        );
      }
      return { blocked: false, warnings };
    }
    return { blocked: true, warnings };
  }
  return { blocked: false, warnings };
}

/** 命中明细一句话描述（人类可读输出用） */
export function describeMatched(f: AllergenFinding): string {
  return f.matchedIngredients
    .map((m) => `食材「${m.name}」(${m.matchedAs.join('/')})`)
    .join('、');
}

// ───── DB 只读加载（fm-import 写库前校验与 fm-publish-check 盘点共用）─────

/** PrismaClient 最小接口（避免编译期依赖 generated 目录，对齐 db.ts 口径） */
export interface AllergenPrismaLike {
  exclusionRule: { findMany(args?: unknown): Promise<Record<string, unknown>[]> };
  ingredient: {
    findMany(args: unknown): Promise<
      { id: string; name: string; aliases: string[]; category: string }[]
    >;
  };
}

/**
 * 规则源加载（只读）：ExclusionRule 全量动态读取（无 where，零硬编码）；
 * INGREDIENT 规则 targetId 经 DB Ingredient 行 join 补全 name/aliases（对齐 planService
 * loadExclusionViews 口径）。join 不到（数据漂移）时 profile=null（nameSet 仅含 targetId）。
 */
export async function loadAllergenRules(
  prisma: AllergenPrismaLike,
): Promise<{
  rules: AllergenRuleView[];
  ruleTargetProfiles: Map<string, { name: string; aliases: string[] } | null>;
}> {
  const rows = await prisma.exclusionRule.findMany();
  const rules: AllergenRuleView[] = rows.map((r) => ({
    id: r.id as string,
    scope: r.scope as AllergenRuleView['scope'],
    targetId: (r.targetId as string | null) ?? null,
    targetTag: (r.targetTag as string | null) ?? null,
    severity: r.severity as AllergenRuleView['severity'],
    note: (r.note as string | null) ?? null,
  }));
  const ingredientIds = rules
    .filter((r) => r.scope === 'INGREDIENT' && r.targetId)
    .map((r) => r.targetId!);
  const targets =
    ingredientIds.length > 0
      ? await prisma.ingredient.findMany({ where: { id: { in: ingredientIds } } })
      : [];
  const targetMap = new Map(targets.map((t) => [t.id, { name: t.name, aliases: t.aliases }]));
  const ruleTargetProfiles = new Map<string, { name: string; aliases: string[] } | null>();
  for (const r of rules) {
    if (r.scope === 'INGREDIENT' && r.targetId) {
      ruleTargetProfiles.set(r.id, targetMap.get(r.targetId) ?? null);
    }
  }
  return { rules, ruleTargetProfiles };
}

/**
 * 待导入食材画像补全（只读）：按 name 批量查 DB Ingredient 行（name 唯一），
 * 已入库食材带 dbId/dbAliases/dbCategory；库中无行的新食材缺省（仅 JSON 自带信息）。
 */
export async function loadIngredientProfilesByNames(
  prisma: AllergenPrismaLike,
  names: string[],
): Promise<Map<string, { id: string; name: string; aliases: string[]; category: string }>> {
  if (names.length === 0) return new Map();
  const rows = await prisma.ingredient.findMany({ where: { name: { in: names } } });
  return new Map(rows.map((r) => [r.name, r]));
}
