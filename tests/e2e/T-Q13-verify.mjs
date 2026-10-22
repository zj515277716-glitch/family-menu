// tests/e2e/T-Q13-verify.mjs
// T-Q13 页面验收（Playwright，H5 移动端 375×812 / dpr2）：
//   真实打开 http://127.0.0.1:10086，真实点击/输入/断言/截图；
//   覆盖 S-09 菜品做法、S-10 记一笔弹层、S-11 历史，以及审查要求的
//   「GET feedback 失败→重试→预填」与「POST 成功但回读失败→只重读不重提」回归。
// 数据：今天计划由 S-04 真实走一遍生成（2 大 1 小、必消番茄、临时忌口香菜），
//       历史计划用 POST /api/recommend 真实引擎生成后仅移动 planDate；
//       评价事件用本机夹具写入 Event（页面读取口径），报告中如实披露。
// 运行：node tests/e2e/T-Q13-verify.mjs
//       FM_SETUP_ONLY=1 node tests/e2e/T-Q13-verify.mjs  （只建数据并打印清单，排障用）
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { requireLocalToken } from './lib/env-token.mjs'

const BASE = 'http://127.0.0.1:10086'
const API = 'http://127.0.0.1:3000'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const outDir = join(root, 'evidence', 'T-Q13')
const fixtureScript = join(here, 'T-Q12-fixtures.ts')
mkdirSync(outDir, { recursive: true })

const SETUP_ONLY = process.env.FM_SETUP_ONLY === '1'
const checks = []
function check(name, ok, detail = '') {
  checks.push({ name, ok, detail })
  if (!ok) process.exitCode = 1
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` | ${detail}` : ''}`)
}

function fixture(cmd, args = []) {
  const out = execFileSync(
    'pnpm',
    ['--dir', 'apps/api', 'exec', 'tsx', fixtureScript, cmd, ...args],
    {
      cwd: root,
      encoding: 'utf8',
      shell: true,
      env: { ...process.env, FM_VERIFY_ALLOW_FIXTURE_RESET: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  return out.trim()
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function localDateStr(d = new Date()) {
  const y = d.getFullYear()
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${y}-${m}-${day}`
}
function shiftDate(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00`)
  d.setDate(d.getDate() + days)
  return localDateStr(d)
}
const WEEKDAYS_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
function formatDateCN(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`)
  return `${d.getMonth() + 1}月${d.getDate()}日 ${WEEKDAYS_CN[d.getDay()]}`
}
function b64(v) {
  return Buffer.from(JSON.stringify(v), 'utf8').toString('base64')
}
function roundPurchase(qty) {
  return Math.max(1, Math.ceil(qty))
}

const today = localDateStr()
const tomorrow = shiftDate(today, 1)
const yesterday = shiftDate(today, -1)
const dayBefore = shiftDate(today, -2)
const threeDaysAgo = shiftDate(today, -3)
const fifteenDaysAgo = shiftDate(today, -15)

const sleepMs = 1200
const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: 375, height: 812 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: 'zh-CN',
})
const page = await context.newPage()

let currentStep = 'init'
let expectFailure = false
const unexpectedConsoleErrors = []
const unexpectedFailedRequests = []
const unexpectedBadResponses = []
const feedbackPosts = []
const recommendPlanIds = []
let lastRecommendHttp = null

page.on('console', (m) => {
  if (m.type() === 'error' && !expectFailure) {
    unexpectedConsoleErrors.push({ step: currentStep, text: m.text() })
  }
})
page.on('requestfailed', (r) => {
  if (!expectFailure) {
    unexpectedFailedRequests.push({
      step: currentStep,
      text: `${r.method()} ${r.url()} :: ${r.failure()?.errorText ?? 'unknown'}`,
    })
  }
})
page.on('response', (r) => {
  if (r.status() >= 400 && !expectFailure) {
    unexpectedBadResponses.push({ step: currentStep, text: `${r.status()} ${r.url()}` })
  }
  if (r.request().method() === 'POST' && r.url().includes('/api/recommend')) {
    void r.text().then((raw) => {
      lastRecommendHttp = { status: r.status(), body: raw }
      try {
        const j = JSON.parse(raw)
        if (j?.id) recommendPlanIds.push(j.id)
      } catch {
        /* 响应体不是 JSON 时由页面断言兜底 */
      }
    }).catch(() => {})
  }
})
page.on('request', (r) => {
  if (r.method() === 'POST' && /\/api\/plans\/[^/]+\/feedback/.test(r.url())) {
    let body = null
    try {
      body = r.postDataJSON()
    } catch {
      body = r.postData()
    }
    feedbackPosts.push({ step: currentStep, url: r.url(), body })
  }
})

