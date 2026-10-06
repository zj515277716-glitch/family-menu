// apps/api/test/safety-check.spec.ts
// T-A1 AC3：check:safety 只读检查核心逻辑单测（纯函数，不连 DB）。
// 输入 = DB 行形状（rules/ingredients/dishes 全量投影），输出 = findings + passed。
// 覆盖三条 AC：① HARD+INGREDIENT targetId 悬空 FAIL；② PUBLISHED 菜过 HARD 违规 FAIL；
//            ③ TAG 规则全库零命中 WARN（不阻断）。
import { describe, it, expect } from 'vitest';
import {
  runSafetyCheckCore,
  formatSafetyCheckReport,
  resolveDishRef,
  validatePublishTransition,
  type SafetyCheckRuleRow,
  type SafetyCheckIngredientRow,
  type SafetyCheckDishRow,
} from '../src/services/safetyCheck.js';

// ───── 行形态构造（对齐 prisma 查询投影） ─────

function ing(id: string, name: string, aliases: string[], category = '调料'): SafetyCheckIngredientRow {
  return { id, name, aliases, category, defaultUnit: 'g' };
}

function dish(
  id: string,
  name: string,
  status: string,
  ings: SafetyCheckIngredientRow[],
  flavorTags: string[] = [],
): SafetyCheckDishRow {
  return { id, name, status, flavorTags, ingredients: ings.map((i) => ({ ingredient: i })) };
}

const PEANUT = ing('seed-ing-peanut', '花生米', ['熟花生米', '油炸花生米']);
const CHICKEN = ing('seed-ing-chicken', '鸡胸肉', []);
const TOMATO = ing('seed-ing-tomato', '番茄', ['西红柿'], '蔬菜');
const LIVER = ing('seed-ing-liver', '猪肝', [], '肉类');

const RULES: SafetyCheckRuleRow[] = [
  { id: 'seed-excl-peanut', scope: 'TAG', targetId: null, targetTag: '花生', severity: 'HARD', note: '孩子花生过敏' },
  { id: 'seed-excl-peanut-ing', scope: 'INGREDIENT', targetId: 'seed-ing-peanut', targetTag: null, severity: 'HARD', note: '花生食材级' },
  { id: 'seed-excl-organ', scope: 'TAG', targetId: null, targetTag: '内脏', severity: 'SOFT', note: '爸爸不吃内脏' },
];

function baseInput(overrides: Partial<Parameters<typeof runSafetyCheckCore>[0]> = {}) {
  return {
    rules: RULES,
    ingredients: [PEANUT, CHICKEN, TOMATO, LIVER],
    dishes: [
      dish('dish-kongbao', '宫保鸡丁', 'DRAFT', [CHICKEN, PEANUT]),
      dish('dish-tomato-egg', '番茄炒蛋', 'PUBLISHED', [TOMATO]),
    ],
    checkedAt: '2026-10-03T00:00:00.000Z',
    ...overrides,
  };
}

