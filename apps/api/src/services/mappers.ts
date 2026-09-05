// apps/api/src/services/mappers.ts
// View 类型映射：Prisma 查询结果 -> engine View 类型（AC8 核心职责）
// engine 零 IO，输入输出全是内存对象，API 层负责从 DB 投影到 View

import type {
  DishStep,
  EventType,
  ExclusionScope,
  MealRole,
  ContentStatus,
  MenuScene,
  PrepSequenceItem,
  Severity,
} from '@family-menu/shared';
import type {
  DishIngredientView,
  DishView,
  EventView,
  ExclusionView,
  FamilyRuleView,
  MenuView,
} from '@family-menu/engine';

// ───── Prisma 查询结果行类型（与 schema.prisma 字段对齐） ─────

interface IngredientRow {
  id: string;
  name: string;
  aliases: string[];
  category: string;
  defaultUnit: string;
}

interface DishIngredientRow {
  qty: number;
  unit: string;
  optional: boolean;
  ingredient: IngredientRow;
}

interface DishRow {
  id: string;
  name: string;
  mealRole: string;
  cuisine: string | null;
  flavorTags: string[];
  spicyLevel: number;
  splitFlavor: boolean;
  activeMinutes: number;
  totalMinutes: number;
  equipment: string[];
  steps: unknown;
  status: string;
  ingredients: DishIngredientRow[];
}

interface MenuDishRow {
  dish: DishRow;
}

interface MenuRow {
  id: string;
  name: string;
  scene: string;
  serves: number;
  totalActiveMinutes: number;
  prepSequence: unknown;
  status: string;
  dishes: MenuDishRow[];
}

interface FamilyRuleRow {
  familyId: string;
  defaultPeople: number;
  timeBudgets: number[];
  equipment: string[];
  cuisines: string[];
}

interface ExclusionRuleRow {
  id: string;
  scope: string;
  targetId: string | null;
  targetTag: string | null;
  severity: string;
  note: string | null;
}

interface EventRow {
  id: string;
  type: string;
  createdAt: Date;
  payload: unknown;
  plan: { lockedMenuId: string | null } | null;
}

// ───── 映射函数 ─────

export function toFamilyRuleView(row: FamilyRuleRow): FamilyRuleView {
  return {
    familyId: row.familyId,
    defaultPeople: row.defaultPeople,
    timeBudgets: row.timeBudgets,
    equipment: row.equipment,
    cuisines: row.cuisines,
  };
}

export function toExclusionView(
  row: ExclusionRuleRow,
  ingredient?: IngredientRow | null,
): ExclusionView {
  return {
    id: row.id,
    scope: row.scope as ExclusionScope,
    targetId: row.targetId ?? undefined,
    targetTag: row.targetTag ?? undefined,
    severity: row.severity as Severity,
    note: row.note ?? undefined,
    targetName: ingredient?.name,
    targetAliases: ingredient?.aliases,
  };
}

export function toDishIngredientView(row: DishIngredientRow): DishIngredientView {
  return {
    ingredientId: row.ingredient.id,
    ingredientName: row.ingredient.name,
    aliases: row.ingredient.aliases,
    category: row.ingredient.category,
    defaultUnit: row.ingredient.defaultUnit,
    qty: row.qty,
    unit: row.unit,
    optional: row.optional,
  };
}

export function toDishView(row: DishRow): DishView {
  return {
    id: row.id,
    name: row.name,
    mealRole: row.mealRole as MealRole,
    cuisine: row.cuisine ?? undefined,
    flavorTags: row.flavorTags,
    spicyLevel: row.spicyLevel,
    splitFlavor: row.splitFlavor,
    activeMinutes: row.activeMinutes,
    totalMinutes: row.totalMinutes,
    equipment: row.equipment,
    steps: row.steps as DishStep[],
    status: row.status as ContentStatus,
    ingredients: row.ingredients.map(toDishIngredientView),
  };
}

export function toMenuView(row: MenuRow): MenuView {
  return {
    id: row.id,
    name: row.name,
    scene: row.scene as MenuScene,
    serves: row.serves,
    totalActiveMinutes: row.totalActiveMinutes,
    prepSequence: row.prepSequence as PrepSequenceItem[],
    status: row.status as ContentStatus,
    dishes: row.dishes.map((md) => toDishView(md.dish)),
  };
}

/**
 * Event -> EventView。menuId/dishId/cookedResult/willRepeat 为 join 后字段（契约注释见 engine types），
 * 从事件 payload 与关联 Plan 提取：
 * - LOCK: payload.menuId（该菜单成为今晚计划）
 * - SWAP_MENU: payload.newMenuId（换菜后今晚的菜单）
 * - SWAP_DISH: payload.dishId（菜品级换新）
 * - COOKED: plan.lockedMenuId；payload.taste 单向映射 cookedResult（good->success/ok->partial/fail->fail，
 *   与 addFeedback 写 CookLog 用同一映射）；payload.willRepeat
 * - NOT_COOKED/GENERATE/VIEW/REPEAT/RESCALE：不带 menuId（没做成/未选定，不参与"7天内已做过"降权）
 */
export function toEventView(row: EventRow): EventView {
  const payload = (row.payload ?? {}) as {
    menuId?: string;
    newMenuId?: string;
    dishId?: string;
    taste?: string;
    willRepeat?: boolean;
  };
  const view: EventView = {
    id: row.id,
    type: row.type as EventType,
    createdAt: row.createdAt,
  };
  if (row.type === 'LOCK' && typeof payload.menuId === 'string') {
    view.menuId = payload.menuId;
  } else if (row.type === 'SWAP_MENU' && typeof payload.newMenuId === 'string') {
    view.menuId = payload.newMenuId;
  } else if (row.type === 'SWAP_DISH' && typeof payload.dishId === 'string') {
    view.dishId = payload.dishId;
  } else if (row.type === 'COOKED') {
    const lockedMenuId = row.plan?.lockedMenuId ?? undefined;
    if (lockedMenuId) view.menuId = lockedMenuId;
    if (payload.taste === 'good') view.cookedResult = 'success';
    else if (payload.taste === 'ok') view.cookedResult = 'partial';
    else if (payload.taste === 'fail') view.cookedResult = 'fail';
    if (typeof payload.willRepeat === 'boolean') view.willRepeat = payload.willRepeat;
  }
  return view;
}

// ───── list-merger 输入映射（MenuView -> ShoppingMenu 鸭子类型兼容） ─────

import type { ShoppingMenu, ShoppingIngredient } from '@family-menu/list-merger';

export function toShoppingMenu(menu: MenuView): ShoppingMenu {
  return {
    id: menu.id,
    name: menu.name,
    dishes: menu.dishes.map((dish) => ({
      ingredients: dish.ingredients.map(
        (ing): ShoppingIngredient => ({
          ingredientId: ing.ingredientId,
          ingredientName: ing.ingredientName,
          aliases: ing.aliases,
          category: ing.category,
          defaultUnit: ing.defaultUnit,
          qty: ing.qty,
          unit: ing.unit,
          optional: ing.optional,
        }),
      ),
    })),
  };
}
