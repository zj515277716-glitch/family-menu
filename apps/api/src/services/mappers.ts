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
  // T-P07 媒体投影字段（T-C01 既有列；null 投影为 undefined 走前端降级）
  imageUrl: string | null;
  sourceUrl: string | null;
  sourceSite: string | null;
  ingredients: DishIngredientRow[];
}

interface MenuDishRow {
  sort: number;
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

/**
 * Dish 视图 + 媒体投影字段（T-P07）。
 * engine 的 DishView 不含媒体字段（卡内禁改 engine），此处以交叉类型对齐 shared DishSchema
 * 既有可选字段 imageUrl/sourceUrl/sourceSite（T-C01）：多出的字段随 JSON 透传给前端
 * candidates.menu 快照，字段缺省（undefined）序列化后不出现，前端自动走无图降级。
 */
export type DishMediaView = DishView & {
  imageUrl?: string;
  sourceUrl?: string;
  sourceSite?: string;
};

export function toDishView(row: DishRow): DishMediaView {
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
    // T-P07 媒体投影：null -> undefined（不编造，缺省即降级）
    imageUrl: row.imageUrl ?? undefined,
    sourceUrl: row.sourceUrl ?? undefined,
    sourceSite: row.sourceSite ?? undefined,
  };
}

export function toMenuView(row: MenuRow): MenuView {
  // T-P07（R-4 挂账）：防御性按 MenuDish.sort 升序排序后再映射——
  // 与 planService 两条 dishes 关联查询的 orderBy: { sort: 'asc' } 口径一致，
  // 查询层 orderBy 缺失/调用方传入乱序行时，dishes 数组序仍等于 sort 序（=备菜顺序）。
  const dishes = [...row.dishes].sort((a, b) => a.sort - b.sort).map((md) => toDishView(md.dish));
  return {
    id: row.id,
    name: row.name,
    scene: row.scene as MenuScene,
    serves: row.serves,
    totalActiveMinutes: row.totalActiveMinutes,
    prepSequence: row.prepSequence as PrepSequenceItem[],
    status: row.status as ContentStatus,
    dishes,
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
