// apps/api/src/services/planService.ts
// 引擎编排：调 engine.recommend + list-merger.mergeShoppingList + Prisma 持久化
// 路由薄、逻辑在 services（AGENTS.md 铁律），planService 是 API 层核心业务逻辑

import { filterSwapCandidates, recommend } from '@family-menu/engine';
import type { DishView, MenuView } from '@family-menu/engine';
import { mergeShoppingList, type ShoppingList } from '@family-menu/list-merger';
import type {
  Candidate,
  CookResult,
  ExclusionRule,
  FamilyRule,
  FeedbackResult,
  MealRole,
  Plan,
  PlanContext,
  PlanStatus,
  PrepSequenceItem,
  PutExclusionsRequest,
  SwapOptionsResponse,
  SwapType,
} from '@family-menu/shared';
import { prisma } from '../db.js';
import {
  toDishView,
  toEventView,
  toExclusionView,
  toFamilyRuleView,
  toMenuView,
  toShoppingMenu,
} from './mappers.js';

// ───── 错误类型 ─────

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

/** 计划状态不允许该操作（DEC-013：未锁定就换菜 -> 409） */
export class PlanStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlanStateError';
  }
}

/** 换菜服务端复检拒绝（新菜不符合今晚规则 -> 400，details 携带过滤轨迹） */
export class SwapRecheckError extends Error {
  readonly details: unknown[];
  constructor(message: string, details: unknown[] = []) {
    super(message);
    this.name = 'SwapRecheckError';
    this.details = details;
  }
}

// ───── 常量 ─────

/** 单家庭版默认 familyId（阶段2多家庭时从登录态获取） */
const FAMILY_ID = process.env.FAMILY_ID ?? 'seed-family';

// ───── 内部辅助：Plan 行映射 ─────

interface PlanRow {
  id: string;
  familyId: string;
  planDate: Date;
  context: unknown;
  candidates: unknown;
  lockedMenuId: string | null;
  shoppingList: unknown;
  status: string;
  createdAt: Date;
}

function toPlan(row: PlanRow): Plan {
  return {
    id: row.id,
    familyId: row.familyId,
    planDate: row.planDate,
    context: row.context as PlanContext,
    candidates: row.candidates as Candidate[],
    lockedMenuId: row.lockedMenuId ?? undefined,
    shoppingList: (row.shoppingList as ShoppingList | null) ?? undefined,
    status: row.status as PlanStatus,
    createdAt: row.createdAt,
  };
}

// ───── 内部辅助：查询家庭规则与禁忌 ─────

async function loadFamilyRuleView(familyId: string) {
  const rule = await prisma.familyRule.findFirst({ where: { familyId } });
  if (!rule) {
    throw new NotFoundError(`FamilyRule not found for family ${familyId}`);
  }
  return toFamilyRuleView(rule);
}

async function loadExclusionViews(familyId: string) {
  const exclusions = await prisma.exclusionRule.findMany({ where: { familyId } });
  // scope=INGREDIENT 时 join Ingredient 获取 name/aliases
  const ingredientIds = exclusions
    .filter((e) => e.scope === 'INGREDIENT' && e.targetId)
    .map((e) => e.targetId!);
  const ingredients =
    ingredientIds.length > 0
      ? await prisma.ingredient.findMany({ where: { id: { in: ingredientIds } } })
      : [];
  const ingredientMap = new Map(ingredients.map((i) => [i.id, i]));
  return exclusions.map((e) =>
    toExclusionView(e, e.targetId ? ingredientMap.get(e.targetId) : null),
  );
}

async function loadMenuViews(): Promise<ReturnType<typeof toMenuView>[]> {
  const menus = await prisma.menu.findMany({
    where: { status: 'PUBLISHED' },
    include: {
      dishes: {
        include: {
          dish: {
            include: {
              ingredients: { include: { ingredient: true } },
            },
          },
        },
      },
    },
  });
  return menus.map(toMenuView);
}

async function loadEventViews(familyId: string) {
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const events = await prisma.event.findMany({
    where: { familyId, createdAt: { gte: since } },
    orderBy: { createdAt: 'desc' },
  });
  return events.map(toEventView);
}

