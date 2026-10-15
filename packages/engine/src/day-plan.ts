// packages/engine/src/day-plan.ts
// PD-020 一日三餐联合规划主模块：
// - planDay：次日早/中/晚三餐联合规划主入口（餐型维度 + 跨餐约束 + 必消跨餐分配）
// - replanMeal：换一餐（该餐整体重推，其他餐不变且跨餐约束仍成立；失败保持原餐并给原因）
// - replanAllMeals：换一批（全天重推，当前全天菜不回池）
// - swapCandidatesForSlot：换一道（同餐型候选替换，swap-candidates 按餐型过滤）
// 铁律：纯函数零 IO；安全过滤（长期 HARD + 临时忌口 + 儿童约束）永远先于评分；
// 同输入确定性输出（稳定排序/内容哈希沿用 T-A3 口径）。
import type {
  DayPlanInput,
  DayPlanResult,
  DesiredDishNote,
  DishView,
  ExclusionView,
  FilterTrace,
  MealFailure,
  MealFailureKind,
  MealPlanView,
  MealSlot,
  MenuView,
  MustUseAllocation,
  RecommendInput,
  ScoredMenu,
} from './types.js';
import { MEAL_SLOTS, MEAL_SLOT_LABELS } from './types.js';
import {
  filterChildSafeDishes,
  filterSafeDishes,
  relabelTempExclusionRule,
  tempAvoidanceToExclusions,
} from './safety.js';
import {
  breakfastDishCount,
  buildPrepSequence,
  composeMenusByRole,
  inferMealTypes,
  poolForSlot,
  stableContentHash,
} from './composition.js';
import { feasibilityFilter } from './feasibility.js';
import { crossMealClashCount, crossMealClashes, score } from './score.js';
import { SHORTAGE_PENALTY } from './recommend.js';
import {
  filterSwapCandidates,
  type SwapCandidateInput,
  type SwapCandidateResult,
} from './swap-candidates.js';

/** 每餐候选菜单短名单上限（组合枚举规模封顶 12³，纯函数确定性） */
const CANDIDATES_PER_SLOT = 12;
/** 早餐轻食池参与组合的头部菜数（组合数 C(8,K) ≤ 56） */
const BREAKFAST_POOL_CAP = 8;
/** 想吃的菜排入时的组合排序加分（仅影响排序键，不改展示 score） */
const DESIRED_BONUS = 0.1;

// ───── 基础工具 ─────

function menuIngredientIds(menu: MenuView): Set<string> {
  const ids = new Set<string>();
  for (const dish of menu.dishes) {
    for (const ing of dish.ingredients) ids.add(ing.ingredientId);
  }
  return ids;
}

/** 所选餐次按规范序（早/中/晚）返回；缺省三餐全选 */
function canonicalSlots(meals?: MealSlot[]): MealSlot[] {
  const picked = new Set(meals ?? MEAL_SLOTS);
  return MEAL_SLOTS.filter((s) => picked.has(s));
}

function peopleOf(input: DayPlanInput): number {
  return Math.max(1, input.context.adults + input.context.children);
}

/** 确定性取 K 组合（索引升序枚举，同输入同输出） */
function pickCombinations<T>(items: T[], k: number): T[][] {
  const out: T[][] = [];
  const walk = (start: number, acc: T[]): void => {
    if (acc.length === k) {
      out.push([...acc]);
      return;
    }
    for (let i = start; i <= items.length - (k - acc.length); i++) {
      acc.push(items[i]);
      walk(i + 1, acc);
      acc.pop();
    }
  };
  walk(0, []);
  return out;
}

// ───── 第一阶段：安全（长期 HARD + 临时忌口 + 儿童约束） ─────

interface SafetyStage {
  safeDishes: DishView[];
  allExclusions: ExclusionView[];
  tempExclusions: ExclusionView[];
  /** dishId -> 过滤原因（临时忌口已改写为独立标注） */
  excludedReasons: Map<string, string>;
  safetyTraces: FilterTrace[];
}

