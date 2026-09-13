// tools/content-pipeline/test/allergen.spec.ts
// R-2 单元测试（AC1 五分支 / AC2 报告结构与状态过滤 / AC3 category 警告）：
// 全部为纯函数或 mock prisma 的常规单测形态；真实库盘点属 AC4，另行实跑（不在此 mock）。

import { describe, it, expect, vi } from 'vitest';
import {
  checkDishAllergen,
  resolveAllergenDecision,
  describeMatched,
  loadAllergenRules,
  loadIngredientProfilesByNames,
  type AllergenRuleView,
  type AllergenIngredientProfile,
} from '../src/allergen.js';
import {
  normalizeStatusFilter,
  scanDishesForGaps,
  collectNonStandardCategories,
  buildPublishCheckReport,
  formatReport,
  type PublishCheckDish,
} from '../src/publish-check.js';
import {
  findNonStandardCategories,
  formatNonStandardCategoryWarning,
} from '../src/import.js';

// ───── 测试数据 ─────

// 规则集：HARD INGREDIENT（targetId=ing-peanut）+ HARD TAG（花生）+ SOFT TAG（内脏）
const ruleHardIngredient: AllergenRuleView = {
  id: 'rule-hard-ing',
  scope: 'INGREDIENT',
  targetId: 'ing-peanut',
  severity: 'HARD',
  note: '花生 HARD',
};
const ruleHardTag: AllergenRuleView = {
  id: 'rule-hard-tag',
  scope: 'TAG',
  targetTag: '花生',
  severity: 'HARD',
  note: '花生 HARD',
};
const ruleSoftTag: AllergenRuleView = {
  id: 'rule-soft-tag',
  scope: 'TAG',
  targetTag: '内脏',
  severity: 'SOFT',
  note: '内脏 SOFT',
};
const rules3 = [ruleHardIngredient, ruleHardTag, ruleSoftTag];

// INGREDIENT 规则 target 行（join 补全结果）
const targetProfiles = new Map<string, { name: string; aliases: string[] } | null>([
  ['rule-hard-ing', { name: '花生米', aliases: ['花生仁'] }],
]);

/** 便捷构造食材画像 */
function ing(overrides: Partial<AllergenIngredientProfile> & { name: string }): AllergenIngredientProfile {
  return { aliases: [], ...overrides };
}

// ───── AC1：checkDishAllergen + resolveAllergenDecision 五分支 ─────

