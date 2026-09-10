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
 * 入库 origin（T-C03 扩展）：
 * - LLM_DRAFT：默认路径（内容管线起草），不削弱原双保险语义；
 * - FETCHED：外部站点抓取入库，仅经显式授权参数（CLI --origin FETCHED）放行（R-4 处置）。
 * 无论如何不允许 MANUAL / PUBLISHED / TESTED 从本工具落库（编译期字面量锁定）。
 */
export type ImportOrigin = 'LLM_DRAFT' | 'FETCHED';

/**
 * Dish 写入数据（工具内部类型，对齐 Prisma Dish model 字段）。
 * status 为字面量 'DRAFT'（双保险第二层，编译期锁定，T-C03 未削弱）；
 * origin 为 'LLM_DRAFT' | 'FETCHED' 两个字面量之一：默认路径恒 LLM_DRAFT，
 * FETCHED 需显式授权（normalizeOriginOption / CLI --origin FETCHED），编译期禁止其余取值。
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
  origin: ImportOrigin; // 字面量联合：LLM_DRAFT（默认）/ FETCHED（显式授权），编译期禁止其余取值
  licenseNote?: string;
  imageUrl?: string; // T-C01：菜品图片 URL（缺省 undefined=不落库）
  sourceUrl?: string; // T-C01：外部来源原帖地址（缺省 undefined=不落库）
  sourceSite?: string; // T-C01：来源站点（缺省 undefined=不落库）
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
 * 显式授权参数归一（T-C03，R-4 处置）：
 * - undefined/空串 → 'LLM_DRAFT'（默认路径，双保险语义与 T-C01 之前完全一致）；
 * - 'FETCHED' → 'FETCHED'（唯一放行的显式授权值，落 origin=FETCHED + status=DRAFT）；
 * - 其他任何值（含 MANUAL/PUBLISHED/TESTED/大小写变体）→ 抛错拒绝。
 * 纯函数，可单测；CLI 与库调用共用，保证授权口径单一。
 */
export function normalizeOriginOption(value?: string): ImportOrigin {
  if (value === undefined || value === '') return 'LLM_DRAFT';
  if (value === 'FETCHED') return 'FETCHED';
  throw new Error(
    `origin 授权值非法：${JSON.stringify(value)}（仅允许缺省=LLM_DRAFT 或显式授权 FETCHED）`,
  );
}

/** prepareDraftDish 可选参数（T-C03）：origin 为显式授权项，缺省默认路径不变 */
export interface PrepareDraftOptions {
  /** 仅接受 'FETCHED'（normalizeOriginOption 校验）；缺省强制 'LLM_DRAFT' */
  origin?: ImportOrigin;
}

/**
 * 校验草稿 JSON 并准备 DB 写入数据。
 * 双保险第一层：强制 status='DRAFT'；origin 默认强制 'LLM_DRAFT'（覆盖任何输入值），
 * 仅当显式传入 { origin: 'FETCHED' } 时落 FETCHED（R-4 处置：外部抓取入库专用口）。
 * 纯函数，可单测。
 *
 * @param jsonRaw 草稿文件内容（对象或 JSON 字符串）
 * @param options 可选：显式授权参数
 * @returns 安全的 DishDraftCreateInput（status 恒为 DRAFT；origin 为 LLM_DRAFT 或显式授权的 FETCHED）
 * @throws 校验失败 / origin 授权值非法
 */
export function prepareDraftDish(
  jsonRaw: unknown,
): DishDraftCreateInput & { status: 'DRAFT'; origin: 'LLM_DRAFT' };
export function prepareDraftDish(
  jsonRaw: unknown,
  options: PrepareDraftOptions & { origin: 'FETCHED' },
): DishDraftCreateInput & { status: 'DRAFT'; origin: 'FETCHED' };
export function prepareDraftDish(
  jsonRaw: unknown,
  options?: PrepareDraftOptions,
): DishDraftCreateInput;
export function prepareDraftDish(
  jsonRaw: unknown,
  options?: PrepareDraftOptions,
): DishDraftCreateInput {
  const obj: Record<string, unknown> =
    typeof jsonRaw === 'string'
      ? (JSON.parse(jsonRaw) as Record<string, unknown>)
      : (jsonRaw as Record<string, unknown>);

  // 显式授权归一（T-C03）：undefined→LLM_DRAFT；'FETCHED'→FETCHED；其余抛错。
  // 默认路径行为与 T-C03 之前完全一致（双保险默认语义不削弱）。
  const forcedOrigin = normalizeOriginOption(options?.origin);

  // 过组合 schema 校验（dish + ingredients）
  const validated = DraftFileSchema.parse({
    ...obj,
    // 强制安全字段（双保险第一层：覆盖任何输入值）
    id: `import-${Date.now()}`, // 临时 id 过 schema 校验，DB 生成真实 id
    status: 'DRAFT',
    origin: forcedOrigin,
  }) as DraftDish;

  // 组装写入数据（字面量类型锁定 status；origin 仅 LLM_DRAFT/FETCHED 两个字面量）
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
    origin: forcedOrigin, // 默认 LLM_DRAFT；仅显式授权时 FETCHED
    licenseNote: validated.licenseNote,
    // T-C01 透传：缺省 undefined -> Prisma create 忽略该字段 = 不落库（DB 保持 NULL）
    imageUrl: validated.imageUrl,
    sourceUrl: validated.sourceUrl,
    sourceSite: validated.sourceSite,
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
 * 3. createDishWithIngredients 创建菜品 + 关联（status 恒 DRAFT；origin 默认 LLM_DRAFT/显式授权 FETCHED）
 *
 * 双保险：
 *  - 第一层：prepareDraftDish 强制 status='DRAFT'；origin 默认 'LLM_DRAFT'，仅显式授权 {origin:'FETCHED'} 时 'FETCHED'（T-C03，覆盖任何输入）
 *  - 第二层：DishDraftCreateInput.status 字面量 'DRAFT'，origin 字面量联合 'LLM_DRAFT'|'FETCHED'，编译期锁定
 *  - DB 层：ContentStatus 三态枚举，import 只写 DRAFT，无升级路径（DEC-006）
 *
 * @param jsonRaw 草稿文件内容
 * @param writer DraftWriter 实现（CLI 注入 PrismaClient，测试注入 mock）
 * @param options 可选：显式授权参数（T-C03，如 { origin: 'FETCHED' }）
 * @returns 新菜品 id + 食材数量
 */
export async function importDraft(
  jsonRaw: unknown,
  writer: DraftWriter,
  options?: PrepareDraftOptions,
): Promise<ImportResult> {
  // 第一层：校验 + 强制 DRAFT（origin 默认 LLM_DRAFT / 显式授权 FETCHED）
  const input = prepareDraftDish(jsonRaw, options);

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
 * @param filePath 草稿文件路径（out/*.draft.json 或 fetch2dish 产物 *.dish.json）
 * @param writer DraftWriter 实现
 * @param options 可选：显式授权参数（T-C03，如 { origin: 'FETCHED' }）
 */
export async function importDraftFile(
  filePath: string,
  writer: DraftWriter,
  options?: PrepareDraftOptions,
): Promise<ImportResult> {
  const fs = await import('node:fs');
  const content = fs.readFileSync(filePath, 'utf-8');
  return importDraft(content, writer, options);
}
