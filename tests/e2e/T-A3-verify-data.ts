// tests/e2e/T-A3-verify-data.ts
// T-A3 页面验收数据脚本（真实 PG :54329，与 dev 集成测试同库同思路，前缀 a3v-）。
// 子命令：
//   setup   幂等清残留 -> 建 2 食材 + 9 道 PUBLISHED 测试菜（组合轮转占位：a3v- 排全库 id 最前）
//   assert  UI 走完反馈后跑：CookLog 菜级落库 + loadEventViews 菜级展开断言（P0-3 修复面）
//   cleanup 按前缀/计划归删（CookLog -> Event -> Plan -> DishIngredient -> Dish -> Ingredient）
//   status  零残留复核（a3v- 菜/食材 + 含 a3v- 候选的计划数）
// 运行（cwd=apps/api，prisma/pg 依赖可解析）：
//   pnpm --dir apps/api exec tsx ../../tests/e2e/T-A3-verify-data.ts setup
// 口令/连接串只在内存，不打印不入文件。
import { prisma } from '../../apps/api/src/db.js';
import { loadEventViews } from '../../apps/api/src/services/planService.js';

const PREFIX = 'a3v-';
const FAMILY_ID = 'seed-family';

const INGREDIENTS = [
  { id: 'a3v-ing-1', name: 'A3验收白菜', category: '蔬菜' },
  { id: 'a3v-ing-2', name: 'A3验收萝卜', category: '蔬菜' },
];

/** 菜品定义：m2 同时含两种食材（白菜+萝卜）——萝卜只此一家，用它做必消定向 */
const DISHES: Array<{
  id: string;
  name: string;
  role: 'MAIN' | 'SIDE' | 'SOUP';
  minutes: number;
  ings: string[];
}> = [
  { id: 'a3v-dish-m1', name: 'A3验收主菜一', role: 'MAIN', minutes: 8, ings: ['a3v-ing-1'] },
  { id: 'a3v-dish-m2', name: 'A3验收主菜二', role: 'MAIN', minutes: 9, ings: ['a3v-ing-1', 'a3v-ing-2'] },
  { id: 'a3v-dish-m3', name: 'A3验收主菜三', role: 'MAIN', minutes: 10, ings: ['a3v-ing-1'] },
  { id: 'a3v-dish-s1', name: 'A3验收配菜一', role: 'SIDE', minutes: 4, ings: ['a3v-ing-1'] },
  { id: 'a3v-dish-s2', name: 'A3验收配菜二', role: 'SIDE', minutes: 6, ings: ['a3v-ing-1'] },
  { id: 'a3v-dish-s3', name: 'A3验收配菜三', role: 'SIDE', minutes: 6, ings: ['a3v-ing-1'] },
  { id: 'a3v-dish-sou1', name: 'A3验收汤一', role: 'SOUP', minutes: 5, ings: ['a3v-ing-1'] },
  { id: 'a3v-dish-sou2', name: 'A3验收汤二', role: 'SOUP', minutes: 7, ings: ['a3v-ing-1'] },
  { id: 'a3v-dish-sou3', name: 'A3验收汤三', role: 'SOUP', minutes: 7, ings: ['a3v-ing-1'] },
];
const DISH_IDS = DISHES.map((d) => d.id);

/** 找出候选里含 a3v- 菜的计划（cuid 动态 id 无法前缀查，全量拉回 JS 侧过滤） */
async function findA3vPlans() {
  const all = await prisma.plan.findMany({
    select: { id: true, candidates: true, status: true, lockedMenuId: true },
  });
  return all.filter((p) => JSON.stringify(p.candidates).includes(PREFIX));
}

async function cleanup(): Promise<string[]> {
  const plans = await findA3vPlans();
  const planIds = plans.map((p) => p.id);
  const cookLogs = await prisma.cookLog.deleteMany({ where: { dishId: { in: DISH_IDS } } });
  const events = await prisma.event.deleteMany({ where: { planId: { in: planIds } } });
  const planRows = await prisma.plan.deleteMany({ where: { id: { in: planIds } } });
  const dishIngs = await prisma.dishIngredient.deleteMany({ where: { dishId: { in: DISH_IDS } } });
  const dishRows = await prisma.dish.deleteMany({ where: { id: { in: DISH_IDS } } });
  const ingRows = await prisma.ingredient.deleteMany({ where: { id: { startsWith: PREFIX } } });
  return [
    `deleted: cookLog=${cookLogs.count} event=${events.count} plan=${planRows.count} (${planIds.length} 个 a3v 计划)`,
    `deleted: dishIngredient=${dishIngs.count} dish=${dishRows.count} ingredient=${ingRows.count}`,
  ];
}

async function setup(): Promise<void> {
  for (const line of await cleanup()) console.log(line);
  await prisma.ingredient.createMany({
    data: INGREDIENTS.map((i) => ({
      id: i.id,
      name: i.name,
      aliases: [],
      category: i.category,
      defaultUnit: 'g',
    })),
  });
  for (const d of DISHES) {
    await prisma.dish.create({
      data: {
        id: d.id,
        name: d.name,
        mealRole: d.role,
        cuisine: '家常',
        flavorTags: [],
        spicyLevel: 0,
        splitFlavor: false,
        activeMinutes: d.minutes,
        totalMinutes: d.minutes,
        equipment: ['wok'],
        steps: [{ order: 1, text: `做${d.name}` }],
        status: 'PUBLISHED',
        origin: 'MANUAL',
      },
    });
    for (const ingId of d.ings) {
      await prisma.dishIngredient.create({
        data: { dishId: d.id, ingredientId: ingId, qty: 100, unit: 'g', optional: false },
      });
    }
  }
  console.log(`created: ${INGREDIENTS.length} 食材 + ${DISHES.length} 菜（PUBLISHED，a3v- 前缀）`);
}