/**
 * 安全阶段：dish 级过滤（与单餐 recommend 同口径的菜粒度投影）。
 * 顺序：长期 HARD + 临时忌口（合成 HARD，同效）-> 儿童>0 追加避辣/避刺/避硬。
 * 安全层永远先于评分，不可被任何权重覆盖。
 */
function prepareSafetyStage(input: DayPlanInput): SafetyStage {
  const tempExclusions = tempAvoidanceToExclusions(input.context.tempAvoidances ?? []);
  const allExclusions = [...input.exclusions, ...tempExclusions];
  const relabel = (rule: string): string =>
    relabelTempExclusionRule(rule, tempExclusions);

  const safety = filterSafeDishes(input.dishes, allExclusions);
  const excludedReasons = new Map<string, string>();
  const safetyTraces: FilterTrace[] = [];
  for (const { dish, reason } of safety.excluded) {
    const relabeled = relabel(reason);
    excludedReasons.set(dish.id, relabeled);
    safetyTraces.push({ menuId: dish.id, stage: 'safety', rule: relabeled });
  }

  let safeDishes = safety.passed;
  if (input.context.children > 0) {
    const child = filterChildSafeDishes(safeDishes);
    for (const { dish, reason } of child.excluded) {
      excludedReasons.set(dish.id, reason);
      safetyTraces.push({ menuId: dish.id, stage: 'safety', rule: reason });
    }
    safeDishes = child.passed;
  }

  return { safeDishes, allExclusions, tempExclusions, excludedReasons, safetyTraces };
}

// ───── 第二阶段：餐型候选生成 + 可行性 + 评分排序 ─────

interface RankedMenu {
  menu: MenuView;
  scored: ScoredMenu;
  rankValue: number;
  ingredientIds: Set<string>;
}

interface SlotPipeline {
  slot: MealSlot;
  /** 可行性前的全部候选菜单（空手按餐归因用） */
  allMenus: MenuView[];
  /** 可行性通过、已按排序键排序的完整候选名单 */
  ranked: RankedMenu[];
  shortages: Record<string, string[]>;
  traces: FilterTrace[];
}

/** 早餐池头部选取：必消覆盖菜优先入池（不因材 cap 漏掉必消出路），其余按 id 序补足 */
function selectBreakfastCap(available: DishView[], mustUseIds: string[]): DishView[] {
  const sorted = [...available].sort((a, b) => a.id.localeCompare(b.id));
  const mustSet = new Set(mustUseIds);
  const forced = sorted.filter((d) =>
    d.ingredients.some((ing) => mustSet.has(ing.ingredientId)),
  );
  const forcedIds = new Set(forced.map((d) => d.id));
  const rest = sorted.filter((d) => !forcedIds.has(d.id));
  const cap = Math.max(BREAKFAST_POOL_CAP, forced.length);
  return [...forced, ...rest].slice(0, cap);
}

/** 早餐候选：轻食池取 K 道（K=breakfastDishCount）的确定性组合，合成虚拟菜单 */
function buildBreakfastMenus(
  pool: DishView[],
  people: number,
  mustUseIds: string[],
  excludeSet: Set<string>,
): { menus: MenuView[]; shortages: Record<string, string[]> } {
  const available = pool.filter((d) => !excludeSet.has(d.id));
  const capped = selectBreakfastCap(available, mustUseIds);
  const need = breakfastDishCount(people);
  const menus: MenuView[] = [];
  const shortages: Record<string, string[]> = {};

  const synth = (dishes: DishView[]): MenuView => {
    const hash = stableContentHash(dishes.map((d) => d.id));
    return {
      id: `virt-breakfast-${hash}`,
      name: `早餐组合 #${hash.slice(0, 4)}`,
      scene: 'WEEKDAY_FAST',
      serves: people,
      totalActiveMinutes: dishes.reduce((sum, d) => sum + d.activeMinutes, 0),
      prepSequence: buildPrepSequence(dishes),
      status: 'PUBLISHED',
      dishes,
    };
  };

  if (capped.length === 0) return { menus, shortages };
  if (capped.length <= need) {
    const menu = synth(capped);
    menus.push(menu);
    if (capped.length < need) {
      shortages[menu.id] = [
        `早餐轻食池仅${capped.length}道可用，不足${need}道，已如实全部排入`,
      ];
    }
    return { menus, shortages };
  }
  for (const combo of pickCombinations(capped, need)) {
    menus.push(synth(combo));
  }
  return { menus, shortages };
}

