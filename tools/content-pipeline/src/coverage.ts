// tools/content-pipeline/src/coverage.ts
// 覆盖矩阵：时长×主蛋白×器具×场景 -> 缺口清单
// 对齐实施方案第388行 + 第586行（WP-07 AC1）
// 纯函数零IO，便于单元测试；CLI 入口在 cli/coverage.ts 负责读 DB

import { TIME_BUDGETS, EQUIPMENT, MenuSceneSchema } from '@family-menu/shared';

// ───── 维度取值域（来自 shared 契约，不重复定义）─────

/** 时长档（分钟）：15 / 30 / 60 */
export const TIME_BUCKETS = TIME_BUDGETS;

/** 厨房器具：wok / rice_cooker / steamer / air_fryer */
export const EQUIPMENTS = EQUIPMENT;

/** 菜单场景：WEEKDAY_FAST / WEEKEND / CLEARANCE / BUDGET */
export const SCENES = MenuSceneSchema.options;

/**
 * 主蛋白取值域（内容管线工具内部维度，Dish schema 无此字段，由食材推断）。
 * 设计依据：slot 示例 `weekday_fast,chicken,30min`（第586行）。
 * 覆盖家庭常见蛋白来源，HOW 层面决策，记录于完成报告。
 */
export const MAIN_PROTEINS = [
  'chicken',
  'pork',
  'beef',
  'fish',
  'shrimp',
  'egg',
  'tofu',
] as const;
export type MainProtein = (typeof MAIN_PROTEINS)[number];

// ───── 主蛋白推断（从食材名/品类映射）─────

/** 食材名 -> 主蛋白 映射关键词（中文食材名匹配，按顺序优先） */
const PROTEIN_KEYWORDS: ReadonlyArray<readonly [MainProtein, readonly string[]]> = [
  // chicken 用精确词，避免 '鸡' 误匹配 '鸡蛋'
  ['chicken', ['鸡肉', '鸡腿', '鸡胸', '鸡翅', '鸡腿肉']],
  ['pork', ['猪肉', '排骨', '五花', '腊肉']],
  ['beef', ['牛肉', '牛腩', '牛排']],
  ['fish', ['鱼', '鲈鱼', '鲫鱼', '带鱼']],
  ['shrimp', ['虾', '虾仁']],
  ['egg', ['鸡蛋', '鸭蛋', '蛋']],
  ['tofu', ['豆腐', '豆干']],
];

/**
 * 从食材名列表推断主蛋白。
 * 取第一个匹配到的主蛋白；无匹配返回 null（该菜品不计入主蛋白维度覆盖）。
 * 纯函数，可单测。
 */
export function inferMainProtein(ingredientNames: readonly string[]): MainProtein | null {
  for (const name of ingredientNames) {
    for (const [protein, keywords] of PROTEIN_KEYWORDS) {
      if (keywords.some((kw) => name.includes(kw))) {
        return protein;
      }
    }
  }
  return null;
}

// ───── 时间档归属 ─────

/**
 * 将 totalMinutes 归入时长档。
 * - <=15 -> 15
 * - 16-30 -> 30
 * - 31-60 -> 60
 * - >60 -> null（不归入任何常用档，不计入覆盖）
 * 纯函数，可单测。
 */
export function findTimeBucket(totalMinutes: number): number | null {
  if (totalMinutes <= 15) return 15;
  if (totalMinutes <= 30) return 30;
  if (totalMinutes <= 60) return 60;
  return null;
}

// ───── 视图类型 ─────

/**
 * 覆盖矩阵计算的菜品视图（已从 DB 读取并推断好维度）。
 * CLI 入口负责把 Prisma 行转换为此视图。
 */
export interface CoverageDishView {
  id: string;
  totalMinutes: number;
  equipment: string[];
  mainProtein: MainProtein | null;
  scenes: string[];
}

/** 覆盖矩阵缺口单元格 */
export interface CoverageGap {
  timeBudget: number;
  mainProtein: MainProtein;
  equipment: string;
  scene: string;
}

// ───── 核心纯函数：计算缺口 ─────

/**
 * 计算单个菜品覆盖的矩阵单元格集合（用于从全矩阵中扣除）。
 * 一个菜品覆盖：timeBucket × mainProtein × 每个equipment × 每个scene 的笛卡尔积。
 * CC 拆分：本函数仅组装键，遍历由 buildCoveredKeys 辅助。
 */
