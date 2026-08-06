// packages/engine - 推荐引擎（纯函数零 IO/零 LLM/零数据库依赖）
// 统一导出 recommend 主函数 + 所有公开类型（4.2 铁律）
export const PACKAGE_NAME = '@family-menu/engine';

export { recommend } from './recommend.js';
export { safetyFilter, type SafetyFilterResult } from './safety.js';
export {
  feasibilityFilter,
  type FeasibilityFilterResult,
  type FeasibilityWarning,
} from './feasibility.js';
export { score, SCORE_WEIGHTS } from './score.js';
export { diversify } from './diversify.js';

export type {
  ScoreDim,
  TonightContext,
  FamilyRuleView,
  ExclusionView,
  DishIngredientView,
  DishView,
  MenuView,
  EventView,
  RecommendInput,
  ScoredMenu,
  FilterTrace,
  RecommendResult,
} from './types.js';