/**
 * 单餐管道：餐型池 -> 候选菜单（早餐轻食组合 / 午晚 MealRole 槽位组合）
 * -> 时长档与器具可行性（现有口径按餐应用）-> 6 维评分 -> 排序键排序。
 * mustUse 不在单餐硬过滤（全天跨餐分配由组合选择兜底），仅作评分加分维度。
 */
function runSlotPipeline(
  slot: MealSlot,
  input: DayPlanInput,
  stage: SafetyStage,
  excludeSet: Set<string>,
): SlotPipeline {
  const people = peopleOf(input);
  const { context } = input;
  const pool = poolForSlot(stage.safeDishes, slot);

  let menus: MenuView[];
  let shortages: Record<string, string[]>;
  if (slot === 'breakfast') {
    const built = buildBreakfastMenus(pool, people, context.mustUseIngredients, excludeSet);
    menus = built.menus;
    shortages = built.shortages;
  } else {
    const composed = composeMenusByRole(pool, {
      people,
      exclusions: stage.allExclusions,
      mustUseIngredientIds: [],
      excludeDishIds: [...excludeSet],
    });
    menus = composed.virtualMenus;
    shortages = composed.slotShortages;
  }

  const feasibility = feasibilityFilter(
    menus,
    { people, timeBudgetMin: context.timeBudgetMin, mustUseIngredients: [] },
    input.rules,
  );

  const scoreInput: RecommendInput = {
    rules: input.rules,
    exclusions: stage.allExclusions,
    context: {
      people,
      timeBudgetMin: context.timeBudgetMin,
      mustUseIngredients: context.mustUseIngredients,
    },
    library: [],
    history: input.history,
    recentWindowDays: context.avoidRecentDays ?? 7,
  };

  const ranked: RankedMenu[] = feasibility.passed
    .map((menu) => {
      const scored = score(menu, scoreInput);
      const shortageCount = (shortages[menu.id] ?? []).length;
      return {
        menu,
        scored,
        rankValue: scored.score - SHORTAGE_PENALTY * shortageCount,
        ingredientIds: menuIngredientIds(menu),
      };
    })
    .sort((a, b) => b.rankValue - a.rankValue || a.menu.id.localeCompare(b.menu.id));

  return { slot, allMenus: menus, ranked, shortages, traces: feasibility.filtered };
}

// ───── 第三阶段：跨餐组合选择（必消分配 + 跨餐约束 + 想吃加分） ─────

interface ChosenMeal {
  slot: MealSlot;
  menu: MenuView;
  scored: ScoredMenu;
  shortages: string[];
  traces: FilterTrace[];
}

interface ComboEval {
  coverage: number;
  proteinViolations: number;
  clashViolations: number;
  totalScore: number;
  ids: string;
  acc: RankedMenu[];
}

/** 组合排序键：必消覆盖数降序 -> 主蛋白重复数升序 -> 撞车数升序 -> 总分降序 -> id 字典序 */
function compareCombo(a: ComboEval, b: ComboEval): number {
  return (
    b.coverage - a.coverage ||
    a.proteinViolations - b.proteinViolations ||
    a.clashViolations - b.clashViolations ||
    b.totalScore - a.totalScore ||
    a.ids.localeCompare(b.ids)
  );
}

