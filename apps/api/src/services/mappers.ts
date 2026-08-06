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

export function toEventView(row: EventRow): EventView {
  return {
    id: row.id,
    type: row.type as EventType,
    createdAt: row.createdAt,
  };
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
