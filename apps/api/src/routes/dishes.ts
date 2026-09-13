// apps/api/src/routes/dishes.ts
// R-9：DRAFT 内容 HTTP 只读口（GET /api/dishes 列表 + GET /api/dishes/:id 详情）
// 路由薄：schema 校验 + 调 dishesService，逻辑在 services（对齐 plans.ts 先例）。
// 只读：service 全程 findMany/findUnique 零写库；鉴权由全局 authHook 自动覆盖（无豁免逻辑，
// 与 /images/** 同口径）。来源：T-C03 审查建议级 R-9（审阅 FETCHED 草稿不再直查 PG）。

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { ContentStatusSchema, DishSchema, type ContentStatus } from '@family-menu/shared';
import { dishesService } from '../services/dishesService.js';

// ───── 响应 schema（本地组合，不改 shared：shared 无 dish 列表/详情响应形状） ─────

/**
 * 列表响应：shared DishSchema 数组。
 * zod strip 语义会丢弃 view 中 DishSchema 之外的多余键（如 ingredients/view 投影差），
 * 响应形状与契约严格一致；fm-import 入库前过 DraftFileSchema（=DishSchema.extend），
 * 管线行必然符合 DishSchema 顶层形状，列表端点严格 parse 有兜底依据。
 */
export const DishListResponseSchema = z.array(DishSchema);

/**
 * 详情用料行 view：对齐 engine DishIngredientView 类型（join 后形状：
 * ingredientId/ingredientName/aliases/category/defaultUnit/qty/unit/optional），
 * 非 DB DishIngredient 行形状（shared DishIngredientSchema），故本地定义。
 */
const DishIngredientViewSchema = z.object({
  ingredientId: z.string(),
  ingredientName: z.string(),
  aliases: z.array(z.string()),
  category: z.string(),
  defaultUnit: z.string(),
  qty: z.number(),
  unit: z.string(),
  optional: z.boolean(),
});

/** 详情响应：Dish 全字段 + ingredients 用料清单（DishSchema.extend 本地组合，不涉契约变更） */
export const DishDetailResponseSchema = DishSchema.extend({
  ingredients: z.array(DishIngredientViewSchema),
});

// ───── 请求 schema ─────

const DishIdParamsSchema = z.object({ id: z.string() });

/**
 * ?status= 可选过滤：值域 DRAFT/TESTED/PUBLISHED（消费 shared ContentStatusSchema 白名单）。
 * 支持逗号分隔多值，逐段 trim 后去重保序；白名单外（含未知值/空串）-> 400；缺省（无参）= 全部。
 */
const DishListQuerySchema = z.object({
  status: z
    .string()
    .optional()
    .transform((raw, ctx): ContentStatus[] | undefined => {
      if (raw === undefined) {
        return undefined;
      }
      const seen = new Set<string>();
      const values: ContentStatus[] = [];
      for (const segment of raw.split(',')) {
        const value = segment.trim();
        const parsed = ContentStatusSchema.safeParse(value);
        if (!parsed.success) {
          ctx.addIssue({
            code: 'custom',
            message: `status 值非法：${JSON.stringify(value)}（白名单 DRAFT/TESTED/PUBLISHED，逗号分隔多值）`,
          });
          return z.NEVER;
        }
        if (!seen.has(parsed.data)) {
          seen.add(parsed.data);
          values.push(parsed.data);
        }
      }
      return values;
    }),
});

export const dishRoutes: FastifyPluginAsync = async (app) => {
  // ── R-9 AC1: 菜品列表（只读） ──
  // GET /api/dishes?status=DRAFT,TESTED
  app.get('/dishes', async (request, reply) => {
    const query = DishListQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.code(400).send({ error: 'Validation error', details: query.error.issues });
    }
    const dishes = await dishesService.listDishes(query.data.status);
    return DishListResponseSchema.parse(dishes);
  });

  // ── R-9 AC2: 菜品详情（只读，含 ingredients 用料清单） ──
  // GET /api/dishes/:id ；不存在 -> service NotFoundError -> app.ts 错误处理 -> 404
  app.get('/dishes/:id', async (request, reply) => {
    const params = DishIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: 'Invalid dish id' });
    }
    const dish = await dishesService.getDish(params.data.id);
    return DishDetailResponseSchema.parse(dish);
  });
};
