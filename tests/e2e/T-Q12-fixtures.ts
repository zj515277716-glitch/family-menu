// tests/e2e/T-Q12-fixtures.ts
// T-Q12 页面验收的本地夹具脚本（仅本机 PG，绝不用于生产）：
//   probe                      只读打印规则/菜品/食材/计划概览（不含任何密钥）
//   reset-verify-days          清理本机「今天/明天」两天内由验收创建的 Plan（含 Event），
//                              仅当 FM_VERIFY_ALLOW_FIXTURE_RESET=1 时执行；不碰更早历史数据
//   move-to-today <planId>     把 UI 真实生成的一份 Plan 的 planDate 改为本机「今天零点」
//   seed-feedback <planId>     写入三餐真实 Event 反馈（早=好吃 / 中=翻车 / 晚=没做）
// 运行：pnpm --dir apps/api exec tsx ../../tests/e2e/T-Q12-fixtures.ts <cmd> [...args]
import { prisma } from '../../apps/api/src/db.ts'

function localToday(): Date {
  const n = new Date()
  return new Date(n.getFullYear(), n.getMonth(), n.getDate(), 0, 0, 0, 0)
}

const [cmd, arg1] = process.argv.slice(2)

if (cmd === 'probe') {
  const family = await prisma.family.findFirst({ select: { id: true, name: true } })
  const rule = await prisma.familyRule.findFirst()
  const dishes = await prisma.dish.findMany({
    where: { status: 'PUBLISHED' },
    select: { id: true, name: true, mealTypes: true, mealRole: true, activeMinutes: true },
    orderBy: { name: 'asc' },
  })
  const ingredients = await prisma.ingredient.findMany({
    select: { id: true, name: true, aliases: true, category: true },
    orderBy: { name: 'asc' },
  })
  const plans = await prisma.plan.findMany({
    select: { id: true, planDate: true, createdAt: true, status: true, dayContext: true },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })
  console.log(
    JSON.stringify(
      {
        family,
        rule,
        publishedDishCount: dishes.length,
        dishes,
        ingredients,
        plans,
      },
      null,
      1,
    ),
  )
} else if (cmd === 'reset-verify-days') {
  if (process.env.FM_VERIFY_ALLOW_FIXTURE_RESET !== '1') {
    throw new Error('拒绝执行：需显式设置 FM_VERIFY_ALLOW_FIXTURE_RESET=1（仅本机验收库）')
  }
  const today = localToday()
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const dayAfter = new Date(tomorrow)
  dayAfter.setDate(dayAfter.getDate() + 1)
  const plans = await prisma.plan.findMany({
    where: { familyId: 'seed-family', planDate: { gte: today, lt: dayAfter } },
    select: { id: true },
  })
  const ids = plans.map((p) => p.id)
  if (ids.length > 0) {
    await prisma.event.deleteMany({ where: { planId: { in: ids } } })
    await prisma.plan.deleteMany({ where: { id: { in: ids } } })
  }
  console.log(JSON.stringify({ deletedPlans: ids.length, ids }))
} else if (cmd === 'move-to-today') {
  if (!arg1) throw new Error('缺少 planId')
  const plan = await prisma.plan.update({
    where: { id: arg1 },
    data: { planDate: localToday() },
  })
  console.log(JSON.stringify({ moved: plan.id, planDate: plan.planDate }))
} else if (cmd === 'seed-feedback') {
  if (!arg1) throw new Error('缺少 planId')
  const plan = await prisma.plan.findUnique({ where: { id: arg1 } })
  if (!plan) throw new Error(`plan 不存在: ${arg1}`)
  // 语义对齐 dayPlanService.addDayFeedback：COOKED payload={taste,willRepeat}，NOT_COOKED payload={willRepeat}
  await prisma.event.createMany({
    data: [
      {
        familyId: plan.familyId,
        planId: plan.id,
        type: 'COOKED',
        mealSlot: 'breakfast',
        payload: { taste: 'good', willRepeat: true },
      },
      {
        familyId: plan.familyId,
        planId: plan.id,
        type: 'COOKED',
        mealSlot: 'lunch',
        payload: { taste: 'fail', willRepeat: false },
      },
      {
        familyId: plan.familyId,
        planId: plan.id,
        type: 'NOT_COOKED',
        mealSlot: 'dinner',
        payload: { willRepeat: false },
      },
    ],
  })
  console.log(JSON.stringify({ seeded: plan.id, slots: ['breakfast', 'lunch', 'dinner'] }))
} else {
  console.error('未知命令，可用：probe | move-to-today | seed-feedback')
  process.exit(2)
}

await prisma.$disconnect()
