// packages/engine - 推荐引擎（纯函数零 IO/零 LLM/零数据库依赖）
// 统一导出 recommend 主函数 + planDay 三餐联合规划主入口 + 所有公开类型（4.2 铁律）
export const PACKAGE_NAME = '@family-menu/engine';

export { recommend, planDay, SHORTAGE_PENALTY } from './recommend.js';
export {
  replanMeal,
  replanAllMeals,
  swapCandidatesForSlot,
  type ReplanMealResult,
} from './day-plan.js';
export {
  safetyFilter,
  filterSafeDishes,
  filterChildSafeDishes,
  tempAvoidanceToExclusions,
  relabelTempExclusionRule,
  isTempExclusionId,
  TEMP_EXCLUSION_ID_PREFIX,
  CHILD_MAX_SPICY_LEVEL,
  CHILD_AVOID_FLAVOR_TAGS,
  type SafetyFilterResult,
  type DishSafetyResult,
  type ChildSafeResult,
} from './safety.js';
export { feasibilityFilter, type FeasibilityFilterResult } from './feasibility.js';
export { filterSwapCandidates, type SwapCandidateInput, type SwapCandidateResult } from './swap-candidates.js';
export {
  score,
  SCORE_WEIGHTS,
  COOKING_METHOD_BY_EQUIPMENT,
  dishProteinIds,
  dishCookingMethods,
  dishMainIngredientId,
  crossMealClashes,
  crossMealClashCount,
  type CrossMealClashes,
} from './score.js';
export { diversify } from './diversify.js';
export {
  composeMenusByRole,
  mainSlotCount,
  breakfastDishCount,
  inferMealTypes,
  isBreakfastDish,
  poolForSlot,
  stableContentHash,
  buildPrepSequence,
  BREAKFAST_INGREDIENT_CATEGORIES,
  BREAKFAST_NAME_KEYWORDS,
  type ComposeInput,
  type CompositionResult,
} from './composition.js';

export type {
  ScoreDim,
  TonightContext,
  MealSlot,
  TempAvoidanceView,
  DayPlanContext,
  DayPlanInput,
  MealPlanView,
  MustUseAllocation,
  DesiredDishNote,
  MealFailureKind,
  MealFailure,
  DayPlanResult,
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
  MustUseUnmetReason,
} from './types.js';
export { MEAL_SLOTS, MEAL_SLOT_LABELS } from './types.js';
