// packages/engine/test/feasibility.spec.ts
// T-P10（PD-017 修订）：空手原因归类测试——unsatisfiable 值/顺序/形状零变化，
// 新增 unsatisfiableReasons 二次归类（∈宽集->TIME_BUDGET，∉宽集->NO_DISH，缺器具菜单不进宽集）
// 复用 test/fixtures 既有 fixture，零新 fixture。
import { describe, it, expect } from 'vitest';
import { feasibilityFilter, recommend, type TonightContext, type FamilyRuleView } from '../src/index.js';
import * as F from './fixtures/index.js';

// ───── E1-E6：feasibilityFilter 单元 ─────

describe('feasibilityFilter 空手原因归类（T-P10）', () => {
  it('E1 时间型：必消只出现在器具齐全但超时的菜单中 -> TIME_BUDGET', () => {
    // MENU_LAWEI 40min > 30min 预算，但器具齐全（steamer/rice_cooker 均在 FAMILY_RULE）-> 进宽集
    const context: TonightContext = { ...F.CONTEXT_30MIN, mustUseIngredients: ['ing-pork-belly'] };
    const result = feasibilityFilter([F.MENU_LAWEI], context, F.FAMILY_RULE);

    // unsatisfiable 值/顺序/形状零变化
    expect(result.unsatisfiable).toEqual(['ing-pork-belly']);
    // 归类：宽集含 ing-pork-belly（腊味合蒸）-> 时长型
    expect(result.unsatisfiableReasons).toEqual({ 'ing-pork-belly': 'TIME_BUDGET' });
    // 行为零变化：超时菜单被过滤、必消不可达 -> 空手
    expect(result.passed).toEqual([]);
    expect(result.filtered).toEqual([
      { menuId: 'menu-lawei', stage: 'feasibility', rule: '总工时40分钟超出预算30分钟' },
    ]);
  });

  it('E2 无菜型：60min 档必消食材不在任何菜单中 -> NO_DISH', () => {
    // ing-tomato 不在 MENU_PLAIN_RICE 中；60min 时 MENU_PLAIN_RICE 可达但不覆盖 -> 无菜型
    const context: TonightContext = { ...F.CONTEXT_60MIN, mustUseIngredients: ['ing-tomato'] };
    const result = feasibilityFilter([F.MENU_PLAIN_RICE], context, F.FAMILY_RULE);

    expect(result.unsatisfiable).toEqual(['ing-tomato']);
    expect(result.unsatisfiableReasons).toEqual({ 'ing-tomato': 'NO_DISH' });
    expect(result.passed).toEqual([]);
    expect(result.filtered).toEqual([
      { menuId: 'menu-plain-rice', stage: 'feasibility', rule: '未能消耗必消食材：ing-tomato' },
    ]);
  });

  it('E3 器具缺失归无菜型：缺器具菜单不进宽集（D-2 口径，出路暗示必须真实）', () => {
    // MENU_LAWEI 40min <= 60min 时长达标但缺 steamer -> 器具过滤，不进宽集
    const rules: FamilyRuleView = { ...F.FAMILY_RULE, equipment: ['wok'] };
    const context: TonightContext = { ...F.CONTEXT_60MIN, mustUseIngredients: ['ing-pork-belly'] };
    const result = feasibilityFilter([F.MENU_LAWEI], context, rules);

    expect(result.unsatisfiable).toEqual(['ing-pork-belly']);
    expect(result.unsatisfiableReasons).toEqual({ 'ing-pork-belly': 'NO_DISH' });
    expect(result.passed).toEqual([]);
    expect(result.filtered).toEqual([
      { menuId: 'menu-lawei', stage: 'feasibility', rule: '缺少器具：steamer、rice_cooker' },
    ]);
  });

  it('E4 双重失败（超时+缺器具）：仍归无菜型，filtered 时长 trace 顺序不变', () => {
    // MENU_LAWEI 40min > 30min 且缺 steamer：时长过滤触发，缺器具 -> 不进宽集
    const rules: FamilyRuleView = { ...F.FAMILY_RULE, equipment: ['wok'] };
    const context: TonightContext = { ...F.CONTEXT_30MIN, mustUseIngredients: ['ing-pork-belly'] };
    const result = feasibilityFilter([F.MENU_LAWEI], context, rules);

    expect(result.unsatisfiable).toEqual(['ing-pork-belly']);
    expect(result.unsatisfiableReasons).toEqual({ 'ing-pork-belly': 'NO_DISH' });
    expect(result.passed).toEqual([]);
    expect(result.filtered).toEqual([
      { menuId: 'menu-lawei', stage: 'feasibility', rule: '总工时40分钟超出预算30分钟' },
    ]);
  });

  it('E5 必消可达：unsatisfiable 与 unsatisfiableReasons 均为空', () => {
    // MENU_LAWEI 40min <= 60min 且器具齐全，覆盖全部必消 -> 通过
    const context: TonightContext = {
      ...F.CONTEXT_60MIN,
      mustUseIngredients: ['ing-pork-belly', 'ing-rice'],
    };
    const result = feasibilityFilter([F.MENU_LAWEI], context, F.FAMILY_RULE);

    expect(result.unsatisfiable).toEqual([]);
    expect(result.unsatisfiableReasons).toEqual({});
    expect(result.passed).toEqual([F.MENU_LAWEI]);
    expect(result.filtered).toEqual([]);
  });

  it('E6 混合两型：同一批必消各归各型（TIME_BUDGET 与 NO_DISH 并存）', () => {
    // ing-pork-belly：MENU_LAWEI 器具齐全但 40min>30min 超时 -> 进宽集 -> TIME_BUDGET
    // ing-tomato：两套菜单都不含 -> NO_DISH
    const context: TonightContext = {
      ...F.CONTEXT_30MIN,
      mustUseIngredients: ['ing-pork-belly', 'ing-tomato'],
    };
    const result = feasibilityFilter([F.MENU_LAWEI, F.MENU_PLAIN_RICE], context, F.FAMILY_RULE);

    // unsatisfiable 顺序 = mustUseIngredients 顺序，零变化
    expect(result.unsatisfiable).toEqual(['ing-pork-belly', 'ing-tomato']);
    expect(result.unsatisfiableReasons).toEqual({
      'ing-pork-belly': 'TIME_BUDGET',
      'ing-tomato': 'NO_DISH',
    });
    expect(result.passed).toEqual([]);
    // trace 顺序不变：超时 trace（库序）先于必消未消耗 trace
    expect(result.filtered).toEqual([
      { menuId: 'menu-lawei', stage: 'feasibility', rule: '总工时40分钟超出预算30分钟' },
      {
        menuId: 'menu-plain-rice',
        stage: 'feasibility',
        rule: '未能消耗必消食材：ing-pork-belly、ing-tomato',
      },
    ]);
  });
});