async function assertState(): Promise<void> {
  // 1) CookLog 菜级落库（AC3 / P0-3）：反馈过的计划里每道锁定菜一行 dishId，menuId 不伪造
  const cookLogs = await prisma.cookLog.findMany({ where: { dishId: { in: DISH_IDS } } });
  const cookedPlans = await prisma.plan.findMany({
    where: { status: 'COOKED', lockedMenuId: { startsWith: 'virt-' } },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: { id: true, candidates: true, lockedMenuId: true, createdAt: true },
  });
  const mine = cookedPlans.find((p) => JSON.stringify(p.candidates).includes(PREFIX));
  if (!mine) {
    throw new Error('未找到 a3v 已反馈（COOKED）计划——先跑 UI 脚本');
  }
  interface CandMenu {
    menuId: string;
    menu?: { dishes?: Array<{ id: string; name: string }> };
  }
  const cands = mine.candidates as unknown as CandMenu[];
  const locked = cands.find((c) => c.menuId === mine.lockedMenuId);
  const lockedDishes = locked?.menu?.dishes ?? [];
  console.log(`[assert] 已反馈计划 ${mine.id} 锁定组合 ${mine.lockedMenuId}`);
  console.log(`[assert] 锁定菜: ${lockedDishes.map((d) => `${d.id}(${d.name})`).join('、')}`);

  const logsForPlan = cookLogs.filter((l) => lockedDishes.some((d) => d.id === l.dishId));
  const dishIds = logsForPlan.map((l) => l.dishId).sort();
  const expectIds = lockedDishes.map((d) => d.id).sort();
  const okRows = logsForPlan.length === lockedDishes.length;
  const okDishIds = JSON.stringify(dishIds) === JSON.stringify(expectIds);
  const okMenuNull = logsForPlan.every((l) => l.menuId === null);
  const okResult = logsForPlan.every((l) => l.result === 'success' && l.willRepeat === true);
  console.log(
    `[assert] CookLog 行数=${logsForPlan.length}/${lockedDishes.length} dishId集合一致=${okDishIds} menuId全null=${okMenuNull} result=success且willRepeat=${okResult}`,
  );
  if (!okRows || !okDishIds || !okMenuNull || !okResult) {
    throw new Error('CookLog 菜级断言失败');
  }

  // 2) loadEventViews 菜级展开（P0-3 读取侧）：COOKED/LOCK 事件 -> 每菜一条 dishId+dishRole
  const views = await loadEventViews(FAMILY_ID);
  const myViews = views.filter((v) => v.dishId !== undefined && v.dishId.startsWith(PREFIX));
  const cookedViews = myViews.filter((v) => v.type === 'COOKED');
  const lockViews = myViews.filter((v) => v.type === 'LOCK');
  const okCookedSet =
    JSON.stringify(cookedViews.map((v) => v.dishId).sort()) === JSON.stringify(expectIds);
  const okCookedVal = cookedViews.every(
    (v) => v.cookedResult === 'success' && v.willRepeat === true,
  );
  const okRoles = myViews.every((v) => ['MAIN', 'SIDE', 'SOUP', 'STAPLE'].includes(v.dishRole ?? ''));
  console.log(
    `[assert] loadEventViews 展开: a3v 菜级视图 ${myViews.length} 条（COOKED ${cookedViews.length} + LOCK ${lockViews.length}），` +
      `COOKED dishId集合=锁定菜=${okCookedSet} 口径success+willRepeat=${okCookedVal} 角色齐全=${okRoles}`,
  );
  if (!okCookedSet || !okCookedVal || !okRoles) {
    throw new Error('loadEventViews 菜级展开断言失败');
  }
  console.log('[assert] PASS CookLog 菜级落库 + loadEventViews 菜级展开');
}

async function status(): Promise<void> {
  const dishCount = await prisma.dish.count({ where: { id: { startsWith: PREFIX } } });
  const ingCount = await prisma.ingredient.count({ where: { id: { startsWith: PREFIX } } });
  const plans = await findA3vPlans();
  const cookLogs = await prisma.cookLog.count({ where: { dishId: { in: DISH_IDS } } });
  const events = await prisma.event.count({
    where: { planId: { in: plans.map((p) => p.id) } },
  });
  console.log(
    `[status] a3v 残留: dish=${dishCount} ingredient=${ingCount} plan=${plans.length} cookLog=${cookLogs} event=${events}`,
  );
  if (dishCount || ingCount || plans.length || cookLogs || events) {
    console.log('[status] FAIL 存在残留');
    process.exitCode = 1;
  } else {
    console.log('[status] PASS 零残留');
  }
}

const cmd = process.argv[2];
switch (cmd) {
  case 'setup':
    await setup();
    break;
  case 'assert':
    await assertState();
    break;
  case 'cleanup':
    for (const line of await cleanup()) console.log(line);
    break;
  case 'status':
    await status();
    break;
  default:
    console.error('用法: T-A3-verify-data.ts <setup|assert|cleanup|status>');
    process.exit(2);
}
await prisma.$disconnect();