// ── 内部辅助：mustUse 用户原文 -> ingredientId 稳定映射（TP-02） ──

/**
 * mustUse 用户原文 -> ingredientId 稳定映射。
 * 匹配顺序：trim -> name 精确 -> aliases 精确 -> 大小写不敏感；
 * 未映射的原文原样透传（引擎按 ingredientId 匹配不到 -> 必然空手，unmetMustUse 回传原文）。
 */
async function resolveMustUseIds(
  rawNames: string[],
): Promise<{ ids: string[]; idToRaw: Map<string, string> }> {
  const ids: string[] = [];
  const idToRaw = new Map<string, string>();
  if (rawNames.length === 0) {
    return { ids, idToRaw };
  }
  const ingredients = await prisma.ingredient.findMany();
  const byKey = new Map<string, string>(); // 小写 name/alias -> ingredientId
  for (const ing of ingredients) {
    for (const key of [ing.name, ...ing.aliases]) {
      const normalized = key.trim().toLowerCase();
      if (normalized && !byKey.has(normalized)) {
        byKey.set(normalized, ing.id);
      }
    }
  }
  for (const raw of rawNames) {
    const trimmed = raw.trim();
    const id = byKey.get(trimmed.toLowerCase()) ?? trimmed;
    ids.push(id);
    idToRaw.set(id, trimmed);
  }
  return { ids, idToRaw };
}

// ── 内部辅助：锁定菜单与换菜（TP-03/DEC-013） ──

/** 加载计划并校验已锁定（换菜序列 404 -> 409） */
async function requireLockedPlan(
  planId: string,
): Promise<PlanRow & { lockedMenuId: string }> {
  const plan = await prisma.plan.findUnique({ where: { id: planId } });
  if (!plan) {
    throw new NotFoundError(`Plan ${planId} not found`);
  }
  if (plan.status !== 'LOCKED' || !plan.lockedMenuId) {
    throw new PlanStateError('计划尚未锁定菜单，请先锁定今晚方案');
  }
  return plan as PlanRow & { lockedMenuId: string };
}

/**
 * 锁定菜单水合（DEC-013 持久化方案 B：快照零迁移）。
 * 优先读 plan.candidates 中锁定候选的 menu 快照；快照缺失时按 lockedMenuId 从 DB 懒水合。
 */
async function hydrateLockedMenu(
  plan: PlanRow & { lockedMenuId: string },
): Promise<{ menuView: MenuView; candidateIndex: number }> {
  const candidates = plan.candidates as Candidate[];
  const candidateIndex = candidates.findIndex((c) => c.menuId === plan.lockedMenuId);
  if (candidateIndex === -1) {
    throw new NotFoundError(`Menu ${plan.lockedMenuId} is not a candidate of plan ${plan.id}`);
  }
  const snapshot = candidates[candidateIndex].menu as MenuView | undefined;
  if (snapshot && Array.isArray(snapshot.dishes)) {
    return { menuView: snapshot, candidateIndex };
  }
  const menu = await prisma.menu.findUnique({
    where: { id: plan.lockedMenuId },
    include: {
      dishes: {
        include: {
          dish: {
            include: {
              ingredients: { include: { ingredient: true } },
            },
          },
        },
      },
    },
  });
  if (!menu) {
    throw new NotFoundError(`Menu ${plan.lockedMenuId} not found`);
  }
  return { menuView: toMenuView(menu), candidateIndex };
}

/** 加载指定角色的 PUBLISHED 菜品候选池（含食材关联） */
async function loadDishViews(mealRole: MealRole): Promise<DishView[]> {
  const dishes = await prisma.dish.findMany({
    where: { status: 'PUBLISHED', mealRole },
    include: { ingredients: { include: { ingredient: true } } },
  });
  return dishes.map(toDishView);
}

/**
 * 换菜候选五层过滤（DEC-013）：
 * safety -> 器具 -> 时长 -> mustUse 联动（接住 orphaned）-> 排除已在菜单。
 */
