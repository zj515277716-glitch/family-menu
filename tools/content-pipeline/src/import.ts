// tools/content-pipeline/src/import.ts
// 导入 CLI 核心逻辑：审核通过的 JSON -> DB status=DRAFT
// 对齐 AC5/AC6：仅写入 DRAFT（双保险：DB status 三态 + import 只写 DRAFT）
// DEC-006：产物只落 DRAFT，升级仅通过试做记录 CookLog

import { z } from 'zod';
import { DishSchema, type DishStep } from '@family-menu/shared';
import { DraftIngredientSchema, type DraftDish } from './draft.js';

// ───── 写入接口（注入，便于测试 mock；CLI 入口用真实 PrismaClient 实现）─────

/**
 * 菜品-食材关联写入数据（含食材元信息，用于 upsert Ingredient）。
 */
export interface DishIngredientLinkInput {
  // 食材元信息（upsert Ingredient 用，按 name 唯一）
  name: string;
  aliases: string[];
  category: string;
  defaultUnit: string;
  // 本次用量（带用量与单位，AC4 约束）
  qty: number;
  unit: string;
  optional: boolean;
}

/**
 * Dish 写入数据（工具内部类型，对齐 Prisma Dish model 字段）。
 * status/origin 为字面量类型，编译时保证只能 DRAFT/LLM_DRAFT（双保险第二层）。
 */
export interface DishDraftCreateInput {
  name: string;
  mealRole: string;
  cuisine?: string;
  flavorTags: string[];
  spicyLevel: number;
  splitFlavor: boolean;
  activeMinutes: number;
  totalMinutes: number;
  equipment: string[];
  steps: DishStep[];
  status: 'DRAFT'; // 字面量类型：双保险，编译期锁定
  origin: 'LLM_DRAFT'; // 字面量类型：双保险，编译期锁定
  licenseNote?: string;
  ingredients: DishIngredientLinkInput[];
}

/**
 * 草稿写入器抽象（DI 接口）。
 * 真实实现用 PrismaClient（CLI 入口）；测试用 mock 实现。
 */
export interface DraftWriter {
  /** upsert Ingredient（按 name 唯一），返回 ingredientId */
  upsertIngredient(input: {
    name: string;
    aliases: string[];
    category: string;
    defaultUnit: string;
  }): Promise<{ id: string }>;
  /** 创建 Dish + 嵌套 DishIngredient 关联（ingredientId 已在 input 中填充） */
  createDishWithIngredients(input: {
    dish: Omit<DishDraftCreateInput, 'ingredients'>;
    ingredients: { ingredientId: string; qty: number; unit: string; optional: boolean }[];
  }): Promise<{ id: string }>;
}

// ───── 草稿 JSON 校验 schema（复用 draft.ts 的 DraftIngredientSchema）─────

/**
 * 草稿文件 JSON 校验 schema。
 * dish 部分过 DishSchema（AC3 一致），ingredients 部分过 DraftIngredientSchema。
 * 因 DishSchema 冻结不含 ingredients，工具内部组合（HOW，不改 shared）。
 */
export const DraftFileSchema = DishSchema.extend({
  ingredients: z.array(DraftIngredientSchema),
});

// ───── 核心纯函数：准备写入数据（校验 + 强制 DRAFT）─────

/**
 * 校验草稿 JSON 并准备 DB 写入数据。
 * 双保险第一层：强制 status='DRAFT' + origin='LLM_DRAFT'（即使 JSON 写了别的也覆盖）。
 * 纯函数，可单测。
 *
 * @param jsonRaw 草稿文件内容（对象或 JSON 字符串）
 * @returns 安全的 DishDraftCreateInput（status/origin 恒为 DRAFT/LLM_DRAFT）
 * @throws 校验失败
 */
