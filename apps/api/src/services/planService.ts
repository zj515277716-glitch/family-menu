// apps/api/src/services/planService.ts
// 引擎编排：调 engine.recommend + list-merger.mergeShoppingList + Prisma 持久化
// 路由薄、逻辑在 services（AGENTS.md 铁律），planService 是 API 层核心业务逻辑

import { composeMenusByRole, filterSwapCandidates, recommend } from '@family-menu/engine';
import type { DishView, MenuView } from '@family-menu/engine';
import { mergeShoppingList, type ShoppingList } from '@family-menu/list-merger';
import type {
  Candidate,
  ExclusionRule,
  FamilyRule,
  FeedbackRequest,
  FeedbackResponse,
  MealRole,
  Plan,
  PlanContext,
  PlanStatus,
  PrepSequenceItem,
  PutExclusionsRequest,
  SwapOptionsResponse,
  SwapType,
  Taste,
} from '@family-menu/shared';
import { prisma } from '../db.js';
import { matchMustUseNames } from '../utils/must-use-matcher.js';
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

// T-P07（R-2 挂账）：两条 dishes 关联查询补 orderBy: { sort: 'asc' }，与 listPlans 既有口径一致；
// export 供集成测试直接断言「乱序写入后读出按 sort 序」（逻辑仍在 services，路由不经此）。
export async function loadMenuViews(): Promise<ReturnType<typeof toMenuView>[]> {
  const menus = await prisma.menu.findMany({
    where: { status: 'PUBLISHED' },
    include: {
      dishes: {
        orderBy: { sort: 'asc' },
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

/**
 * T-P16/PD-018：加载全角色 PUBLISHED 菜池（槽位组合层输入，含食材关联）。
 * 按 id 升序确定性排序，保证同条件组合可复现（AC6 换一批语义基线）。
 */
async function loadPublishedDishViews(): Promise<DishView[]> {
  const dishes = await prisma.dish.findMany({
    where: { status: 'PUBLISHED' },
    orderBy: { id: 'asc' },
    include: { ingredients: { include: { ingredient: true } } },
  });
  return dishes.map(toDishView);
}

async function loadEventViews(familyId: string) {
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const events = await prisma.event.findMany({
    where: { familyId, createdAt: { gte: since } },
    orderBy: { createdAt: 'desc' },
    include: { plan: { select: { lockedMenuId: true } } },
  });
  return events.map(toEventView);
}

// ── 内部辅助：mustUse 用户原文 -> ingredientId 稳定映射（TP-02） ──

/**
 * mustUse 用户原文 -> ingredientId 稳定映射（T-P05 方案 E 分层匹配）。
 * 匹配纯函数在 utils/must-use-matcher.ts（零 IO）：层 1 精确等值（trim->小写，name/aliases
 * 先到先得，与既有行为同构）-> 层 2 双向子串（恰好命中 1 个食材才采纳，≥2 个歧义不猜）；
 * 未映射的原文原样透传（引擎按 ingredientId 匹配不到 -> 必然空手，unmetMustUse 回传原文）。
 */
async function resolveMustUseIds(
  rawNames: string[],
): Promise<{ ids: string[]; idToRaw: Map<string, string> }> {
  if (rawNames.length === 0) {
    return { ids: [], idToRaw: new Map<string, string>() };
  }
  const ingredients = await prisma.ingredient.findMany({ orderBy: { id: 'asc' } });
  const { ids, idToRaw } = matchMustUseNames(
    rawNames,
    ingredients.map((i) => ({ id: i.id, name: i.name, aliases: i.aliases })),
  );
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
        orderBy: { sort: 'asc' }, // T-P07（R-2）：懒水合同样按 sort 序
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

export { hydrateLockedMenu };

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
    // targetName 回填：scope=INGREDIENT 时 join Ingredient 取 name，避免 H5 直渲 cuid（实测乱码 bug）
    const ingredientIds = rules
      .filter((r) => r.scope === 'INGREDIENT' && r.targetId)
      .map((r) => r.targetId!);
    const ingredients =
      ingredientIds.length > 0
        ? await prisma.ingredient.findMany({ where: { id: { in: ingredientIds } } })
        : [];
    const nameMap = new Map(ingredients.map((i) => [i.id, i.name]));
    // Prisma 可空列读出 null；契约 optional 字段仅接受 undefined（TAG 类禁忌 targetId 恒为 null）
    return rules.map((r) => ({
      ...r,
      targetId: r.targetId ?? undefined,
      targetTag: r.targetTag ?? undefined,
      targetName:
        r.scope === 'INGREDIENT' && r.targetId ? nameMap.get(r.targetId) : undefined,
      note: r.note ?? undefined,
    }));
  },

  // ── putExclusions 语义口径（PE-1，2026-09-13）──
  // PUT /api/family/exclusions 为「全量替换」，但仅对【用户行】生效；seed- 前缀行受 API 层保护：
  //   1) deleteMany 排除 id 以 'seed-' 开头的行 —— seed 灌入的 3 条禁忌规则（seed-excl-peanut /
  //      seed-excl-organ / seed-excl-peanut-ing，含 HARD 花生食材级拦截）永不因前端保存被清除；
  //   2) createMany 过滤 payload 中 id 以 'seed-' 开头的行 —— 防同 id 主键冲突 P2002 导致整批失败，
  //      seed 行内容以库内现值为准（不被 payload 覆盖）。
  //   'seed-' 前缀是与 prisma/seed.ts 的约定（魔法值），变更 seed id 前缀须同步此处。
  // 已知边界（如实标注，勿隐瞒）：
  //   S-4 误删恢复：pnpm db:seed 重放（upsert update:{}）可恢复被误删的 seed 行，但不修复同 id 行
  //      内容被篡改（update 为空不会回写内容）；本接口已从删除与写入两侧封死 seed 行通道。
  //   S-5 删除复活：H5 保存前按 id 合并远端行（见 h5 setup 页），UI 删除的 seed 规则保存后会被复活；
  //      正式解法为长期方案 3（ExclusionRule 增加 source 列 SEED/USER，涉 shared 契约 + 迁移，另立卡）。
  // 过滤后 payload 为空数组是合法 NOOP（createMany({data:[]}) 返回 count 0，不抛错）。
  async putExclusions(rules: PutExclusionsRequest): Promise<ExclusionRule[]> {
    // 全量替换（对用户行）：事务内 deleteMany + createMany（与 PUT /api/family/rules 全量写入语义同构）
    // familyId 强制覆盖为 FAMILY_ID，防止跨家庭写入
    await prisma.$transaction([
      prisma.exclusionRule.deleteMany({
        where: { familyId: FAMILY_ID, id: { not: { startsWith: 'seed-' } } },
      }),
      prisma.exclusionRule.createMany({
        data: rules
          .filter((r) => !r.id.startsWith('seed-'))
          .map((r) => ({
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
  ): Promise<{
    candidates: Candidate[];
    planId?: string;
    unmetMustUse?: string[];
    /** 空手原因分类（T-P10/PD-017）：key=必消食材用户原文，与 unmetMustUse 同键集一一对应 */
    unmetReasons?: Record<string, 'TIME_BUDGET' | 'NO_DISH'>;
  }> {
    const [rules, exclusions, history, mustUseResolved, dishPool] = await Promise.all([
      loadFamilyRuleView(FAMILY_ID),
      loadExclusionViews(FAMILY_ID),
      loadEventViews(FAMILY_ID),
      resolveMustUseIds(context.mustUse),
      loadPublishedDishViews(),
    ]);

    // T-P16/PD-018：推荐 library = 槽位组合虚拟菜单（骨架：主菜⌈people/2⌉/SIDE 1/SOUP 1），
    // 不再依赖 Menu 原子匹配（AC1）；禁菜在组合层 dish 级预过滤（AC2），覆盖式生成保宽集；
    // mustUse 定向同桌 + 空手口径由 feasibility 层原样判定（AC3）
    const composition = composeMenusByRole(dishPool, {
      people: context.people,
      exclusions,
      mustUseIngredientIds: mustUseResolved.ids,
    });
    const library = composition.virtualMenus;

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
      // AC5 缺槽降级侧车：slotShortages 并入候选 reasons 透出（零契约变更，AC7）
      reasons: [...sm.reasons, ...(composition.slotShortages[sm.menuId] ?? [])],
      breakdown: sm.breakdown,
      menu: library.find((m) => m.id === sm.menuId),
    }));

    // 空手（PD-001/C-7）：没有任何方案能消耗全部必消 -> 不建 Plan、不写 Event、
    // 不改今晚设置；返回无法消耗的必消食材原文，供前端渲染空手说明页
    if (candidates.length === 0) {
      // 空手原因分类（T-P10/PD-017）：与 unmetMustUse 用同一 idToRaw 映射回译，
      // id 键 -> 用户原文键，同键集一一对应由构造保证（同源同序）
      const unmetReasons: Record<string, 'TIME_BUDGET' | 'NO_DISH'> = {};
      for (const [id, reason] of Object.entries(result.unsatisfiableMustUseReasons)) {
        unmetReasons[mustUseResolved.idToRaw.get(id) ?? id] = reason;
      }
      return {
        candidates,
        unmetMustUse: result.unsatisfiableMustUse.map(
          (id) => mustUseResolved.idToRaw.get(id) ?? id,
        ),
        unmetReasons,
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
      // T-P16/PD-018：换一批=换菜（AC6）——当前候选集用过的全部菜不回池，
      // 强制组合出不同的一批；虚拟菜单 id 每次动态生成，menuId 级排除已无意义
      const context = plan.context as PlanContext;
      const excludeDishIds = [
        ...new Set(
          candidates.flatMap((c) => {
            const menu = c.menu as MenuView | undefined;
            return menu && Array.isArray(menu.dishes)
              ? menu.dishes.map((d) => d.id)
              : [];
          }),
        ),
      ];

      // 用推荐引擎获取所有评分候选（不只 top 3）
      // T-P05（D2）：mustUse 同走 resolveMustUseIds 映射（修复遗留 bug——
      // 此前 context.mustUse 原文直传当 id，引擎匹配不到导致全换分支必消失效）
      const [rules, exclusions, history, mustUseResolved, dishPool] = await Promise.all([
        loadFamilyRuleView(FAMILY_ID),
        loadExclusionViews(FAMILY_ID),
        loadEventViews(FAMILY_ID),
        resolveMustUseIds(context.mustUse),
        loadPublishedDishViews(),
      ]);

      // T-P16/PD-018：library = 槽位组合虚拟菜单（剔除当前菜后重新组合）
      const composition = composeMenusByRole(dishPool, {
        people: context.people,
        exclusions,
        mustUseIngredientIds: mustUseResolved.ids,
        excludeDishIds,
      });
      const library = composition.virtualMenus;

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

      // 取新的 3 套（换批语义由 excludeDishIds 保证：菜品级不与当前重复）
      const freshCandidates: Candidate[] = result.candidates.slice(0, 3).map((sm) => ({
        menuId: sm.menuId,
        score: sm.score,
        // AC5 缺槽降级侧车并入 reasons（与主推荐同口径）
        reasons: [...sm.reasons, ...(composition.slotShortages[sm.menuId] ?? [])],
        breakdown: sm.breakdown,
        menu: library.find((m) => m.id === sm.menuId),
      }));

      let finalCandidates: Candidate[];
      if (freshCandidates.length >= 3) {
        finalCandidates = freshCandidates;
      } else {
        // 候选不足 3 套：从组合库兜底补充（含被时长档过滤的超时虚拟菜单，0.5 分兜底，
        // 保留原「放宽时间限制」语义）。库耗尽则如实返回不足 3 套——AC6 换批语义：
        // 当前候选用过的菜已全部剔除，不拿旧候选回填凑数。
        const seen = new Set(freshCandidates.map((c) => c.menuId));
        for (const m of library) {
          if (seen.has(m.id)) continue;
          freshCandidates.push({
            menuId: m.id,
            score: 0.5,
            reasons: ['替换候选'],
            breakdown: { historyAcceptance: 0.5, timeDifficulty: 0.8, ingredientReuse: 0.5, preferenceCoverage: 0.5, recentDiversity: 0.5, categoryDiversity: 0.5 },
            menu: m,
          });
          seen.add(m.id);
          if (freshCandidates.length >= 3) break;
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

  // ── F6: 反馈（v0.6 三问模型，DEC-015/TP-05，对应 C-10/PD-006） ──

  /**
   * 三问反馈写入（append-only 事件流，覆盖重提=追加新事件）。
   * didCook=true  -> Event COOKED，payload={taste, willRepeat, actualMinutes?}；并写 CookLog
   *                  （taste 映射 result：good->success / ok->partial / fail->fail，DEC-015 裁决 3）；
   * didCook=false -> Event NOT_COOKED，payload={willRepeat, actualMinutes?}（无 taste），不写 CookLog。
   * Plan.status：didCook->COOKED / 没做->SKIPPED（裁决 5，willRepeat 不影响 status）。
   * REPEAT 事件回归 repeatPlan 专属语义（反馈不再产生 REPEAT，消除旧 result='repeat' 语义 hack）。
   */
  async addFeedback(planId: string, data: FeedbackRequest): Promise<Plan> {
    const plan = await prisma.plan.findUnique({ where: { id: planId } });
    if (!plan) {
      throw new NotFoundError(`Plan ${planId} not found`);
    }

    const { didCook, taste, willRepeat, actualMinutes } = data;

    // payload 形状钉死（DEC-015 裁决 2）：taste 仅在做了时存在
    const payload: { taste?: Taste; willRepeat: boolean; actualMinutes?: number } = { willRepeat };
    if (didCook) payload.taste = taste;
    if (actualMinutes !== undefined) payload.actualMinutes = actualMinutes;

    const newStatus: PlanStatus = didCook ? 'COOKED' : 'SKIPPED';

    const updated = await prisma.plan.update({
      where: { id: planId },
      data: { status: newStatus },
    });

    await prisma.event.create({
      data: {
        familyId: FAMILY_ID,
        planId,
        type: didCook ? 'COOKED' : 'NOT_COOKED',
        payload,
      },
    });

    // CookLog 是内容升级唯一通道（DEC-006）：做了才写（没做即无试做，写了即伪造升级依据）
    // taste 单向映射为管线语义 result（good->success / ok->partial / fail->fail），Event payload 保留 taste 原值
    if (didCook) {
      const resultMapping: Record<Taste, 'success' | 'partial' | 'fail'> = {
        good: 'success',
        ok: 'partial',
        fail: 'fail',
      };
      // T-P16/PD-018：虚拟菜单 id（virt-*）不在 Menu 表，CookLog.menuId 有外键到 Menu，
      // 虚拟 id 直写会违反 FK -> 置 null（不伪造 menuId）；result/willRepeat/actualMinutes
      // 照常落库，内容升级通道（DEC-006）不受影响
      const lockedMenuId = plan.lockedMenuId ?? null;
      await prisma.cookLog.create({
        data: {
          menuId: lockedMenuId !== null && lockedMenuId.startsWith('virt-') ? null : lockedMenuId,
          result: resultMapping[taste as Taste],
          failPoints: null, // 三问无失败原因输入，字段留给内容管线
          willRepeat,
          actualMinutes: actualMinutes ?? null,
        },
      });
    }

    return toPlan(updated as PlanRow);
  },

  /**
   * 读取该 plan 最新一条反馈（GET /api/plans/:id/feedback，DEC-015 裁决 4；v0.9 空态修订 T-P12）。
   * didCook 由事件类型派生（COOKED/NOT_COOKED）；taste/willRepeat/actualMinutes 取事件 payload；
   * submittedAt = 事件创建时间。事件流 append-only：覆盖重提后自然取到最新一条。
   * taste/willRepeat/actualMinutes 可选 = v0.5 旧事件 payload 无这些字段，如实缺省不编造。
   * 无反馈 -> return null（v0.9：路由层 200 + JSON null）；plan 不存在仍 NotFoundError -> 404。
   */
  async getFeedback(planId: string): Promise<FeedbackResponse | null> {
    const plan = await prisma.plan.findUnique({ where: { id: planId } });
    if (!plan) {
      throw new NotFoundError(`Plan ${planId} not found`);
    }

    const event = await prisma.event.findFirst({
      where: { planId, type: { in: ['COOKED', 'NOT_COOKED'] } },
      orderBy: { createdAt: 'desc' },
    });
    if (!event) {
      return null;
    }

    const payload = (event.payload ?? {}) as {
      taste?: Taste;
      willRepeat?: boolean;
      actualMinutes?: number;
    };

    return {
      didCook: event.type === 'COOKED',
      taste: payload.taste,
      willRepeat: payload.willRepeat,
      actualMinutes: payload.actualMinutes,
      submittedAt: event.createdAt,
    };
  },

  // ── F7: 历史与复做 ──

  async listPlans(): Promise<Plan[]> {
    const plans = await prisma.plan.findMany({
      where: { familyId: FAMILY_ID },
      orderBy: { createdAt: 'desc' },
    });
    // 真实菜名（e-final 屏⑫ rec-dishes）：按锁定菜单一次查出 全部 菜名，按 menuId 分组
    const menuIds = [...new Set(plans.map((p) => p.lockedMenuId).filter((id): id is string => !!id))];
    const dishRows = menuIds.length
      ? await prisma.menuDish.findMany({
          where: { menuId: { in: menuIds } },
          orderBy: { sort: 'asc' },
          select: { menuId: true, dish: { select: { name: true } } },
        })
      : [];
    const namesByMenu = new Map<string, string[]>();
    for (const row of dishRows) {
      const names = namesByMenu.get(row.menuId) ?? [];
      names.push(row.dish.name);
      namesByMenu.set(row.menuId, names);
    }
    return plans.map((p) => {
      const plan = toPlan(p as PlanRow);
      const names = p.lockedMenuId ? namesByMenu.get(p.lockedMenuId) : undefined;
      if (names && names.length > 0) {
        plan.dishNames = names;
      } else if (p.lockedMenuId) {
        // T-P16/PD-018：虚拟菜单（virt-*）不在 MenuDish 表，MenuDish 查询必落空 ->
        // 从该 plan 候选快照（DEC-013 方案 B：candidates.menu 持久化）回填菜名，
        // 历史页展示口径与锁定时一致；快照缺失则如实缺省（不编造菜名）
        const planCandidates = p.candidates as Candidate[] | null;
        const menu = Array.isArray(planCandidates)
          ? (planCandidates.find((c) => c.menuId === p.lockedMenuId)?.menu as MenuView | undefined)
          : undefined;
        if (menu && Array.isArray(menu.dishes)) {
          plan.dishNames = menu.dishes.map((d) => d.name);
        }
      }
      return plan;
    });
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
