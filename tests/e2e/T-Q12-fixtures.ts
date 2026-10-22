// tests/e2e/T-Q12-fixtures.ts
// T-Q12/T-Q13 页面验收的本地夹具脚本（仅本机 PG，绝不用于生产）：
//   probe                      只读打印规则/菜品/食材/计划概览（不含任何密钥）
//   reset-verify-days          清理本机「今天/明天」两天内由验收创建的 Plan（含 Event），
//                              仅当 FM_VERIFY_ALLOW_FIXTURE_RESET=1 时执行；不碰更早历史数据
//   reset-dates <csv> [with-cooklogs]
//                              按本地日期清理验收 Plan（含 Event）；第二参数存在时一并清理
//                              这些日期区间内的 CookLog（本地验收库专用）
//   move-to-today <planId>     把 UI 真实生成的一份 Plan 的 planDate 改为本机「今天零点」
//   move-to-date <planId> <YYYY-MM-DD>
//                              把真实生成的 Plan 移到指定本地日零点（历史/过去日期复看用）
//   seed-feedback <planId>     写入三餐真实 Event 反馈（早=好吃 / 中=翻车 / 晚=没做）
//   seed-feedback-json <planId> <base64-json>
//                              按餐写 Event（base64 避免 Windows 引号问题）；先清同 plan 反馈
//   plan-brief <planId>        只读打印该 plan 的餐次/菜名/失败归因（排障用）
//   list-plans [limit]         只读打印近期计划概览（含是否带 dayPlan）
// 说明：T-Q13 只用真实引擎生成计划，本文件只做「移日期 / 写评价事件」的验收辅助；
//       seed-feedback-json 只写 Event（页面读取口径），不写 CookLog，报告中如实披露。
// 运行：pnpm --dir apps/api exec tsx ../../tests/e2e/T-Q12-fixtures.ts <cmd> [...args]
import { prisma } from '../../apps/api/src/db.ts'

const FAMILY_ID = 'seed-family'

function localToday(): Date {
  const n = new Date()
  return new Date(n.getFullYear(), n.getMonth(), n.getDate(), 0, 0, 0, 0)
}

function localMidnight(dateStr: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) throw new Error(`日期格式须为 YYYY-MM-DD: ${dateStr}`)
  const d = new Date(`${dateStr}T00:00:00`)
  if (Number.isNaN(d.getTime())) throw new Error(`无效日期: ${dateStr}`)
  return d
}

function nextDay(d: Date): Date {
  const n = new Date(d)
  n.setDate(n.getDate() + 1)
  return n
}

