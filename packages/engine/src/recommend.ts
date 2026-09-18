// packages/engine/src/recommend.ts
// 推荐主函数：串联四层管道（safety -> feasibility -> score -> diversify），
// 输出 {candidates, filtered, unsatisfiableMustUse, unsatisfiableMustUseReasons}
// unsatisfiableMustUseReasons（T-P10/PD-017）：空手原因分类，key=ingredientId（与 unsatisfiableMustUse 同键集），
//   value='TIME_BUDGET'（菜库存在器具齐全、含该食材的菜单，只是当次时长排不下）
//        | 'NO_DISH'（菜库经安全/器具过滤后暂时没有能用到该食材的菜单）；
//   unsatisfiableMustUse 非空（注定空手）时必非空；正常推荐时为空对象（键集为空）。
import type { FilterTrace, RecommendInput, RecommendResult, ScoredMenu } from './types.js';
import { safetyFilter } from './safety.js';
import { feasibilityFilter } from './feasibility.js';
import { score } from './score.js';
import { diversify } from './diversify.js';

/**
 * 缺槽罚分系数（T-P17/AC1，写死常量）：
 * 1 条缺槽 ≈ 满分差的 10%，足以让完整套在排序上反超时长占优的缺槽短套；
 * 两套短缺数相同则罚分相互抵消，回到原 score 序。
 * 仅影响排序键，不改 ScoredMenu.score / breakdown 展示值。
 */
export const SHORTAGE_PENALTY = 0.1;

/**
 * 推荐主函数，对齐 4.2 recommend 签名。
 * 串联：safetyFilter -> feasibilityFilter -> score -> sort -> diversify
 * 安全层永远先于评分，不可被任何权重覆盖。
 */
export function recommend(input: RecommendInput): RecommendResult {
  // 第一层：安全过滤（HARD 禁忌 + 成分未确认）
  const safetyResult = safetyFilter(input.library, input.exclusions);

  // 第二层：可行性过滤（时长/器具/mustUse 硬过滤，PD-001）
  const feasibilityResult = feasibilityFilter(
    safetyResult.passed,
    input.context,
    input.rules,
  );

  // 合并 filtered（safety + feasibility）
  const filtered: FilterTrace[] = [
    ...safetyResult.filtered,
    ...feasibilityResult.filtered,
  ];

  // 第三层：评分
  const scored: ScoredMenu[] = feasibilityResult.passed.map((menu) =>
    score(menu, input),
  );

  // 按分数降序（无随机性，同分按 menuId 字典序保证稳定）。
  // T-P17/AC1：排序键叠加缺槽罚分 score - SHORTAGE_PENALTY × 缺槽计数——
  // 完整套（0 缺槽）在完整可行套存在时反超缺槽短套；不传 menuShortageCounts
  // （老调用方）时罚分恒为 0，与基线逐位一致。score/breakdown 展示值不动。
  const shortageCounts = input.menuShortageCounts;
  const rankValue = (sm: ScoredMenu): number =>
    sm.score - SHORTAGE_PENALTY * (shortageCounts?.[sm.menuId] ?? 0);
  scored.sort((a, b) => rankValue(b) - rankValue(a) || a.menuId.localeCompare(b.menuId));

  // 第四层：多样化（取 Top-N 后错开主蛋白/风格，输出 3 套）
  const candidates = diversify(scored, input.library);

  // 不足 3 套时如实返回并说明
  if (candidates.length < 3) {
    for (const c of candidates) {
      c.reasons.push(`候选不足3套（当前${candidates.length}套）`);
    }
  }

  return {
    candidates,
    filtered,
    unsatisfiableMustUse: feasibilityResult.unsatisfiable,
    unsatisfiableMustUseReasons: feasibilityResult.unsatisfiableReasons,
  };
}