const bodyText = () => page.evaluate(() => document.body.innerText.replace(/\n+/g, ' | '))
async function waitBody(text, timeout = 20000) {
  await page.waitForFunction((t) => document.body.innerText.includes(t), text, { timeout })
}
async function waitGone(text, timeout = 10000) {
  await page.waitForFunction((t) => !document.body.innerText.includes(t), text, { timeout })
}
async function shot(name, fullPage = false) {
  await page.screenshot({ path: join(outDir, name), fullPage })
  console.log(`SHOT ${name}`)
}
function byBtn(cls, text) {
  return page.locator(cls).filter({ hasText: text }).first()
}
async function tap(cls, text, timeout = 15000) {
  const loc = byBtn(cls, text)
  await loc.waitFor({ state: 'visible', timeout })
  await loc.click()
  return loc
}
async function tapText(text, timeout = 15000) {
  const loc = page.getByText(text, { exact: true }).first()
  await loc.waitFor({ state: 'visible', timeout })
  await loc.click()
  return loc
}
async function assertVisibleBox(name, locator) {
  await locator.scrollIntoViewIfNeeded().catch(() => {})
  const box = await locator.boundingBox()
  const ok =
    !!box && box.y >= -1 && box.y + box.height <= 813 && box.x >= -1 && box.x + box.width <= 376
  check(name, ok, box ? `box=${JSON.stringify(box)}` : 'no boundingBox')
}
function mealBlock(slotLabel) {
  return page.locator('.meal-block').filter({ has: page.getByText(slotLabel, { exact: true }) }).first()
}
function sheetVisible() {
  return page.locator('.nut-popup:visible').filter({ has: page.locator('.sheet-title') }).first()
}
function sheetTitleText() {
  return sheetVisible().locator('.sheet-title').innerText()
}
async function sheetOptionsOn() {
  const texts = await sheetVisible().locator('.opt.on').allTextContents()
  return texts.map((t) => t.trim()).filter(Boolean)
}
async function clickSheetOpt(label) {
  const sheet = sheetVisible()
  await sheet.locator('.opt').filter({ hasText: new RegExp(`^${label}$`) }).first().click()
  await sleep(180)
}
async function clickSheetSubmit() {
  await sheetVisible().locator('.btn-main').first().click()
}
async function waitSheetClosed(timeout = 12000) {
  await page.waitForFunction(
    () => {
      const pops = Array.from(document.querySelectorAll('.nut-popup'))
      return pops.every((p) => {
        if (!(p instanceof HTMLElement)) return true
        const style = getComputedStyle(p)
        return (
          style.display === 'none' ||
          style.visibility === 'hidden' ||
          p.getBoundingClientRect().height === 0
        )
      })
    },
    null,
    { timeout },
  ).catch(() => {})
  await sleep(350)
}
async function closeSheetByCancel() {
  await sheetVisible().locator('.btn-plain').filter({ hasText: '取消' }).first().click()
  await waitSheetClosed(8000)
}
async function openFeedback(slotLabel) {
  const block = mealBlock(slotLabel)
  await block.locator('.btn-plain').filter({ hasText: '记一笔' }).first().click()
  await sheetVisible().waitFor({ state: 'visible', timeout: 8000 })
  await sleep(400)
}
function mealTag(slotLabel) {
  return mealBlock(slotLabel).locator('.tag').first()
}
async function waitTag(slotLabel, text, timeout = 8000) {
  await page.waitForFunction(
    ({ slotLabel, text }) => {
      const blocks = Array.from(document.querySelectorAll('.meal-block'))
      return blocks.some((b) => {
        const name = b.querySelector('.meal-name')?.textContent?.trim()
        const tag = b.querySelector('.tag')?.textContent?.trim()
        return name === slotLabel && tag === text
      })
    },
    { slotLabel, text },
    { timeout },
  )
}
async function historyRows() {
  return page.locator('.history-day').evaluateAll((els) =>
    els.map((e) => ({
      title: e.querySelector('.day-title')?.textContent?.trim() ?? '',
      note: e.querySelector('.day-note')?.textContent?.trim() ?? '',
      rows: Array.from(e.querySelectorAll('.meal-row')).map((r) => ({
        name: r.querySelector('.meal-row-name')?.textContent?.trim() ?? '',
        dishes: r.querySelector('.meal-row-dishes')?.textContent?.trim() ?? '',
        meta: r.querySelector('.meal-row-meta')?.textContent?.trim() ?? '',
        tag: r.querySelector('.tag')?.textContent?.trim() ?? '',
        tagCls: r.querySelector('.tag')?.className ?? '',
      })),
    })),
  )
}
async function dishDetail(id) {
  const res = await apiFetch(`/api/dishes/${encodeURIComponent(id)}`)
  if (res.status !== 200) throw new Error(`GET /api/dishes/${id} HTTP ${res.status}: ${res.text.slice(0, 200)}`)
  return JSON.parse(res.text)
}
async function waitDishName(name, timeout = 20000) {
  await page.waitForFunction(
    (n) => document.querySelector('.dhero-name')?.textContent?.trim() === n,
    name,
    { timeout },
  )
}


// ───────────────────── 登录 ─────────────────────
async function login() {
  currentStep = '00-login'
  await page.goto(BASE, { waitUntil: 'load', timeout: 30000 })
  const loginInput = page.locator('input[placeholder="请输入口令"]')
  await page.waitForFunction(
    () =>
      !!document.querySelector('input[placeholder="请输入口令"]') ||
      document.body.innerText.includes('今天三餐') ||
      document.body.innerText.includes('历史'),
    null,
    { timeout: 25000 },
  )
  if (await loginInput.count()) {
    let loggedIn = false
    for (let attempt = 1; attempt <= 3 && !loggedIn; attempt++) {
      await loginInput.waitFor({ state: 'visible', timeout: 15000 })
      await loginInput.fill(requireLocalToken())
      console.log(`LOGIN attempt=${attempt} typed=${(await loginInput.inputValue()).length > 0}`)
      await tap('.btn-main', '进入')
      try {
        await waitBody('今天三餐', 15000)
        loggedIn = true
      } catch {
        await shot(`login-retry-${attempt}.png`)
        await sleep(1200)
      }
    }
    check('0.1 登录页口令输入并进入首页', loggedIn)
  }
  await waitBody('今天三餐', 25000)
  check('0.2 真实登录并进入首页', (await bodyText()).includes('今天三餐'))
}