describe('AC1 五分支：过敏原检测与处置分级', () => {
  it('分支1：HARD INGREDIENT 规则命中且未标注 -> blocked=true（默认拒绝）', () => {
    const findings = checkDishAllergen(
      { name: '宫保鸡丁', flavorTags: [] },
      [ing({ name: '花生米', dbId: 'ing-peanut' })],
      [ruleHardIngredient],
      targetProfiles,
    );
    expect(findings.length).toBe(1);
    expect(findings[0].scope).toBe('INGREDIENT');
    expect(findings[0].severity).toBe('HARD');
    const decision = resolveAllergenDecision(findings);
    expect(decision.blocked).toBe(true);
  });

  it('分支2：HARD 命中 + --allow-allergen-draft 显式豁免 -> 放行并保留豁免警告', () => {
    const findings = checkDishAllergen(
      { name: '宫保鸡丁', flavorTags: [] },
      [ing({ name: '花生米', dbId: 'ing-peanut' })],
      [ruleHardIngredient],
      targetProfiles,
    );
    const decision = resolveAllergenDecision(findings, { allowAllergenDraft: true });
    expect(decision.blocked).toBe(false);
    expect(decision.warnings.length).toBe(1);
    expect(decision.warnings[0]).toContain('豁免');
    expect(decision.warnings[0]).toContain('rule-hard-ing');
  });

  it('分支3：SOFT 规则命中 -> 放行 + 警告（不阻断）', () => {
    // 子串宽口径：dbAliases「内脏类-猪肝」含 targetTag「内脏」-> 命中
    const findings = checkDishAllergen(
      { name: '炒肝尖', flavorTags: [] },
      [ing({ name: '猪肝', aliases: ['肝尖'], dbAliases: ['内脏类-猪肝'] })],
      rules3,
      targetProfiles,
    );
    // 反例：name/aliases/dbAliases 均不含 targetTag 子串 -> 不命中
    const noHit = checkDishAllergen(
      { name: '炒肝尖', flavorTags: [] },
      [ing({ name: '猪肝', aliases: ['肝尖'], dbAliases: ['肝'] })],
      rules3,
      targetProfiles,
    );
    expect(findings.length).toBe(1);
    expect(findings[0].severity).toBe('SOFT');
    expect(noHit.length).toBe(0);
    const decision = resolveAllergenDecision(findings);
    expect(decision.blocked).toBe(false);
    expect(decision.warnings.length).toBe(1);
    expect(decision.warnings[0]).toContain('SOFT');
  });

  it('分支4：flavorTags 已标注 targetTag -> 放行、无警告（engine 会拦，管线放行）', () => {
    const findings = checkDishAllergen(
      { name: '花生碎拌菜', flavorTags: ['花生'] },
      [ing({ name: '花生酱' })], // 子串命中食材面，但菜已标注
      rules3.filter((r) => r.scope === 'TAG'),
      targetProfiles,
    );
    expect(findings.length).toBe(0);
    const decision = resolveAllergenDecision(findings);
    expect(decision.blocked).toBe(false);
    expect(decision.warnings.length).toBe(0);
  });

  it('分支5：无规则命中 -> 放行、无警告', () => {
    const findings = checkDishAllergen(
      { name: '番茄炒蛋', flavorTags: ['清淡'] },
      [ing({ name: '番茄', aliases: ['西红柿'] }), ing({ name: '鸡蛋' })],
      rules3,
      targetProfiles,
    );
    expect(findings.length).toBe(0);
    const decision = resolveAllergenDecision(findings);
    expect(decision.blocked).toBe(false);
    expect(decision.warnings.length).toBe(0);
  });
});

// ───── AC1 匹配口径细节 ─────

