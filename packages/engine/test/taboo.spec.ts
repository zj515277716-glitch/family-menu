// packages/engine/test/taboo.spec.ts
// 禁忌测试集（4.3，M2 发布门槛：禁忌集 100% 阻断）
// fixtures：每条 HARD 规则 × 库内每套含该成分的菜单 = 一条必须被过滤的用例
// 变形用例：别名（番茄/西红柿）、隐含成分（腊味合蒸含腊肉）、可选食材含禁忌
// 断言：filtered 包含之且 candidates（passed）不含之
import { describe, it, expect } from 'vitest';
import { safetyFilter, recommend } from '../src/index.js';
import * as F from './fixtures/index.js';

describe('safetyFilter 禁忌测试集（4.3 M2 发布门槛）', () => {
  // ───── 基础用例：HARD 食材禁忌 × 含该成分菜单 ─────

  it('HARD 番茄禁忌过滤含番茄的菜单（基础用例）', () => {
    const { passed, filtered } = safetyFilter(
      [F.MENU_TOMATO_EGG, F.MENU_PLAIN_RICE],
      [F.EXCLUSION_HARD_TOMATO],
    );
    expect(filtered.map((f) => f.menuId)).toContain('menu-tomato-egg');
    expect(passed.map((m) => m.id)).not.toContain('menu-tomato-egg');
    expect(passed.map((m) => m.id)).toContain('menu-plain-rice');
  });

  it('HARD 腊肉禁忌过滤含腊肉的菜单（基础用例）', () => {
    const { passed, filtered } = safetyFilter(
      [F.MENU_LAWEI, F.MENU_PLAIN_RICE],
      [F.EXCLUSION_HARD_PORK_BELLY],
    );
    expect(filtered.map((f) => f.menuId)).toContain('menu-lawei');
    expect(passed.map((m) => m.id)).not.toContain('menu-lawei');
  });

  it('HARD 辣椒禁忌过滤含辣椒(非optional)的菜单（基础用例）', () => {
    const { passed, filtered } = safetyFilter(
      [F.MENU_MAPOTOFU, F.MENU_PLAIN_RICE],
      [F.EXCLUSION_HARD_CHILI],
    );
    expect(filtered.map((f) => f.menuId)).toContain('menu-mapotofu');
    expect(passed.map((m) => m.id)).not.toContain('menu-mapotofu');
  });

  // ───── 变形用例 1：别名（番茄/西红柿） ─────

  it('变形-别名：HARD 番茄禁忌过滤含"西红柿"(不同id,别名重叠)的菜单', () => {
    const { passed, filtered } = safetyFilter(
      [F.MENU_XIHONGSHI, F.MENU_PLAIN_RICE],
      [F.EXCLUSION_HARD_TOMATO],
    );
    expect(filtered.map((f) => f.menuId)).toContain('menu-xihongshi');
    expect(passed.map((m) => m.id)).not.toContain('menu-xihongshi');
  });

  // ───── 变形用例 2：隐含成分（腊味合蒸含腊肉） ─────

  it('变形-隐含成分：HARD 腊肉禁忌过滤"腊味合蒸"（菜名不含腊肉但食材含腊肉）', () => {
    const { passed, filtered } = safetyFilter(
      [F.MENU_LAWEI, F.MENU_PLAIN_RICE],
      [F.EXCLUSION_HARD_PORK_BELLY],
    );
    expect(filtered.map((f) => f.menuId)).toContain('menu-lawei');
    const trace = filtered.find((f) => f.menuId === 'menu-lawei')!;
    expect(trace.rule).toContain('腊肉');
    expect(passed.map((m) => m.id)).not.toContain('menu-lawei');
  });

  // ───── 变形用例 3：可选食材含禁忌 ─────

  it('变形-可选食材：HARD 辣椒禁忌过滤含辣椒(optional=true)的菜单', () => {
    const { passed, filtered } = safetyFilter(
      [F.MENU_FISH, F.MENU_PLAIN_RICE],
      [F.EXCLUSION_HARD_CHILI],
    );
    expect(filtered.map((f) => f.menuId)).toContain('menu-fish');
    expect(passed.map((m) => m.id)).not.toContain('menu-fish');
  });

  // ───── HARD TAG 禁忌 ─────

  it('HARD TAG 内脏禁忌过滤 flavorTags 含"内脏"的菜单', () => {
    const { passed, filtered } = safetyFilter(
      [F.MENU_OFFAL, F.MENU_PLAIN_RICE],
      [F.EXCLUSION_HARD_OFFAL_TAG],
    );
    expect(filtered.map((f) => f.menuId)).toContain('menu-offal');
    expect(passed.map((m) => m.id)).not.toContain('menu-offal');
  });

  it('HARD TAG 禁忌按食材 category 过滤（非 flavorTags）', () => {
    const { passed, filtered } = safetyFilter(
      [F.MENU_FISH, F.MENU_PLAIN_RICE],
      [
        {
          id: 'ex-hard-fish-tag',
          scope: 'TAG',
          targetTag: '水产',
          severity: 'HARD',
        },
      ],
    );
    // MENU_FISH 含鱼(category=水产)，flavorTags=['清淡']不含'水产' -> 按食材品类过滤
    expect(filtered.map((f) => f.menuId)).toContain('menu-fish');
    expect(passed.map((m) => m.id)).toContain('menu-plain-rice');
  });

  it('HARD TAG 禁忌无 targetTag 时跳过（不过滤）', () => {
    const { passed, filtered } = safetyFilter(
      [F.MENU_PLAIN_RICE],
      [{ id: 'ex-hard-tag-no-tag', scope: 'TAG', severity: 'HARD' }],
    );
    expect(filtered).toHaveLength(0);
    expect(passed).toHaveLength(1);
  });

  // ───── HARD DISH 禁忌 ─────

  it('HARD DISH 禁忌过滤含目标菜品的菜单', () => {
    const { passed, filtered } = safetyFilter(
      [F.MENU_MAPOTOFU, F.MENU_PLAIN_RICE],
      [F.EXCLUSION_HARD_DISH],
    );
    expect(filtered.map((f) => f.menuId)).toContain('menu-mapotofu');
    expect(passed.map((m) => m.id)).not.toContain('menu-mapotofu');
  });

  it('HARD DISH 禁忌无 targetId 时跳过（不过滤）', () => {
    const { passed, filtered } = safetyFilter(
      [F.MENU_PLAIN_RICE],
      [{ id: 'ex-hard-dish-no-id', scope: 'DISH', severity: 'HARD' }],
    );
    expect(filtered).toHaveLength(0);
    expect(passed).toHaveLength(1);
  });

  // ───── 成分未确认 ─────

  it('存在 HARD 食材禁忌时，成分未确认的菜单被保守过滤', () => {
    const { passed, filtered } = safetyFilter(
      [F.MENU_UNKNOWN, F.MENU_PLAIN_RICE],
      [F.EXCLUSION_HARD_TOMATO],
    );
    expect(filtered.map((f) => f.menuId)).toContain('menu-unknown');
    expect(passed.map((m) => m.id)).not.toContain('menu-unknown');
  });

  it('无 HARD 食材禁忌时，成分未确认的菜单不被过滤', () => {
    const { passed, filtered } = safetyFilter(
      [F.MENU_UNKNOWN, F.MENU_PLAIN_RICE],
      [F.EXCLUSION_HARD_OFFAL_TAG],
    );
    expect(filtered.map((f) => f.menuId)).not.toContain('menu-unknown');
    expect(passed.map((m) => m.id)).toContain('menu-unknown');
  });

  // ───── SOFT 禁忌不过滤 ─────

  it('SOFT 禁忌不过滤菜单（仅降权，不阻断）', () => {
    const { passed, filtered } = safetyFilter(
      [F.MENU_MAPOTOFU, F.MENU_PLAIN_RICE],
      [F.EXCLUSION_SOFT_CHILI],
    );
    expect(filtered).toHaveLength(0);
    expect(passed.map((m) => m.id)).toContain('menu-mapotofu');
  });

  // ───── FilterTrace 正确性 ─────

  it('FilterTrace 含正确的 stage=safety 和 rule 描述', () => {
    const { filtered } = safetyFilter(
      [F.MENU_TOMATO_EGG],
      [F.EXCLUSION_HARD_TOMATO],
    );
    expect(filtered).toHaveLength(1);
    expect(filtered[0].stage).toBe('safety');
    expect(filtered[0].rule).toContain('HARD');
    expect(filtered[0].rule).toContain('番茄');
  });
});

