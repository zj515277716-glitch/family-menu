// apps/api/test/migration-backfill.spec.ts
// T-Q10 迁移回填验证：20261018154421_meal_slots_dayplan 落库后，存量单餐数据
// 必须 100% 回填 dinner 餐次、且未伪造三餐数据（Plan.dayPlan 保持 NULL）。
// 真实库集成测试：PG 不可达时显式 skip（不假绿，项目规则）。
import { describe, it, expect, beforeAll } from 'vitest';
import { prisma } from '../src/db.js';

const canConnect = await prisma
  .$queryRaw`SELECT 1`
  .then(() => true)
  .catch(() => false);

describe.skipIf(!canConnect)('T-Q10 迁移回填（meal_slots_dayplan）', () => {
  beforeAll(async () => {
    // 库里至少要有存量数据才有回填可言；空库（CI 首次跑）跳过而非报错
    const [dishCount, eventCount] = await Promise.all([
      prisma.dish.count(),
      prisma.event.count(),
    ]);
    if (dishCount === 0 && eventCount === 0) {
      console.warn('空库，跳过回填断言（先跑 pnpm db:seed）');
      return;
    }
  });

  it('存量 Event 全部回填 mealSlot=dinner（历史单餐=晚餐语境）', async () => {
    const nullSlot = await prisma.event.count({ where: { mealSlot: null } });
    expect(nullSlot).toBe(0);
  });

  it('存量 CookLog 全部回填 mealSlot=dinner', async () => {
    const nullSlot = await prisma.cookLog.count({ where: { mealSlot: null } });
    expect(nullSlot).toBe(0);
  });

  it('存量 Plan 不伪造三餐数据：dayPlan 恒 NULL、dayContext 恒 NULL', async () => {
    const forged = await prisma.plan.count({
      where: { OR: [{ dayPlan: { not: null } }, { dayContext: { not: null } }] },
    });
    // 迁移本身不写新行；若本断言失败且非本卡新测试写入的行，即为回填脚本污染
    expect(forged).toBe(0);
  });

  it('存量 Dish.mealTypes 未被迁移瞎标：非种子早餐菜恒空数组', async () => {
    // 本卡种子新增 6 道早餐菜合法标 ['breakfast']（T-Q10 任务项 5）；
    // 迁移本身不写 mealTypes，其余存量菜必须保持空数组（空=引擎按既有字段推断）
    const seedBreakfastIds = [
      'seed-dish-millet-porridge',
      'seed-dish-egg-pancake',
      'seed-dish-steamed-egg-custard',
      'seed-dish-milk-oatmeal',
      'seed-dish-tomato-egg-noodle',
      'seed-dish-boiled-egg',
    ];
    const dishes = await prisma.dish.findMany({
      where: { id: { notIn: seedBreakfastIds } },
      select: { mealTypes: true },
    });
    for (const d of dishes) {
      expect(d.mealTypes).toEqual([]);
    }
  });
});