const [cmd, arg1, arg2] = process.argv.slice(2)

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
} else if (cmd === 'reset-dates') {
  if (process.env.FM_VERIFY_ALLOW_FIXTURE_RESET !== '1') {
    throw new Error('拒绝执行：需显式设置 FM_VERIFY_ALLOW_FIXTURE_RESET=1（仅本机验收库）')
  }
  const dates = (arg1 ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  if (dates.length === 0) throw new Error('缺少日期列表（YYYY-MM-DD,YYYY-MM-DD）')
  const starts = dates.map(localMidnight)
  const ranges = starts.map((s) => ({ planDate: { gte: s, lt: nextDay(s) } }))
  const plans = await prisma.plan.findMany({
    where: { familyId: FAMILY_ID, OR: ranges },
    select: { id: true },
  })
  const ids = plans.map((p) => p.id)
  if (ids.length > 0) {
    await prisma.event.deleteMany({ where: { planId: { in: ids } } })
    await prisma.plan.deleteMany({ where: { id: { in: ids } } })
  }
  let deletedCookLogs = 0
  if (arg2 === 'with-cooklogs') {
    const min = new Date(Math.min(...starts.map((d) => d.getTime())))
    const max = new Date(Math.max(...starts.map((d) => nextDay(d).getTime())))
    const res = await prisma.cookLog.deleteMany({ where: { cookedAt: { gte: min, lt: max } } })
    deletedCookLogs = res.count
  }
  console.log(JSON.stringify({ deletedPlans: ids.length, ids, deletedCookLogs, dates }))
} else if (cmd === 'move-to-today') {
  if (!arg1) throw new Error('缺少 planId')
  const plan = await prisma.plan.update({
    where: { id: arg1 },
    data: { planDate: localToday() },
  })
  console.log(JSON.stringify({ moved: plan.id, planDate: plan.planDate }))
} else if (cmd === 'move-to-date') {
  if (!arg1 || !arg2) throw new Error('用法：move-to-date <planId> <YYYY-MM-DD>')
  const plan = await prisma.plan.update({
    where: { id: arg1 },
    data: { planDate: localMidnight(arg2) },
  })
  console.log(JSON.stringify({ moved: plan.id, planDate: plan.planDate, date: arg2 }))
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
} else if (cmd === 'seed-feedback-json') {
  if (!arg1 || !arg2) throw new Error('用法：seed-feedback-json <planId> <base64-json>')
  const plan = await prisma.plan.findUnique({ where: { id: arg1 } })
  if (!plan) throw new Error(`plan 不存在: ${arg1}`)
  const spec = JSON.parse(Buffer.from(arg2, 'base64').toString('utf8')) as Record<
    string,
    { didCook: boolean; taste?: 'good' | 'ok' | 'fail'; willRepeat?: boolean; actualMinutes?: number } | null
  >
  const slots = Object.keys(spec)
  // 幂等：先清该 plan 的全部反馈事件，再按本次 spec 写入（只写 Event，页面读取口径）
  await prisma.event.deleteMany({
    where: { planId: plan.id, type: { in: ['COOKED', 'NOT_COOKED'] } },
  })
  const rows = []
  for (const slot of slots) {
    const v = spec[slot]
    if (!v) continue
    if (!['breakfast', 'lunch', 'dinner'].includes(slot)) throw new Error(`未知餐次: ${slot}`)
    const payload: { taste?: string; willRepeat?: boolean; actualMinutes?: number } = {
      willRepeat: v.willRepeat === true,
    }
    if (v.didCook) {
      payload.taste = v.taste
      if (v.actualMinutes !== undefined) payload.actualMinutes = v.actualMinutes
    }
    rows.push({
      familyId: plan.familyId,
      planId: plan.id,
      type: v.didCook ? ('COOKED' as const) : ('NOT_COOKED' as const),
      mealSlot: slot,
      payload,
    })
  }
  if (rows.length > 0) await prisma.event.createMany({ data: rows })
  console.log(JSON.stringify({ seeded: plan.id, slots: rows.map((r) => r.mealSlot) }))
} else if (cmd === 'plan-brief') {
  if (!arg1) throw new Error('缺少 planId')
  const plan = await prisma.plan.findUnique({ where: { id: arg1 } })
  if (!plan) throw new Error(`plan 不存在: ${arg1}`)
  const dp = plan.dayPlan as
    | {
        meals?: { slot: string; dishes: { id: string; name: string }[] }[]
        failures?: { slot: string; kind: string; detail?: string }[]
      }
    | null
  console.log(
    JSON.stringify(
      {
        id: plan.id,
        planDate: plan.planDate,
        createdAt: plan.createdAt,
        status: plan.status,
        dayContext: plan.dayContext,
        hasDayPlan: !!plan.dayPlan,
        meals: (dp?.meals ?? []).map((m) => ({
          slot: m.slot,
          dishes: m.dishes.map((d) => ({ id: d.id, name: d.name })),
        })),
        failures: dp?.failures ?? [],
      },
      null,
      1,
    ),
  )
} else if (cmd === 'list-plans') {
  const take = Math.max(1, Math.min(100, Number(arg1 ?? 20) || 20))
  const plans = await prisma.plan.findMany({
    where: { familyId: FAMILY_ID },
    orderBy: { createdAt: 'desc' },
    take,
    select: { id: true, planDate: true, createdAt: true, status: true, dayContext: true, dayPlan: true },
  })
  console.log(
    JSON.stringify(
      plans.map((p) => {
        const dp = p.dayPlan as { meals?: { slot: string; dishes: { name: string }[] }[] } | null
        return {
          id: p.id,
          planDate: p.planDate,
          createdAt: p.createdAt,
          status: p.status,
          hasDayPlan: !!p.dayPlan,
          adults: (p.dayContext as { adults?: number } | null)?.adults,
          children: (p.dayContext as { children?: number } | null)?.children,
          dishNames: (dp?.meals ?? []).flatMap((m) => m.dishes.map((d) => d.name)).slice(0, 8),
        }
      }),
      null,
      1,
    ),
  )
} else {
  console.error(
    '未知命令，可用：probe | reset-verify-days | reset-dates | move-to-today | move-to-date | seed-feedback | seed-feedback-json | plan-brief | list-plans',
  )
  process.exit(2)
}

await prisma.$disconnect()