function buildDishCoveredKeys(dish: CoverageDishView): Set<string> {
  const keys = new Set<string>();
  const bucket = findTimeBucket(dish.totalMinutes);
  if (bucket === null) return keys;
  if (dish.mainProtein === null) return keys;
  for (const eq of dish.equipment) {
    if (!EQUIPMENTS.includes(eq as never)) continue;
    for (const scene of dish.scenes) {
      if (!SCENES.includes(scene as never)) continue;
      keys.add(encodeCell(bucket, dish.mainProtein, eq, scene));
    }
  }
  return keys;
}

/** 单元格序列化为唯一键 */
function encodeCell(
  timeBudget: number,
  mainProtein: MainProtein,
  equipment: string,
  scene: string,
): string {
  return `${timeBudget}|${mainProtein}|${equipment}|${scene}`;
}

/**
 * 计算覆盖矩阵缺口。
 * 全矩阵 = 时长档 × 主蛋白 × 器具 × 场景；扣除已有菜品覆盖的单元格，剩余为缺口。
 * 纯函数，同输入同输出，可单测。
 *
 * @param dishes 已有菜品视图（mainProtein/scenes 已推断）
 * @returns 缺口单元格列表（按维度顺序稳定排列）
 */
export function computeCoverageGaps(dishes: readonly CoverageDishView[]): CoverageGap[] {
  const covered = new Set<string>();
  for (const dish of dishes) {
    for (const key of buildDishCoveredKeys(dish)) {
      covered.add(key);
    }
  }

  const gaps: CoverageGap[] = [];
  for (const timeBudget of TIME_BUCKETS) {
    for (const mainProtein of MAIN_PROTEINS) {
      for (const equipment of EQUIPMENTS) {
        for (const scene of SCENES) {
          const key = encodeCell(timeBudget, mainProtein, equipment, scene);
          if (!covered.has(key)) {
            gaps.push({ timeBudget, mainProtein, equipment, scene });
          }
        }
      }
    }
  }
  return gaps;
}

// ───── 缺口格式化为 slot 字符串（供 draft --slot 使用）─────

/**
 * 将缺口格式化为 slot 字符串：`<scene_lower>,<mainProtein>,<timeBudget>min`。
 * 例：{ scene: 'WEEKDAY_FAST', mainProtein: 'chicken', timeBudget: 30 } -> 'weekday_fast,chicken,30min'
 * 注意：slot 不含器具维度（draft 让豆包根据菜品自由选器具，见 draft.ts）。
 */
export function gapToSlot(gap: CoverageGap): string {
  return `${gap.scene.toLowerCase()},${gap.mainProtein},${gap.timeBudget}min`;
}

/**
 * 解析 slot 字符串为 { scene, mainProtein, timeBudget }。
 * 反向解析，供 draft CLI 使用。格式：`<scene>,<mainProtein>,<timeBudget>min`。
 * 解析失败抛 Error。
 */
export interface ParsedSlot {
  scene: string;
  mainProtein: MainProtein;
  timeBudget: number;
}

export function parseSlot(slot: string): ParsedSlot {
  const parts = slot.split(',').map((s) => s.trim());
  if (parts.length !== 3) {
    throw new Error(`无效 slot "${slot}"，期望格式 <scene>,<mainProtein>,<timeBudget>min`);
  }
  const [sceneLower, mainProteinRaw, timeRaw] = parts;
  const scene = sceneLower.toUpperCase();
  if (!SCENES.includes(scene as never)) {
    throw new Error(`无效场景 "${sceneLower}"，合法值：${SCENES.join('/')}`);
  }
  if (!MAIN_PROTEINS.includes(mainProteinRaw as MainProtein)) {
    throw new Error(`无效主蛋白 "${mainProteinRaw}"，合法值：${MAIN_PROTEINS.join('/')}`);
  }
  const mainProtein = mainProteinRaw as MainProtein;
  const timeMatch = timeRaw.match(/^(\d+)min$/);
  if (!timeMatch) {
    throw new Error(`无效时长 "${timeRaw}"，期望格式 <数字>min，如 30min`);
  }
  const timeBudget = Number(timeMatch[1]);
  if (!TIME_BUCKETS.includes(timeBudget as never)) {
    throw new Error(`无效时长档 ${timeBudget}，合法值：${TIME_BUCKETS.join('/')}`);
  }
  return { scene, mainProtein, timeBudget };
}
