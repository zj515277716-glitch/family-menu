// tests/e2e/T-Q12-verify.mjs
// T-Q12 页面验收（Playwright，H5 移动端 375×812 / dpr2）：
//   真实打开 http://127.0.0.1:10086，真实点击/输入/断言/截图；
//   覆盖 S-03 首页（空/正常/加载/服务未连接）、S-04 定餐（填写/会话不丢/三态）、
//   S-05 骨架（route 延迟 /api/recommend 约 2s，弱网模拟）、S-06 三餐菜单（换一道/换一餐/换全部/重进）、
//   S-07 空手（真实必消「鸵鸟肉」）、S-08 采购清单（分组/已有/勾选保存/刷新/备菜建议）。
// 本地夹具（仅本机 PG，绝不碰生产，详见 T-Q12-fixtures.ts）：
//   1) 跑前清理今天/明天由验收创建的 Plan；
//   2) 为 S-03 真实生成一份明天计划，把 planDate 改为今天本地零点；
//   3) 为该计划插入三餐真实 Event 反馈（早=好吃 / 中=翻车 / 晚=没做）。
// 运行：node tests/e2e/T-Q12-verify.mjs
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
const outDir = join(root, 'evidence', 'T-Q12')
const fixtureScript = join(here, 'T-Q12-fixtures.ts')
mkdirSync(outDir, { recursive: true })

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
let inOfflineStep = false
const consoleErrors = []
const failedRequests = []
const recommendPlanIds = []
const swapSuccessToasts = []
let lastRecommendHttp = null