describe('AC1 匹配口径：INGREDIENT 精确等值 / TAG 子串宽口径 / 边界', () => {
  it('INGREDIENT：食材 name 与规则 target 行 name 精确等值命中', () => {
    const findings = checkDishAllergen(
      { name: '菜A', flavorTags: [] },
      [ing({ name: '花生米' })], // 与 target 行 name 等值
      [ruleHardIngredient],
      targetProfiles,
    );
    expect(findings.length).toBe(1);
    expect(findings[0].matchedIngredients[0].matchedAs).toContain('花生米');
  });

  it('INGREDIENT：经规则 target 行 aliases 等值命中食材 name', () => {
    const findings = checkDishAllergen(
      { name: '菜A', flavorTags: [] },
      [ing({ name: '花生仁' })], // target 行 aliases 之一
      [ruleHardIngredient],
      targetProfiles,
    );
    expect(findings.length).toBe(1);
  });

  it('INGREDIENT：经食材 dbAliases 等值命中（JSON 侧 name 与 DB 侧别名不同）', () => {
    const findings = checkDishAllergen(
      { name: '菜A', flavorTags: [] },
      [ing({ name: 'X仁果', dbAliases: ['花生米'] })],
      [ruleHardIngredient],
      targetProfiles,
    );
    expect(findings.length).toBe(1);
    expect(findings[0].matchedIngredients[0].matchedAs).toContain('花生米');
  });

  it('INGREDIENT：规则 target 行 join 不到 -> nameSet 仅含 targetId，食材 dbId 等值仍命中', () => {
    const findings = checkDishAllergen(
      { name: '菜A', flavorTags: [] },
      [ing({ name: '神秘食材', dbId: 'ing-peanut' })],
      [ruleHardIngredient],
      new Map([['rule-hard-ing', null]]),
    );
    expect(findings.length).toBe(1);
    expect(findings[0].matchedIngredients[0].matchedAs).toContain('ing-peanut');
  });

  it('INGREDIENT：子串不算等值（「花生糖」不等值「花生米」）-> 不命中', () => {
    const findings = checkDishAllergen(
      { name: '菜A', flavorTags: [] },
      [ing({ name: '花生糖' })],
      [ruleHardIngredient],
      targetProfiles,
    );
    expect(findings.length).toBe(0);
  });

  it('TAG：子串宽口径——食材 name 含 targetTag 即命中（纵深补位 engine 缺口）', () => {
    const findings = checkDishAllergen(
      { name: '菜A', flavorTags: [] },
      [ing({ name: '花生酱' })], // '花生酱'.includes('花生')
      [ruleHardTag],
      targetProfiles,
    );
    expect(findings.length).toBe(1);
    expect(findings[0].missingTag).toBe('花生');
  });

  it('TAG：经 aliases / dbAliases 子串命中', () => {
    const byAlias = checkDishAllergen(
      { name: '菜A', flavorTags: [] },
      [ing({ name: '酱料', aliases: ['花生调味酱'] })],
      [ruleHardTag],
      targetProfiles,
    );
    const byDbAlias = checkDishAllergen(
      { name: '菜B', flavorTags: [] },
      [ing({ name: '酱料', dbAliases: ['碎花生'] })],
      [ruleHardTag],
      targetProfiles,
    );
    expect(byAlias.length).toBe(1);
    expect(byDbAlias.length).toBe(1);
  });

  it('DISH scope 规则不在管线检测面 -> 跳过', () => {
    const dishRule: AllergenRuleView = {
      id: 'rule-dish',
      scope: 'DISH',
      targetId: 'dish-x',
      severity: 'HARD',
    };
    const findings = checkDishAllergen(
      { name: '菜A', flavorTags: [] },
      [ing({ name: '花生米', dbId: 'ing-peanut' })],
      [dishRule],
      targetProfiles,
    );
    expect(findings.length).toBe(0);
  });

  it('空规则集零影响 -> findings 空、放行无警告', () => {
    const findings = checkDishAllergen(
      { name: '菜A', flavorTags: [] },
      [ing({ name: '花生米', dbId: 'ing-peanut' })],
      [],
      new Map(),
    );
    expect(findings.length).toBe(0);
    const decision = resolveAllergenDecision(findings, { allowAllergenDraft: false });
    expect(decision.blocked).toBe(false);
    expect(decision.warnings.length).toBe(0);
  });

  it('describeMatched 输出食材名与命中值', () => {
    const findings = checkDishAllergen(
      { name: '菜A', flavorTags: [] },
      [ing({ name: '花生米', dbId: 'ing-peanut' })],
      [ruleHardIngredient],
      targetProfiles,
    );
    const text = describeMatched(findings[0]);
    expect(text).toContain('花生米');
    expect(text).toContain('ing-peanut');
  });
});

// ───── AC1 加载函数（mock prisma，只读口径）─────

