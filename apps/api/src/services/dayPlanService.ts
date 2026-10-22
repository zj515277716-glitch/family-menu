// apps/api/src/services/dayPlanService.ts
// 日计划流（T-Q10/PD-020）：三餐计划的生成/换菜/反馈/清单编排。
// 引擎只读对接（planDay/replanMeal/replanAllMeals/swapCandidatesForSlot），
// 逻辑在 services、路由薄（AGENTS.md 铁律）；存量单餐流仍在 planService，两者按
// plan.dayPlan 有无分流（互不污染：a3-reputation 等直接调 planService 旧路径的测试零影响）。

import {
  planDay,
  replanAllMeals,
  replanMeal,
  swapCandidatesForSlot,
} from '@family-menu/engine';
import type { DayPlanResult, DishView, MealSlot } from '@family-menu/engine';
import { MEAL_SLOTS } from '@family-menu/shared';
import type {
  DayPlanContext,
  Plan,
  PlanStatus,
  ShoppingList,
  SwapOptionsResponse,
  Taste,
  FeedbackRequest,
} from '@family-menu/shared';
import { mergeDayShoppingList, type DayShoppingMenu } from '@family-menu/list-merger';
import { prisma } from '../db.js';
import type { Prisma } from '../generated/prisma/client.js';
import {
  FAMILY_ID,
  loadExclusionViews,
  loadEventViews,
  loadFamilyRuleView,
  loadPublishedDishViews,
  resolveMustUseIds,
  NotFoundError,
  PlanStateError,
  SwapRecheckError,
  toPlan,
  type PlanRow,
} from './planService.js';

// ───── 内部辅助 ─────