// ───────────────────── 真实生成今天计划（S-04 全流程） ─────────────────────
async function generateTodayPlanViaUI() {
  currentStep = 'S-04-journey'
  await tap('.btn-main', '定明天的餐')
  await waitBody('明天几个人吃', 20000)

  const adultRow = page.locator('.frow').filter({ hasText: '成人' }).first()
  const childRow = page.locator('.frow').filter({ hasText: '儿童' }).first()
  // 默认 4 大 0 小 → 2 大 1 小（用于验证用料缩放与人数标签）
  await adultRow.locator('.step-btn').nth(0).click()
  await adultRow.locator('.step-btn').nth(0).click()
  await childRow.locator('.step-btn').nth(1).click()
  check(
    'S-04 人数步进：4 大 0 小 → 2 大 1 小',
    (await adultRow.locator('.step-val').innerText()) === '2' &&
      (await childRow.locator('.step-val').innerText()) === '1',
  )

  // 必消「番茄」（真实有效食材）
  await page.locator('.chip-add').filter({ hasText: '加食材' }).click()
  const mustInput = page.locator('input[placeholder="例：番茄"]')
  await mustInput.waitFor({ state: 'visible', timeout: 10000 })
  await mustInput.fill('番茄')
  await page.locator('.sheet-body .btn-main').filter({ hasText: '添加' }).first().click()
  await page.waitForFunction(
    () => Array.from(document.querySelectorAll('.chip')).some((el) => el.textContent?.includes('番茄')),
    null,
    { timeout: 8000 },
  )
  // 临时忌口「香菜」（与所选菜不冲突）
  await page.locator('.chip-add').filter({ hasText: '加忌口' }).click()
  const tempInput = page.locator('input[placeholder="例：牛肉"]')
  await tempInput.waitFor({ state: 'visible', timeout: 10000 })
  await tempInput.fill('香菜')
  await page.locator('.sheet-body .btn-main').filter({ hasText: '添加' }).first().click()
  await page.waitForFunction(
    () => Array.from(document.querySelectorAll('.chip')).some((el) => el.textContent?.includes('香菜')),
    null,
    { timeout: 8000 },
  )
  const chips = (await page.locator('.chip').allTextContents()).join('|')
  check('S-04 必消/临时忌口均写入', chips.includes('番茄') && chips.includes('香菜'), chips)

  // 想吃的菜：只输入菜名，从菜谱池点选
  const desiredInput = page.locator('input[placeholder="例：番茄炒蛋"]')
  for (const dishName of ['清蒸鲈鱼', '番茄炒蛋', '蒜蓉青菜']) {
    await desiredInput.fill(dishName)
    const item = page.locator('.cand-item').filter({ hasText: dishName }).first()
    await item.waitFor({ state: 'visible', timeout: 10000 })
    await item.click()
    await waitBody(`已加入：${dishName}`, 10000)
  }
  check(
    'S-04 想吃的菜点选加入（不让用户输入系统编号）',
    (await page.locator('.chip').allTextContents()).join('|').includes('蒜蓉青菜'),
  )
  await shot('S-04-journey-filled.png')
  await assertVisibleBox(
    'S-04 最后操作按钮「推荐菜谱」完全可见',
    page.locator('.stickybar .btn-main').filter({ hasText: '推荐菜谱' }).first(),
  )

  const beforeIds = recommendPlanIds.length
  await tap('.stickybar .btn-main', '推荐菜谱')
  await waitBody('正在为明天搭配三餐…', 15000)
  await page.waitForFunction(
    () =>
      document.body.innerText.includes('确认三餐，查看采购清单') ||
      document.body.innerText.includes('明天三餐出不来') ||
      document.body.innerText.includes('没生成出来'),
    null,
    { timeout: 45000 },
  )
  const afterText = await bodyText()
  if (!afterText.includes('确认三餐，查看采购清单')) {
    check(
      'S-05 真实引擎生成今天计划（UI 全流程）',
      false,
      lastRecommendHttp ? `HTTP ${lastRecommendHttp.status}: ${lastRecommendHttp.body.slice(0, 300)}` : '未捕获响应',
    )
    await shot('S-04-generate-blocked.png', true)
    throw new Error('BLOCKER: UI 生成计划失败，无法继续 S-09/S-10')
  }
  await sleep(500)
  const planId = recommendPlanIds[beforeIds] ?? recommendPlanIds[recommendPlanIds.length - 1]
  check('S-05 真实引擎生成今天计划（UI 全流程）', !!planId, `planId=${planId}`)
  await shot('S-05-menu-generated.png', true)
  if (!planId) throw new Error('BLOCKER: 未捕获 recommend planId')

  // 真实计划从「明天」移到今天（夹具只改 planDate，不改 dayPlan）
  const moved = fixture('move-to-date', [planId, today])
  console.log('FIXTURE move today:', moved)
  const brief = JSON.parse(fixture('plan-brief', [planId]))
  check(
    'S-09 生成计划带三餐结构且人数 2 大 1 小',
    brief.hasDayPlan &&
      (brief.meals ?? []).length >= 1 &&
      brief.dayContext?.adults === 2 &&
      brief.dayContext?.children === 1,
    `meals=${(brief.meals ?? []).map((m) => `${m.slot}:${m.dishes.length}`).join(',')} ctx=${JSON.stringify(
      brief.dayContext,
    )}`,
  )
  return { planId, brief }
}

