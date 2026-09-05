// tools/content-pipeline/src/menu-assemble.ts
// TP-06 菜库扩充：菜单组装纯函数（纯规则零 LLM，对齐 DEC-006）
// 组装规则：每套菜单 = 1 个新主菜（MAIN）+ 1 个配菜（SIDE）+ 1 个汤（SOUP）；
//           周末场景（WEEKEND）再加 1 个主食（STAPLE）
// 工时/备菜顺序：复刻 apps/api planService.buildPrepSequence 的既有约定（顺序展开步骤）
// 产物只落 DRAFT（DEC-006）；发布须产品负责人确认（TP-06 卡内建确认点）

import type { DishStep, PrepSequenceItem } from '@family-menu/shared';

// ───── 类型 ─────

/** 组装输入的菜品引用（主菜来自草稿导入，配菜来自 DB 既有菜） */
export interface AssembleDishRef {
  id: string;
  name: string;
  mealRole: string; // MAIN | SIDE | SOUP | STAPLE
  activeMinutes: number;
  steps: DishStep[];
}

/** 组装支持的菜单场景（对齐 Prisma MenuScene 中本次扩充用到的两档） */
export type AssembleScene = 'WEEKDAY_FAST' | 'WEEKEND';

/** 配菜池（SIDE 轮换使用；SOUP/STAPLE 固定一份） */
export interface AccompanimentPool {
  sides: AssembleDishRef[];
  soup: AssembleDishRef;
  staple: AssembleDishRef; // 仅 WEEKEND 使用
}

/** 组装单套菜单的输入 */
export interface MenuAssembleInput {
  menuId: string; // 确定性 id（幂等 upsert 用，如 pipeline-menu-01）
  scene: AssembleScene;
  main: AssembleDishRef;
  name?: string; // 缺省 = `${main.name}套餐`
}

/** 组装产出的菜单草稿（对齐 Prisma Menu 写入字段） */
export interface AssembledMenu {
  id: string;
  name: string;
  scene: AssembleScene;
  serves: number;
  totalActiveMinutes: number;
  prepSequence: PrepSequenceItem[];
  status: 'DRAFT'; // 字面量类型：编译期锁定只产 DRAFT（DEC-006 双保险）
  dishes: { dishId: string; sort: number }[];
}

// ───── 备菜顺序（复刻 apps/api planService.buildPrepSequence 既有约定）─────

/**
 * 按菜品顺序逐菜展开步骤为分钟序列：
 * - 每步占用 ceil(activeMinutes / 步数) 分钟
 * - steps 为空的菜如实占位「做「菜名」」并前进 max(1, ceil(activeMinutes)) 分钟
 */
export function buildPrepSequence(dishes: AssembleDishRef[]): PrepSequenceItem[] {
  const sequence: PrepSequenceItem[] = [];
  let cursor = 0;
  for (const dish of dishes) {
    const steps = [...dish.steps].sort((a, b) => a.order - b.order);
    if (steps.length === 0) {
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

// ───── 配菜轮换 ─────

/** SIDE 轮换：按 menuId 尾号交替（pipeline-menu-01 → 第 1 个，02 → 第 2 个…循环） */
export function pickSide(menuId: string, sides: AssembleDishRef[]): AssembleDishRef {
  if (sides.length === 0) {
    throw new Error('配菜池为空，无法组装菜单');
  }
  const match = /(\d+)$/.exec(menuId);
  const index = match ? (parseInt(match[1], 10) - 1) % sides.length : 0;
  return sides[index] as AssembleDishRef;
}

// ───── 单套组装 ─────

/**
 * 组装一套菜单草稿（纯函数）：
 * - 菜品构成：MAIN + SIDE + SOUP（WEEKEND 再加 STAPLE），sort 从 1 递增
 * - totalActiveMinutes = 各菜 activeMinutes 之和（与 planService 换菜重算口径一致）
 * - prepSequence 按 [MAIN, SIDE, SOUP, STAPLE] 顺序展开
 * - status 恒为 DRAFT
 */
export function assembleOneMenu(input: MenuAssembleInput, pool: AccompanimentPool): AssembledMenu {
  const side = pickSide(input.menuId, pool.sides);
  const dishes: AssembleDishRef[] = [input.main, side, pool.soup];
  if (input.scene === 'WEEKEND') {
    dishes.push(pool.staple);
  }
  const totalActiveMinutes = dishes.reduce((sum, d) => sum + d.activeMinutes, 0);
  return {
    id: input.menuId,
    name: input.name ?? `${input.main.name}套餐`,
    scene: input.scene,
    serves: 4,
    totalActiveMinutes,
    prepSequence: buildPrepSequence(dishes),
    status: 'DRAFT',
    dishes: dishes.map((d, i) => ({ dishId: d.id, sort: i + 1 })),
  };
}
