// apps/api/src/services/planService.ts
// 引擎编排：调 engine.recommend + list-merger.mergeShoppingList + Prisma 持久化
// 路由薄、逻辑在 services（AGENTS.md 铁律），planService 是 API 层核心业务逻辑

import { recommend } from '@family-menu/engine';
import { mergeShoppingList, type ShoppingList } from '@family-menu/list-merger';
import type {
  Candidate,
  CookResult,
  ExclusionRule,
  FamilyRule,
  FeedbackResult,
  Plan,
  PlanContext,
  PlanStatus,
  PutExclusionsRequest,
  SwapType,
} from '@family-menu/shared';
import { prisma } from '../db.js';
import {
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
    shoppingList: (row.shoppingList as Record<string, unknown> | null) ?? undefined,
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
  ): Promise<{ candidates: Candidate[]; planId: string }> {
    const [rules, exclusions, library, history] = await Promise.all([
      loadFamilyRuleView(FAMILY_ID),
      loadExclusionViews(FAMILY_ID),
      loadMenuViews(),
      loadEventViews(FAMILY_ID),
    ]);

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

    const candidates: Candidate[] = result.candidates.map((sm) => ({
      menuId: sm.menuId,
      score: sm.score,
      reasons: sm.reasons,
      breakdown: sm.breakdown,
      menu: library.find((m) => m.id === sm.menuId),
    }));

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
    reason?: string,
  ): Promise<Plan> {
    const plan = await prisma.plan.findUnique({ where: { id: planId } });
    if (!plan) {
      throw new NotFoundError(`Plan ${planId} not found`);
    }

    const candidates = plan.candidates as Candidate[];

    if (swapType === '全换') {
      // 重新推荐，排除当前候选的 menuId
      const context = plan.context as PlanContext;
      const excludeMenuIds = candidates.map((c) => c.menuId);

      const [rules, exclusions, library, history] = await Promise.all([
        loadFamilyRuleView(FAMILY_ID),
        loadExclusionViews(FAMILY_ID),
        loadMenuViews(),
        loadEventViews(FAMILY_ID),
      ]);

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

      // 过滤掉当前候选，取新的 3 套
      const newCandidates: Candidate[] = result.candidates
        .filter((sm) => !excludeMenuIds.includes(sm.menuId))
        .slice(0, 3)
        .map((sm) => ({
          menuId: sm.menuId,
          score: sm.score,
          reasons: sm.reasons,
          breakdown: sm.breakdown,
          menu: library.find((m) => m.id === sm.menuId),
        }));

      // 如果新候选不足，保留旧候选补充
      const finalCandidates = newCandidates.length > 0
        ? newCandidates
        : candidates;

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

    // 单菜换：记录事件，不修改候选
    await prisma.event.create({
      data: {
        familyId: FAMILY_ID,
        planId,
        type: 'SWAP_DISH',
        payload: { reason, dishId },
      },
    });

    return toPlan(plan as PlanRow);
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

    const menuView = toMenuView(menu);
    const shoppingMenu = toShoppingMenu(menuView);
    const shoppingList = mergeShoppingList(shoppingMenu);

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
    const { planId: newPlanId } = await this.generateRecommendation(context);

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
