// apps/api/src/services/dishesService.ts
// R-9：DRAFT 内容 HTTP 只读口的 service 层（列表 + 详情）
// 路由薄、逻辑在 services（AGENTS.md 铁律），对齐 planService 先例：
//   - 不存在 -> NotFoundError（app.ts 错误处理映射 404）
//   - DB 行 -> View 投影复用 mappers.toDishView（origin 投影由 R-9 补齐）
// 只读约束（任务卡 AC4）：全程 findMany/findUnique，零写库语句。

import type { ContentStatus } from '@family-menu/shared';
import type { DishMediaView } from './mappers.js';
import { toDishView } from './mappers.js';
import { NotFoundError } from './planService.js';
import { prisma } from '../db.js';

export const dishesService = {
  /**
   * 菜品列表（只读）。statuses 缺省/空 => 全量；否则 status IN (...) 白名单过滤。
   * 排序 id asc：Dish 无显式 createdAt/updatedAt 列，cuid 时间有序 = 入库顺序，确定性输出
   * （防无 ORDER BY 的同类别问题，对齐 R-4 toMenuView 防御口径）。
   */
  async listDishes(statuses?: ContentStatus[]): Promise<DishMediaView[]> {
    const dishes = await prisma.dish.findMany({
      where: statuses && statuses.length > 0 ? { status: { in: statuses } } : undefined,
      orderBy: { id: 'asc' },
      include: { ingredients: { include: { ingredient: true } } },
    });
    return dishes.map(toDishView);
  },

  /**
   * 菜品详情（只读）：Dish 全字段 + ingredients 用料清单（DishIngredient->Ingredient join）。
   * 不存在 -> NotFoundError（404 语义，先例口径同 planService）。
   */
  async getDish(id: string): Promise<DishMediaView> {
    const dish = await prisma.dish.findUnique({
      where: { id },
      include: { ingredients: { include: { ingredient: true } } },
    });
    if (!dish) {
      throw new NotFoundError(`Dish ${id} not found`);
    }
    return toDishView(dish);
  },
};
