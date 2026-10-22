// apps/api/test/plan-projection.spec.ts
// T-Q10 遗留投影缺陷（T-Q12 验收阻断）：三餐计划写入 context={}，toPlan 原样投影后
// PlanResponseSchema.parse 报 Validation error，导致 POST /api/recommend 与
// GET /api/plans?date= 返回 400（数据已落库但读不出来）。
// 修复口径：读取侧兼容——仅在对象且 people/timeBudgetMin 为 number、mustUse 为数组时
// 投影为 PlanContext，否则 undefined；不改 DB/schema/写入侧。存量单餐 context 原样保留。
import { describe, it, expect } from 'vitest';
import { PlanResponseSchema } from '@family-menu/shared';
import { toPlan, type PlanRow } from '../src/services/planService.js';

const baseRow: PlanRow = {
  id: 'plan-proj-1',
  familyId: 'seed-family',
  planDate: new Date(2026, 9, 22),
  context: {},
  dayContext: null,
  candidates: [],
  dayPlan: null,
  lockedMenuId: null,
  shoppingList: null,
  status: 'LOCKED',
  createdAt: new Date(2026, 9, 21, 22, 5),
};

const dayContext = {
  adults: 4,
  children: 0,
  timeBudgetMin: 30,
  mustUseIngredients: [],
  meals: ['breakfast', 'lunch', 'dinner'],
};

describe('toPlan 投影：context 兼容性', () => {
  it('三餐计划 context={} -> undefined，PlanResponseSchema.parse 不抛', () => {
    const plan = toPlan({ ...baseRow, context: {}, dayContext });
    expect(plan.context).toBeUndefined();
    expect(() => PlanResponseSchema.parse(plan)).not.toThrow();
  });

  it('存量单餐 context 合法 -> 原样保留，不回退', () => {
    const context = { people: 2, timeBudgetMin: 30, mustUse: ['番茄'] };
    const plan = toPlan({ ...baseRow, context, dayContext: null });
    expect(plan.context).toEqual(context);
    expect(() => PlanResponseSchema.parse(plan)).not.toThrow();
  });

  it('异常存量：context={} 且 dayContext/dayPlan 均空 -> 不抛、context undefined', () => {
    const plan = toPlan({ ...baseRow, context: {}, dayContext: null, dayPlan: null });
    expect(plan.context).toBeUndefined();
    expect(() => PlanResponseSchema.parse(plan)).not.toThrow();
  });
});