/**
 * 跨餐组合选择：每个 viable 餐次取一套，使
 * ①必消全天全部用上（PD-001，可跨餐分配，一道菜可用掉多样必消）；
 * ②一天内主蛋白尽量不重复；③菜系/烹饪方式/主食材尽量不撞；
 * ④想吃的菜优先排入（加分不硬凑）；⑤总分最高。
 * 必消凑不齐 -> null（PD-001 硬要求：不伪造可行解，空手按组合冲突归因）。
 */
function chooseDayCombination(
  pipelines: SlotPipeline[],
  mustUseIds: string[],
  desiredDishIds: string[],
): ChosenMeal[] | null {
  const lists = pipelines.map((p) => p.ranked.slice(0, CANDIDATES_PER_SLOT));

  // 必消保险：短名单都没覆盖到的必消，把该餐完整名单里最佳覆盖套补进来
  for (const id of mustUseIds) {
    const covered = lists.some((list) => list.some((c) => c.ingredientIds.has(id)));
    if (covered) continue;
    for (let i = 0; i < pipelines.length; i++) {
      const donor = pipelines[i].ranked.find((c) => c.ingredientIds.has(id));
      if (donor) {
        if (!lists[i].includes(donor)) lists[i] = [...lists[i], donor];
        break;
      }
    }
  }

  const desiredSet = new Set(desiredDishIds);
  let best: ComboEval | null = null;
  const enumerate = (idx: number, acc: RankedMenu[]): void => {
    if (idx === lists.length) {
      const union = new Set<string>();
      let desiredHits = 0;
      for (const c of acc) {
        for (const id of c.ingredientIds) union.add(id);
        for (const d of c.menu.dishes) if (desiredSet.has(d.id)) desiredHits++;
      }
      const clashes = crossMealClashes(acc.map((c) => c.menu.dishes));
      const candidate: ComboEval = {
        coverage: mustUseIds.filter((id) => union.has(id)).length,
        proteinViolations: clashes.proteinRepeats.length,
        clashViolations:
          clashes.cuisineClashes.length +
          clashes.methodClashes.length +
          clashes.mainIngredientClashes.length,
        totalScore:
          acc.reduce((sum, c) => sum + c.scored.score, 0) + DESIRED_BONUS * desiredHits,
        ids: acc.map((c) => c.menu.id).join('|'),
        acc: [...acc],
      };
      if (best === null || compareCombo(candidate, best) < 0) best = candidate;
      return;
    }
    for (const c of lists[idx]) {
      acc.push(c);
      enumerate(idx + 1, acc);
      acc.pop();
    }
  };
  enumerate(0, []);

  if (best === null) return null;
  const fullCoverage = (best as ComboEval).coverage >= mustUseIds.length;
  if (!fullCoverage) return null;

  const chosen = best as ComboEval;
  return pipelines.map((p, i) => ({
    slot: p.slot,
    menu: chosen.acc[i].menu,
    scored: chosen.acc[i].scored,
    shortages: p.shortages[chosen.acc[i].menu.id] ?? [],
    traces: p.traces,
  }));
}

// ───── 空手按餐归因（PD-017 两型 + PD-014 组合冲突） ─────

function buildSuggestions(kind: MealFailureKind, input: DayPlanInput): string[] {
  const { context } = input;
  const out: string[] = [];
  if (kind === 'TIME_BUDGET') out.push('换更长的时长档再试');
  if ((context.tempAvoidances ?? []).length > 0) out.push('放宽临时忌口');
  if (context.mustUseIngredients.length > 0) out.push('删减必消食材');
  if ((context.desiredDishIds ?? []).length > 0) out.push('调整想吃的菜');
  out.push('补充菜库后再试');
  return out;
}