export function prepareDraftDish(jsonRaw: unknown): DishDraftCreateInput {
  const obj: Record<string, unknown> =
    typeof jsonRaw === 'string'
      ? (JSON.parse(jsonRaw) as Record<string, unknown>)
      : (jsonRaw as Record<string, unknown>);

  // 过组合 schema 校验（dish + ingredients）
  const validated = DraftFileSchema.parse({
    ...obj,
    // 强制安全字段（双保险第一层：覆盖任何输入值）
    id: `import-${Date.now()}`, // 临时 id 过 schema 校验，DB 生成真实 id
    status: 'DRAFT',
    origin: 'LLM_DRAFT',
  }) as DraftDish;

  // 组装写入数据（字面量类型锁定 status/origin）
  const input: DishDraftCreateInput = {
    name: validated.name,
    mealRole: validated.mealRole,
    cuisine: validated.cuisine,
    flavorTags: validated.flavorTags,
    spicyLevel: validated.spicyLevel,
    splitFlavor: validated.splitFlavor,
    activeMinutes: validated.activeMinutes,
    totalMinutes: validated.totalMinutes,
    equipment: validated.equipment,
    steps: validated.steps,
    status: 'DRAFT', // 双保险：字面量类型，编译期锁定
    origin: 'LLM_DRAFT', // 双保险：字面量类型，编译期锁定
    licenseNote: validated.licenseNote,
    ingredients: validated.ingredients.map((ing) => ({
      name: ing.name,
      aliases: ing.aliases ?? [],
      category: ing.category,
      defaultUnit: ing.defaultUnit,
      qty: ing.qty,
      unit: ing.unit,
      optional: ing.optional ?? false,
    })),
  };

  return input;
}

// ───── 核心：导入（upsert 食材 + 创建菜品）─────

export interface ImportResult {
  dishId: string;
  ingredientCount: number;
}

/**
 * 导入草稿菜品到 DB。
 * 1. prepareDraftDish 校验 + 强制 DRAFT
 * 2. 对每个食材 upsert Ingredient（按 name 唯一）拿 ingredientId
 * 3. createDishWithIngredients 创建菜品 + 关联（status/origin 已锁定 DRAFT/LLM_DRAFT）
 *
 * 双保险：
 *  - 第一层：prepareDraftDish 强制 status='DRAFT' origin='LLM_DRAFT'（覆盖任何输入）
 *  - 第二层：DishDraftCreateInput.status/origin 字面量类型，编译期锁定
 *  - DB 层：ContentStatus 三态枚举，import 只写 DRAFT，无升级路径（DEC-006）
 *
 * @param jsonRaw 草稿文件内容
 * @param writer DraftWriter 实现（CLI 注入 PrismaClient，测试注入 mock）
 * @returns 新菜品 id + 食材数量
 */
export async function importDraft(
  jsonRaw: unknown,
  writer: DraftWriter,
): Promise<ImportResult> {
  // 第一层：校验 + 强制 DRAFT
  const input = prepareDraftDish(jsonRaw);

  // 第二层：upsert 食材，拿到 ingredientId
  const ingredientLinks: { ingredientId: string; qty: number; unit: string; optional: boolean }[] = [];
  for (const ing of input.ingredients) {
    const upserted = await writer.upsertIngredient({
      name: ing.name,
      aliases: ing.aliases,
      category: ing.category,
      defaultUnit: ing.defaultUnit,
    });
    ingredientLinks.push({
      ingredientId: upserted.id,
      qty: ing.qty,
      unit: ing.unit,
      optional: ing.optional,
    });
  }

  // 第三层：创建菜品（status/origin 字面量类型已锁定 DRAFT/LLM_DRAFT）
  const { ingredients: _removed, ...dishFields } = input;
  void _removed;
  const created = await writer.createDishWithIngredients({
    dish: dishFields,
    ingredients: ingredientLinks,
  });

  return { dishId: created.id, ingredientCount: ingredientLinks.length };
}

// ───── 文件读取辅助 ─────

/**
 * 读取草稿 JSON 文件并导入。
 * @param filePath 草稿文件路径（out/*.draft.json）
 * @param writer DraftWriter 实现
 */
export async function importDraftFile(
  filePath: string,
  writer: DraftWriter,
): Promise<ImportResult> {
  const fs = await import('node:fs');
  const content = fs.readFileSync(filePath, 'utf-8');
  return importDraft(content, writer);
}