describe('AC1 规则源加载：DB ExclusionRule 全量动态读取（mock prisma）', () => {
  it('loadAllergenRules：findMany() 全量无 where；INGREDIENT targetId 经 DB join 补全', async () => {
    const exclusionFindMany = vi.fn(async () => [
      { id: 'rule-hard-ing', scope: 'INGREDIENT', targetId: 'ing-peanut', targetTag: null, severity: 'HARD', note: '花生 HARD' },
      { id: 'rule-hard-tag', scope: 'TAG', targetId: null, targetTag: '花生', severity: 'HARD', note: null },
    ]);
    const ingredientFindMany = vi.fn(async (args: { where: { id: { in: string[] } } }) => {
      expect(args.where.id.in).toEqual(['ing-peanut']);
      return [{ id: 'ing-peanut', name: '花生米', aliases: ['花生仁'], category: '调料' }];
    });
    const prisma = {
      exclusionRule: { findMany: exclusionFindMany },
      ingredient: { findMany: ingredientFindMany },
    };
    const { rules, ruleTargetProfiles } = await loadAllergenRules(prisma);
    expect(rules.length).toBe(2);
    expect(rules[0].severity).toBe('HARD');
    expect(ruleTargetProfiles.get('rule-hard-ing')).toEqual({ name: '花生米', aliases: ['花生仁'] });
    expect(exclusionFindMany).toHaveBeenCalledTimes(1);
  });

  it('loadAllergenRules：findMany 以无参调用（无 where）——全量动态读取，防误改过滤硬编码子集（REV1/S-3）', async () => {
    const exclusionFindMany = vi.fn(async () => []);
    const prisma = {
      exclusionRule: { findMany: exclusionFindMany },
      ingredient: { findMany: vi.fn() },
    };
    await loadAllergenRules(prisma);
    expect(exclusionFindMany).toHaveBeenCalledTimes(1);
    // 零参数调用 = 无 where：若未来误改为 findMany({ where: ... }) 过滤硬编码子集，此断言即失败
    expect(exclusionFindMany).toHaveBeenCalledWith();
  });

  it('loadAllergenRules：INGREDIENT targetId join 不到 -> profile=null（nameSet 仅 targetId）', async () => {
    const prisma = {
      exclusionRule: {
        findMany: async () => [
          { id: 'rule-hard-ing', scope: 'INGREDIENT', targetId: 'ing-gone', targetTag: null, severity: 'HARD', note: null },
        ],
      },
      ingredient: { findMany: async () => [] },
    };
    const { rules, ruleTargetProfiles } = await loadAllergenRules(prisma);
    expect(rules.length).toBe(1);
    expect(ruleTargetProfiles.get('rule-hard-ing')).toBeNull();
  });

  it('loadAllergenRules：无 INGREDIENT 规则时不发 ingredient 查询', async () => {
    const ingredientFindMany = vi.fn();
    const prisma = {
      exclusionRule: {
        findMany: async () => [
          { id: 'rule-hard-tag', scope: 'TAG', targetId: null, targetTag: '花生', severity: 'HARD', note: null },
        ],
      },
      ingredient: { findMany: ingredientFindMany },
    };
    await loadAllergenRules(prisma);
    expect(ingredientFindMany).not.toHaveBeenCalled();
  });

  it('loadIngredientProfilesByNames：空 names 直接返回空 Map 不查询', async () => {
    const ingredientFindMany = vi.fn();
    const prisma = { ingredient: { findMany: ingredientFindMany } };
    const map = await loadIngredientProfilesByNames(prisma, []);
    expect(map.size).toBe(0);
    expect(ingredientFindMany).not.toHaveBeenCalled();
  });

  it('loadIngredientProfilesByNames：按 name in 批量查询并按 name 索引', async () => {
    const prisma = {
      ingredient: {
        findMany: async (args: { where: { name: { in: string[] } } }) => {
          expect(args.where.name.in).toEqual(['花生米', '番茄']);
          return [
            { id: 'ing-peanut', name: '花生米', aliases: ['花生仁'], category: '调料' },
            { id: 'ing-tomato', name: '番茄', aliases: [], category: '蔬菜' },
          ];
        },
      },
    };
    const map = await loadIngredientProfilesByNames(prisma, ['花生米', '番茄']);
    expect(map.get('花生米')?.id).toBe('ing-peanut');
    expect(map.get('番茄')?.category).toBe('蔬菜');
  });
});

// ───── AC2：fm-publish-check 核心 ─────