describe('recommend 集成禁忌测试（全量 HARD × 全库，100% 阻断）', () => {
  it('所有含 HARD 禁忌成分的菜单在 filtered 中，candidates 不含', () => {
    const result = recommend({
      rules: F.FAMILY_RULE,
      exclusions: F.ALL_HARD_EXCLUSIONS,
      context: F.CONTEXT_60MIN,
      library: F.FULL_LIBRARY,
      history: [],
    });

    const filteredIds = new Set(result.filtered.map((f) => f.menuId));
    const candidateIds = new Set(result.candidates.map((c) => c.menuId));

    // 应被过滤的菜单（每条对应至少一条 HARD 规则）
    const expectedFiltered = [
      'menu-tomato-egg', // 番茄
      'menu-xihongshi', // 西红柿（别名变形）
      'menu-lawei', // 腊肉（隐含成分变形）
      'menu-fish', // 辣椒 optional（可选食材变形）
      'menu-mapotofu', // 辣椒 + DISH 禁忌
      'menu-offal', // 内脏 TAG
      'menu-unknown', // 成分未确认
    ];

    for (const id of expectedFiltered) {
      expect(filteredIds.has(id)).toBe(true);
      expect(candidateIds.has(id)).toBe(false);
    }

    // 安全菜单应在 candidates 中
    expect(candidateIds.has('menu-plain-rice')).toBe(true);
  });

  it('禁忌集 100% 阻断（M2 里程碑）：逐条 HARD 规则 × 含成分菜单', () => {
    const cases: Array<{ name: string; menuId: string; exclusions: typeof F.ALL_HARD_EXCLUSIONS }> = [
      { name: '番茄', menuId: 'menu-tomato-egg', exclusions: [F.EXCLUSION_HARD_TOMATO] },
      { name: '番茄别名(西红柿)', menuId: 'menu-xihongshi', exclusions: [F.EXCLUSION_HARD_TOMATO] },
      { name: '腊肉(隐含)', menuId: 'menu-lawei', exclusions: [F.EXCLUSION_HARD_PORK_BELLY] },
      { name: '辣椒(可选)', menuId: 'menu-fish', exclusions: [F.EXCLUSION_HARD_CHILI] },
      { name: '辣椒(非可选)', menuId: 'menu-mapotofu', exclusions: [F.EXCLUSION_HARD_CHILI] },
      { name: '内脏TAG', menuId: 'menu-offal', exclusions: [F.EXCLUSION_HARD_OFFAL_TAG] },
      { name: '菜品DISH', menuId: 'menu-mapotofu', exclusions: [F.EXCLUSION_HARD_DISH] },
      { name: '成分未确认', menuId: 'menu-unknown', exclusions: [F.EXCLUSION_HARD_TOMATO] },
    ];

    for (const { menuId, exclusions } of cases) {
      const menu = F.FULL_LIBRARY.find((m) => m.id === menuId)!;
      const { passed, filtered } = safetyFilter([menu], exclusions);
      expect(filtered.map((f) => f.menuId)).toContain(menuId);
      expect(passed.map((m) => m.id)).not.toContain(menuId);
    }
  });

  it('安全层永远先于评分：HARD 过滤的菜单不进入 candidates', () => {
    const result = recommend({
      rules: F.FAMILY_RULE,
      exclusions: [F.EXCLUSION_HARD_TOMATO],
      context: F.CONTEXT_60MIN,
      library: [F.MENU_TOMATO_EGG, F.MENU_PLAIN_RICE],
      history: [],
    });
    // menu-tomato-egg 被 safety 过滤，不会进入 candidates
    expect(result.candidates.map((c) => c.menuId)).not.toContain('menu-tomato-egg');
    expect(result.filtered.find((f) => f.menuId === 'menu-tomato-egg')?.stage).toBe('safety');
  });
});