/** 候选为空的餐次归因：有器具齐全但超时的 -> 时间型；否则无菜型 */
function attributeEmptySlot(pipeline: SlotPipeline, input: DayPlanInput): MealFailure {
  const label = MEAL_SLOT_LABELS[pipeline.slot];
  const availableEquipment = new Set(input.rules.equipment);
  const hasEquipmentOk = pipeline.allMenus.some((m) =>
    m.dishes.every((d) => d.equipment.every((eq) => availableEquipment.has(eq))),
  );
  let kind: MealFailureKind;
  let detail: string;
  if (pipeline.allMenus.length === 0) {
    kind = 'NO_DISH';
    detail = `${label}无菜可出：菜库经忌口/儿童约束过滤后，该餐型没有可用菜`;
  } else if (hasEquipmentOk) {
    kind = 'TIME_BUDGET';
    detail = `${label}有菜可做，但${input.context.timeBudgetMin}分钟时长档排不下`;
  } else {
    kind = 'NO_DISH';
    detail = `${label}无菜可出：可用菜缺少家庭器具`;
  }
  return { slot: pipeline.slot, kind, detail, suggestions: buildSuggestions(kind, input) };
}

/** 各餐单独能出、但必消全天凑不齐 -> 组合冲突（PD-014 口径扩展） */
function combinationFailure(
  slot: MealSlot,
  input: DayPlanInput,
  unallocatable: string[],
): MealFailure {
  const kind: MealFailureKind = 'COMBINATION';
  const detail =
    unallocatable.length > 0
      ? `必消食材${unallocatable.join('、')}没有任何一餐能用上，全天凑不齐`
      : '没有任何组合能同时用上全部必消食材';
  return { slot, kind, detail, suggestions: buildSuggestions(kind, input) };
}

// ───── 结果装配 ─────

/** 必消跨餐分配落位：按餐次规范序，每样必消落在第一餐第一道具含它的菜（一道菜可落多样） */
function allocateMustUse(
  meals: MealPlanView[],
  mustUseIds: string[],
): MustUseAllocation[] {
  const ordered = [...meals].sort(
    (a, b) => MEAL_SLOTS.indexOf(a.slot) - MEAL_SLOTS.indexOf(b.slot),
  );
  const out: MustUseAllocation[] = [];
  for (const id of mustUseIds) {
    for (const meal of ordered) {
      const dish = meal.dishes.find((d) =>
        d.ingredients.some((ing) => ing.ingredientId === id),
      );
      if (dish) {
        out.push({ ingredientId: id, slot: meal.slot, dishId: dish.id, dishName: dish.name });
        break;
      }
    }
  }
  return out;
}

/** 想吃的菜排入情况：冲突如实标注未排入（不硬凑） */
function buildDesiredNotes(
  input: DayPlanInput,
  stage: SafetyStage,
  meals: MealPlanView[],
): DesiredDishNote[] {
  const notes: DesiredDishNote[] = [];
  const selectedSlots = new Set(canonicalSlots(input.context.meals));
  for (const dishId of input.context.desiredDishIds ?? []) {
    const dish = input.dishes.find((d) => d.id === dishId);
    if (!dish) {
      notes.push({
        dishId,
        dishName: dishId,
        included: false,
        reason: '想吃的菜不在菜库，未排入',
      });
      continue;
    }
    const excluded = stage.excludedReasons.get(dishId);
    if (excluded) {
      const conflict = excluded.includes('临时忌口')
        ? '与临时忌口冲突'
        : excluded.includes('儿童餐')
          ? '与儿童餐约束冲突'
          : '与忌口冲突';
      notes.push({
        dishId,
        dishName: dish.name,
        included: false,
        reason: `想吃的「${dish.name}」${conflict}，未排入（${excluded}）`,
      });
      continue;
    }
    const hitMeal = meals.find((m) => m.dishes.some((d) => d.id === dishId));
    if (hitMeal) {
      notes.push({
        dishId,
        dishName: dish.name,
        included: true,
        slot: hitMeal.slot,
        reason: `已排入${MEAL_SLOT_LABELS[hitMeal.slot]}`,
      });
      continue;
    }
    if (!inferMealTypes(dish).some((s) => selectedSlots.has(s))) {
      notes.push({
        dishId,
        dishName: dish.name,
        included: false,
        reason: `想吃的「${dish.name}」餐型不在所选餐次内，未排入`,
      });
      continue;
    }
    notes.push({
      dishId,
      dishName: dish.name,
      included: false,
      reason: `想吃的「${dish.name}」未排入：同餐型候选中未入选（与必消/组合安排冲突时不硬凑）`,
    });
  }
  return notes;
}