describe('AC2：normalizeStatusFilter 状态过滤归一', () => {
  it('缺省（undefined/空串/纯空白）-> 全扫 DRAFT+TESTED', () => {
    expect(normalizeStatusFilter()).toEqual(['DRAFT', 'TESTED']);
    expect(normalizeStatusFilter('')).toEqual(['DRAFT', 'TESTED']);
    expect(normalizeStatusFilter('   ')).toEqual(['DRAFT', 'TESTED']);
  });

  it("'draft,tested' 大小写归一 + 去重保序", () => {
    expect(normalizeStatusFilter('draft,tested')).toEqual(['DRAFT', 'TESTED']);
    expect(normalizeStatusFilter('DRAFT')).toEqual(['DRAFT']);
    expect(normalizeStatusFilter(' tested , draft ,draft')).toEqual(['TESTED', 'DRAFT']);
  });

  it("非法值抛错（published 不在盘点白名单）", () => {
    expect(() => normalizeStatusFilter('published')).toThrow();
    expect(() => normalizeStatusFilter('draft,manual')).toThrow();
  });
});

/** 构造盘点用菜品行 */
function checkDish(
  overrides: Partial<PublishCheckDish> & {
    id: string;
    name: string;
    ingredients: PublishCheckDish['ingredients'];
  },
): PublishCheckDish {
  return {
    origin: 'LLM_DRAFT',
    status: 'DRAFT',
    flavorTags: [],
    ...overrides,
  };
}

describe('AC2：scanDishesForGaps / buildPublishCheckReport / formatReport', () => {
  const dishes: PublishCheckDish[] = [
    checkDish({
      id: 'dish-1',
      name: '宫保鸡丁',
      ingredients: [
        {
          name: '花生米',
          category: '调料',
          profile: { name: '花生米', aliases: [], dbId: 'ing-peanut', dbAliases: ['花生米'] },
        },
      ],
    }),
    checkDish({
      id: 'dish-2',
      name: '蚝油生菜',
      ingredients: [
        {
          name: '花生米',
          category: '调料',
          profile: { name: '花生米', aliases: [], dbId: 'ing-peanut', dbAliases: ['花生米'] },
        },
      ],
    }),
    checkDish({
      id: 'dish-3',
      name: '番茄炒蛋',
      ingredients: [{ name: '番茄', category: '蔬菜', profile: { name: '番茄', aliases: [] } }],
    }),
    checkDish({
      id: 'dish-4',
      name: '花生拌菜（已标注）',
      flavorTags: ['花生'],
      ingredients: [{ name: '花生酱', category: '调料', profile: { name: '花生酱', aliases: [] } }],
    }),
  ];

  it('scanDishesForGaps：命中菜进 gaps，已标注/无命中菜不进', () => {
    const gaps = scanDishesForGaps(dishes, [ruleHardTag], targetProfiles);
    expect(gaps.map((g) => g.dishName)).toEqual(['宫保鸡丁', '蚝油生菜']);
  });

  it('buildPublishCheckReport：结构完整（数字与过滤自洽）', () => {
    const report = buildPublishCheckReport(
      dishes,
      rules3,
      targetProfiles,
      ['DRAFT', 'TESTED'],
      '2026-09-13T00:00:00.000Z',
    );
    expect(report.scannedAt).toBe('2026-09-13T00:00:00.000Z');
    expect(report.statusFilter).toEqual(['DRAFT', 'TESTED']);
    expect(report.ruleCounts).toEqual({ total: 3, hard: 2, soft: 1 });
    expect(report.scannedCount).toBe(4);
    expect(report.gapDishCount).toBe(2);
    expect(report.gaps.every((g) => g.findings.length > 0)).toBe(true);
    // 退出码语义（AC2）：有缺口 -> 2；无缺口 -> 0（CLI 层按 gapDishCount 设置）
    expect(report.gapDishCount > 0).toBe(true);
  });

  it('formatReport：人类可读全文含关键要素', () => {
    const report = buildPublishCheckReport(
      dishes,
      rules3,
      targetProfiles,
      ['DRAFT', 'TESTED'],
      '2026-09-13T00:00:00.000Z',
    );
    const text = formatReport(report);
    expect(text).toContain('fm-publish-check 存量过敏原盘点报告');
    expect(text).toContain("status IN ('DRAFT', 'TESTED')");
    expect(text).toContain('共 4 道菜');
    expect(text).toContain('HARD 2 / SOFT 1');
    expect(text).toContain('过敏原缺口菜品：2 道');
    expect(text).toContain('宫保鸡丁');
    expect(text).toContain('exit 2');
  });

  it('loadDishesForCheck 形态（mock prisma）：嵌套食材合成 profile，status where 过滤', async () => {
    const { loadDishesForCheck } = await import('../src/publish-check.js');
    const dishFindMany = vi.fn(async (args: {
      where: { status: { in: string[] } };
      include: unknown;
      orderBy: unknown;
    }) => {
      expect(args.where.status.in).toEqual(['DRAFT']);
      return [
        {
          id: 'dish-9',
          name: '菜九',
          origin: 'FETCHED',
          status: 'DRAFT',
          flavorTags: ['清淡'],
          ingredients: [
            { ingredient: { id: 'ing-peanut', name: '花生米', aliases: ['花生仁'], category: '调料' } },
          ],
        },
      ];
    });
    const rows = await loadDishesForCheck(
      { dish: { findMany: dishFindMany } },
      ['DRAFT'],
    );
    expect(rows.length).toBe(1);
    expect(rows[0].ingredients[0].profile.dbId).toBe('ing-peanut');
    expect(rows[0].ingredients[0].profile.dbAliases).toEqual(['花生仁']);
    expect(dishFindMany).toHaveBeenCalledTimes(1);
  });
});