/** 明天本地零点（计划日 = 生成时刻的次日；C-2「定明天的餐」） */
export function nextLocalMidnight(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * 装载引擎 DayPlanInput（引擎零 IO，全部在此装配）。
 * mustUseIngredients 兼容 ingredientId 与用户原文两种输入（resolveMustUseIds：
 * id 层 1 不中即原样透传，引擎按 ingredientId 匹配仍成立；原文则映射为 id）。
 */
async function loadDayPlanInput(context: DayPlanContext) {
  const [rules, exclusions, history, dishPool, mustUseResolved] = await Promise.all([
    loadFamilyRuleView(FAMILY_ID),
    loadExclusionViews(FAMILY_ID),
    loadEventViews(FAMILY_ID),
    loadPublishedDishViews(),
    resolveMustUseIds(context.mustUseIngredients),
  ]);
  return {
    rules,
    exclusions,
    context: { ...context, mustUseIngredients: mustUseResolved.ids },
    dishes: dishPool,
    history,
    mustUseIds: new Set(mustUseResolved.ids),
  };
}

/** 三餐 -> list-merger 输入（鸭子类型投影，steps 供备菜建议提取） */
function toDayShoppingMenus(dayPlan: DayPlanResult): DayShoppingMenu[] {
  return dayPlan.meals.map((m) => ({
    slot: m.slot,
    dishes: m.dishes.map((d) => ({
      name: d.name,
      ingredients: d.ingredients.map((ing) => ({
        ingredientId: ing.ingredientId,
        ingredientName: ing.ingredientName,
        aliases: ing.aliases,
        category: ing.category,
        defaultUnit: ing.defaultUnit,
        qty: ing.qty,
        unit: ing.unit,
        optional: ing.optional,
      })),
      steps: d.steps.map((s) => ({ order: s.order, text: s.text })),
    })),
  }));
}

/** 三餐清单重算（C-4：三餐合并去重+按成人/儿童缩放+必消标已有+备菜建议），按 ingredientId 保留勾选 */
function computeDayShoppingList(
  dayPlan: DayPlanResult,
  adults: number,
  children: number,
  mustUseIds: ReadonlySet<string>,
  previous?: ShoppingList | null,
): ShoppingList {
  const merged = mergeDayShoppingList(toDayShoppingMenus(dayPlan), {
    adults,
    children,
    alreadyHaveIds: mustUseIds,
  });
  if (!previous) {
    return merged;
  }
  const checkedIds = new Set(
    previous.groups.flatMap((g) =>
      g.items.filter((i) => i.checked).map((i) => i.ingredientId),
    ),
  );
  return {
    groups: merged.groups.map((g) => ({
      ...g,
      items: g.items.map((i) => ({ ...i, checked: checkedIds.has(i.ingredientId) })),
    })),
    prepAdvice: merged.prepAdvice,
  };
}

/** 读取计划并校验为三餐计划（dayPlan 存在），否则 409（旧单餐计划走 planService 旧路径） */
async function requireDayPlan(planId: string): Promise<PlanRow & { dayPlan: DayPlanResult; dayContext: DayPlanContext }> {
  const plan = await prisma.plan.findUnique({ where: { id: planId } });
  if (!plan) {
    throw new NotFoundError(`Plan ${planId} not found`);
  }
  if (!plan.dayPlan || !plan.dayContext) {
    throw new PlanStateError('该计划是存量单餐计划，不支持三餐操作');
  }
  return plan as PlanRow & { dayPlan: DayPlanResult; dayContext: DayPlanContext };
}

/** 三餐计划 status 聚合：所选餐次全部有反馈才迁移（任一做了->COOKED / 全没做->SKIPPED / 未齐->LOCKED） */
async function recomputeDayPlanStatus(plan: PlanRow & { dayContext: DayPlanContext }): Promise<PlanStatus> {
  const slots = plan.dayContext.meals ?? [...MEAL_SLOTS];
  const events = await prisma.event.findMany({
    where: { planId: plan.id, type: { in: ['COOKED', 'NOT_COOKED'] } },
    orderBy: { createdAt: 'desc' },
  });
  const latestBySlot = new Map<string, 'COOKED' | 'NOT_COOKED'>();
  for (const e of events) {
    if (e.mealSlot && !latestBySlot.has(e.mealSlot)) {
      latestBySlot.set(e.mealSlot, e.type as 'COOKED' | 'NOT_COOKED');
    }
  }
  if (!slots.every((s) => latestBySlot.has(s))) {
    return 'LOCKED';
  }
  return [...latestBySlot.values()].includes('COOKED') ? 'COOKED' : 'SKIPPED';
}

/** 换菜后落库：dayPlan 快照重写 + 清单重算（保留勾选） */
async function persistDayPlanUpdate(
  plan: PlanRow & { dayPlan: DayPlanResult; dayContext: DayPlanContext },
  next: DayPlanResult,
  eventType: 'SWAP_MENU' | 'SWAP_DISH',
  payload: Prisma.InputJsonValue,
  mealSlot: MealSlot = 'dinner',
): Promise<Plan> {
  const shoppingList = computeDayShoppingList(
    next,
    plan.dayContext.adults,
    plan.dayContext.children,
    new Set(plan.dayContext.mustUseIngredients),
    (plan.shoppingList as ShoppingList | null) ?? null,
  );
  const updated = await prisma.plan.update({
    where: { id: plan.id },
    data: {
      dayPlan: next as unknown as object,
      shoppingList: shoppingList as unknown as object,
    },
  });
  // mealSlot 恒有值（迁移不变量：null 恒 0）；按餐操作带真实餐次，全天操作 dinner 占位
  await prisma.event.create({
    data: {
      familyId: FAMILY_ID,
      planId: plan.id,
      type: eventType,
      payload,
      mealSlot,
    },
  });
  return toPlan(updated as PlanRow);
}

// ───── dayPlanService ─────

export const dayPlanService = {
  /**
   * 生成次日三餐计划（C-3）：输入日计划上下文 -> 引擎 planDay -> 生成即落库
   * （无三选一，status=LOCKED）。空手也建 Plan（failures 归因供当日调整出路，C-7）。
   * planDate = 明天本地零点；同日重生成 = append 新行（GET /api/plans?date= 取最新）。
   */
  async generateDayPlan(context: DayPlanContext): Promise<Plan> {
    const input = await loadDayPlanInput(context);
    const result = planDay(input);

    const shoppingList = computeDayShoppingList(
      result,
      context.adults,
      context.children,
      input.mustUseIds,
    );

    const plan = await prisma.plan.create({
      data: {
        familyId: FAMILY_ID,
        planDate: nextLocalMidnight(),
        context: {}, // 旧单餐上下文列非空：三餐计划存空对象，语义字段在 dayContext
        dayContext: context as unknown as object,
        candidates: [], // 旧三候选列非空：三餐计划无三选一，存空数组
        dayPlan: result as unknown as object,
        shoppingList: shoppingList as unknown as object,
        status: 'LOCKED',
      },
    });

    await prisma.event.create({
      // 整天生成不隶属单一餐次，dinner 占位保持 mealSlot 恒有值（迁移不变量）
      data: { familyId: FAMILY_ID, planId: plan.id, type: 'GENERATE', mealSlot: 'dinner' },
    });

    return toPlan(plan as PlanRow);
  },

  /**
   * 三餐换菜（C-3a 三语义）：
   * 全换 = replanAllMeals（当前全天已用菜不回池，三餐整体重推）；
   * 换一餐 = replanMeal（该餐重推其他餐不动，失败保持原餐并给原因 -> 400）；
   * 单菜换 = swapCandidatesForSlot 候选复检（新菜须过五层+餐型+儿童约束）。
   */
  async swapDayPlan(
    planId: string,
    swapType: '全换' | '单菜换' | '换一餐',
    dishId?: string,
    newDishId?: string,
    slot?: MealSlot,
    reason?: string,
  ): Promise<Plan> {
    const plan = await requireDayPlan(planId);
    const input = await loadDayPlanInput(plan.dayContext);
    const current = plan.dayPlan;

    if (swapType === '全换') {
      const next = replanAllMeals(input, current);
      // 当前菜不回池后全天空手（meals 为空或每餐 0 道）不是成功换餐：
      // C-3a 失败恢复要求原菜单保持可再试——不落库、不写 Event，部分餐失败仍按现语义替换
      if (next.meals.every((m) => m.dishes.length === 0)) {
        throw new SwapRecheckError('这次没换出可用的三餐，已保持原餐');
      }
      return persistDayPlanUpdate(plan, next, 'SWAP_MENU', {
        reason: reason ?? null,
        oldMeals: current.meals.map((m) => m.menuId),
        newMeals: next.meals.map((m) => m.menuId),
      });
    }

    if (swapType === '换一餐') {
      if (!slot) {
        throw new SwapRecheckError('换一餐必须携带要重推的餐次 slot');
      }
      const r = replanMeal(input, current, slot);
      if (!r.replaced) {
        // 引擎保持原餐：如失败因，不伪造成功（C-3a 失败恢复「没换成，原菜单保持可再试」）
        throw new SwapRecheckError(r.reason ?? '换一餐失败，已保持原餐');
      }
      return persistDayPlanUpdate(
        plan,
        r.plan,
        'SWAP_MENU',
        {
          reason: reason ?? null,
          slot,
          oldMenuId: current.meals.find((m) => m.slot === slot)?.menuId ?? null,
          newMenuId: r.plan.meals.find((m) => m.slot === slot)?.menuId ?? null,
        },
        slot,
      );
    }

    // ── 单菜换（换一道） ──
    if (!dishId || !newDishId) {
      throw new SwapRecheckError('单菜换必须携带 dishId 与 newDishId');
    }
    const meal = current.meals.find((m) => m.dishes.some((d) => d.id === dishId));
    if (!meal) {
      throw new NotFoundError(`三餐计划中没有这道菜：${dishId}`);
    }
    const outgoingDish = meal.dishes.find((d) => d.id === dishId)!;

    // 复检：新菜须过 餐型+五层+儿童约束（引擎 swapCandidatesForSlot 全量口径）
    const swapResult = swapCandidatesForSlot(
      meal.slot,
      {
        outgoingDish,
        remainingDishes: meal.dishes.filter((d) => d.id !== dishId),
        candidates: input.dishes,
        mustUseIngredientIds: input.context.mustUseIngredients,
        timeBudgetMin: plan.dayContext.timeBudgetMin,
        availableEquipment: input.rules.equipment,
        exclusions: input.exclusions,
      },
      plan.dayContext.children,
    );
    const newDish = swapResult.passed.find((d) => d.id === newDishId);
    if (!newDish) {
      const trace = swapResult.filtered.find((f) => f.menuId === newDishId);
      throw new SwapRecheckError(
        trace ? `不能换成这道菜：${trace.rule}` : '不能换成这道菜（不在可换候选池中）',
        trace ? [trace] : [],
      );
    }

    // 快照重写：新菜继承槽位；mustUseAllocation 指向换出菜的行改指新菜
    // （引擎五层第 4 层保证新菜接住全部 orphaned 必消，改指不破坏 PD-001 落位事实）
    const nextDishes = meal.dishes.map((d) => (d.id === dishId ? newDish : d));
    const next: DayPlanResult = {
      ...current,
      meals: current.meals.map((m) =>
        m.slot === meal.slot
          ? {
              ...m,
              dishes: nextDishes,
              totalActiveMinutes: nextDishes.reduce((sum, d) => sum + d.activeMinutes, 0),
            }
          : m,
      ),
      mustUseAllocation: current.mustUseAllocation.map((a) =>
        a.dishId === dishId
          ? { ...a, dishId: newDish.id, dishName: newDish.name }
          : a,
      ),
    };
    return persistDayPlanUpdate(
      plan,
      next,
      'SWAP_DISH',
      {
        dishId,
        newDishId,
        slot: meal.slot,
        reason: reason ?? null,
        oldDishName: outgoingDish.name,
        newDishName: newDish.name,
      },
      meal.slot,
    );
  },

  /** 三餐换一道候选列表（C-3a：同餐型候选，含儿童约束过滤） */
  async getDaySwapOptions(planId: string, dishId: string): Promise<SwapOptionsResponse> {
    const plan = await requireDayPlan(planId);
    const meal = plan.dayPlan.meals.find((m) => m.dishes.some((d) => d.id === dishId));
    if (!meal) {
      throw new NotFoundError(`三餐计划中没有这道菜：${dishId}`);
    }
    const outgoingDish = meal.dishes.find((d) => d.id === dishId)!;
    const input = await loadDayPlanInput(plan.dayContext);

    const { passed } = swapCandidatesForSlot(
      meal.slot,
      {
        outgoingDish,
        remainingDishes: meal.dishes.filter((d) => d.id !== dishId),
        candidates: input.dishes,
        mustUseIngredientIds: input.context.mustUseIngredients,
        timeBudgetMin: plan.dayContext.timeBudgetMin,
        availableEquipment: input.rules.equipment,
        exclusions: input.exclusions,
      },
      plan.dayContext.children,
    );

    return {
      dishId,
      mealRole: outgoingDish.mealRole,
      candidates: passed.map((d: DishView) => ({
        dishId: d.id,
        name: d.name,
        mealRole: d.mealRole,
        cuisine: d.cuisine,
        flavorTags: d.flavorTags,
        spicyLevel: d.spicyLevel,
        activeMinutes: d.activeMinutes,
        totalMinutes: d.totalMinutes,
        equipment: d.equipment,
      })),
    };
  },

  /** 三餐清单（C-4）：快照重算 + 勾选保留 + 落库 */
  async getDayShoppingList(planId: string): Promise<ShoppingList> {
    const plan = await requireDayPlan(planId);
    const input = await loadDayPlanInput(plan.dayContext);
    const shoppingList = computeDayShoppingList(
      plan.dayPlan,
      plan.dayContext.adults,
      plan.dayContext.children,
      input.mustUseIds,
      (plan.shoppingList as ShoppingList | null) ?? null,
    );
    await prisma.plan.update({
      where: { id: planId },
      data: { shoppingList: shoppingList as unknown as object },
    });
    return shoppingList;
  },

  /** 三餐改人数重算（C-4 成人/儿童口径）：同步 dayContext + 清单（保留勾选）+ Event RESCALE */
  async rescaleDayShoppingList(
    planId: string,
    adults: number,
    children: number,
  ): Promise<ShoppingList> {
    const plan = await requireDayPlan(planId);
    const input = await loadDayPlanInput(plan.dayContext);
    const nextContext: DayPlanContext = { ...plan.dayContext, adults, children };
    const shoppingList = computeDayShoppingList(
      plan.dayPlan,
      adults,
      children,
      input.mustUseIds,
      (plan.shoppingList as ShoppingList | null) ?? null,
    );
    await prisma.plan.update({
      where: { id: planId },
      data: {
        dayContext: nextContext as unknown as object,
        shoppingList: shoppingList as unknown as object,
      },
    });
    await prisma.event.create({
      data: {
        familyId: FAMILY_ID,
        planId,
        type: 'RESCALE',
        payload: {
          from: { adults: plan.dayContext.adults, children: plan.dayContext.children },
          to: { adults, children },
        },
        mealSlot: 'dinner',
      },
    });
    return shoppingList;
  },

  /**
   * 三餐按餐反馈（C-5）：Event 带 mealSlot（同日同餐重提=读取侧按餐取最新，等效覆盖）；
   * didCook 时该餐每菜写一行 CookLog（dishId+mealSlot）；status 按所选餐次聚合迁移。
   */
  async addDayFeedback(planId: string, data: FeedbackRequest): Promise<Plan> {
    const plan = await requireDayPlan(planId);
    const slot = data.mealSlot ?? 'dinner'; // 缺省兼容（契约 optional：存量客户端不破）
    const { didCook, taste, willRepeat, actualMinutes } = data;

    const payload: { taste?: Taste; willRepeat: boolean; actualMinutes?: number } = { willRepeat };
    if (didCook) payload.taste = taste;
    if (actualMinutes !== undefined) payload.actualMinutes = actualMinutes;

    await prisma.event.create({
      data: {
        familyId: FAMILY_ID,
        planId,
        type: didCook ? 'COOKED' : 'NOT_COOKED',
        payload,
        mealSlot: slot,
      },
    });

    // CookLog 是内容升级唯一通道（DEC-006）：做了才写，按该餐每菜一行（mealSlot 关联）
    if (didCook) {
      const resultMapping: Record<Taste, 'success' | 'partial' | 'fail'> = {
        good: 'success',
        ok: 'partial',
        fail: 'fail',
      };
      const result = resultMapping[taste as Taste];
      const meal = plan.dayPlan.meals.find((m) => m.slot === slot);
      if (meal) {
        for (const dish of meal.dishes) {
          await prisma.cookLog.create({
            data: {
              menuId: null,
              dishId: dish.id,
              mealSlot: slot,
              result,
              failPoints: null,
              willRepeat,
              actualMinutes: actualMinutes ?? null,
            },
          });
        }
      }
    }

    const status = await recomputeDayPlanStatus(plan);
    const updated = await prisma.plan.update({
      where: { id: planId },
      data: { status },
    });
    return toPlan(updated as PlanRow);
  },
};