/** 跨餐约束落位说明：必消分配 + 主蛋白/菜系/烹饪方式/主食材是否三餐不撞（放宽如实标注） */
function buildCrossMealNotes(
  meals: MealPlanView[],
  allocation: MustUseAllocation[],
): string[] {
  const notes: string[] = [];
  const dishCover = new Map<string, { dishName: string; ids: string[] }>();
  for (const a of allocation) {
    notes.push(`必消 ${a.ingredientId} 分到${MEAL_SLOT_LABELS[a.slot]}「${a.dishName}」`);
    const entry = dishCover.get(a.dishId) ?? { dishName: a.dishName, ids: [] };
    entry.ids.push(a.ingredientId);
    dishCover.set(a.dishId, entry);
  }
  for (const { dishName, ids } of dishCover.values()) {
    if (ids.length > 1) {
      notes.push(`「${dishName}」一道菜用掉${ids.length}样必消：${ids.join('、')}`);
    }
  }
  if (meals.length > 1) {
    const clashes = crossMealClashes(meals.map((m) => m.dishes));
    const slotNames = meals.map((m) => MEAL_SLOT_LABELS[m.slot]).join('/');
    notes.push(
      clashes.proteinRepeats.length === 0
        ? `${slotNames}主蛋白互不重复`
        : `主蛋白跨餐重复：${clashes.proteinRepeats.join('、')}（菜库所限，已尽量少）`,
    );
    const groups: Array<[string, string[]]> = [
      ['菜系', clashes.cuisineClashes],
      ['烹饪方式', clashes.methodClashes],
      ['主食材', clashes.mainIngredientClashes],
    ];
    for (const [label, list] of groups) {
      notes.push(
        list.length === 0
          ? `${slotNames}${label}不撞`
          : `${label}跨餐撞车：${list.join('、')}（菜库所限，已尽量少）`,
      );
    }
  }
  return notes;
}

function assembleResult(
  input: DayPlanInput,
  stage: SafetyStage,
  chosen: ChosenMeal[],
  failures: MealFailure[],
  pipelineTraces: FilterTrace[],
): DayPlanResult {
  const meals: MealPlanView[] = chosen.map((c) => ({
    slot: c.slot,
    menuId: c.menu.id,
    dishes: c.menu.dishes,
    score: c.scored.score,
    reasons: [...c.scored.reasons, ...c.shortages],
    filtered: c.traces,
    totalActiveMinutes: c.menu.totalActiveMinutes,
  }));
  const allocation = allocateMustUse(meals, input.context.mustUseIngredients);
  return {
    meals,
    mustUseAllocation: allocation,
    desiredNotes: buildDesiredNotes(input, stage, meals),
    failures,
    crossMealNotes: buildCrossMealNotes(meals, allocation),
    filtered: [...stage.safetyTraces, ...pipelineTraces],
  };
}

// ───── 主入口 ─────

/**
 * 一日三餐联合规划（PD-020 主入口）。
 * 管道：安全（长期 HARD + 临时忌口 + 儿童约束）-> 餐型候选（早餐轻食池 /
 * 午晚 MealRole 槽位）-> 可行性（时长档按餐应用 + 器具）-> 评分（6 维 +
 * 已吃菜避开窗口可调）-> 跨餐组合选择（必消全用上 + 主蛋白不重复 +
 * 菜系/烹饪方式/主食材不撞 + 想吃加分）。
 * 空手按餐归因（无菜型/时间型/组合冲突 + 出路），同一输入确定性输出。
 */