// ───── AC3：category 漂移警告 ─────

describe('AC3：category 非标检测与警告（消费 shared CATEGORIES）', () => {
  it('findNonStandardCategories：非标收、标准六类不收', () => {
    const rows = [
      { name: '花生米', category: '调料' },
      { name: '罗勒', category: '香草' }, // 非标
      { name: '番茄', category: '蔬菜' },
    ];
    const nonStandard = findNonStandardCategories(rows);
    expect(nonStandard).toEqual([{ name: '罗勒', category: '香草' }]);
  });

  it('formatNonStandardCategoryWarning：含数量、六类清单、食材名与当前值、不阻断声明', () => {
    const text = formatNonStandardCategoryWarning([{ name: '罗勒', category: '香草' }]);
    expect(text).toContain('1 个食材');
    expect(text).toContain('蔬菜/肉类/水产/蛋奶/调料/主食');
    expect(text).toContain('罗勒=香草');
    expect(text).toContain('仅警告，不阻断');
  });

  it('collectNonStandardCategories：按 name+category 去重（同名跨菜引用只计一次）', () => {
    const dishes: PublishCheckDish[] = [
      checkDish({
        id: 'd1',
        name: '菜一',
        ingredients: [
          { name: '罗勒', category: '香草', profile: { name: '罗勒', aliases: [] } },
          { name: '番茄', category: '蔬菜', profile: { name: '番茄', aliases: [] } },
        ],
      }),
      checkDish({
        id: 'd2',
        name: '菜二',
        ingredients: [{ name: '罗勒', category: '香草', profile: { name: '罗勒', aliases: [] } }],
      }),
    ];
    const result = collectNonStandardCategories(dishes);
    expect(result.count).toBe(1);
    expect(result.items).toEqual([{ name: '罗勒', category: '香草' }]);
  });

  it('buildPublishCheckReport 附带非标 category 计数（AC2 报告面）', () => {
    const dishes: PublishCheckDish[] = [
      checkDish({
        id: 'd1',
        name: '菜一',
        ingredients: [{ name: '罗勒', category: '香草', profile: { name: '罗勒', aliases: [] } }],
      }),
    ];
    const report = buildPublishCheckReport(dishes, [], new Map(), ['DRAFT'], '2026-09-13T00:00:00.000Z');
    expect(report.nonStandardCategory.count).toBe(1);
    expect(report.nonStandardCategory.items[0].name).toBe('罗勒');
    const text = formatReport(report);
    expect(text).toContain('非标 category 食材引用');
    expect(text).toContain('结论：无缺口（exit 0）');
  });
});
