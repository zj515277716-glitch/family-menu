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

// ───── 一日三餐联合规划（PD-020） ─────

/** 餐型：早/中/晚三正餐（早餐外饮品加餐零食本版不做，确认书 §五） */
export type MealSlot = 'breakfast' | 'lunch' | 'dinner';

/** 餐型规范顺序（全天计划、分配落位、组合枚举一律按此序，保确定性） */
export const MEAL_SLOTS: readonly MealSlot[] = ['breakfast', 'lunch', 'dinner'];

/** 餐型中文标签（设计规则 3：枚举一律中文） */
export const MEAL_SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: '早餐',
  lunch: '中餐',
  dinner: '晚餐',
};

/**
 * 临时忌口（PD-020 ③，当日生效：如生病不吃牛肉/虾）。
 * 与长期硬禁忌分层：过滤效力同 HARD，但 FilterTrace 独立标注「临时忌口」。
 */
export interface TempAvoidanceView {
  ingredientId?: string;
  ingredientName?: string;
  aliases?: string[];
}

/**
 * 日计划上下文（PD-020）：TonightContext 的三餐扩展。
 * TonightContext 保留不动（apps/api 现行调用兼容），三餐规划一律走本类型。
 */
export interface DayPlanContext {
  /** 成人数 */
  adults: number;
  /** 儿童数；>0 触发儿童餐约束（避辣/避刺多/避过硬，确认书 §四） */
  children: number;
  /** 常做时长档，按餐应用（每餐总工时 ≤ 档位） */
  timeBudgetMin: 15 | 30 | 60;
  /** 必消食材 ingredientId（PD-001 硬要求，可跨餐分配，全天必须全部用上） */
  mustUseIngredients: string[];
  /** 临时忌口（当日生效，与长期 HARD 同效但独立标注） */
  tempAvoidances?: TempAvoidanceView[];
  /** 想吃的菜 dishId（选填；与忌口/必消冲突时如实标注未排入，不硬凑） */
  desiredDishIds?: string[];
  /** 餐次勾选（早/中/晚任选；缺省=三餐全选） */
  meals?: MealSlot[];
  /** 已吃菜避开窗口天数（默认 7；菜品级聚合沿用 A3 降权口径） */
  avoidRecentDays?: number;
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
  /**
   * 适用餐型（PD-020 餐型维度，可选）。缺省时由 composition.inferMealTypes
   * 按既有字段确定性推断（粥/饼/蛋/豆制品类轻食进早餐池），兼容现数据。
   */
  mealTypes?: MealSlot[];
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

/**
 * 行为事件视图（从 Event 映射，menuId/dishId/cookedResult 为 join 后字段）。
 * T-A3 菜级聚合：API 层把 COOKED/LOCK/SWAP_MENU 事件按当时锁定/选定菜单的菜品
 * 逐菜展开（id=`${eventId}:${dishId}`）并携带 dishRole；score 的口碑与多样性
 * 维度按 dishId/dishRole 聚合，不再按 menuId 字面匹配（消除跨组合错配）。
 * 无菜品信息的事件（含旧格式 menuId-only 数据）原样透传，菜级维度自然不命中。
 */
export interface EventView {
  id: string;
  type: EventType;
  menuId?: string;
  dishId?: string;
  createdAt: Date;
  cookedResult?: 'success' | 'partial' | 'fail';
  willRepeat?: boolean;
  /** 菜级展开时携带的菜品角色（近期类别多样性按菜聚合用），展开事件必带 */
  dishRole?: MealRole;
}

/** 推荐输入，对齐 4.2 RecommendInput */
export interface RecommendInput {
  rules: FamilyRuleView;
  exclusions: ExclusionView[];
  context: TonightContext;
  library: MenuView[]; // 仅 status=PUBLISHED
  history: EventView[]; // 近 30 天
  /**
   * 缺槽计数侧车（T-P17/AC1，engine 内部扩展，不改 shared 契约）：
   * menuId -> 该虚拟菜单的缺槽说明条数（来自组合层 slotShortages）。
   * 仅参与排序罚分（score - SHORTAGE_PENALTY × 计数，SHORTAGE_PENALTY=0.1），
   * 不改变 score/breakdown 展示值；不传（老调用方）时罚分恒为 0，行为与基线逐位一致。
   */
  menuShortageCounts?: Record<string, number>;
  /**
   * 已吃菜避开窗口天数（PD-020，默认 7）。仅影响近期多样性维度的降权窗口，
   * 不传（老调用方）时恒为 7 天，行为与基线逐位一致。
   */
  recentWindowDays?: number;
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

/**
 * 必消空手原因分类（T-P10 / PD-017 修订）：
 * - TIME_BUDGET：菜库存在器具齐全、含该食材的菜单，只是当次时长排不下（出路：换更长时间长）
 * - NO_DISH：菜库（经安全/器具过滤后）暂时没有能用到该食材的菜单
 */
export type MustUseUnmetReason = 'TIME_BUDGET' | 'NO_DISH';

/** recommend 返回类型，对齐 4.2 */
export interface RecommendResult {
  candidates: ScoredMenu[]; // 恰好 3 套（不足时如实返回并说明；必消无法消耗时为空）
  filtered: FilterTrace[];
  /** 没有任何可达菜单能消耗的必消食材（ingredientId）——非空即注定空手（PD-001） */
  unsatisfiableMustUse: string[];
  /** 空手原因分类（T-P10）：与 unsatisfiableMustUse 同键集（key=ingredientId），空手非空时必非空 */
  unsatisfiableMustUseReasons: Record<string, MustUseUnmetReason>;
}

// ───── 一日三餐联合规划结果模型（PD-020） ─────

/** 日计划输入（engine 零 IO，全部由调用方装载） */
export interface DayPlanInput {
  rules: FamilyRuleView;
  /** 长期禁忌（HARD+SOFT）；临时忌口走 context.tempAvoidances，不混入本字段 */
  exclusions: ExclusionView[];
  context: DayPlanContext;
  /** PUBLISHED 菜池（餐型维度从各菜既有字段/可选 mealTypes 判定） */
  dishes: DishView[];
  /** 近 30 天行为事件（菜级展开，A3 口径沿用） */
  history: EventView[];
  /** 换一批（PD-013）：当前全天已用菜不回池，强制重推出不同的一批 */
  excludeDishIds?: string[];
}

/** 单餐计划视图（所选餐次各一套） */
export interface MealPlanView {
  slot: MealSlot;
  /** 内容稳定哈希 id（T-A3 口径：同组合跨批次同 id） */
  menuId: string;
  dishes: DishView[];
  score: number;
  /** 推荐理由 + 缺槽如实标注（PD-018 沿用） */
  reasons: string[];
  /** 该餐过滤轨迹（沿用现有可解释口径） */
  filtered: FilterTrace[];
  totalActiveMinutes: number;
}

/** 必消跨餐分配落位（哪个必消分到了哪餐哪道菜） */
export interface MustUseAllocation {
  ingredientId: string;
  slot: MealSlot;
  dishId: string;
  dishName: string;
}

/** 想吃的菜排入情况（冲突如实标注，不硬凑） */
export interface DesiredDishNote {
  dishId: string;
  dishName: string;
  included: boolean;
  /** 排入时为所在餐次 */
  slot?: MealSlot;
  /** 未排入原因（与忌口/儿童约束冲突、餐型不在所选餐次、未入选等） */
  reason: string;
}

/** 单餐空手归因类型（PD-017 两型 + PD-014 组合口径扩展） */
export type MealFailureKind = 'NO_DISH' | 'TIME_BUDGET' | 'COMBINATION';

/** 单餐空手归因：哪一餐、因为什么出不了、调整出路 */
export interface MealFailure {
  slot: MealSlot;
  kind: MealFailureKind;
  detail: string;
  /** 调整出路（放宽临时忌口/删必消/换想吃的菜/换时长档，按适用性给出） */
  suggestions: string[];
}

/** 日计划结果（同一输入确定性输出） */
export interface DayPlanResult {
  /** 所选餐次各一套（按早/中/晚规范序；空手餐次不在此列，见 failures） */
  meals: MealPlanView[];
  /** 必消跨餐分配落位（全天必消全部用上才可能有 meals，PD-001） */
  mustUseAllocation: MustUseAllocation[];
  /** 想吃的菜排入/未排入说明 */
  desiredNotes: DesiredDishNote[];
  /** 空手按餐归因（无菜型/时间型/组合冲突 + 出路） */
  failures: MealFailure[];
  /** 跨餐约束落位说明（主蛋白/菜系/烹饪方式/主食材是否三餐不撞，含放宽如实标注） */
  crossMealNotes: string[];
  /** 全天过滤轨迹汇总（safety 菜级 + 各餐 feasibility） */
  filtered: FilterTrace[];
}