export function planDay(input: DayPlanInput): DayPlanResult {
  const slots = canonicalSlots(input.context.meals);
  const stage = prepareSafetyStage(input);
  const excludeSet = new Set(input.excludeDishIds ?? []);

  if (slots.length === 0) {
    return {
      meals: [],
      mustUseAllocation: [],
      desiredNotes: buildDesiredNotes(input, stage, []),
      failures: [],
      crossMealNotes: ['未选择任何餐次'],
      filtered: stage.safetyTraces,
    };
  }

  const pipelines = slots.map((slot) => runSlotPipeline(slot, input, stage, excludeSet));
  const failures: MealFailure[] = [];
  const viable: SlotPipeline[] = [];
  for (const p of pipelines) {
    if (p.ranked.length === 0) {
      failures.push(attributeEmptySlot(p, input));
    } else {
      viable.push(p);
    }
  }

  let chosen: ChosenMeal[] = [];
  if (viable.length > 0) {
    const result = chooseDayCombination(
      viable,
      input.context.mustUseIngredients,
      input.context.desiredDishIds ?? [],
    );
    if (result === null) {
      const coverable = new Set<string>();
      for (const p of viable) {
        for (const c of p.ranked) {
          for (const id of c.ingredientIds) coverable.add(id);
        }
      }
      const unallocatable = input.context.mustUseIngredients.filter(
        (id) => !coverable.has(id),
      );
      for (const p of viable) {
        failures.push(combinationFailure(p.slot, input, unallocatable));
      }
    } else {
      chosen = result;
    }
  }

  failures.sort((a, b) => MEAL_SLOTS.indexOf(a.slot) - MEAL_SLOTS.indexOf(b.slot));
  return assembleResult(
    input,
    stage,
    chosen,
    failures,
    pipelines.flatMap((p) => p.traces),
  );
}

// ───── 调整语义（PD-003/PD-013/确认书 C-3a） ─────

export interface ReplanMealResult {
  /** 成功=换后新计划；失败=原计划原样 */
  plan: DayPlanResult;
  replaced: boolean;
  /** 重推失败原因（保持原餐时必给） */
  reason?: string;
}

/**
 * 换一餐：该餐整体重推（当前餐菜不回池，换了就是真的换了），
 * 其他餐不变且跨餐约束仍成立——
 * - 硬约束：新套必须接住其他餐覆盖不了的全部必消（PD-001 不因换餐被击穿）；
 * - 主蛋白不重复：可保持时必保持（存在不重复候选则只在其中挑）；
 * - 菜系/烹饪方式/主食材：与其他餐撞车数最少者优先（与 planDay 同一排序标准），
 *   实在避不开照出但由 crossMealNotes 如实标注；
 * 重推失败（无新组合 / 必消接不住）保持原餐并给原因。
 */
