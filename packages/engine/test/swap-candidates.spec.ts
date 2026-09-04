// packages/engine/test/swap-candidates.spec.ts
// 换菜候选过滤单测（TP-03/DEC-013）：五层过滤 + mustUse 联动 + 排序确定性
// 复用禁忌测试集 fixtures（铁律 8：触碰引擎必跑 taboo 100%）
import { describe, it, expect } from 'vitest';
import { filterSwapCandidates, type SwapCandidateInput } from '../src/index.js';
import * as F from './fixtures/index.js';

// 场景：今晚菜单 = 麻婆豆腐 + 白米饭；把麻婆豆腐换掉，候选池为同角色 MAIN 的 PUBLISHED 菜
const OUTGOING = F.DISH_MAPOTOFU;
const REMAINING = [F.DISH_PLAIN_RICE];

function baseInput(overrides: Partial<SwapCandidateInput> = {}): SwapCandidateInput {
  return {
    outgoingDish: OUTGOING,
    remainingDishes: REMAINING,
    candidates: [F.DISH_TOMATO_EGG, F.DISH_STEAMED_FISH, F.DISH_LAWEI_HEZHENG],
    mustUseIngredientIds: [],
    timeBudgetMin: 30,
    availableEquipment: ['wok', 'rice_cooker', 'steamer'],
    exclusions: [],
    ...overrides,
  };
}

