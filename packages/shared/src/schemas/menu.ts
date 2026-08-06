// packages/shared/src/schemas/menu.ts
// 菜单契约，对齐实施方案 3.2 数据模型（Menu / MenuDish / CookLog）
// "一套饭"是一等对象（文件③7.2），不是菜品的松散集合
import { z } from 'zod';
import { ContentStatusSchema } from './dish.js';

// ───── 枚举 ─────

/** 菜单场景 */
export const MenuSceneSchema = z.enum(['WEEKDAY_FAST', 'WEEKEND', 'CLEARANCE', 'BUDGET']);

// ───── 子结构（JSON 字段精确定义，非 z.unknown） ─────

/** 备菜顺序节点：[{minute, action}] 菜单级并行工序 */
export const PrepSequenceItemSchema = z.object({
  minute: z.number().int(),
  action: z.string(),
});

// ───── 模型 ─────

/**
 * 菜单（一套饭）。
 * totalActiveMinutes = 并行工序后的真实总工时（≠单菜相加）。
 */
export const MenuSchema = z.object({
  id: z.string(),
  name: z.string(), // "番茄牛腩套餐"
  scene: MenuSceneSchema,
  serves: z.number().int().default(4),
  totalActiveMinutes: z.number().int(),
  prepSequence: z.array(PrepSequenceItemSchema),
  status: ContentStatusSchema.default('DRAFT'),
});

/** 菜单-菜品关联（复合主键 menuId+dishId，sort 为排序序号） */
export const MenuDishSchema = z.object({
  menuId: z.string(),
  dishId: z.string(),
  sort: z.number().int(),
});

/**
 * 试做记录：菜单从 DRAFT 升级 TESTED/PUBLISHED 的唯一通道（DEC-006 内容管线）。
 * result = success | partial | fail。
 */
export const CookLogSchema = z.object({
  id: z.string(),
  menuId: z.string().optional(),
  dishId: z.string().optional(),
  cookedAt: z.date(),
  actualMinutes: z.number().int().optional(),
  result: z.enum(['success', 'partial', 'fail']),
  failPoints: z.string().optional(),
  willRepeat: z.boolean().optional(),
});