export function replanMeal(
  input: DayPlanInput,
  current: DayPlanResult,
  slot: MealSlot,
): ReplanMealResult {
  const label = MEAL_SLOT_LABELS[slot];
  const otherMeals = current.meals.filter((m) => m.slot !== slot);
  const targetMeal = current.meals.find((m) => m.slot === slot);

  if (!targetMeal && !current.failures.some((f) => f.slot === slot)) {
    return { plan: current, replaced: false, reason: `原计划不含${label}，无法换一餐` };
  }

  const stage = prepareSafetyStage(input);
  const excludeSet = new Set((targetMeal?.dishes ?? []).map((d) => d.id));
  const pipeline = runSlotPipeline(slot, input, stage, excludeSet);

  if (pipeline.ranked.length === 0) {
    return {
      plan: current,
      replaced: false,
      reason: `${label}重推失败：没有可换的新组合（当前菜不回池后该餐型池为空），已保持原餐`,
    };
  }

  // 其他餐覆盖不了的必消，必须由新套接住（PD-001 不因换餐被击穿）
  const otherIngredientIds = new Set<string>();
  for (const m of otherMeals) {
    for (const d of m.dishes) {
      for (const ing of d.ingredients) otherIngredientIds.add(ing.ingredientId);
    }
  }
  const mustCover = input.context.mustUseIngredients.filter(
    (id) => !otherIngredientIds.has(id),
  );
  const covering = pipeline.ranked.filter((c) =>
    mustCover.every((id) => c.ingredientIds.has(id)),
  );
  if (covering.length === 0) {
    return {
      plan: current,
      replaced: false,
      reason: `${label}重推失败：新组合接不住必消食材（${mustCover.join('、')}），已保持原餐`,
    };
  }

  // 跨餐约束仍成立：主蛋白不重复可保持必保持；其余撞车按同一标准取最少
  const otherDishes = otherMeals.map((m) => m.dishes);
  const clashesOf = (c: RankedMenu): ReturnType<typeof crossMealClashes> =>
    crossMealClashes([c.menu.dishes, ...otherDishes]);
  const proteinOk = covering.filter((c) => clashesOf(c).proteinRepeats.length === 0);
  const pool = proteinOk.length > 0 ? proteinOk : covering;
  const sorted = [...pool].sort(
    (a, b) =>
      crossMealClashCount(clashesOf(a)) - crossMealClashCount(clashesOf(b)) ||
      b.rankValue - a.rankValue ||
      a.menu.id.localeCompare(b.menu.id),
  );
  const picked = sorted[0];
  const newMeal: MealPlanView = {
    slot,
    menuId: picked.menu.id,
    dishes: picked.menu.dishes,
    score: picked.scored.score,
    reasons: [...picked.scored.reasons, ...(pipeline.shortages[picked.menu.id] ?? [])],
    filtered: pipeline.traces,
    totalActiveMinutes: picked.menu.totalActiveMinutes,
  };
  const meals = [...otherMeals, newMeal].sort(
    (a, b) => MEAL_SLOTS.indexOf(a.slot) - MEAL_SLOTS.indexOf(b.slot),
  );
  const allocation = allocateMustUse(meals, input.context.mustUseIngredients);
  return {
    plan: {
      meals,
      mustUseAllocation: allocation,
      desiredNotes: buildDesiredNotes(input, stage, meals),
      failures: current.failures.filter((f) => f.slot !== slot),
      crossMealNotes: buildCrossMealNotes(meals, allocation),
      filtered: [
        ...stage.safetyTraces,
        ...pipeline.traces,
        ...otherMeals.flatMap((m) => m.filtered),
      ],
    },
    replaced: true,
  };
}

/** 换一批：全天重推（当前全天菜不回池，PD-013 语义的三餐扩展） */
export function replanAllMeals(input: DayPlanInput, current: DayPlanResult): DayPlanResult {
  const excludeDishIds = current.meals.flatMap((m) => m.dishes.map((d) => d.id));
  return planDay({ ...input, excludeDishIds });
}

/**
 * 换一道：同餐型候选替换（swap-candidates 按餐型过滤）。
 * 早餐只从早餐轻食池出候选；午/晚只从适用该餐型的菜出候选（同 MealRole 由调用方收敛）。
 * 儿童>0 时追加儿童餐约束（辣/刺多/过硬候选移入 filtered 并给原因，不静默丢弃）；
 * 其余五层（安全/器具/时长/mustUse 联动/已在菜单）沿用 filterSwapCandidates 原口径。
 */
export function swapCandidatesForSlot(
  slot: MealSlot,
  input: SwapCandidateInput,
  childrenCount = 0,
): SwapCandidateResult {
  const slotPool = input.candidates.filter((d) => inferMealTypes(d).includes(slot));
  const base = filterSwapCandidates({ ...input, candidates: slotPool });
  if (childrenCount <= 0) return base;
  const child = filterChildSafeDishes(base.passed);
  return {
    passed: child.passed,
    filtered: [
      ...base.filtered,
      ...child.excluded.map((e) => ({
        menuId: e.dish.id,
        stage: 'safety' as const,
        rule: e.reason,
      })),
    ],
  };
}