describe('filterSwapCandidates 换菜候选过滤（TP-03/DEC-013）', () => {
  it('无禁忌全通过，按 activeMinutes 升序排序', () => {
    // 清蒸鱼 10min / 番茄炒蛋 15min / 腊味合蒸 20min（入参顺序故意乱序）
    const { passed, filtered } = filterSwapCandidates(baseInput());
    expect(filtered).toHaveLength(0);
    expect(passed.map((d) => d.name)).toEqual(['清蒸鱼', '番茄炒蛋', '腊味合蒸']);
  });

  it('同分（activeMinutes 相等）按 name 字典序排序（确定性）', () => {
    // 番茄炒蛋 15min、爆炒猪肝 15min -> 拼音 bào < fān，爆炒猪肝在前
    const { passed } = filterSwapCandidates(
      baseInput({ candidates: [F.DISH_TOMATO_EGG, F.DISH_OFFAL] }),
    );
    expect(passed.map((d) => d.name)).toEqual(['爆炒猪肝', '番茄炒蛋']);
  });

  it('第 1 层：HARD 食材禁忌候选被滤（复用 safetyFilter 文案）', () => {
    const { passed, filtered } = filterSwapCandidates(
      baseInput({ candidates: [F.DISH_TOMATO_EGG, F.DISH_STEAMED_FISH], exclusions: [F.EXCLUSION_HARD_TOMATO] }),
    );
    expect(passed.map((d) => d.id)).toEqual([F.DISH_STEAMED_FISH.id]);
    const trace = filtered.find((f) => f.menuId === F.DISH_TOMATO_EGG.id)!;
    expect(trace.stage).toBe('safety');
    expect(trace.rule).toContain('番茄');
  });

  it('第 1 层：成分未确认候选被保守过滤（存在 HARD 食材禁忌时）', () => {
    const { passed, filtered } = filterSwapCandidates(
      baseInput({ candidates: [F.DISH_UNKNOWN], exclusions: [F.EXCLUSION_HARD_TOMATO] }),
    );
    expect(passed).toHaveLength(0);
    expect(filtered[0]!.rule).toContain('成分未确认');
  });

  it('第 1 层：SOFT 禁忌不拦换菜候选（安全层只看 HARD）', () => {
    const { passed, filtered } = filterSwapCandidates(
      baseInput({ outgoingDish: F.DISH_TOMATO_EGG, candidates: [F.DISH_MAPOTOFU], exclusions: [F.EXCLUSION_SOFT_CHILI] }),
    );
    expect(filtered).toHaveLength(0);
    expect(passed.map((d) => d.id)).toContain(F.DISH_MAPOTOFU.id);
  });

  it('第 2 层：器具不满足被滤（steamer 不在家庭器具中）', () => {
    const { passed, filtered } = filterSwapCandidates(
      baseInput({ availableEquipment: ['wok'], candidates: [F.DISH_LAWEI_HEZHENG] }),
    );
    expect(passed).toHaveLength(0);
    expect(filtered[0]!.rule).toContain('缺少器具');
    expect(filtered[0]!.rule).toContain('steamer');
  });

  it('第 3 层：单菜工时超预算被滤（dish 级 activeMinutes）', () => {
    const { passed, filtered } = filterSwapCandidates(
      baseInput({ timeBudgetMin: 15, candidates: [F.DISH_LAWEI_HEZHENG] }), // 腊味合蒸 20min > 15min
    );
    expect(passed).toHaveLength(0);
    expect(filtered[0]!.rule).toContain('超出预算15分钟');
  });

  it('第 4 层正例：候选接住全部 orphaned 必消食材则通过', () => {
    // 必消番茄：白米饭接不住 -> orphaned=[ing-tomato] -> 番茄炒蛋（含番茄）通过
    const { passed, filtered } = filterSwapCandidates(
      baseInput({ mustUseIngredientIds: ['ing-tomato'], candidates: [F.DISH_TOMATO_EGG] }),
    );
    expect(filtered).toHaveLength(0);
    expect(passed.map((d) => d.id)).toContain(F.DISH_TOMATO_EGG.id);
  });

  it('第 4 层反例：候选接不住 orphaned 必消食材被滤（PD-001 不因换菜被击穿）', () => {
    const { passed, filtered } = filterSwapCandidates(
      baseInput({ mustUseIngredientIds: ['ing-tomato'], candidates: [F.DISH_STEAMED_FISH, F.DISH_TOMATO_EGG] }),
    );
    expect(passed.map((d) => d.id)).toEqual([F.DISH_TOMATO_EGG.id]);
    const trace = filtered.find((f) => f.menuId === F.DISH_STEAMED_FISH.id)!;
    expect(trace.stage).toBe('feasibility');
    expect(trace.rule).toContain('未能接住必消食材');
  });

  it('第 4 层例外：orphaned 为空时不约束候选（必消已被换后其他菜接住）', () => {
    // 必消大米已被白米饭（remaining）消耗 -> orphaned=[] -> 任何安全候选都可通过
    const { passed, filtered } = filterSwapCandidates(
      baseInput({ mustUseIngredientIds: ['ing-rice'], candidates: [F.DISH_STEAMED_FISH] }),
    );
    expect(filtered).toHaveLength(0);
    expect(passed.map((d) => d.id)).toContain(F.DISH_STEAMED_FISH.id);
  });

  it('第 5 层：候选已在今晚菜单中（含被换下的菜自身）被滤', () => {
    const { passed, filtered } = filterSwapCandidates(
      baseInput({ candidates: [F.DISH_MAPOTOFU, F.DISH_PLAIN_RICE] }), // 换给自己 + 换成同菜单已有的白米饭
    );
    expect(passed).toHaveLength(0);
    expect(filtered).toHaveLength(2);
    for (const trace of filtered) {
      expect(trace.rule).toContain('已在今晚菜单中');
    }
  });

  it('空候选池：如实返回空通过集（200+空数组的前置，非错误）', () => {
    const { passed, filtered } = filterSwapCandidates(baseInput({ candidates: [] }));
    expect(passed).toHaveLength(0);
    expect(filtered).toHaveLength(0);
  });

  it('综合场景：五层过滤叠加，各候选死因互不干扰', () => {
    // 番茄炒蛋触禁忌 / 清蒸鱼接不住 orphaned 番茄 / 腊味合蒸超预算 -> 只剩通过者
    const { passed, filtered } = filterSwapCandidates(
      baseInput({
        candidates: [F.DISH_TOMATO_EGG, F.DISH_STEAMED_FISH, F.DISH_LAWEI_HEZHENG],
        mustUseIngredientIds: ['ing-tomato'],
        timeBudgetMin: 15,
        exclusions: [F.EXCLUSION_HARD_TOMATO],
      }),
    );
    expect(passed).toHaveLength(0);
    expect(filtered.map((f) => f.menuId)).toEqual([
      F.DISH_TOMATO_EGG.id, // safety：番茄禁忌
      F.DISH_STEAMED_FISH.id, // feasibility：接不住 orphaned
      F.DISH_LAWEI_HEZHENG.id, // feasibility：20min > 15min
    ]);
  });
});
