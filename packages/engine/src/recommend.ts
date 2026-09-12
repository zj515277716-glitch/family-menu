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

  // 按分数降序（无随机性，同分按 menuId 字典序保证稳定）
  scored.sort((a, b) => b.score - a.score || a.menuId.localeCompare(b.menuId));

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