describe('check:safety 核心（T-A1 AC3）', () => {
  it('① HARD+INGREDIENT 规则 targetId 悬空 -> FAIL，passed=false', () => {
    // P0-1 失守形态：花生规则写死本机库 cuid，换库后 targetId 不存在
    const result = runSafetyCheckCore(
      baseInput({
        rules: [
          { id: 'seed-excl-peanut-ing', scope: 'INGREDIENT', targetId: 'cmtvnuvxvc2oy5fdrzhpxxe69', targetTag: null, severity: 'HARD', note: null },
        ],
      }),
    );
    expect(result.passed).toBe(false);
    const finding = result.findings.find((f) => f.kind === 'DANGLING_TARGET');
    expect(finding).toBeDefined();
    expect(finding!.ruleId).toBe('seed-excl-peanut-ing');
    expect(finding!.message).toContain('cmtvnuvxvc2oy5fdrzhpxxe69');
  });

  it('② PUBLISHED 菜含花生米（HARD 命中）-> FAIL，passed=false', () => {
    const result = runSafetyCheckCore(
      baseInput({
        dishes: [dish('dish-kongbao', '宫保鸡丁', 'PUBLISHED', [CHICKEN, PEANUT])],
      }),
    );
    expect(result.passed).toBe(false);
    const finding = result.findings.find((f) => f.kind === 'PUBLISHED_VIOLATION');
    expect(finding).toBeDefined();
    expect(finding!.dishId).toBe('dish-kongbao');
    expect(finding!.message).toContain('花生');
  });

  it('DRAFT/TESTED 含花生米不判失败（发布面才拦；导入面由 fm-import 负责）', () => {
    const result = runSafetyCheckCore(baseInput());
    expect(result.passed).toBe(true);
    expect(result.findings.some((f) => f.kind === 'PUBLISHED_VIOLATION')).toBe(false);
  });

  it('③ TAG 规则全库零命中 -> WARN 但不阻断（passed 仍 true）', () => {
    // 内脏 TAG 对库内所有菜（猪肝/番茄/宫保鸡丁）零命中
    const result = runSafetyCheckCore(baseInput());
    const warn = result.findings.find((f) => f.kind === 'TAG_ZERO_HIT' && f.ruleId === 'seed-excl-organ');
    expect(warn).toBeDefined();
    expect(warn!.severity).toBe('WARN');
    expect(result.passed).toBe(true);
  });

  it('TAG 规则有命中（DRAFT 含花生米也算全库命中）-> 不告警', () => {
    const result = runSafetyCheckCore(baseInput());
    expect(result.findings.some((f) => f.kind === 'TAG_ZERO_HIT' && f.ruleId === 'seed-excl-peanut')).toBe(false);
  });

  it('干净的 seed 形态库 -> passed=true 且无 FAIL finding', () => {
    const result = runSafetyCheckCore(
      baseInput({
        rules: [RULES[1]], // 仅 INGREDIENT 花生规则（稳定 id 已解析）
        dishes: [dish('dish-tomato-egg', '番茄炒蛋', 'PUBLISHED', [TOMATO])],
      }),
    );
    expect(result.passed).toBe(true);
    expect(result.findings.filter((f) => f.severity === 'FAIL')).toHaveLength(0);
  });

  it('人类可读报告含三段结论与退出码口径', () => {
    const ok = formatSafetyCheckReport(runSafetyCheckCore(baseInput()));
    expect(ok).toContain('check:safety');
    expect(ok).toContain('只读');
    const bad = formatSafetyCheckReport(
      runSafetyCheckCore(baseInput({ dishes: [dish('dish-kongbao', '宫保鸡丁', 'PUBLISHED', [CHICKEN, PEANUT])] })),
    );
    expect(bad).toContain('宫保鸡丁');
  });
});

// ───── AC4 发布入口守卫（纯函数） ─────

describe('publish 守卫（T-A1 AC4）', () => {
  const rows = [
    { id: 'seed-dish-a', name: '番茄炒蛋' },
    { id: 'seed-dish-b', name: '宫保鸡丁' },
    { id: 'seed-dish-c', name: '宫保鸡丁' },
  ];

  it('resolveDishRef：id 精确命中', () => {
    expect(resolveDishRef(rows, 'seed-dish-a')?.id).toBe('seed-dish-a');
  });

  it('resolveDishRef：唯一菜名命中', () => {
    expect(resolveDishRef(rows, '番茄炒蛋')?.id).toBe('seed-dish-a');
  });

  it('resolveDishRef：菜名歧义/不存在均不猜测（返回 null）', () => {
    expect(resolveDishRef(rows, '宫保鸡丁')).toBeNull();
    expect(resolveDishRef(rows, '不存在菜')).toBeNull();
  });

  it('validatePublishTransition：仅 DRAFT/TESTED 可发布', () => {
    expect(validatePublishTransition('DRAFT').ok).toBe(true);
    expect(validatePublishTransition('TESTED').ok).toBe(true);
    expect(validatePublishTransition('PUBLISHED').ok).toBe(false);
    expect(validatePublishTransition('WEIRD').ok).toBe(false);
  });
});