// ───────────────────── 真实引擎生成历史计划 + 写评价事件 ─────────────────────
// 说明：本机登录 cookie 是 Secure+HttpOnly，只有浏览器页面上下文会发送；
// 因此数据准备阶段用页面内 fetch（真实同源凭据）调用真实 API，不伪造响应。
async function apiFetch(path, { method = 'GET', body } = {}) {
  const result = await page.evaluate(
    async ({ path, method, body }) => {
      const r = await fetch(`http://127.0.0.1:3000${path}`, {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      const text = await r.text()
      return { status: r.status, text }
    },
    { path, method, body },
  )
  return result
}

async function postRecommend(ctx, label) {
  const { status, text } = await apiFetch('/api/recommend', { method: 'POST', body: ctx })
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    /* ignore */
  }
  if (status !== 200 || !json?.id) {
    throw new Error(`POST /api/recommend(${label}) HTTP ${status}: ${text.slice(0, 400)}`)
  }
  return json
}

function compactPlan(plan) {
  return {
    id: plan.id,
    planDate: plan.planDate,
    createdAt: plan.createdAt,
    dayContext: plan.dayContext,
    meals: (plan.dayPlan?.meals ?? []).map((m) => ({
      slot: m.slot,
      dishes: m.dishes.map((d) => ({ id: d.id, name: d.name })),
    })),
    failures: plan.dayPlan?.failures ?? [],
  }
}

async function setupHistoryData(dishesByName) {
  currentStep = 'setup-history'
  const ctx = (desiredNames, extra = {}) => ({
    adults: 2,
    children: 1,
    timeBudgetMin: 30,
    mustUseIngredients: [],
    meals: ['breakfast', 'lunch', 'dinner'],
    desiredDishIds: desiredNames.map((n) => {
      const id = dishesByName.get(n)
      if (!id) throw new Error(`菜谱池找不到菜名: ${n}`)
      return id
    }),
    ...extra,
  })

  const y1a = await postRecommend(ctx(['土豆炖牛腩', '凉拌黄瓜', '小米粥']), 'y1a')
  await sleep(sleepMs)
  const y1b = await postRecommend(ctx(['红烧肉', '西兰花炒虾仁', '牛奶燕麦粥']), 'y1b')
  await sleep(sleepMs)
  const d2 = await postRecommend(ctx(['清蒸鲈鱼', '紫菜蛋花汤', '番茄炒蛋']), 'd2')
  await sleep(sleepMs)
  const d3 = await postRecommend(
    { ...ctx([]), mustUseIngredients: ['鸵鸟肉'] },
    'd3-failure',
  )
  await sleep(sleepMs)
  const oldPlan = await postRecommend(ctx(['蛋炒饭', '水煮蛋', '小米粥']), 'old15')
  await sleep(sleepMs)
  const planTomorrow = await postRecommend(ctx(['蛋炒饭', '凉拌黄瓜', '西红柿鸡蛋面']), 'tomorrow')

  fixture('move-to-date', [y1a.id, yesterday])
  fixture('move-to-date', [y1b.id, yesterday])
  fixture('move-to-date', [d2.id, dayBefore])
  fixture('move-to-date', [d3.id, threeDaysAgo])
  fixture('move-to-date', [oldPlan.id, fifteenDaysAgo])
  // planTomorrow 保持引擎默认的「明天零点」

  fixture('seed-feedback-json', [
    y1b.id,
    b64({
      breakfast: { didCook: true, taste: 'good', willRepeat: true, actualMinutes: 30 },
      lunch: { didCook: true, taste: 'fail', willRepeat: false },
      dinner: { didCook: false, willRepeat: false },
    }),
  ])
  fixture('seed-feedback-json', [
    d2.id,
    b64({
      breakfast: { didCook: true, taste: 'ok', willRepeat: true, actualMinutes: 50 },
    }),
  ])

  return {
    y1a: compactPlan(y1a),
    y1b: compactPlan(y1b),
    d2: compactPlan(d2),
    d3: compactPlan(d3),
    oldPlan: compactPlan(oldPlan),
    planTomorrow: compactPlan(planTomorrow),
  }
}

// ───────────────────── 主流程 ─────────────────────
let manifest = null
try {
  // 0. 清理本机验收日期窗口（仅本机 PG；带 with-cooklogs 清本区间历史 CookLog）
  currentStep = '00-setup'
  const resetOut = fixture('reset-dates', [
    [today, tomorrow, yesterday, dayBefore, threeDaysAgo, fifteenDaysAgo].join(','),
    'with-cooklogs',
  ])
  console.log('FIXTURE reset-dates:', resetOut)
  check('0.0 验收前清理本机目标日期计划（仅本机 PG）', true, resetOut)

  await login()

  // 1. S-11 真实空态（此时本机库里没有带 dayPlan 的过去计划）
  currentStep = 'S-11-empty'
  await page.locator('.nut-tabbar').getByText('历史', { exact: true }).click()
  await waitBody('还没有记录', 20000)
  const emptyHist = await bodyText()
  check('S-11 真实空态：还没有记录 + 去定明天的餐 + Tabbar', emptyHist.includes('去定明天的餐') && emptyHist.includes('历史'))
  await shot('S-11-empty.png')
  await assertVisibleBox(
    'S-11 空态最后操作按钮「去定明天的餐」完全可见',
    page.locator('.btn-main').filter({ hasText: '去定明天的餐' }).first(),
  )
  await page.locator('.nut-tabbar').getByText('首页', { exact: true }).click()
  await waitBody('今天三餐', 20000)

  // 2. 真实生成今天计划
  const todayInfo = await generateTodayPlanViaUI()

  // 3. 菜谱池 + 历史计划（真实引擎），评价事件由夹具写入
  currentStep = 'setup-dishes'
  const dishRes = await apiFetch('/api/dishes?status=PUBLISHED')
  let dishList = []
  try {
    dishList = JSON.parse(dishRes.text)
  } catch {
    dishList = []
  }
  check(
    'setup 菜谱池可读（真实 PUBLISHED 菜）',
    dishRes.status === 200 && Array.isArray(dishList) && dishList.length > 0,
    `status=${dishRes.status} body=${dishRes.text.slice(0, 160)}`,
  )
  if (!Array.isArray(dishList)) throw new Error('BLOCKER: 菜谱池不可读')
  const dishesByName = new Map(dishList.map((d) => [d.name, d.id]))

  const history = await setupHistoryData(dishesByName)
  manifest = { today, tomorrow, yesterday, dayBefore, threeDaysAgo, fifteenDaysAgo, todayInfo, history }
  console.log(`MANIFEST ${JSON.stringify(manifest)}`)

  // 今天午餐预填用评价：好吃 / 还做 / 30 分钟
  fixture('seed-feedback-json', [
    todayInfo.planId,
    b64({ lunch: { didCook: true, taste: 'good', willRepeat: true, actualMinutes: 30 } }),
  ])

  // 重新进首页：读取真实计划 + 评价标签
  await page.goto(`${BASE}/#/pages/home/index`, { waitUntil: 'load', timeout: 30000 })
  await waitBody('今天三餐', 25000)
  await page.waitForFunction(
    () => !!document.querySelector('.meal-block') && !document.body.innerText.includes('正在读取今天的菜单'),
    null,
    { timeout: 25000 },
  )
  await sleep(500)
  check(
    '0.3 首页读到今天的真实三餐（非假数据）',
    (await page.locator('.meal-block').count()) >= 1,
    `meals=${await page.locator('.meal-block').count()}`,
  )
  await shot('S-03-home-with-plan.png', true)

  if (SETUP_ONLY) {
    console.log('SETUP_ONLY=1，跳过后续页面断言')
  } else {
    const lunchMeal = todayInfo.brief.meals.find((m) => m.slot === 'lunch')
    const lunchDishes = lunchMeal?.dishes ?? []
    check(
      'S-09 今天午餐有 ≥2 道菜（用于同餐上一道/下一道）',
      lunchDishes.length >= 2,
      `lunch=${lunchDishes.map((d) => d.name).join('/')}`,
    )

    // ═════════ S-09 做法页：首页「看做法」进入 ═════════
    currentStep = 'S-09'
    check(
      'S-09 首页午餐菜名与真实计划一致',
      (await mealBlock('中餐').locator('.fcard-name').allTextContents()).every((n) =>
        lunchDishes.some((d) => d.name === n.trim()),
      ),
    )
    await mealBlock('中餐').locator('.btn-ghost').filter({ hasText: '看做法' }).first().click()
    await waitBody('分步做法', 25000)
    await waitDishName(lunchDishes[0].name)
    await sleep(600)

    const firstDish = await dishDetail(lunchDishes[0].id)
    const heroBox = await page.locator('.dhero').first().boundingBox()
    check(
      'S-09 4:3 全出血大图（图/占位块）',
      !!heroBox && heroBox.width > 370 && Math.abs(heroBox.height / heroBox.width - 0.75) < 0.03,
      heroBox ? `box=${JSON.stringify(heroBox)}` : 'no dhero',
    )
    check(
      'S-09 菜名/今天·餐次·人数 chips 齐全',
      (await page.locator('.dhero-name').innerText()) === lunchDishes[0].name &&
        (await page.locator('.dhero-sub').innerText()).includes('今天') &&
        (await page.locator('.dhero-sub').innerText()).includes('中餐') &&
        (await page.locator('.dhero-sub').innerText()).includes('2 大 1 小') &&
        (await page.locator('.dchip.hot').innerText()).includes('动火'),
    )
    await shot('S-09-hero.png')

    // 用料缩放：qty ×（2+1）/4 后向上取整、最小 1
    const ingRows = await page.locator('.ing-row').evaluateAll((els) =>
      els.map((e) => e.innerText.replace(/\s+/g, ' ').trim()),
    )
    const ingErrors = []
    for (const ing of firstDish.ingredients) {
      const expectedQty = roundPurchase((ing.qty * 3) / 4)
      const expected = `${expectedQty} ${ing.unit}`
      const row = ingRows.find((r) => r.startsWith(ing.ingredientName))
      if (!row || !row.includes(expected)) {
        ingErrors.push(`${ing.ingredientName}: 期望 ${expected} / 实际 ${row ?? '缺行'}`)
      }
    }
    const scaledProof = firstDish.ingredients.some(
      (ing) => roundPurchase((ing.qty * 3) / 4) !== roundPurchase(ing.qty),
    )
    check(
      'S-09 用料按（成人+儿童）/4 缩放且标注',
      ingErrors.length === 0 &&
        scaledProof &&
        (await page.locator('.form-title').filter({ hasText: '用料' }).first().innerText()).includes('2 大 1 小') &&
        (await bodyText()).includes('用量已按人数缩放凑整'),
      ingErrors.length ? ingErrors.join(' ; ') : `rows=${ingRows.length} 已缩放`,
    )
    await page.locator('.form-title').filter({ hasText: '用料' }).first().scrollIntoViewIfNeeded()
    await sleep(400)
    await shot('S-09-ingredients.png')

    // 分步序号
    const steps = firstDish.steps.slice().sort((a, b) => a.order - b.order)
    const nums = await page.locator('.step .num').allTextContents()
    check(
      'S-09 分步做法序号圆点连续',
      (await page.locator('.step').count()) === steps.length &&
        nums.map((n) => n.trim()).join(',') === steps.map((_, i) => `${i + 1}`).join(','),
      `steps=${steps.length} nums=${nums.join(',')}`,
    )
    await page.getByText('分步做法', { exact: true }).first().scrollIntoViewIfNeeded()
    await sleep(400)
    await shot('S-09-steps.png')

    // 同餐上一道 / 下一道
    const dswitch1 = await page.locator('.dswitch').first().innerText()
    check(
      'S-09 首道：上一道「没有了」不可点，下一道为同餐第二道',
      dswitch1.includes('上一道：没有了') &&
        dswitch1.includes(`下一道：${lunchDishes[1].name}`) &&
        (await page.locator('.dswitch .dimmed').count()) === 1,
      dswitch1.replace(/\n/g, ' | '),
    )
    await page.locator('.dswitch .nav').filter({ hasText: '下一道' }).first().click()
    await waitDishName(lunchDishes[1].name)
    await sleep(500)
    check(
      'S-09 下一道：真替换且上一道指回第一道',
      (await page.locator('.dswitch').first().innerText()).includes(`上一道：${lunchDishes[0].name}`),
    )
    await shot('S-09-next.png')

    if (lunchDishes.length > 2) {
      await page.locator('.dswitch .nav').filter({ hasText: '下一道' }).first().click()
      await waitDishName(lunchDishes[lunchDishes.length - 1].name)
      await sleep(500)
      const lastText = await page.locator('.dswitch').first().innerText()
      check(
        'S-09 末道：下一道「没有了」不可点',
        lastText.includes('下一道：没有了 ›') && (await page.locator('.dswitch .dimmed').count()) === 1,
        lastText.replace(/\n/g, ' | '),
      )
      const beforeClickName = await page.locator('.dhero-name').innerText()
      await page.locator('.dswitch .dimmed').filter({ hasText: '下一道：没有了' }).first().click()
      await sleep(500)
      check(
        'S-09 「没有了」点击不跳转（非静默按钮）',
        (await page.locator('.dhero-name').innerText()) === beforeClickName &&
          page.url().includes('/pages/dish/index'),
      )
      await shot('S-09-last.png')
    }
    await assertVisibleBox(
      'S-09 最后操作按钮「做完记一笔」完全可见',
      page.locator('.stickybar .btn-main').filter({ hasText: '做完记一笔' }).first(),
    )
    await page.locator('.dhero-back').click()
    await waitBody('今天三餐', 20000)
    await page.waitForFunction(() => !!document.querySelector('.meal-block'), null, { timeout: 20000 })
    check('S-09 返回：正常回到首页', (await bodyText()).includes('今天三餐'))

    // ═════════ S-09 做法页：从菜品卡进入 ═════════
    currentStep = 'S-09-card'
    await mealBlock('中餐').locator('.fcard').first().click()
    await waitBody('分步做法', 25000)
    await waitDishName(lunchDishes[0].name)
    await sleep(500)
    check('S-09 菜品卡点击进入同一道菜的做法页', (await page.locator('.dhero-name').innerText()) === lunchDishes[0].name)
    await shot('S-09-from-card.png')
    await page.locator('.dhero-back').click()
    await waitBody('今天三餐', 20000)
    await page.waitForFunction(() => !!document.querySelector('.meal-block'), null, { timeout: 20000 })

    // ═════════ S-10 记一笔：已有反馈预填 + 耗时取消/保留 ═════════
    currentStep = 'S-10-prefill'
    await openFeedback('中餐')
    check('S-10 午餐弹层标题正确', (await sheetTitleText()).includes('中餐吃得怎么样'))
    let on = await sheetOptionsOn()
    check(
      'S-10 已有反馈的餐预填原值（做了/好吃/还做/30 分钟）',
      ['做了', '好吃', '还做', '30 分钟'].every((t) => on.includes(t)),
      on.join(','),
    )
    await shot('S-10-open-prefill.png')
    await clickSheetOpt('30 分钟')
    on = await sheetOptionsOn()
    check('S-10 实际耗时可选填、可取消', !on.includes('30 分钟'), on.join(','))
    await clickSheetOpt('30 分钟')
    check('S-10 耗时可再次选回', (await sheetOptionsOn()).includes('30 分钟'))
    await closeSheetByCancel()
    await openFeedback('中餐')
    check(
      'S-10 取消关闭后重开，未提交选择仍在（设计规则 5）',
      (await sheetOptionsOn()).includes('30 分钟'),
      (await sheetOptionsOn()).join(','),
    )
    await closeSheetByCancel()

    // ═════════ S-10 三问必选校验 + 遮罩关闭 + 提交/覆盖 ═════════
    currentStep = 'S-10-validation'
    await openFeedback('晚餐')
    await clickSheetSubmit()
    await waitBody('第①问「做了没」还没选', 5000)
    check('S-10 三问校验：缺第①问有 toast', true)
    await shot('S-10-validation-1.png')
    await sleep(2300)
    await clickSheetOpt('做了')
    check(
      'S-10 选「做了」后出现味道与耗时问题',
      (await sheetVisible().innerText()).includes('好吃吗？') &&
        (await sheetVisible().innerText()).includes('实际耗时'),
    )
    await clickSheetSubmit()
    await waitBody('第②问「好吃吗」还没选', 5000)
    check('S-10 三问校验：缺第②问有 toast', true)
    await shot('S-10-validation-2.png')
    await sleep(2300)
    await clickSheetOpt('好吃')
    await clickSheetSubmit()
    await waitBody('第③问「下次还做吗」还没选', 5000)
    check('S-10 三问校验：缺第③问有 toast', true)
    await shot('S-10-validation-3.png')
    await sleep(2300)
    await clickSheetOpt('还做')
    await clickSheetOpt('50 分钟')
    on = await sheetOptionsOn()
    check('S-10 三问+耗时均已选', ['做了', '好吃', '还做', '50 分钟'].every((t) => on.includes(t)), on.join(','))

    // 遮罩关闭 → 重开，未提交选择仍在
    await page.mouse.click(20, 120)
    await waitSheetClosed(8000)
    check('S-10 点遮罩关闭弹层', (await page.locator('.nut-popup:visible').count()) === 0)
    await openFeedback('晚餐')
    on = await sheetOptionsOn()
    check(
      'S-10 遮罩关闭后重开，未提交选择仍在（设计规则 5）',
      ['做了', '好吃', '还做', '50 分钟'].every((t) => on.includes(t)),
      on.join(','),
    )
    await shot('S-10-reopen-retained.png')

    const postsBeforeDinner = feedbackPosts.length
    const toastDinner = page
      .waitForFunction(() => document.body.innerText.includes('记好了'), null, { timeout: 5000 })
      .then(() => true)
      .catch(() => false)
    await clickSheetSubmit()
    const dinnerToast = await toastDinner
    await waitSheetClosed(12000)
    check('S-10 提交成功 toast「记好了」', dinnerToast)
    await waitTag('晚餐', '好吃', 8000)
    check('S-10 提交成功后首页晚餐标签即时更新为「好吃」', (await mealTag('晚餐').innerText()) === '好吃')
    const dinnerPost = feedbackPosts[feedbackPosts.length - 1]
    check(
      'S-10 提交报文：做了/好吃/还做/50 分钟 + 餐次晚餐',
      feedbackPosts.length === postsBeforeDinner + 1 &&
        dinnerPost?.body?.didCook === true &&
        dinnerPost?.body?.taste === 'good' &&
        dinnerPost?.body?.willRepeat === true &&
        dinnerPost?.body?.actualMinutes === 50 &&
        dinnerPost?.body?.mealSlot === 'dinner',
      JSON.stringify(dinnerPost?.body),
    )
    await shot('S-10-submitted.png')

    // 同日同餐再次提交 → 读回最新覆盖
    await openFeedback('晚餐')
    check('S-10 重开晚餐弹层预填已保存值', (await sheetOptionsOn()).includes('好吃'))
    await clickSheetOpt('一般')
    await clickSheetOpt('不做了')
    await clickSheetSubmit()
    await waitSheetClosed(12000)
    await waitTag('晚餐', '一般', 8000)
    const overwritePost = feedbackPosts[feedbackPosts.length - 1]
    check(
      'S-10 同日同餐再次提交覆盖（页面读回最新=一般）',
      (await mealTag('晚餐').innerText()) === '一般' &&
        overwritePost?.body?.taste === 'ok' &&
        overwritePost?.body?.willRepeat === false,
      JSON.stringify(overwritePost?.body),
    )
    await shot('S-10-overwrite.png')

    // ═════════ S-10 没做：隐藏味道/耗时且提交报文不带 ═════════
    currentStep = 'S-10-not-cooked'
    await openFeedback('早餐')
    await clickSheetOpt('做了')
    await clickSheetOpt('好吃')
    await clickSheetOpt('30 分钟')
    await clickSheetOpt('没做')
    const sheetText = await sheetVisible().innerText()
    on = await sheetOptionsOn()
    check(
      'S-10 没做：隐藏味道/耗时，只保留「没做」选中',
      !sheetText.includes('好吃吗？') && !sheetText.includes('实际耗时') && on.length === 1 && on[0] === '没做',
      on.join(','),
    )
    await shot('S-10-not-cooked-hidden.png')

    // 反序操作（同一次编辑会话）：没做 → 做了，原选择不丢（设计规则 5）
    await clickSheetOpt('做了')
    on = await sheetOptionsOn()
    check(
      'S-10 反序操作（没做→做了）不丢已选味道/耗时',
      on.includes('好吃') && on.includes('30 分钟'),
      on.join(','),
    )
    await shot('S-10-order-restored.png')
    await clickSheetOpt('没做')
    await clickSheetSubmit()
    await waitBody('第③问「下次还做吗」还没选', 5000)
    await sleep(2300)
    await clickSheetOpt('不做了')
    const postsBeforeBreakfast = feedbackPosts.length
    await clickSheetSubmit()
    await waitSheetClosed(12000)
    await waitTag('早餐', '没做', 8000)
    const breakfastPost = feedbackPosts[feedbackPosts.length - 1]
    check(
      'S-10 没做提交报文不带 taste/actualMinutes',
      feedbackPosts.length === postsBeforeBreakfast + 1 &&
        breakfastPost?.body?.didCook === false &&
        breakfastPost?.body?.willRepeat === false &&
        breakfastPost?.body?.mealSlot === 'breakfast' &&
        !Object.prototype.hasOwnProperty.call(breakfastPost?.body ?? {}, 'taste') &&
        !Object.prototype.hasOwnProperty.call(breakfastPost?.body ?? {}, 'actualMinutes'),
      JSON.stringify(breakfastPost?.body),
    )
    check('S-10 没做后首页早餐标签为「没做」', (await mealTag('早餐').innerText()) === '没做')
    await shot('S-10-not-cooked.png')

    // 提交成功后重开：以服务端「没做 + 不做了」为准，不残留味道/耗时
    await openFeedback('早餐')
    on = await sheetOptionsOn()
    const reopenText = await sheetVisible().innerText()
    check(
      'S-10 提交后重开：服务端已保存「没做/不做了」，不残留味道/耗时',
      on.includes('没做') &&
        on.includes('不做了') &&
        !on.includes('好吃') &&
        !on.includes('30 分钟') &&
        !reopenText.includes('好吃吗？') &&
        !reopenText.includes('实际耗时'),
      on.join(','),
    )
    await closeSheetByCancel()

    // ═════════ 回归：首次 GET feedback 失败 → 重试 → 弹层必须预填 ═════════
    currentStep = 'S-09-feedback-retry'
    // 等上一条「记好了」toast 消失，避免截图混入上一操作的浮层
    await page
      .waitForFunction(() => !document.body.innerText.includes('记好了'), null, { timeout: 6000 })
      .catch(() => {})
    let abortedFeedbackGet = 0
    const lunchFbRe = new RegExp(
      `/api/plans/${todayInfo.planId}/feedback(\\?mealSlot=lunch)?$`,
    )
    expectFailure = true
    await page.route(lunchFbRe, async (route) => {
      if (route.request().method() === 'GET' && abortedFeedbackGet === 0) {
        abortedFeedbackGet += 1
        await route.abort('failed')
        return
      }
      await route.continue()
    })
    await mealBlock('中餐').locator('.btn-ghost').filter({ hasText: '看做法' }).first().click()
    await waitBody('分步做法', 25000)
    await waitDishName(lunchDishes[0].name)
    await page.waitForFunction(
      () => document.body.innerText.includes('上次评价没读出来'),
      null,
      { timeout: 15000 },
    )
    await page.locator('.banner-warn').filter({ hasText: '上次评价没读出来' }).first().waitFor({
      state: 'visible',
      timeout: 8000,
    })
    await sleep(2000)
    check(
      '回归 首次 GET feedback 失败：明说没读出来 + 重试',
      (await bodyText()).includes('重试') && (await page.locator('.banner-warn').count()) >= 1,
    )
    await shot('S-09-feedback-retry.png')
    await page.locator('.banner-warn .act').filter({ hasText: '重试' }).first().click()
    await waitGone('上次评价没读出来', 15000)
    expectFailure = false
    await page.locator('.stickybar .btn-main').filter({ hasText: '做完记一笔' }).first().click()
    await sheetVisible().waitFor({ state: 'visible', timeout: 8000 })
    await sleep(500)
    on = await sheetOptionsOn()
    check(
      '回归 重试成功后打开记一笔：预填服务端已有答案（不空表单覆盖）',
      ['做了', '好吃', '还做', '30 分钟'].every((t) => on.includes(t)),
      on.join(','),
    )
    await shot('S-09-retry-prefill.png')
    await closeSheetByCancel()
    await page.unroute(lunchFbRe)
    await page.locator('.dhero-back').click()
    await waitBody('今天三餐', 20000)
    await page.waitForFunction(() => !!document.querySelector('.meal-block'), null, { timeout: 20000 })

    // ═════════ 回归：POST 成功但 GET 回读失败 → 只重读不重提 ═════════
    currentStep = 'S-10-readback'
    await openFeedback('中餐')
    check('回读回归前：午餐预填仍为已保存值', (await sheetOptionsOn()).includes('好吃'))
    let postCount = 0
    let getCount = 0
    let blockReadback = true
    expectFailure = true
    await page.route(lunchFbRe, async (route) => {
      if (route.request().method() === 'POST') {
        postCount += 1
        await route.continue()
        return
      }
      getCount += 1
      if (blockReadback) {
        await route.abort('failed')
        return
      }
      await route.continue()
    })
    await clickSheetOpt('翻车')
    await clickSheetOpt('不做了')
    await clickSheetSubmit()
    await page.waitForFunction(
      () => document.body.innerText.includes('记下了，但没读回来'),
      null,
      { timeout: 12000 },
    )
    check(
      '回读失败：提示「记下了，但没读回来」且主按钮为「重读评价」',
      (await sheetVisible().innerText()).includes('记下了，但没读回来') &&
        (await sheetVisible().locator('.btn-main').innerText()).includes('重读评价'),
    )
    check('回读失败：POST 只发 1 次', postCount === 1, `post=${postCount} get=${getCount}`)
    await shot('S-10-readback-fail.png')

    const getsBeforeRetry = getCount
    await sheetVisible().locator('.btn-main').first().click()
    await sleep(900)
    await page.waitForFunction(
      () => document.body.innerText.includes('记下了，但没读回来'),
      null,
      { timeout: 8000 },
    )
    check(
      '回读失败后点「重读评价」：只发 GET，不再 POST',
      postCount === 1 && getCount > getsBeforeRetry,
      `post=${postCount} get=${getCount}`,
    )
    blockReadback = false
    expectFailure = false
    const toastReadback = page
      .waitForFunction(() => document.body.innerText.includes('记好了'), null, { timeout: 5000 })
      .then(() => true)
      .catch(() => false)
    await sheetVisible().locator('.btn-main').first().click()
    const readbackToast = await toastReadback
    await waitSheetClosed(12000)
    await waitTag('中餐', '翻车', 8000)
    check(
      '恢复后重读成功：弹层关闭 + 午餐标签更新为「翻车」',
      readbackToast && (await mealTag('中餐').innerText()) === '翻车',
    )
    check('恢复后仍只发 1 次 POST', postCount === 1, `post=${postCount} get=${getCount}`)
    // 等 toast 消失后补一张干净的恢复态截图（toast 证据在 S-10-submitted）
    await page
      .waitForFunction(() => !document.body.innerText.includes('记好了'), null, { timeout: 6000 })
      .catch(() => {})
    await sleep(500)
    await shot('S-10-readback-recovered.png')
    await page.unroute(lunchFbRe)

    // ═════════ S-11 历史：正常态 ═════════
    currentStep = 'S-11'
    await page.locator('.nut-tabbar').getByText('历史', { exact: true }).click()
    await waitBody('按日分组', 25000)
    await page.waitForFunction(() => document.querySelectorAll('.history-day').length === 3, null, { timeout: 25000 })
    await sleep(600)
    const hrs = await historyRows()
    const expectedTitles = [formatDateCN(yesterday), formatDateCN(dayBefore), formatDateCN(threeDaysAgo)]
    check(
      'S-11 按日分组 + 日期倒序（昨天→前天→大前天）',
      hrs.map((h) => h.title).join(',') === expectedTitles.join(','),
      hrs.map((h) => h.title).join(','),
    )
    check(
      'S-11 每日最新 + 人数说明（3 餐 · 2 大 1 小）',
      hrs.every((h) => h.note === '3 餐 · 2 大 1 小'),
      hrs.map((h) => `${h.title}:${h.note}`).join(' | '),
    )
    const day1 = hrs[0]
    check(
      'S-11 四色标签齐全：好吃/翻车/没做（昨天最新计划）',
      day1.rows[0]?.tag === '做了 · 好吃' &&
        day1.rows[0]?.tagCls.includes('tag-ok') &&
        day1.rows[1]?.tag === '做了 · 翻车' &&
        day1.rows[1]?.tagCls.includes('tag-bad') &&
        day1.rows[2]?.tag === '没做' &&
        day1.rows[2]?.tagCls.includes('tag-none'),
      JSON.stringify(day1.rows.map((r) => `${r.name}:${r.tag}`)),
    )
    check(
      'S-11 一般/还没评价 标签（前天）',
      hrs[1]?.rows[0]?.tag === '做了 · 一般' &&
        hrs[1]?.rows[0]?.tagCls.includes('tag-mid') &&
        hrs[1]?.rows[1]?.tag === '还没评价' &&
        hrs[1]?.rows[2]?.tag === '还没评价',
      JSON.stringify(hrs[1]?.rows.map((r) => `${r.name}:${r.tag}`)),
    )
    check(
      'S-11 缺餐如实标「没排上」（大前天真实必消鸵鸟肉空手）',
      hrs[2]?.rows.every((r) => r.tag === '没排上' && r.dishes === '没排上'),
      JSON.stringify(hrs[2]?.rows.map((r) => `${r.name}:${r.tag}`)),
    )
    const y1bNames = history.y1b.meals.flatMap((m) => m.dishes.map((d) => d.name))
    check(
      'S-11 每餐菜名可读且来自真实计划（昨天最新）',
      y1bNames.every((n) => day1.rows.some((r) => r.dishes.includes(n))),
      `y1b=${y1bNames.join('/')}`,
    )
    check(
      'S-11 早/中/晚三行齐全',
      day1.rows.map((r) => r.name).join(',') === '早,中,晚',
      day1.rows.map((r) => r.name).join(','),
    )
    const dayTitles = hrs.map((h) => h.title)
    check(
      'S-11 今天/明天不出现',
      !dayTitles.includes(formatDateCN(today)) && !dayTitles.includes(formatDateCN(tomorrow)),
      dayTitles.join(','),
    )
    check(
      'S-11 近 14 天窗口外（15 天前）不出现',
      !dayTitles.includes(formatDateCN(fifteenDaysAgo)),
      dayTitles.join(','),
    )
    const histDishes = [history.y1b, history.d2, history.d3].flatMap((p) =>
      p.meals.flatMap((m) => m.dishes.map((d) => d.name)),
    )
    const oldUnique = history.oldPlan.meals
      .flatMap((m) => m.dishes.map((d) => d.name))
      .find((n) => !histDishes.some((h) => h.includes(n) || n.includes(h)))
    const histBody = await bodyText()
    check(
      'S-11 15 天前计划的菜名不出现',
      !oldUnique || !histBody.includes(oldUnique),
      `oldUnique=${oldUnique ?? 'none'}`,
    )
    await shot('S-11-normal-top.png')
    // Taro H5 的滚动容器是 .taro_page（不是 window）；滚到底补大前天「没排上」证据
    await page.evaluate(() => {
      const el = document.querySelector('.taro_page')
      if (el instanceof HTMLElement) el.scrollTop = el.scrollHeight
    })
    await sleep(700)
    await shot('S-11-normal-bottom.png')
    await assertVisibleBox('S-11 Tabbar 三入口完全可见', page.locator('.nut-tabbar').first())
    await page.evaluate(() => {
      const el = document.querySelector('.taro_page')
      if (el instanceof HTMLElement) el.scrollTop = 0
    })
    await sleep(400)

    // 点菜名进 S-09（过去日期：底部应为「返回历史」）
    currentStep = 'S-09-from-history'
    const firstDishName = day1.rows[0].dishes.split(' · ')[0].trim()
    await page.locator('.history-day').first().locator('.meal-dish').first().scrollIntoViewIfNeeded()
    await page.locator('.history-day').first().locator('.meal-dish').first().click()
    await waitBody('分步做法', 25000)
    await waitDishName(firstDishName)
    await sleep(500)
    const pastSub = await page.locator('.dhero-sub').innerText()
    check(
      'S-09 从历史进入过去日期：显示日期/餐次/人数',
      pastSub.includes(formatDateCN(yesterday)) &&
        pastSub.includes('早餐') &&
        pastSub.includes('2 大 1 小') &&
        !pastSub.includes('今天'),
      pastSub,
    )
    const pastSticky = await page.locator('.stickybar .btn-main').innerText()
    check(
      'S-09 过去日期底部为「返回历史」而非「做完记一笔」',
      pastSticky.includes('返回历史') && !pastSticky.includes('做完记一笔'),
      pastSticky,
    )
    await assertVisibleBox(
      'S-09 过去日期最后操作按钮「返回历史」完全可见',
      page.locator('.stickybar .btn-main').filter({ hasText: '返回历史' }).first(),
    )
    await shot('S-09-from-history.png')
    await page.locator('.stickybar .btn-main').filter({ hasText: '返回历史' }).first().click()
    await waitBody('按日分组', 20000)
    await page.waitForFunction(() => document.querySelectorAll('.history-day').length === 3, null, { timeout: 20000 })
    check('S-09 返回历史正常（历史页仍在）', page.url().includes('/pages/history/index'))

    // ═════════ S-11 历史：错误态 + 重试 ═════════
    currentStep = 'S-11-error'
    await page.locator('.nut-tabbar').getByText('首页', { exact: true }).click()
    await waitBody('今天三餐', 20000)
    expectFailure = true
    const listPlansRe = /\/api\/plans$/
    await page.route(listPlansRe, (route) => route.abort())
    await page.locator('.nut-tabbar').getByText('历史', { exact: true }).click()
    await waitBody('暂时拿不到过去的三餐', 20000)
    const errHist = await bodyText()
    check(
      'S-11 错误态：明说拿不到 + 重试 + 不假数据',
      errHist.includes('重试') && errHist.includes('服务恢复后就显示') && errHist.includes('已经记过的评价不会丢'),
    )
    await shot('S-11-error.png')
    await page.unroute(listPlansRe)
    expectFailure = false
    await page.locator('.banner-warn .act').filter({ hasText: '重试' }).first().click()
    await waitBody('按日分组', 25000)
    await page.waitForFunction(() => document.querySelectorAll('.history-day').length === 3, null, { timeout: 25000 })
    check('S-11 点重试恢复真实历史', (await page.locator('.history-day').count()) === 3)
    await shot('S-11-recovered.png')

    // ═════════ 通用：Tabbar / 无假数据 / 非模拟失败步骤的日志 ═════════
    currentStep = 'general'
    check('通用 Tabbar 三入口可切换（首页/历史/设置）', (await page.locator('.nut-tabbar').getByText('设置').count()) === 1)
    await page.locator('.nut-tabbar').getByText('首页', { exact: true }).click()
    await waitBody('今天三餐', 20000)
    await page.waitForFunction(() => !!document.querySelector('.meal-block'), null, { timeout: 20000 })
    const finalHome = await bodyText()
    check(
      '通用 首页不出现假数据/假成功文案',
      !/示例菜|假数据|lorem ipsum/i.test(finalHome) && finalHome.includes('今天三餐'),
    )
    check(
      '通用 非模拟失败步骤 console error=0',
      unexpectedConsoleErrors.length === 0,
      unexpectedConsoleErrors.slice(0, 3).map((e) => `${e.step}:${e.text.slice(0, 80)}`).join(' | '),
    )
    check(
      '通用 非模拟失败步骤失败请求/5xx=0',
      unexpectedFailedRequests.length === 0 && unexpectedBadResponses.length === 0,
      `${unexpectedFailedRequests.length} failed / ${unexpectedBadResponses.length} bad`,
    )
  }
} catch (e) {
  console.error('FATAL', e)
  process.exitCode = 1
} finally {
  console.log(`SUMMARY checks=${checks.length} failed=${checks.filter((c) => !c.ok).length}`)
  console.log(`SUMMARY unexpectedConsoleErrors=${unexpectedConsoleErrors.length}`)
  console.log(`SUMMARY unexpectedFailedRequests=${unexpectedFailedRequests.length}`)
  console.log(`SUMMARY unexpectedBadResponses=${unexpectedBadResponses.length}`)
  if (unexpectedConsoleErrors.length) console.log(JSON.stringify(unexpectedConsoleErrors.slice(0, 20), null, 1))
  if (unexpectedFailedRequests.length) console.log(JSON.stringify(unexpectedFailedRequests.slice(0, 20), null, 1))
  if (unexpectedBadResponses.length) console.log(JSON.stringify(unexpectedBadResponses.slice(0, 20), null, 1))
  await browser.close()
}
