// packages/engine/src/types.ts
// 推荐引擎核心接口，对齐实施方案 4.2 核心接口签名
// View 类型从 shared v0.1 DB 实体 join 投影（engine 零 IO，输入输出全是内存对象）
import type {
  ContentStatus,
  DishStep,
  EventType,
  ExclusionScope,
  MealRole,
  MenuScene,
  PrepSequenceItem,
  Severity,
} from '@family-menu/shared';

/**
 * 评分维度（6 个，权重见 score.ts 的 SCORE_WEIGHTS）。
 * 对齐 4.1：0.35 历史接受度 + 0.20 时长难度匹配 + 0.15 食材复用
 *          + 0.10 偏好覆盖 + 0.10 近期多样性 + 0.10 膳食类别多样性
 */
export type ScoreDim =
  | 'historyAcceptance'
  | 'timeDifficulty'
  | 'ingredientReuse'
  | 'preferenceCoverage'
  | 'recentDiversity'
  | 'categoryDiversity';

/** 今晚情境，对齐 4.2 TonightContext */
export interface TonightContext {
  people: number;
  timeBudgetMin: 15 | 30 | 60;
  mustUseIngredients: string[]; // ingredientId，最多 3 个
}

/** 家庭规则视图（从 FamilyRule 映射） */
export interface FamilyRuleView {
  familyId: string;
  defaultPeople: number;
  timeBudgets: number[];
  equipment: string[];
  cuisines: string[];
}

/**
 * 禁忌视图（从 ExclusionRule 映射，scope=INGREDIENT 时 join Ingredient）。
 * targetName/targetAliases 用于别名归一匹配（番茄/西红柿），安全层与评分层共用。
 */
export interface ExclusionView {
  id: string;
  scope: ExclusionScope;
  targetId?: string;
  targetTag?: string;
  severity: Severity;
  note?: string;
  targetName?: string;
  targetAliases?: string[];
}

/** 菜品食材视图（DishIngredient join Ingredient） */
export interface DishIngredientView {
  ingredientId: string;
  ingredientName: string;
  aliases: string[];
  category: string;
  defaultUnit: string;
  qty: number;
  unit: string;
  optional: boolean;
}

/** 菜品视图（从 Dish 映射 + 关联食材） */
export interface DishView {
  id: string;
  name: string;
  mealRole: MealRole;
  cuisine?: string;
  flavorTags: string[];
  spicyLevel: number;
  splitFlavor: boolean;
  activeMinutes: number;
  totalMinutes: number;
  equipment: string[];
  steps: DishStep[];
  status: ContentStatus;
  ingredients: DishIngredientView[];
}

/** 菜单视图（从 Menu 映射 + 关联菜品，输入仅 status=PUBLISHED） */
export interface MenuView {
  id: string;
  name: string;
  scene: MenuScene;
  serves: number;
  totalActiveMinutes: number;
  prepSequence: PrepSequenceItem[];
  status: ContentStatus;
  dishes: DishView[];
}

/** 行为事件视图（从 Event 映射，menuId/dishId/cookedResult 为 join 后字段） */
export interface EventView {
  id: string;
  type: EventType;
  menuId?: string;
  dishId?: string;
  createdAt: Date;
  cookedResult?: 'success' | 'partial' | 'fail';
  willRepeat?: boolean;
}

/** 推荐输入，对齐 4.2 RecommendInput */
export interface RecommendInput {
  rules: FamilyRuleView;
  exclusions: ExclusionView[];
  context: TonightContext;
  library: MenuView[]; // 仅 status=PUBLISHED
  history: EventView[]; // 近 30 天
}

/** 评分结果，对齐 4.2 ScoredMenu */
export interface ScoredMenu {
  menuId: string;
  score: number;
  reasons: string[];
  breakdown: Record<ScoreDim, number>;
}

/** 过滤追踪（可解释性），对齐 4.2 FilterTrace */
export interface FilterTrace {
  menuId: string;
  stage: 'safety' | 'feasibility';
  rule: string;
}

/** recommend 返回类型，对齐 4.2 */
export interface RecommendResult {
  candidates: ScoredMenu[]; // 恰好 3 套（不足时如实返回并说明）
  filtered: FilterTrace[];
}