// ───── E7：recommend 集成透传 ─────

describe('recommend 空手原因透传（T-P10）', () => {
  it('E7 集成：unsatisfiableMustUseReasons 从引擎透传，混合两型 + filtered 顺序不变', () => {
    const result = recommend({
      rules: F.FAMILY_RULE,
      exclusions: [],
      context: {
        people: 4,
        timeBudgetMin: 30,
        mustUseIngredients: ['ing-pork-belly', 'ing-egg'],
      },
      library: [F.MENU_LAWEI, F.MENU_PLAIN_RICE],
      history: [],
    });

    // 空手行为零变化
    expect(result.candidates).toEqual([]);
    expect(result.unsatisfiableMustUse).toEqual(['ing-pork-belly', 'ing-egg']);
    // 归类透传：ing-pork-belly ∈ 宽集（器具齐全超时菜单）-> TIME_BUDGET；ing-egg 不在库中 -> NO_DISH
    expect(result.unsatisfiableMustUseReasons).toEqual({
      'ing-pork-belly': 'TIME_BUDGET',
      'ing-egg': 'NO_DISH',
    });
    // filtered 顺序不变：超时 trace（menu-lawei）先于必消未消耗 trace（menu-plain-rice）
    expect(result.filtered.map((f) => f.menuId)).toEqual(['menu-lawei', 'menu-plain-rice']);
  });
});