async function runSwapFilter(
  plan: PlanRow,
  menuView: MenuView,
  outgoingDish: DishView,
): Promise<ReturnType<typeof filterSwapCandidates>> {
  const [rules, exclusions, mustUseResolved] = await Promise.all([
    loadFamilyRuleView(FAMILY_ID),
    loadExclusionViews(FAMILY_ID),
    resolveMustUseIds((plan.context as PlanContext).mustUse),
  ]);
  return filterSwapCandidates({
    outgoingDish,
    remainingDishes: menuView.dishes.filter((d) => d.id !== outgoingDish.id),
    candidates: await loadDishViews(outgoingDish.mealRole),
    mustUseIngredientIds: mustUseResolved.ids,
    timeBudgetMin: (plan.context as PlanContext).timeBudgetMin,
    availableEquipment: rules.equipment,
    exclusions,
  });
}

/** 重算采购清单（DEC-014）：merge（按今晚人数缩放+必消标「已有」）后按 ingredientId 保留旧勾选 */
function computeShoppingList(
  menuView: MenuView,
  people: number,
  previous?: ShoppingList | null,
  mustUseIds?: ReadonlySet<string>,
): ShoppingList {
  const merged = mergeShoppingList(toShoppingMenu(menuView), {
    people,
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
  };
}

/** 备菜顺序确定性串行展开 v1（DEC-013）：按菜品序展开各菜步骤，分钟数均分累加 */
function buildPrepSequence(dishes: DishView[]): PrepSequenceItem[] {
  const sequence: PrepSequenceItem[] = [];
  let cursor = 0;
  for (const dish of dishes) {
    const steps = [...dish.steps].sort((a, b) => a.order - b.order);
    if (steps.length === 0) {
      // steps 空的条目如实占位
      sequence.push({ minute: cursor, action: `做「${dish.name}」` });
      cursor += Math.max(1, Math.ceil(dish.activeMinutes));
      continue;
    }
    const perStep = Math.max(1, Math.ceil(dish.activeMinutes / steps.length));
    for (const step of steps) {
      sequence.push({ minute: cursor, action: step.text });
      cursor += perStep;
    }
  }
  return sequence;
}

// ───── planService ─────

export const planService = {
  // ── F1: 家庭规则 ──

  async getFamilyRules(): Promise<FamilyRule | null> {
    const rule = await prisma.familyRule.findFirst({ where: { familyId: FAMILY_ID } });
    if (!rule) {
      return null;
    }
    // FamilyRuleSchema 字段与 Prisma 行一致，直接返回
    return rule as unknown as FamilyRule;
  },

  async updateFamilyRules(data: FamilyRule): Promise<FamilyRule> {
    const updated = await prisma.familyRule.update({
      where: { familyId: data.familyId },
      data: {
        defaultPeople: data.defaultPeople,
        timeBudgets: data.timeBudgets,
        equipment: data.equipment,
        cuisines: data.cuisines,
      },
    });
    return updated as unknown as FamilyRule;
  },

  // ── F1: 禁忌规则（ExclusionRule，v0.2 新增） ──

  async getExclusions(): Promise<ExclusionRule[]> {
    const rules = await prisma.exclusionRule.findMany({ where: { familyId: FAMILY_ID } });
    // ExclusionRule 字段（id/familyId/scope/targetId/targetTag/severity/note）与 Prisma 行一致
    return rules as unknown as ExclusionRule[];
  },

  async putExclusions(rules: PutExclusionsRequest): Promise<ExclusionRule[]> {
    // 全量替换：事务内 deleteMany + createMany（与 PUT /api/family/rules 全量写入语义同构）
    // familyId 强制覆盖为 FAMILY_ID，防止跨家庭写入
    await prisma.$transaction([
      prisma.exclusionRule.deleteMany({ where: { familyId: FAMILY_ID } }),
      prisma.exclusionRule.createMany({
        data: rules.map((r) => ({
          id: r.id,
          familyId: FAMILY_ID,
          scope: r.scope,
          targetId: r.targetId,
          targetTag: r.targetTag,
          severity: r.severity,
          note: r.note,
        })),
      }),
    ]);
    return this.getExclusions();
  },

  // ── F2/F3: 推荐 ──

  async generateRecommendation(
    context: PlanContext,
  ): Promise<{ candidates: Candidate[]; planId?: string; unmetMustUse?: string[] }> {
    const [rules, exclusions, library, history, mustUseResolved] = await Promise.all([
      loadFamilyRuleView(FAMILY_ID),
      loadExclusionViews(FAMILY_ID),
      loadMenuViews(),
      loadEventViews(FAMILY_ID),
      resolveMustUseIds(context.mustUse),
    ]);

    const result = recommend({
      rules,
      exclusions,
      context: {
        people: context.people,
        timeBudgetMin: context.timeBudgetMin as 15 | 30 | 60,
        mustUseIngredients: mustUseResolved.ids,
      },
      library,
      history,
    });

    const candidates: Candidate[] = result.candidates.map((sm) => ({
      menuId: sm.menuId,
      score: sm.score,
      reasons: sm.reasons,
      breakdown: sm.breakdown,
      menu: library.find((m) => m.id === sm.menuId),
    }));

    // 空手（PD-001/C-7）：没有任何方案能消耗全部必消 -> 不建 Plan、不写 Event、
    // 不改今晚设置；返回无法消耗的必消食材原文，供前端渲染空手说明页
    if (candidates.length === 0) {
      return {
        candidates,
        unmetMustUse: result.unsatisfiableMustUse.map(
          (id) => mustUseResolved.idToRaw.get(id) ?? id,
        ),
      };
    }

    const plan = await prisma.plan.create({
      data: {
        familyId: FAMILY_ID,
        planDate: new Date(),
        context: context,
        candidates: candidates as unknown as object,
        status: 'PROPOSED',
      },
    });

    await prisma.event.create({
      data: {
        familyId: FAMILY_ID,
        planId: plan.id,
        type: 'GENERATE',
      },
    });

    return { candidates, planId: plan.id };
  },

  // ── F3: 锁定 ──

  async lockPlan(planId: string, menuId: string): Promise<Plan> {
    const plan = await prisma.plan.findUnique({ where: { id: planId } });
    if (!plan) {
      throw new NotFoundError(`Plan ${planId} not found`);
    }

    const updated = await prisma.plan.update({
      where: { id: planId },
      data: { lockedMenuId: menuId, status: 'LOCKED' },
    });

    await prisma.event.create({
      data: {
        familyId: FAMILY_ID,
        planId,
        type: 'LOCK',
        payload: { menuId },
      },
    });

    return toPlan(updated as PlanRow);
  },

  // ── F3: 换菜 ──

  async swapPlan(
    planId: string,
    swapType: SwapType,
    dishId?: string,
    newDishId?: string,
    reason?: string,
  ): Promise<Plan> {
    const plan = await prisma.plan.findUnique({ where: { id: planId } });
    if (!plan) {
      throw new NotFoundError(`Plan ${planId} not found`);
    }

    const candidates = plan.candidates as Candidate[];

    if (swapType === '全换') {
      // 直接从 DB 查所有 PUBLISHED Menu，排除当前候选
      const context = plan.context as PlanContext;
      const excludeMenuIds = candidates.map((c) => c.menuId);

      const [rules, exclusions, library, history] = await Promise.all([
        loadFamilyRuleView(FAMILY_ID),
        loadExclusionViews(FAMILY_ID),
        loadMenuViews(),
        loadEventViews(FAMILY_ID),
      ]);

      // 用推荐引擎获取所有评分候选（不只 top 3）
      const result = recommend({
        rules,
        exclusions,
        context: {
          people: context.people,
          timeBudgetMin: context.timeBudgetMin as 15 | 30 | 60,
          mustUseIngredients: context.mustUse,
        },
        library,
        history,
      });

      // 从所有候选中排除当前的，取新的 3 套
      const freshCandidates: Candidate[] = result.candidates
        .filter((sm) => !excludeMenuIds.includes(sm.menuId))
        .slice(0, 3)
        .map((sm) => ({
          menuId: sm.menuId,
          score: sm.score,
          reasons: sm.reasons,
          breakdown: sm.breakdown,
          menu: library.find((m) => m.id === sm.menuId),
        }));

      let finalCandidates: Candidate[];
      if (freshCandidates.length >= 3) {
        finalCandidates = freshCandidates;
      } else {
        // 候选不足 3 套：从 DB 查所有 PUBLISHED Menu 补充（放宽时间限制）
        const allMenus = library.filter(
          (m) => m.status === 'PUBLISHED' && !excludeMenuIds.includes(m.id),
        );
        const seen = new Set(freshCandidates.map((c) => c.menuId));
        for (const m of allMenus) {
          if (!seen.has(m.id)) {
            freshCandidates.push({
              menuId: m.id,
              score: 0.5,
              reasons: ['替换候选'],
              breakdown: { historyAcceptance: 0.5, timeDifficulty: 0.8, ingredientReuse: 0.5, preferenceCoverage: 0.5, recentDiversity: 0.5, categoryDiversity: 0.5 },
              menu: m,
            });
            seen.add(m.id);
          }
          if (freshCandidates.length >= 3) break;
        }
        // 如果还不够 3 套，用旧候选打乱补充
        if (freshCandidates.length < 3) {
          const shuffled = [...candidates].sort(() => Math.random() - 0.5);
          for (const c of shuffled) {
            if (!seen.has(c.menuId)) {
              freshCandidates.push(c);
              seen.add(c.menuId);
            }
            if (freshCandidates.length >= 3) break;
          }
        }
        finalCandidates = freshCandidates;
      }

      const newMenuId = finalCandidates[0]?.menuId ?? plan.lockedMenuId ?? '';

      const updated = await prisma.plan.update({
        where: { id: planId },
        data: {
          candidates: finalCandidates as unknown as object,
          lockedMenuId: newMenuId,
        },
      });

      await prisma.event.create({
        data: {
          familyId: FAMILY_ID,
          planId,
          type: 'SWAP_MENU',
          payload: { reason, oldMenuId: plan.lockedMenuId, newMenuId },
        },
      });

      return toPlan(updated as PlanRow);
    }

    // ── 单菜换（DEC-013：真实替换，杜绝假成功） ──
    if (plan.status !== 'LOCKED' || !plan.lockedMenuId) {
      throw new PlanStateError('计划尚未锁定菜单，请先锁定今晚方案');
    }
    if (!dishId || !newDishId) {
      throw new SwapRecheckError('单菜换必须携带 dishId 与 newDishId');
    }

    const { menuView, candidateIndex } = await hydrateLockedMenu(
      plan as PlanRow & { lockedMenuId: string },
    );
    const outgoingDish = menuView.dishes.find((d) => d.id === dishId);
    if (!outgoingDish) {
      throw new NotFoundError(`今晚菜单中没有这道菜：${dishId}`);
    }

    // 服务端复检：新菜须过五层过滤（safety/器具/时长/mustUse 接住 orphaned/不在菜单）
    const { passed, filtered } = await runSwapFilter(plan, menuView, outgoingDish);
    const newDish = passed.find((d) => d.id === newDishId);
    if (!newDish) {
      const trace = filtered.find((f) => f.menuId === newDishId);
      throw new SwapRecheckError(
        trace ? `不能换成这道菜：${trace.rule}` : '不能换成这道菜（不在可换候选池中）',
        trace ? [trace] : [],
      );
    }

    // 快照重写：新菜继承被换菜的槽位，prepSequence/totalActiveMinutes 重算
    const newDishes = [...menuView.dishes];
    newDishes[newDishes.findIndex((d) => d.id === dishId)] = newDish;
    const newMenuView: MenuView = {
      ...menuView,
      dishes: newDishes,
      totalActiveMinutes: newDishes.reduce((sum, d) => sum + d.activeMinutes, 0),
      prepSequence: buildPrepSequence(newDishes),
    };

    // 清单重算写回（按今晚人数缩放 + 必消标记，按 ingredientId 保留勾选）+ 锁定候选快照原地重写
    const swapContext = plan.context as PlanContext;
    const swapMustUse = await resolveMustUseIds(swapContext.mustUse);
    const shoppingList = computeShoppingList(
      newMenuView,
      swapContext.people,
      (plan.shoppingList as ShoppingList | null) ?? null,
      new Set(swapMustUse.ids),
    );
    candidates[candidateIndex] = { ...candidates[candidateIndex], menu: newMenuView };

    const updated = await prisma.plan.update({
      where: { id: planId },
      data: {
        candidates: candidates as unknown as object,
        shoppingList: shoppingList as unknown as object,
      },
    });

    await prisma.event.create({
      data: {
        familyId: FAMILY_ID,
        planId,
        type: 'SWAP_DISH',
        payload: {
          dishId,
          newDishId,
          reason: reason ?? null,
          oldDishName: outgoingDish.name,
          newDishName: newDish.name,
          regenerated: true,
        },
      },
    });

    return toPlan(updated as PlanRow);
  },

  // ── F3: 换菜候选（TP-03/DEC-013） ──

  async getSwapOptions(planId: string, dishId: string): Promise<SwapOptionsResponse> {
    const plan = await requireLockedPlan(planId);
    const { menuView } = await hydrateLockedMenu(plan);
    const outgoingDish = menuView.dishes.find((d) => d.id === dishId);
    if (!outgoingDish) {
      throw new NotFoundError(`今晚菜单中没有这道菜：${dishId}`);
    }

    const { passed } = await runSwapFilter(plan, menuView, outgoingDish);

    return {
      dishId,
      mealRole: outgoingDish.mealRole,
      candidates: passed.map((d) => ({
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

  // ── F4/F5: 采购清单 ──

  async getShoppingList(planId: string): Promise<ShoppingList> {
    const plan = await prisma.plan.findUnique({ where: { id: planId } });
    if (!plan) {
      throw new NotFoundError(`Plan ${planId} not found`);
    }
    if (!plan.lockedMenuId) {
      throw new NotFoundError(`Plan ${planId} has no locked menu`);
    }

    // 快照优先（DEC-013）：从锁定候选的 menu 快照读，缺则懒水合；
    // 重算后按 ingredientId 保留旧清单勾选状态（修复每次清空勾选的缺陷）
    const { menuView } = await hydrateLockedMenu(
      plan as PlanRow & { lockedMenuId: string },
    );
    const context = plan.context as PlanContext;
    const mustUseResolved = await resolveMustUseIds(context.mustUse);
    const shoppingList = computeShoppingList(
      menuView,
      context.people,
      (plan.shoppingList as ShoppingList | null) ?? null,
      new Set(mustUseResolved.ids),
    );

    await prisma.plan.update({
      where: { id: planId },
      data: { shoppingList: shoppingList as unknown as object },
    });

    return shoppingList;
  },

  async patchShoppingList(
    planId: string,
    itemId: string,
    checked: boolean,
  ): Promise<ShoppingList> {
    const plan = await prisma.plan.findUnique({ where: { id: planId } });
    if (!plan) {
      throw new NotFoundError(`Plan ${planId} not found`);
    }

    // 如果 shoppingList 不存在，先生成
    let shoppingList = (plan.shoppingList as ShoppingList | null) ?? null;
    if (!shoppingList) {
      shoppingList = await this.getShoppingList(planId);
    }

    // 更新勾选状态
    const updatedGroups = shoppingList.groups.map((group) => ({
      ...group,
      items: group.items.map((item) =>
        item.ingredientId === itemId ? { ...item, checked } : item,
      ),
    }));
    const updatedList: ShoppingList = { groups: updatedGroups };

    await prisma.plan.update({
      where: { id: planId },
      data: { shoppingList: updatedList as unknown as object },
    });

    return updatedList;
  },

  /** 改人数重算清单（TP-04/DEC-014 裁决 3）：同步今晚人数 -> 重算清单（保留勾选）-> Event RESCALE */
  async rescaleShoppingList(planId: string, people: number): Promise<ShoppingList> {
    const plan = await requireLockedPlan(planId);
    const context = plan.context as PlanContext;
    const from = context.people;
    context.people = people;

    // 水合锁定菜单，按新人数重算（必消标「已有」+ 按 ingredientId 保留勾选）
    const { menuView } = await hydrateLockedMenu(plan);
    const mustUseResolved = await resolveMustUseIds(context.mustUse);
    const shoppingList = computeShoppingList(
      menuView,
      people,
      (plan.shoppingList as ShoppingList | null) ?? null,
      new Set(mustUseResolved.ids),
    );

    await prisma.plan.update({
      where: { id: planId },
      data: {
        context: context as unknown as object,
        shoppingList: shoppingList as unknown as object,
      },
    });

    await prisma.event.create({
      data: {
        familyId: FAMILY_ID,
        planId,
        type: 'RESCALE',
        payload: { from, to: people },
      },
    });

    return shoppingList;
  },

  // ── F6: 反馈 ──

  async addFeedback(
    planId: string,
    result: FeedbackResult,
    actualMinutes?: number,
    cookResult?: CookResult,
    failPoints?: string,
  ): Promise<Plan> {
    const plan = await prisma.plan.findUnique({ where: { id: planId } });
    if (!plan) {
      throw new NotFoundError(`Plan ${planId} not found`);
    }

    const eventType = result === 'cooked' ? 'COOKED' : result === 'not_cooked' ? 'NOT_COOKED' : 'REPEAT';
    const newStatus: PlanStatus = result === 'cooked' ? 'COOKED' : result === 'not_cooked' ? 'SKIPPED' : (plan.status as PlanStatus);

    const updated = await prisma.plan.update({
      where: { id: planId },
      data: { status: newStatus },
    });

    await prisma.event.create({
      data: {
        familyId: FAMILY_ID,
        planId,
        type: eventType,
        payload: actualMinutes !== undefined ? { actualMinutes } : undefined,
      },
    });

    // 烹饪结果落 CookLog（DEC-011：result=cooked 且 cookResult 有值时写）
    // CookLog model 无 familyId 字段（schema.prisma 事实源，边界禁改），任务卡示例的 familyId 此处不传
    // menuId 用 ?? null（CookLog.menuId 可选，避免空字符串违反外键约束）
    if (result === 'cooked' && cookResult) {
      await prisma.cookLog.create({
        data: {
          menuId: plan.lockedMenuId ?? null,
          result: cookResult,
          failPoints: failPoints ?? null,
          actualMinutes: actualMinutes ?? null,
        },
      });
    }

    return toPlan(updated as PlanRow);
  },

  // ── F7: 历史与复做 ──

  async listPlans(): Promise<Plan[]> {
    const plans = await prisma.plan.findMany({
      where: { familyId: FAMILY_ID },
      orderBy: { createdAt: 'desc' },
    });
    return plans.map((p) => toPlan(p as PlanRow));
  },

  async repeatPlan(planId: string): Promise<Plan> {
    const original = await prisma.plan.findUnique({ where: { id: planId } });
    if (!original) {
      throw new NotFoundError(`Plan ${planId} not found`);
    }

    const context = original.context as PlanContext;
    const recommendation = await this.generateRecommendation(context);
    // 复做遇到空手情境（TP-02 硬过滤）：无新 Plan 可建 -> 如实报 404
    if (recommendation.planId === undefined) {
      throw new NotFoundError(`无法复做：该情境下没有能消耗必消食材的方案`);
    }
    const newPlanId = recommendation.planId;

    const newPlan = await prisma.plan.findUnique({ where: { id: newPlanId } });
    if (!newPlan) {
      throw new NotFoundError(`New plan ${newPlanId} not found`);
    }

    await prisma.event.create({
      data: {
        familyId: FAMILY_ID,
        planId: newPlanId,
        type: 'REPEAT',
        payload: { originalPlanId: planId },
      },
    });

    return toPlan(newPlan as PlanRow);
  },
};