page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push({ step: currentStep, text: m.text() })
})
page.on('requestfailed', (r) => {
  failedRequests.push({
    step: currentStep,
    text: `${r.method()} ${r.url()} :: ${r.failure()?.errorText ?? 'unknown'}`,
  })
})
page.on('response', async (r) => {
  if (r.request().method() === 'POST' && r.url().includes('/api/recommend')) {
    try {
      const raw = await r.text()
      lastRecommendHttp = { status: r.status(), body: raw }
      const j = JSON.parse(raw)
      if (j?.id) recommendPlanIds.push(j.id)
    } catch {
      /* 响应体读取失败不代表页面失败，断言在页面 */
    }
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
  const ok = !!box && box.y >= -1 && box.y + box.height <= 813 && box.x >= -1 && box.x + box.width <= 376
  check(name, ok, box ? `box=${JSON.stringify(box)}` : 'no boundingBox')
}
async function fillPopup(placeholder, value, addText = '添加') {
  const input = page.locator(`input[placeholder="${placeholder}"]`)
  await input.waitFor({ state: 'visible', timeout: 10000 })
  const sheet = page.locator('.sheet-body').filter({
    has: page.locator(`input[placeholder="${placeholder}"]`),
  })
  await input.fill(value)
  await sheet.locator('.btn-main').filter({ hasText: addText }).first().click()
  await page.waitForFunction(
    (v) => Array.from(document.querySelectorAll('.chip')).some((el) => el.textContent?.includes(v)),
    value,
    { timeout: 8000 },
  )
  await sleep(350)
}
async function mealBlockNames(index) {
  const block = page.locator('.meal-block').nth(index)
  return block.locator('.fcard-name').allTextContents()
}
function homeNextMealExpected() {
  const h = new Date().getHours()
  if (h < 10) return '早餐'
  if (h < 15) return '中餐'
  return '晚餐'
}

let step = 'start'
try {
  // ═════════ 0. 复位本地验收夹具 + 登录 ═════════
  currentStep = '00-setup'
  const resetOut = fixture('reset-verify-days')
  console.log('FIXTURE reset:', resetOut)
  check('0.1 验收前清理本机今天/明天的计划（仅本机 PG）', true, resetOut)

  await page.goto(BASE, { waitUntil: 'load', timeout: 25000 })
  const loginInput = page.locator('input[placeholder="请输入口令"]')
  // 登录页先探测既有登录态（「正在检查登录状态…」），输入框稍后才出现；等二者之一。
  await page.waitForFunction(
    () =>
      !!document.querySelector('input[placeholder="请输入口令"]') ||
      document.body.innerText.includes('今天三餐'),
    null,
    { timeout: 25000 },
  )
  if (await loginInput.count()) {
    let loggedIn = false
    for (let attempt = 1; attempt <= 3 && !loggedIn; attempt++) {
      await loginInput.waitFor({ state: 'visible', timeout: 15000 })
      await loginInput.fill(requireLocalToken())
      const typed = await loginInput.inputValue()
      console.log(`LOGIN attempt=${attempt} typed=${typed.length > 0}`)
      await tap('.btn-main', '进入')
      try {
        await waitBody('今天三餐', 15000)
        loggedIn = true
      } catch {
        const txt = await bodyText()
        console.log(`LOGIN retry body: ${txt.slice(0, 200)}`)
        await shot(`login-retry-${attempt}.png`)
        await sleep(1500)
      }
    }
    check('0.2 登录页口令输入并进入', loggedIn)
  }
  await waitBody('今天三餐', 25000)
  check('0.2 真实登录并进入首页', (await bodyText()).includes('今天三餐'))

  // ═════════ 1. S-03 首页：无计划空态 ═════════
  currentStep = 'S-03-empty'
  const emptyHome = await bodyText()
  check('S-03 空态：今天还没定菜单（真实无计划）', emptyHome.includes('今天还没定菜单'))
  check('S-03 空态：明天还没定餐入口', emptyHome.includes('还没定明天的餐') && emptyHome.includes('定明天的餐'))
  check('S-03 空态：Tabbar 三入口', ['首页', '历史', '设置'].every((t) => emptyHome.includes(t)))
  await shot('S-03-home-empty.png', true)

  // ═════════ 1b. S-13 服务未连接叠加态 + 重试恢复（首页真实断网） ═════════
  currentStep = 'S-13'
  inOfflineStep = true
  await page.route('**/api/**', (route) => route.abort())
  await page.locator('.nut-tabbar').getByText('历史', { exact: true }).click()
  await waitBody('历史', 10000)
  await page.locator('.nut-tabbar').getByText('首页', { exact: true }).click()
  await page.waitForFunction(
    () => /服务未连接|连不上服务|网络不稳定/.test(document.body.innerText),
    null,
    { timeout: 25000 },
  )
  const offlineHome = await bodyText()
  check('S-13 断网：明说连不上服务 + 重试（实际文案见 detail）',
    /服务未连接|连不上服务|网络不稳定/.test(offlineHome) && offlineHome.includes('重试'),
    offlineHome.slice(0, 120))
  check('S-13 断网：绝不显示假菜单',
    (await page.locator('.fcard').count()) === 0 && offlineHome.includes('暂时拿不到今天的三餐'))
  await shot('S-13-offline.png', true)
  await page.unroute('**/api/**')
  inOfflineStep = false
  await tap('.banner .act', '重试')
  await waitBody('今天三餐', 25000)
  await page.waitForFunction(
    () => document.body.innerText.includes('今天还没定菜单'),
    null,
    { timeout: 20000 },
  )
  check('S-13 点重试恢复：首页重新拿到真实状态', (await page.locator('.fcard').count()) === 0)
  await shot('S-13-recovered.png', true)

  // ═════════ 2. S-04 定明天的餐：填写 + 离开重进不丢 ═════════
  currentStep = 'S-04-loading'
  // 加载态：延迟 family/rules，确认骨架后自动进入表单
  await page.route('**/api/family/rules', async (route) => {
    await sleep(1200)
    await route.continue()
  })
  await tap('.btn-main', '定明天的餐')
  await page.waitForFunction(() => !!document.querySelector('.sk'), null, { timeout: 8000 })
  await sleep(850)
  await shot('S-04-loading.png')
  await waitBody('明天几个人吃', 20000)
  await page.unroute('**/api/family/rules')

  currentStep = 'S-04'
  const adultRow = page.locator('.frow').filter({ hasText: '成人' }).first()
  const childRow = page.locator('.frow').filter({ hasText: '儿童' }).first()
  await adultRow.locator('.step-btn').nth(1).click()
  await childRow.locator('.step-btn').nth(1).click()
  check('S-04 人数步进：成人 4→5、儿童 0→1',
    (await adultRow.locator('.step-val').innerText()) === '5' &&
      (await childRow.locator('.step-val').innerText()) === '1')

  // 必消「番茄」、临时忌口「牛肉」
  await page.locator('.chip-add').filter({ hasText: '加食材' }).click()
  await fillPopup('例：番茄', '番茄')
  await page.locator('.chip-add').filter({ hasText: '加忌口' }).click()
  await fillPopup('例：牛肉', '牛肉')
  check('S-04 必消/临时忌口标签已添加',
    (await page.locator('.chip').allTextContents()).join('|').includes('番茄') &&
      (await page.locator('.chip').allTextContents()).join('|').includes('牛肉'))

  // 想吃的菜：输入菜名 → 点选菜谱池（不输入系统编号）
  const desiredInput = page.locator('input[placeholder="例：番茄炒蛋"]')
  await desiredInput.fill('番茄')
  const desiredItem = page.locator('.cand-item').filter({ hasText: '番茄炒蛋' }).first()
  await desiredItem.waitFor({ state: 'visible', timeout: 10000 })
  await desiredItem.click()
  await waitBody('已加入：番茄炒蛋')
  check('S-04 想吃的菜点选加入（用户只输入菜名，id 由列表带入）',
    (await page.locator('.chip').allTextContents()).join('|').includes('番茄炒蛋'))

  // 再点选清蒸鲈鱼、紫菜蛋花汤（后者含「紫菜泡发」，用于 S-08 今晚预处理数据）
  for (const dishName of ['清蒸鲈鱼', '紫菜蛋花汤']) {
    await desiredInput.fill(dishName)
    const item = page.locator('.cand-item').filter({ hasText: dishName }).first()
    await item.waitFor({ state: 'visible', timeout: 10000 })
    await item.click()
    await waitBody(`已加入：${dishName}`)
  }
  const desiredChips = (await page.locator('.chip').allTextContents()).join('|')
  check('S-04 想吃的菜可连续点选（清蒸鲈鱼/紫菜蛋花汤）',
    desiredChips.includes('清蒸鲈鱼') && desiredChips.includes('紫菜蛋花汤'))

  // 餐次：全选默认；关闭两餐后尝试关闭最后一餐 → 必须「至少保留一餐」反馈
  const mealOpts = page.locator('.opt')
  await mealOpts.filter({ hasText: '早餐' }).first().click()
  await mealOpts.filter({ hasText: '中餐' }).first().click()
  check('S-04 餐次可取消（默认全选 → 只剩晚餐）',
    (await page.locator('.opt.on').count()) === 1)
  await mealOpts.filter({ hasText: '晚餐' }).first().click()
  await waitBody('至少保留一餐')
  check('S-04 最后一餐不可清空且有 toast 反馈（至少保留一餐）',
    (await page.locator('.opt.on').count()) === 1)
  await mealOpts.filter({ hasText: '早餐' }).first().click()
  await mealOpts.filter({ hasText: '中餐' }).first().click()
  check('S-04 三餐恢复全选', (await page.locator('.opt.on').count()) === 3)
  await page.getByText('明天几个人吃', { exact: true }).first().scrollIntoViewIfNeeded()
  await sleep(300)
  await shot('S-04-filled-top.png')
  await shot('S-04-filled.png', true)
  await page.locator('.stickybar').scrollIntoViewIfNeeded().catch(() => {})
  await shot('S-04-sticky.png')
  await assertVisibleBox('S-04 最后操作按钮「推荐菜谱」完全可见', page.locator('.stickybar .btn-main').filter({ hasText: '推荐菜谱' }).first())

  // 离开再进：同一编辑会话草稿不丢
  await tapText('‹ 返回首页')
  await waitBody('今天三餐')
  await tap('.btn-main', '定明天的餐')
  await waitBody('明天几个人吃')
  const reAdult = await page.locator('.frow').filter({ hasText: '成人' }).first().locator('.step-val').innerText()
  const reChild = await page.locator('.frow').filter({ hasText: '儿童' }).first().locator('.step-val').innerText()
  const reChips = (await page.locator('.chip').allTextContents()).join('|')
  const reMeals = await page.locator('.opt.on').count()
  check('S-04 离开再进：人数/必消/忌口/想吃的菜/餐次均未丢',
    reAdult === '5' && reChild === '1' && reChips.includes('番茄') && reChips.includes('牛肉') &&
      reChips.includes('番茄炒蛋') && reChips.includes('清蒸鲈鱼') && reChips.includes('紫菜蛋花汤') &&
      reMeals === 3,
    `adults=${reAdult} children=${reChild} chips=${reChips} mealsOn=${reMeals}`)
  await page.getByText('明天几个人吃', { exact: true }).first().scrollIntoViewIfNeeded()
  await sleep(300)
  await shot('S-04-reenter-top.png')
  await shot('S-04-reenter-persist.png', true)

  // ═════════ 3. S-07 空手：真实必消「鸵鸟肉」 ═════════
  currentStep = 'S-07'
  await page.locator('.chip-add').filter({ hasText: '加食材' }).click()
  await fillPopup('例：番茄', '鸵鸟肉')
  // 同一次真实 recommend 调用：先截 S-05 骨架（弱网模拟 2.2s），再看是否能进入空手/菜单
  currentStep = 'S-05'
  await page.route('**/api/recommend', async (route) => {
    await sleep(2200)
    await route.continue().catch(() => {})
  })
  await tap('.stickybar .btn-main', '推荐菜谱')
  await waitBody('正在为明天搭配三餐…', 15000)
  await sleep(850)
  await shot('S-05-skeleton.png')
  await shot('S-05-skeleton-full.png', true)
  currentStep = 'S-07'
  await page.waitForFunction(
    () =>
      document.body.innerText.includes('明天三餐出不来？') ||
      document.body.innerText.includes('没生成出来'),
    null,
    { timeout: 45000 },
  )
  await page.unroute('**/api/recommend')
  const afterRecommend = await bodyText()
  if (afterRecommend.includes('没生成出来')) {
    const detail = lastRecommendHttp
      ? `POST /api/recommend HTTP ${lastRecommendHttp.status}: ${lastRecommendHttp.body.slice(0, 260)}`
      : 'POST /api/recommend 失败，未捕获响应'
    check('S-05 骨架后生成完成并进入三餐菜单', false, `被响应校验阻断；${detail}`)
    check('S-07 全天空手页（哪一餐+原因+建议）', false, `同一阻断；${detail}`)
    await sleep(850)
    await shot('S-07-gen-error.png', true)
    // 已落库的计划同样读不出来：直接进该日菜单页，验证读取也被同一响应校验阻断
    const d = new Date()
    d.setDate(d.getDate() + 1)
    const tomorrow = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    currentStep = 'S-06-read-blocked'
    await page.goto(`${BASE}/#/pages/day-menu/index?date=${tomorrow}`, { waitUntil: 'load', timeout: 25000 })
    await sleep(2500)
    const readText = await bodyText()
    check(
      'S-06 同一天重进读取三餐（GET /api/plans）',
      readText.includes('必消') || readText.includes('换一道'),
      `页面=${readText.slice(0, 220)}`,
    )
    await shot('S-06-read-blocked.png', true)
    throw new Error('BLOCKER: Plan 响应校验失败，S-05→S-06→S-08 与 S-03 正常态无法继续')
  }
  const emptyText = await bodyText()
  check('S-07 全天空手页：明说哪一餐+原因',
    /早餐|中餐|晚餐/.test(emptyText) && /组合冲突|没有符合条件的菜|来不及做/.test(emptyText),
    emptyText.slice(0, 220))
  check('S-07 给出调整建议（删减必消/调整想吃的菜/放宽临时忌口）',
    /删减必消|调整想吃的菜|放宽临时忌口/.test(emptyText))
  check('S-07 底部「调好重新生成」按钮存在', emptyText.includes('调好重新生成'))
  await shot('S-07-empty-hand.png', true)
  await assertVisibleBox('S-07 最后操作按钮「调好重新生成」完全可见',
    page.locator('.stickybar .btn-main').filter({ hasText: '调好重新生成' }).first())

  // 点建议 → 回 S-04；草稿仍在（不丢已填）
  const suggestion = page.locator('.card .opt').filter({ hasText: '删减必消食材' }).first()
  await suggestion.waitFor({ state: 'visible', timeout: 8000 })
  await suggestion.click()
  await waitBody('明天几个人吃', 15000)
  check('S-07 点调整建议回到 S-04 且已填内容仍在',
    (await page.locator('.chip').allTextContents()).join('|').includes('鸵鸟肉'))
  await shot('S-07-back-to-setup.png', true)
  // 删掉鸵鸟肉，恢复正常必消
  await page.locator('.chip').filter({ hasText: '鸵鸟肉' }).first().locator('.x').click()
  check('S-07 删除异常必消后标签消失',
    !(await page.locator('.chip').allTextContents()).join('|').includes('鸵鸟肉'))

  // ═════════ 4. S-05 生成中骨架：延迟 /api/recommend ~2s（弱网模拟） ═════════
  currentStep = 'S-05'
  await page.route('**/api/recommend', async (route) => {
    await sleep(2200)
    await route.continue()
  })
  await tap('.stickybar .btn-main', '推荐菜谱')
  await waitBody('正在为明天搭配三餐…', 15000)
  check('S-05 骨架屏文案「正在为明天搭配三餐…」', true)
  const skMealTitles = await page.locator('.section-head .section-title').allTextContents()
  check('S-05 骨架块与餐次标题同时出现',
    (await page.locator('.sk').count()) > 0 &&
      ['早餐', '中餐', '晚餐'].every((s) => skMealTitles.includes(s)),
    `titles=${skMealTitles.join('、')}`)
  await shot('S-05-skeleton.png', true)
  await page.waitForFunction(
    () =>
      !location.hash.includes('generate=1') &&
      !document.body.innerText.includes('正在为明天搭配三餐') &&
      document.querySelectorAll('.meal-block').length > 0,
    null,
    { timeout: 45000 },
  )
  await page.unroute('**/api/recommend')
  await sleep(800)
  check('S-05 → S-06 生成完成（generate 参数已清除）', (await page.locator('.meal-block').count()) >= 1,
    `url=${page.url()}`)
  check('S-05 真实 POST /api/recommend 已落库（捕获计划 id）', recommendPlanIds.length >= 1,
    `ids=${recommendPlanIds.length}`)
  const firstPlanId = recommendPlanIds[recommendPlanIds.length - 1]
  await shot('S-06-menu.png', true)
  await shot('S-06-menu-top.png')
  await page.locator('.meal-block').nth(1).scrollIntoViewIfNeeded()
  await sleep(300)
  await shot('S-06-menu-mid.png')
  await page.locator('.meal-block').nth(2).scrollIntoViewIfNeeded()
  await sleep(300)
  await shot('S-06-menu-bottom.png')

  // ═════════ 5. S-06 三餐菜单：分区/必消/总时长 + 三操作 ═════════
  currentStep = 'S-06'
  const menuText = await bodyText()
  check('S-06 三餐分区齐全（早/中/晚）',
    (await page.locator('.meal-block').count()) === 3 &&
      ['早餐', '中餐', '晚餐'].every((s) => menuText.includes(s)))
  check('S-06 必消横幅如实展示（含「番茄」）', /必消/.test(menuText) && menuText.includes('番茄'))
  check('S-06 合计动火时长可见', /合计动火约\s*\d+\s*分钟/.test(menuText))
  await assertVisibleBox('S-06 最后操作按钮「确认三餐，查看采购清单」完全可见',
    page.locator('.stickybar .btn-main').filter({ hasText: '确认三餐' }).first())

  // 换一道：打开候选弹层（有候选/0 候选都如实展示）
  let dishSwap = null
  let sawZeroCandidate = false
  const totalCards = await page.locator('.fcard').count()
  for (let i = 0; i < Math.min(totalCards, 8); i++) {
    const card = page.locator('.fcard').nth(i)
    await card.scrollIntoViewIfNeeded()
    const blockIndex = await card.evaluate(
      (el) => Array.from(document.querySelectorAll('.meal-block')).indexOf(el.closest('.meal-block')),
    )
    const outgoing = await card.locator('.fcard-name').innerText()
    if (outgoing === '紫菜蛋花汤') {
      // 保留汤用于 S-08 今晚预处理（紫菜泡发），换其他菜验证换一道
      continue
    }
    await card.locator('.mini').click()
    const swapSheet = page.locator('.sheet-body:visible')
    await swapSheet.waitFor({ state: 'visible', timeout: 10000 })
    await sleep(650)
    await page.waitForFunction(
      () => document.body.innerText.includes('暂时没有可换的候选') ||
        document.querySelectorAll('.sheet-body .cand-item').length > 0,
      null,
      { timeout: 15000 },
    )
    const candCount = await swapSheet.locator('.cand-item').count()
    if (candCount === 0) {
      sawZeroCandidate = true
      await shot('S-06-swap-zero.png')
      await swapSheet.locator('.btn-plain').filter({ hasText: '取消' }).first().click()
      await sleep(500)
      continue
    }
    await shot('S-06-swap-candidates.png')
    const incoming = await swapSheet.locator('.cand-item .cand-name').first().innerText()
    await swapSheet.locator('.cand-item').first().click()
    const reason = swapSheet.locator('input[placeholder="选填，如：太麻烦"]')
    if (await reason.count()) await reason.fill('验收：想换个口味')
    await sleep(300)
    await shot('S-06-swap-selected.png')
    await swapSheet.locator('.btn-main').filter({ hasText: '换成这道' }).first().click()
    await waitBody('换好了', 20000)
    swapSuccessToasts.push('换一道')
    await sleep(900)
    const after = await mealBlockNames(blockIndex)
    check('S-06 换一道：真替换且同餐分区同步',
      after.includes(incoming) && !after.includes(outgoing),
      `before=${outgoing} incoming=${incoming} after=${after.join('、')}`)
    dishSwap = { blockIndex, outgoing, incoming, after }
    await shot('S-06-swap-result.png', true)
    break
  }
  if (!dishSwap) {
    check('S-06 换一道：真替换且同餐分区同步', false,
      `未找到有候选的菜（0 候选态=${sawZeroCandidate}）`)
  }

  // 同一天重进看到同一份（刷新不重新生成）
  currentStep = 'S-06-reload'
  const namesBeforeReload = await page.locator('.fcard-name').allTextContents()
  const urlBeforeReload = page.url()
  const recommendCountBeforeReload = recommendPlanIds.length
  await page.reload({ waitUntil: 'load', timeout: 25000 })
  await waitBody('明天三餐', 25000)
  await sleep(1200)
  const namesAfterReload = await page.locator('.fcard-name').allTextContents()
  check('S-06 刷新重进：同一份三餐不重新生成',
    namesAfterReload.join('|') === namesBeforeReload.join('|') &&
      !urlBeforeReload.includes('generate=1') &&
      recommendPlanIds.length === recommendCountBeforeReload,
    `url=${page.url()} cards=${namesAfterReload.join('、')}`)
  await shot('S-06-reload-same.png', true)

  // ═════════ 6. S-08 采购清单 + 备菜建议 ═════════
  currentStep = 'S-08-loading'
  // 加载态：延迟 GET 清单，截骨架后进入
  await page.route('**/api/plans/*/shopping-list', async (route) => {
    if (route.request().method() === 'GET') await sleep(1200)
    await route.continue()
  })
  await tap('.stickybar .btn-main', '确认三餐，查看采购清单')
  await waitBody('明日采购清单', 15000)
  await page.waitForFunction(() => !!document.querySelector('.sgroup-block'), null, { timeout: 8000 })
  await shot('S-08-loading.png')
  await page.waitForFunction(
    () => document.querySelectorAll('.item').length > 0 || document.body.innerText.includes('这张清单是空的'),
    null,
    { timeout: 20000 },
  )
  await page.unroute('**/api/plans/*/shopping-list')

  currentStep = 'S-08'
  await sleep(600)
  const listText = await bodyText()
  check('S-08 分组清单与合并去重说明存在',
    (await page.locator('.group-title').count()) >= 1 && listText.includes('三餐食材已合并去重'))
  check('S-08 清单条目非空', (await page.locator('.item').count()) > 0,
    `items=${await page.locator('.item').count()}`)
  const ownedCount = await page.locator('.item.owned').count()
  check('S-08 必消「已有」条目划线并标「必消已有」（若有）',
    ownedCount === 0 || /必消已有/.test(listText), `owned=${ownedCount}`)
  const prepTitles = await page.locator('.prep-card .prep-title').allTextContents()
  check('S-08 备菜建议分段展示（今晚预处理/明早先做）',
    prepTitles.length > 0,
    `prepTitles=${prepTitles.join('、')}`)
  check('S-08 备菜建议两段齐全', prepTitles.includes('今晚预处理') && prepTitles.includes('明早先做'),
    `prepTitles=${prepTitles.join('、')}`)
  await shot('S-08-list.png', true)
  await page.locator('.prep-card').first().scrollIntoViewIfNeeded()
  await sleep(300)
  await shot('S-08-prep-tonight.png')
  await page.locator('.prep-card').last().scrollIntoViewIfNeeded()
  await sleep(300)
  await shot('S-08-prep-morning.png')
  await assertVisibleBox('S-08 最后操作按钮「就按这个买」完全可见',
    page.locator('.stickybar .btn-main').filter({ hasText: '就按这个买' }).first())

  // 必消已有：点它必须给反馈、状态不变（不删除）
  if (ownedCount > 0) {
    const owned = page.locator('.item.owned').first()
    const ownedName = await owned.locator('.name').innerText()
    await owned.click()
    await waitBody('必消已有，不用再买', 8000)
    check('S-08 必消已有不可勾选但有 toast 反馈', (await owned.getAttribute('class')).includes('owned'),
      ownedName.replace(/\n/g, ' '))
    await shot('S-08-owned-toast.png')
    await sleep(2200) // 等 toast 消失，避免遮挡后续点击
  }

  // 勾选一项 → 刷新重进仍保存
  let checkedName = null
  const candidateItem = page.locator('.item:not(.owned)').first()
  if (await candidateItem.count()) {
    checkedName = (await candidateItem.locator('.name').innerText()).replace(/\n/g, ' ').trim()
    await candidateItem.click()
    await sleep(1200)
    check('S-08 勾选后本页立即显示已完成',
      (await candidateItem.getAttribute('class')).includes('done'))
    await shot('S-08-checked.png')
    await page.reload({ waitUntil: 'load', timeout: 25000 })
    await waitBody('明日采购清单', 25000)
    await page.waitForFunction(() => document.querySelectorAll('.item').length > 0, null, { timeout: 20000 })
    await sleep(600)
    const reloaded = page.locator('.item').filter({ hasText: checkedName }).first()
    check('S-08 刷新重进：勾选状态仍在（服务端真实保存）',
      (await reloaded.getAttribute('class')).includes('done'),
      `item=${checkedName}`)
    await shot('S-08-reload-checked.png', true)
  } else {
    check('S-08 勾选后刷新仍在', false, '清单里没有可勾选的非「已有」条目')
  }

  // 错误态：断掉清单接口 → 警示横幅 + 重试；恢复后重试成功
  currentStep = 'S-08-error'
  await page.route('**/api/plans/*/shopping-list', (route) => route.abort())
  inOfflineStep = true
  await page.reload({ waitUntil: 'load', timeout: 25000 })
  await page.waitForFunction(
    () => /服务未连接|连不上服务|网络不稳定/.test(document.body.innerText),
    null,
    { timeout: 20000 },
  )
  check('S-08 错误态：明说连不上服务且给重试', (await bodyText()).includes('重试'))
  await shot('S-08-error.png')
  await page.unroute('**/api/plans/*/shopping-list')
  inOfflineStep = false
  await tap('.banner .act', '重试')
  await waitBody('明日采购清单', 15000)
  await page.waitForFunction(() => document.querySelectorAll('.item').length > 0, null, { timeout: 20000 })
  check('S-08 点重试恢复清单', (await page.locator('.item').count()) > 0)
  await shot('S-08-recovered.png')

  // ═════════ 6b. S-06 换一餐（放在 S-08 后执行，避免先换掉含汤早餐） ═════════
  currentStep = 'S-06-meal-swap'
  const md = new Date()
  md.setDate(md.getDate() + 1)
  const mealSwapDate = `${md.getFullYear()}-${String(md.getMonth() + 1).padStart(2, '0')}-${String(md.getDate()).padStart(2, '0')}`
  await page.goto(`${BASE}/#/pages/day-menu/index?date=${mealSwapDate}`, { waitUntil: 'load', timeout: 25000 })
  await waitBody('明天三餐', 25000)
  await sleep(1500)
  await page.locator('.meal-block').nth(0).scrollIntoViewIfNeeded()
  await sleep(300)
  await waitGone('换好了', 10000).catch(() => {})
  const targetBlockIndex = dishSwap ? dishSwap.blockIndex : 0
  const targetMealName = await page.locator('.meal-block').nth(targetBlockIndex).locator('.meal-name').innerText()
  const otherIndex = [0, 1, 2].find((i) => i !== targetBlockIndex)
  const otherBefore = await mealBlockNames(otherIndex)
  const mealBefore = await mealBlockNames(targetBlockIndex)
  const delayedSwapHandler = async (route) => {
    await sleep(900)
    await route.continue()
  }
  await page.route('**/api/plans/*/swap', delayedSwapHandler)
  await tap('.btn-plain', `${targetMealName}换一餐`)
  await sleep(350)
  await shot('S-06-meal-swap-loading.png')
  await page.waitForFunction(
    () => document.body.innerText.includes('换好了') ||
      document.body.innerText.includes('没换成') ||
      document.body.innerText.includes('⚠ 没换成'),
    null,
    { timeout: 30000 },
  )
  const mealSwapText = await bodyText()
  if (mealSwapText.includes('没换成')) {
    check('S-06 换一餐：失败有明确反馈且原菜单保持', mealSwapText.includes('没换成'))
  } else {
    swapSuccessToasts.push('换一餐')
    await sleep(900)
    const mealAfter = await mealBlockNames(targetBlockIndex)
    const otherAfter = await mealBlockNames(otherIndex)
    check('S-06 换一餐：该餐真替换、其他餐不动',
      mealAfter.join('|') !== mealBefore.join('|') && otherAfter.join('|') === otherBefore.join('|'),
      `meal=${targetMealName} before=${mealBefore.join('、')} after=${mealAfter.join('、')}`)
  }
  await page.unroute('**/api/plans/*/swap')
  await shot('S-06-meal-swap-result.png', true)

  // ═════════ 7. S-03 正常态：真实生成今天计划 + 真实 Event 评价 ═════════
  currentStep = 'S-03-fixture'
  // 通过真实页面（S-04）再生成一份明天计划，随后仅把 planDate 改到今天；推荐本身真实落库。
  await page.goto(`${BASE}/#/pages/meal-setup/index`, { waitUntil: 'load', timeout: 25000 })
  await waitBody('明天几个人吃', 20000)
  await page.locator('.chip-add').filter({ hasText: '加食材' }).click()
  await fillPopup('例：番茄', '番茄')
  const desired2 = page.locator('input[placeholder="例：番茄炒蛋"]')
  await desired2.fill('番茄')
  const cand2 = page.locator('.cand-item').filter({ hasText: '番茄炒蛋' }).first()
  await cand2.waitFor({ state: 'visible', timeout: 10000 })
  await cand2.click()
  await waitBody('已加入：番茄炒蛋')
  const recommendBefore = recommendPlanIds.length
  await tap('.stickybar .btn-main', '推荐菜谱')
  await page.waitForFunction(
    () =>
      !location.hash.includes('generate=1') &&
      !document.body.innerText.includes('正在为明天搭配三餐') &&
      document.querySelectorAll('.meal-block').length > 0,
    null,
    { timeout: 45000 },
  )
  await sleep(1000)
  check('S-03 夹具：UI 真实生成第二份明天计划', recommendPlanIds.length === recommendBefore + 1,
    `ids=${recommendPlanIds.length}`)
  const todayFixturePlanId = recommendPlanIds[recommendPlanIds.length - 1]
  const moved = fixture('move-to-today', [todayFixturePlanId])
  console.log('FIXTURE move-to-today:', moved)
  const seeded = fixture('seed-feedback', [todayFixturePlanId])
  console.log('FIXTURE seed-feedback:', seeded)
  check('S-03 夹具：计划日改为今天本地零点', moved.includes(todayFixturePlanId))
  check('S-03 夹具：三餐评价 Event 已写入（好吃/翻车/没做）', seeded.includes('breakfast'))

  currentStep = 'S-03-normal'
  await page.goto(`${BASE}/#/pages/home/index`, { waitUntil: 'load', timeout: 25000 })
  await waitBody('今天三餐', 25000)
  await page.waitForFunction(() => !!document.querySelector('.meal-block'), null, { timeout: 20000 })
  await sleep(800)
  const homeNormal = await bodyText()
  const mealNames = await page.locator('.meal-block .meal-name').allTextContents()
  const expectedNext = homeNextMealExpected()
  check('S-03 正常态：今天三餐显示', (await page.locator('.meal-block').count()) === 3,
    `meals=${mealNames.join('、')}`)
  check(`S-03 下一餐置顶（当前时间应 ${expectedNext} 在前）`,
    mealNames[0] === expectedNext, `order=${mealNames.join('、')}`)
  check('S-03 「下一餐」标签存在', homeNormal.includes('下一餐'))
  const feedbackLabels = ['好吃', '一般', '翻车', '没做'].filter((t) => homeNormal.includes(t))
  check('S-03 评价标签至少两种文案/颜色（读真实 Event）', feedbackLabels.length >= 2,
    `labels=${feedbackLabels.join('、')}`)
  check('S-03 明天摘要大卡存在（三餐 + 查看菜单/看采购清单）',
    (await page.locator('.hscroll-wide .fcard').count()) === 3 &&
      homeNormal.includes('查看菜单') && homeNormal.includes('看采购清单'),
    `wideCards=${await page.locator('.hscroll-wide .fcard').count()}`)
  check('S-03 Tabbar 存在', (await page.locator('.nut-tabbar').count()) > 0)
  await shot('S-03-home-normal.png', true)
  await page.locator('.meal-block').last().scrollIntoViewIfNeeded()
  await sleep(300)
  await shot('S-03-home-normal-mid.png')
  await page.getByText('看采购清单', { exact: true }).first().scrollIntoViewIfNeeded()
  await sleep(300)
  await shot('S-03-home-normal-bottom.png')

  // 占位按钮反馈：记一笔 → 明说下一版上线（不静默）
  const noteBtn = page.locator('.btn-plain').filter({ hasText: '记一笔' }).first()
  if (await noteBtn.count()) {
    await noteBtn.click()
    await waitBody('在下一版上线', 8000)
    check('通用：占位按钮「记一笔」点击有反馈', true)
    await shot('S-03-placeholder-toast.png')
    await sleep(2200)
  }

  // 首页加载态：延迟 family/rules，切历史再回首页
  currentStep = 'S-03-loading'
  await page.locator('.nut-tabbar').getByText('历史', { exact: true }).click()
  await waitBody('历史', 10000)
  await page.route('**/api/family/rules', async (route) => {
    await sleep(1200)
    await route.continue().catch(() => {})
  })
  await page.locator('.nut-tabbar').getByText('首页', { exact: true }).click()
  await page.waitForFunction(() => document.body.innerText.includes('正在读取今天的菜单'), null, { timeout: 10000 })
  check('S-03 加载态可达（骨架+正在读取今天的菜单）', true)
  await shot('S-03-loading.png')
  await waitBody('今天三餐', 20000)
  await page.unroute('**/api/family/rules')

  // ═════════ 8. S-13 服务未连接叠加态 + 重试恢复 ═════════
  currentStep = 'S-13'
  inOfflineStep = true
  await page.route('**/api/**', (route) => route.abort())
  await page.locator('.nut-tabbar').getByText('历史', { exact: true }).click()
  await waitBody('历史', 10000)
  await page.locator('.nut-tabbar').getByText('首页', { exact: true }).click()
  await page.waitForFunction(
    () => /服务未连接|连不上服务|网络不稳定/.test(document.body.innerText),
    null,
    { timeout: 25000 },
  )
  const offlineText = await bodyText()
  check('S-13 断网：明说连不上服务 + 重试（实际文案见 detail）',
    /服务未连接|连不上服务|网络不稳定/.test(offlineText) && offlineText.includes('重试'),
    offlineText.slice(0, 120))
  check('S-13 断网：绝不显示假菜单',
    (await page.locator('.fcard').count()) === 0 && offlineText.includes('暂时拿不到今天的三餐'))
  await shot('S-13-offline.png', true)
  await page.unroute('**/api/**')
  inOfflineStep = false
  await tap('.banner .act', '重试')
  await waitBody('今天三餐', 25000)
  await page.waitForFunction(() => !!document.querySelector('.meal-block'), null, { timeout: 20000 })
  check('S-13 点重试恢复：今天三餐重新出现',
    (await page.locator('.meal-block').count()) === 3)
  await shot('S-13-recovered.png', true)

  // ═════════ 8b. S-06 全部换一批（放在最后，避免失败清空影响后续屏） ═════════
  currentStep = 'S-06-all-swap'
  const td = new Date()
  td.setDate(td.getDate() + 1)
  const tomorrowDate = `${td.getFullYear()}-${String(td.getMonth() + 1).padStart(2, '0')}-${String(td.getDate()).padStart(2, '0')}`
  await page.goto(`${BASE}/#/pages/day-menu/index?date=${tomorrowDate}`, { waitUntil: 'load', timeout: 25000 })
  await waitBody('明天三餐', 25000)
  await sleep(1500)
  const allBefore = (await page.locator('.fcard-name').allTextContents()).join('|')
  const beforeCount = await page.locator('.fcard').count()
  check('S-06 全部换一批前菜单可用', beforeCount > 0, `cards=${beforeCount}`)
  if (beforeCount > 0) {
    let currentNames = allBefore
    let failureSeen = false
    for (let i = 1; i <= 10; i++) {
      await waitGone('换好了', 6000).catch(() => {})
      await tap('.stickybar .btn-ghost', '全部换一批')
      await page.waitForFunction(
        () => /换好了|没换成|已保持原餐|明天三餐出不来/.test(document.body.innerText),
        null,
        { timeout: 30000 },
      )
      await sleep(900)
      const text = await bodyText()
      if (text.includes('明天三餐出不来？')) {
        check('S-06 全部换一批池耗尽：失败需提示并保持原菜单', false,
          '页面被清空为空手页，且无失败提示')
        await shot('S-06-all-swap-empty.png', true)
        break
      }
      if (text.includes('没换成') || text.includes('已保持原餐')) {
        const after = (await page.locator('.fcard-name').allTextContents()).join('|')
        const kept = after === currentNames && (await page.locator('.fcard').count()) > 0
        check('S-06 全部换一批池耗尽：提示「没换成…已保持原餐」且原菜单菜名不变',
          text.includes('没换成') && text.includes('已保持原餐') && kept,
          `attempt=${i} msg=${text.match(/没换成[^|]*/)?.[0] ?? ''} kept=${kept}`)
        await shot('S-06-all-swap-failure.png', true)
        await page.reload({ waitUntil: 'load', timeout: 25000 })
        await waitBody('明天三餐', 25000)
        await sleep(1200)
        const reloadNames = (await page.locator('.fcard-name').allTextContents()).join('|')
        check('S-06 全部换一批失败后刷新重进仍是原菜单',
          reloadNames === currentNames,
          `before=${currentNames} reload=${reloadNames}`)
        await shot('S-06-all-swap-reload.png', true)
        failureSeen = true
        break
      }
      const after = (await page.locator('.fcard-name').allTextContents()).join('|')
      if (after.length === 0) {
        check(`S-06 全部换一批第 ${i} 次：成功但菜单为空`, false, '应保持原菜单并提示失败')
        await shot('S-06-all-swap-empty.png', true)
        break
      }
      check(`S-06 全部换一批第 ${i} 次：真替换且非空`, after !== currentNames,
        `before=${currentNames} after=${after}`)
      swapSuccessToasts.push('全部换一批')
      currentNames = after
    }
    if (!failureSeen) {
      check('S-06 全部换一批：持续换到池耗尽触发 400', false, '10 次内未触发失败')
    }
  }

  // ═════════ 9. 汇总通用检查 ═════════
  currentStep = 'final'
  const expectedFailureSteps = ['S-13', 'S-08-error', 'S-06-all-swap']
  const realConsoleErrors = consoleErrors.filter((e) => !expectedFailureSteps.includes(e.step) && !inOfflineStep)
  const realFailedRequests = failedRequests.filter(
    (e) => !expectedFailureSteps.includes(e.step),
  )
  check('通用：控制台 0 error（断网/换批失败模拟除外）', realConsoleErrors.length === 0,
    realConsoleErrors.slice(0, 3).map((e) => `${e.step}:${e.text}`).join(' || '))
  check('通用：0 失败请求（模拟断网两步除外）', realFailedRequests.length === 0,
    realFailedRequests.slice(0, 3).map((e) => `${e.step}:${e.text}`).join(' || '))
  check('通用：按钮反馈可观察到（toast/状态变化）', swapSuccessToasts.length >= 1,
    swapSuccessToasts.join('、'))
  console.log('CONSOLE_ERRORS', JSON.stringify(consoleErrors.slice(0, 10)))
  console.log('FAILED_REQUESTS', JSON.stringify(failedRequests.slice(0, 10)))
} catch (e) {
  check(`执行中断 @ ${currentStep}`, false, e.message.split('\n')[0])
  try {
    await shot(`FAIL-${currentStep}.png`, true)
  } catch {
    /* 页面可能已崩 */
  }
  console.error(e)
} finally {
  await browser.close()
  const pass = checks.filter((c) => c.ok).length
  console.log(`\n=== 汇总：${pass}/${checks.length} 通过 ===`)
  for (const c of checks.filter((x) => !x.ok)) console.log(`FAILED: ${c.name} | ${c.detail}`)
  console.log('截图目录:', outDir)
}
