// tools/content-pipeline/src/draft.ts
// 起草 CLI 核心逻辑：按 slot 调豆包批量起草 -> JSON 过 shared zod 校验 -> 失败重试3次
// 对齐 AC2/AC3/AC7：豆包API用openai SDK（火山方舟兼容），产出过 DishSchema 校验
// 产物永远只落 DRAFT 状态（DEC-006），运行时零 LLM（管线在 tools/ 非 apps/）

import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DishSchema,
  type Dish,
  type ContentStatus,
  type ContentOrigin,
} from '@family-menu/shared';
import type { ArkChatClient, ChatMessage } from './ark.js';
import { parseSlot, type ParsedSlot } from './coverage.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ───── 工具内部 schema：食材带用量（DishSchema 不含 ingredients，不改 shared）─────

/** 草稿食材：name + 品类 + 默认单位 + 用量 + 单位 + 是否可选 */
export const DraftIngredientSchema = z.object({
  name: z.string(),
  aliases: z.array(z.string()).optional(),
  category: z.string(), // 蔬菜/肉类/水产/蛋奶/调料/主食
  defaultUnit: z.string(), // g/个/条/ml...
  qty: z.number(),
  unit: z.string(), // 本次用量单位（带用量与单位，AC4 约束）
  optional: z.boolean().optional(),
});
export type DraftIngredient = z.infer<typeof DraftIngredientSchema>;

/**
 * 草稿菜品 = Dish（过 DishSchema 校验）+ ingredients（过 DraftIngredientSchema）。
 * 因 DishSchema 契约冻结不含食材关联，工具内部扩展 ingredients 字段（HOW，不改 shared）。
 */
export type DraftDish = Dish & { ingredients: DraftIngredient[] };

// ───── 提示词加载 ─────

/** menu-draft.md 提示词文件路径（src/prompts/menu-draft.md） */
const PROMPT_PATH = path.resolve(__dirname, './prompts/menu-draft.md');

/**
 * 加载起草提示词（menu-draft.md）。
 * 抽象为函数便于测试注入。
 */
export function loadPrompt(promptPath: string = PROMPT_PATH): string {
  return fs.readFileSync(promptPath, 'utf-8');
}

// ───── 校验：豆包输出 -> DraftDish ─────

/**
 * 校验豆包返回的 JSON 为合法 DraftDish。
 * 1. 解析 JSON
 * 2. 注入临时 id + 强制 status=DRAFT + origin=LLM_DRAFT（双保险第一层）
 * 3. dish 部分过 DishSchema 校验（满足 AC3）
 * 4. ingredients 部分过 DraftIngredientSchema[] 校验
 * 纯函数，可单测。
 */
export function validateDraftDish(raw: string, slot: ParsedSlot): DraftDish {
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error('豆包返回不是合法 JSON');
  }

  // 强制安全字段（双保险：即使豆包输出 PUBLISHED 也强制改回 DRAFT）
  const dishInput = {
    ...obj,
    id: `draft-${Date.now()}`, // 临时 id，import 时 DB @default(cuid()) 重新生成
    status: 'DRAFT' as ContentStatus,
    origin: 'LLM_DRAFT' as ContentOrigin,
  };

  // dish 部分过 DishSchema 校验（AC3）
  const dish = DishSchema.parse(dishInput);

  // ingredients 部分过工具内部 schema 校验
  const ingredientsRaw = obj.ingredients;
  if (!Array.isArray(ingredientsRaw)) {
    throw new Error('ingredients 字段缺失或非数组');
  }
  const ingredients = z.array(DraftIngredientSchema).parse(ingredientsRaw);

  // 业务校验：totalMinutes 不超过 slot 时长档上限
  if (dish.totalMinutes > slot.timeBudget) {
    throw new Error(
      `totalMinutes=${dish.totalMinutes} 超过 slot 时长档上限 ${slot.timeBudget}min`,
    );
  }

  return { ...dish, ingredients };
}

// ───── 核心：起草单道菜（含重试）─────

/** 最大尝试次数（AC3：失败自动重试3次） */
export const MAX_ATTEMPTS = 3;

export interface DraftOptions {
  slot: ParsedSlot;
  arkClient: ArkChatClient;
  prompt: string;
}

export interface DraftResult {
  dish: DraftDish;
  attempts: number;
}

/**
 * 起草单道菜：调豆包 -> 校验 -> 失败重试（最多 MAX_ATTEMPTS 次）。
 * 纯函数化（arkClient 注入，便于测试 mock）。
 *
 * @returns 校验通过的 DraftDish + 实际尝试次数
 * @throws 重试 MAX_ATTEMPTS 次仍失败
 */
export async function draftDish(options: DraftOptions): Promise<DraftResult> {
  const { slot, arkClient, prompt } = options;
  const messages: ChatMessage[] = [
    { role: 'system', content: prompt },
    {
      role: 'user',
      content: buildSlotInstruction(slot),
    },
  ];

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const raw = await arkClient.complete(messages);
      const dish = validateDraftDish(raw, slot);
      return { dish, attempts: attempt };
    } catch (err) {
      lastError = err;
      // 未达上限则重试
    }
  }
  throw new Error(
    `起草失败：重试 ${MAX_ATTEMPTS} 次仍不通过校验。最后一次错误：${String(lastError)}`,
  );
}

/** 构造 slot 指令（用户消息） */
function buildSlotInstruction(slot: ParsedSlot): string {
  return [
    `请起草一道菜：`,
    `- 场景：${slot.scene}`,
    `- 主蛋白：${slot.mainProtein}`,
    `- 时长档：${slot.timeBudget}min（totalMinutes 不超过 ${slot.timeBudget}）`,
    ``,
    `只输出 JSON 对象，不要附加任何解释或代码围栏。`,
  ].join('\n');
}

// ───── 输出文件 ─────

/**
 * 生成草稿输出文件名：`<scene>_<mainProtein>_<timeBudget>min_<timestamp>.draft.json`。
 */
export function buildDraftFileName(slot: ParsedSlot, timestamp: number = Date.now()): string {
  const scene = slot.scene.toLowerCase();
  return `${scene}_${slot.mainProtein}_${slot.timeBudget}min_${timestamp}.draft.json`;
}

/**
 * 将 DraftDish 写入 out/*.draft.json 文件。
 * @param outDir 输出目录（默认 tools/content-pipeline/out）
 */
export function writeDraftFile(
  dish: DraftDish,
  slot: ParsedSlot,
  outDir: string,
  timestamp: number = Date.now(),
): string {
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  const fileName = buildDraftFileName(slot, timestamp);
  const filePath = path.resolve(outDir, fileName);
  fs.writeFileSync(filePath, JSON.stringify(dish, null, 2), 'utf-8');
  return filePath;
}

// ───── slot 解析（复用 coverage.ts）─────

export { parseSlot, type ParsedSlot };

/** 便捷：从 slot 字符串起草并写文件 */
export async function draftFromSlotString(
  slotStr: string,
  arkClient: ArkChatClient,
  prompt: string,
  outDir: string,
): Promise<{ dish: DraftDish; filePath: string; attempts: number }> {
  const slot = parseSlot(slotStr);
  const { dish, attempts } = await draftDish({ slot, arkClient, prompt });
  const filePath = writeDraftFile(dish, slot, outDir);
  return { dish, filePath, attempts };
}
