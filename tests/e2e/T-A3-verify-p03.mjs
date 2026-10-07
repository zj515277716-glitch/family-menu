// tests/e2e/T-A3-verify-p03.mjs
// T-A3 页面验收主脚本（P0-3 修复实证，Playwright 390x844 移动端视口，真实 dev 环境）：
//   数据前提：先跑 T-A3-verify-data.ts setup（a3v- 前缀 2 食材 + 9 菜已入库）
//   轮1（推荐基线）：2人/60分钟/必消A3验收白菜 -> 3 候选（全部口碑中性 0.7/0.8）
//     -> 锁定含「A3验收主菜二」的组合 -> 清单页 -> 反馈三问「做了/好吃/还做」-> 历史页
//   轮2（P0-3 路径A 菜级口碑生效）：3人/必消A3验收萝卜 -> 只出 1 套「主菜一+主菜二+配菜一+汤一」
//     ——与锁定组合不同的另一套，仅共享同一道菜「主菜二」，其历史接受度应为 1.0（好吃+还做），
//     页面理由应出现「历史接受度高」「曾标记愿意再做」
//   轮3（对比 + 路径B 不污染）：回到 2人/白菜 -> 锁定组合以相同 virt- 内容哈希 id 回归且升至第 1；
//     其余两套不含反馈菜的组合保持 0.7/0.8 不受污染；旧 virt-001 顺序编号不再出现
// 运行：node tests/e2e/T-A3-verify-p03.mjs
// 截图与断言明细落 evidence/T-A3/。口令仅进内存（lib/env-token.mjs）。
import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { requireLocalToken } from './lib/env-token.mjs'

const BASE = 'http://127.0.0.1:10086'
const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, '..', '..', 'evidence', 'T-A3')
mkdirSync(outDir, { recursive: true })
const TOKEN = requireLocalToken()

const checks = []
function check(name, ok, detail = '') {
  checks.push(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` | ${detail}` : ''}`)
  if (!ok) process.exitCode = 1
  return ok
}
const shot = (page, name, opts = {}) => page.screenshot({ path: join(outDir, name), ...opts })

// ── API 轨迹捕获：/api/recommend 请求体 + 响应（与页面渲染同源同数据）──
const apiTrace = []
function armApiTrace(page) {
  page.on('request', (req) => {
    if (req.method() === 'POST' && req.url().includes('/api/')) {
      let body = null
      try { body = req.postData() ? JSON.parse(req.postData()) : null } catch { /* 非 JSON 忽略 */ }
      apiTrace.push({ url: req.url().replace('http://127.0.0.1:3000', ''), method: 'POST', reqBody: body })
    }
  })
  page.on('response', async (res) => {
    if (res.request().method() === 'POST' && res.url().includes('/api/')) {
      const entry = [...apiTrace].reverse().find((e) => e.url === res.url().replace('http://127.0.0.1:3000', '') && e.status === undefined)
      if (entry) {
        entry.status = res.status()
        try { entry.resBody = await res.json() } catch { entry.resBody = null }
      }
    }
  })
}
async function waitForApi(urlPart, count, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const hits = apiTrace.filter((e) => e.url.includes(urlPart) && e.status !== undefined)
    if (hits.length >= count) return hits
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error(`等待 ${urlPart} x${count} 超时`)
}

/** 规则 §7：页面最后一个操作按钮完全可见（不被 TabBar 遮挡、不出视口；只取可见元素，Taro 页面栈旧页隐藏在 DOM）。
 *  scrollIntoViewIfNeeded 只保证进视口——先滚到页面底部（页面留白应足以避开固定 TabBar），再量边界。 */
async function lastButtonVisible(page, name, sel) {
  const el = page.locator(sel).filter({ visible: true }).last()
  await el.scrollIntoViewIfNeeded()
  // Taro H5 滚动容器不一定是 window：把所有可滚容器（.taro_page/.taro_router/文档）都滚到底再量
  await page.evaluate(() => {
    const tryScroll = (node) => {
      if (node && node.scrollHeight > node.clientHeight + 4) node.scrollTop = node.scrollHeight
    }
    for (const sel of ['.taro_page', '.taro_router', '.taro_router_core', '.taro-tabbar-page']) {
      document.querySelectorAll(sel).forEach(tryScroll)
    }
    tryScroll(document.scrollingElement)
    window.scrollTo(0, document.documentElement.scrollHeight)
  })
  await page.waitForTimeout(300)
  const box = await el.boundingBox()
  if (!box) return check(`§7 末按钮可见 ${name}`, false, '元素不存在')
  const tabTop = await page.evaluate(() => {
    const els = [...document.querySelectorAll('.nut-tabbar-fixed'), ...document.querySelectorAll('.nut-tabbar')]
    for (const t of els) {
      const r = t.getBoundingClientRect()
      if (r.height > 0) return r.top
    }
    return null
  })
  const inViewport = box.y >= 0 && box.y + box.height <= 844
  const notCovered = tabTop === null || box.y + box.height <= tabTop + 1
  check(`§7 末按钮可见 ${name}`, inViewport && notCovered, `box.y=${Math.round(box.y)} h=${Math.round(box.height)} tabTop=${tabTop === null ? '无tabbar' : Math.round(tabTop)}`)
}

const dishNamesOf = (c) => (c.menu?.dishes ?? []).map((d) => d.name)
const hasDish = (c, name) => dishNamesOf(c).includes(name)

// ══════════════ 开跑 ══════════════
const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: 'zh-CN',
})
const page = await context.newPage()
armApiTrace(page)

try {
  // ── 登录门 ──
  await page.goto(BASE, { waitUntil: 'load', timeout: 20000 })
  const loginInput = page.locator('input[placeholder="输入家庭口令"]')
  await loginInput.waitFor({ state: 'visible', timeout: 15000 })
  await loginInput.fill(TOKEN)
  await page.locator('text=进入').first().click()
  await page.waitForSelector('text=今晚吃什么', { timeout: 15000 })
  check('0 登录门 -> 首页', true, page.url())

  /** 今晚页设情境：人数、60 分钟档、必消 chip（输入+Enter） */
  async function setupTonight({ people, mustUse }) {
    const stepNum = page.locator('.fm-step-num').first()
    const minus = page.locator('.fm-step-btn').first()
    const plus = page.locator('.fm-step-btn').nth(1)
    let cur = Number(await stepNum.innerText())
    while (cur > people) { await minus.click(); cur--; }
    while (cur < people) { await plus.click(); cur++; }
    check(`  人数调到 ${people}`, Number(await stepNum.innerText()) === people)
    const chip60 = page.locator('.fm-radio-chip', { hasText: '60 分钟' })
    if (!(await chip60.getAttribute('class')).includes('on')) await chip60.click()
    check('  时长 60 分钟档选中', (await chip60.getAttribute('class')).includes('on'))
    // 清掉既有必消 chip（点击即移除）
    for (const chip of await page.locator('.fm-chip-must').all()) {
      await chip.click()
      await page.waitForTimeout(150)
    }
    check('  必消清空', (await page.locator('.fm-chip-must').count()) === 0)
    const input = page.locator('input[placeholder^="搜索食材"]')
    await input.fill(mustUse)
    await input.press('Enter')
    await page.locator('.fm-chip-must', { hasText: mustUse }).waitFor({ timeout: 5000 })
    check(`  必消 chip「${mustUse}」已加`, true)
  }

  async function runRecommend() {
    await page.locator('.fm-bottom-bar .fm-btn-primary', { hasText: '推荐今晚吃什么' }).click()
    await page.waitForSelector('text=选出今晚的一套', { timeout: 20000 })
    await page.locator('.candidate-card').first().waitFor({ timeout: 10000 })
    await page.waitForTimeout(600) // 等卡片渲染稳定
    const recs = apiTrace.filter((e) => e.url.includes('/api/recommend') && e.status !== undefined)
    return recs[recs.length - 1]
  }

  // ══ 轮 1：推荐基线（2 人 / 60 分 / A3验收白菜）══
  await setupTonight({ people: 2, mustUse: 'A3验收白菜' })
  await shot(page, '01-tonight-round1.png')
  const r1 = await runRecommend()
  const r1c = r1.resBody.candidates
  check('轮1 返回 3 套候选', r1c.length === 3, `实际 ${r1c.length} 套`)
  check('轮1 请求情境 2人/60分/白菜', r1.reqBody.people === 2 && r1.reqBody.timeBudgetMin === 60 && r1.reqBody.mustUse.join() === 'A3验收白菜', JSON.stringify(r1.reqBody))
  check('轮1 虚拟菜单 id 为内容哈希形态 virt-[0-9a-f]{8}', r1c.every((c) => /^virt-[0-9a-f]{8}$/.test(c.menuId)), r1c.map((c) => c.menuId).join(','))
  check('轮1 无旧顺序编号 virt-\\d+', !r1c.some((c) => /^virt-\d+$/.test(c.menuId)))
  check('轮1 全部候选口碑中性 0.7', r1c.every((c) => c.breakdown.historyAcceptance === 0.7), r1c.map((c) => c.breakdown.historyAcceptance).join(','))
  check('轮1 全部候选近期多样性 0.8', r1c.every((c) => c.breakdown.recentDiversity === 0.8))
  await shot(page, '02-candidates-round1.png')
  await shot(page, '02-candidates-round1-full.png', { fullPage: true })
  const locked1 = r1c.find((c) => hasDish(c, 'A3验收主菜二'))
  check('轮1 候选含「A3验收主菜二」的目标组合', !!locked1, locked1 ? `${locked1.menuId} [${dishNamesOf(locked1).join('、')}] score=${locked1.score}` : '')

  // ── 锁定目标组合（按菜名定位卡片，不依赖排序）──
  const targetCard = page.locator('.candidate-card', { hasText: 'A3验收主菜二' })
  await targetCard.locator('.fm-cand-lock').click()
  await page.locator('.fm-lock-success-mask').waitFor({ timeout: 10000 })
  await page.waitForSelector('text=今晚的菜单', { timeout: 15000 })
  await page.locator('text=备菜顺序').waitFor({ timeout: 15000 })
  await page.locator('text=购物清单').waitFor({ timeout: 15000 })
  const planText = await page.evaluate(() => document.body.innerText)
  check('锁定后清单页显示锁定菜', ['A3验收主菜二', 'A3验收配菜二', 'A3验收汤二'].every((t) => planText.includes(t)))
  check('锁定后必消标记「已有 · 必消」', planText.includes('已有 · 必消'))
  check('锁定后必消横幅', planText.includes('必消食材已用上：A3验收白菜'))
  await shot(page, '03-plan-locked.png')
  await lastButtonVisible(page, '清单页主按钮', '.fm-bottom-bar .fm-btn-primary')
  await shot(page, '03-plan-locked-full.png', { fullPage: true })

  // ── 反馈三问：做了 / 好吃 / 还做 ──
  await page.locator('text=做完饭回来记录一下').first().click()
  await page.waitForSelector('text=今晚吃得怎么样？', { timeout: 15000 })
  await page.locator('.fm-opt').filter({ hasText: /^做了$/ }).click()
  await page.locator('.fm-opt').filter({ hasText: /^好吃$/ }).click()
  await page.locator('.fm-opt').filter({ hasText: /^还做$/ }).click()
  await page.waitForTimeout(300)
  await shot(page, '04-feedback-questions.png')
  await lastButtonVisible(page, '反馈页提交按钮', '.fm-btn-primary:has-text("提交反馈")')
  await page.locator('text=提交反馈').first().click()
  await page.waitForSelector('text=记好了', { timeout: 15000 })
  check('反馈提交成功（记好了）', true)
  await shot(page, '05-feedback-done.png')
  const fbTrace = apiTrace.find((e) => e.url.includes('/feedback') && e.status === 200)
  check('反馈 API 200 且三问齐', fbTrace?.reqBody?.didCook === true && fbTrace?.reqBody?.taste === 'good' && fbTrace?.reqBody?.willRepeat === true, JSON.stringify(fbTrace?.reqBody))

  // ── 历史页 ──
  await page.locator('.fm-btn-ghost').filter({ hasText: /^看看历史$/ }).first().click()
  await page.waitForSelector('text=吃过的饭', { timeout: 15000 })
  await page.waitForTimeout(800)
  const firstRec = page.locator('.fm-rec').first()
  const firstRecText = await firstRec.innerText()
  check('历史页最新记录=今天这顿（菜名+三问标签）',
    firstRecText.includes('A3验收主菜二') && firstRecText.includes('做了') && firstRecText.includes('好吃') && firstRecText.includes('下次还做'),
    firstRecText.replace(/\n+/g, ' | '))
  await shot(page, '06-history.png')
  await lastButtonVisible(page, '历史页底部按钮', '.fm-bottom-bar .fm-btn-primary')

  // ══ 轮 2：P0-3 路径 A —— 换一个组合，同一道菜口碑生效（3 人 / A3验收萝卜）══
  await page.getByText('今晚', { exact: true }).filter({ visible: true }).first().click()
  await page.waitForSelector('text=今晚吃什么', { timeout: 15000 })
  await setupTonight({ people: 3, mustUse: 'A3验收萝卜' })
  await shot(page, '07-tonight-round2.png')
  const r2 = await runRecommend()
  const r2c = r2.resBody.candidates
  check('轮2 请求情境 3人/60分/萝卜', r2.reqBody.people === 3 && r2.reqBody.timeBudgetMin === 60 && r2.reqBody.mustUse.join() === 'A3验收萝卜', JSON.stringify(r2.reqBody))
  check('轮2 只出 1 套（必消萝卜唯一持有者=主菜二）', r2c.length === 1, `实际 ${r2c.length} 套`)
  const w0 = r2c[0]
  const w0Names = dishNamesOf(w0).sort().join('、')
  check('轮2 组合=主菜一+主菜二+配菜一+汤一（与轮1锁定组合不同套、仅共享主菜二）',
    w0Names === 'A3验收主菜一、A3验收主菜二、A3验收汤一、A3验收配菜一', w0Names)
  check('轮2 组合 id ≠ 轮1 锁定组合 id', w0.menuId !== locked1.menuId, `${w0.menuId} vs ${locked1.menuId}`)
  check('轮2 含同一道菜的另一组合 历史接受度=1.0（好吃0.9+还做0.1）', w0.breakdown.historyAcceptance === 1.0, `实际 ${w0.breakdown.historyAcceptance}`)
  check('轮2 该组合 7 天内降权 0.2', w0.breakdown.recentDiversity === 0.2, `实际 ${w0.breakdown.recentDiversity}`)
  const cardText = await page.locator('.candidate-card').first().innerText()
  check('轮2 页面理由出现「历史接受度高」', cardText.includes('历史接受度高'))
  check('轮2 页面理由出现「曾标记愿意再做」', cardText.includes('曾标记愿意再做'))
  check('轮2 页面如实提示只找到 1 套', (await page.evaluate(() => document.body.innerText)).includes('只找到 1 套'))
  await shot(page, '08-candidates-round2-dish-level.png')
  await lastButtonVisible(page, '轮2 候选卡锁定按钮', '.candidate-card .fm-cand-lock')
  await shot(page, '08b-candidates-round2-button-clear.png')

  // ══ 轮 3：同情境再推荐对比 + 路径 B 不污染（2 人 / A3验收白菜）══
  // 候选页 TabBar 的「今晚」是激活态（candidates 属今晚流程，handleSwitch 早退不跳转）——
  // 用户真实路径是滑返回/浏览器返回，这里 goBack 等价复现
  await page.goBack()
  await page.waitForSelector('text=今晚吃什么', { timeout: 15000 })
  await setupTonight({ people: 2, mustUse: 'A3验收白菜' })
  const r3 = await runRecommend()
  const r3c = r3.resBody.candidates
  check('轮3 请求情境 2人/60分/白菜', r3.reqBody.people === 2 && r3.reqBody.timeBudgetMin === 60 && r3.reqBody.mustUse.join() === 'A3验收白菜', JSON.stringify(r3.reqBody))
  check('轮3 返回 3 套候选', r3c.length === 3, `实际 ${r3c.length} 套`)
  const locked3 = r3c.find((c) => hasDish(c, 'A3验收主菜二'))
  check('轮3 锁定组合同 id 回归（内容哈希稳定）', locked3?.menuId === locked1.menuId, `${locked3?.menuId} vs ${locked1.menuId}`)
  check('轮3 锁定组合历史接受度升至 1.0', locked3?.breakdown.historyAcceptance === 1.0, `实际 ${locked3?.breakdown.historyAcceptance}（轮1 ${locked1.breakdown.historyAcceptance}）`)
  check('轮3 锁定组合 7 天降权 0.2', locked3?.breakdown.recentDiversity === 0.2)
  check('轮3 锁定组合升到第 1（推荐位）', r3c[0].menuId === locked1.menuId, `第1=${r3c[0].menuId} score=${r3c[0].score}`)
  check('轮3 锁定组合总分上升', locked3.score > locked1.score, `${locked1.score} -> ${locked3.score}`)
  // 路径 B：不含任何反馈菜的组合不受污染
  const feedbackDishes = ['A3验收主菜二', 'A3验收配菜二', 'A3验收汤二']
  const untouched = r3c.filter((c) => !dishNamesOf(c).some((n) => feedbackDishes.includes(n)))
  check('轮3 存在不含反馈菜的对照组合', untouched.length === 2, `实际 ${untouched.length} 套`)
  check('路径B 对照组合历史接受度保持 0.7（不受反馈污染）', untouched.every((c) => c.breakdown.historyAcceptance === 0.7), untouched.map((c) => c.breakdown.historyAcceptance).join(','))
  check('路径B 对照组合近期多样性保持 0.8', untouched.every((c) => c.breakdown.recentDiversity === 0.8))
  check('轮3 无旧顺序编号 virt-\\d+', !r3c.some((c) => /^virt-\d+$/.test(c.menuId)))
  const firstCardText = await page.locator('.candidate-card').first().innerText()
  check('轮3 第 1 卡带「推荐」标记且含主菜二', firstCardText.includes('推荐') && firstCardText.includes('A3验收主菜二'))
  check('轮3 第 1 卡理由含「历史接受度高」', firstCardText.includes('历史接受度高'))
  await shot(page, '09-candidates-round3-compare.png')
  await shot(page, '09-candidates-round3-compare-full.png', { fullPage: true })

  // ── 汇总输出 + 机器可读轨迹（无口令，仅业务数据）──
  console.log(checks.join('\n'))
  const summary = {
    rounds: [r1, r2, r3].map((r, i) => ({
      round: i + 1,
      request: r.reqBody,
      planId: r.resBody.planId,
      candidates: r.resBody.candidates.map((c) => ({
        menuId: c.menuId,
        score: c.score,
        dishes: dishNamesOf(c),
        historyAcceptance: c.breakdown.historyAcceptance,
        recentDiversity: c.breakdown.recentDiversity,
        reasons: c.reasons,
      })),
    })),
    lockedMenuIdRound1: locked1.menuId,
    feedbackTrace: apiTrace.filter((e) => e.url.includes('/feedback') || e.url.includes('/lock')).map((e) => ({ url: e.url, status: e.status, reqBody: e.reqBody })),
  }
  writeFileSync(join(outDir, 'verify-run.json'), JSON.stringify(summary, null, 2))
  console.log(`截图目录: ${outDir}`)
  console.log(`轮1锁定: ${locked1.menuId} score=${locked1.score} -> 轮3: ${locked3.menuId} score=${locked3.score}`)
  console.log(`轮2跨组合: ${w0.menuId} [${dishNamesOf(w0).join('、')}] acceptance=${w0.breakdown.historyAcceptance}`)
} catch (e) {
  console.error('FAIL 中断:', e instanceof Error ? e.message : String(e))
  console.error(checks.join('\n'))
  try {
    await shot(page, '99-fail.png')
    console.error('页面文本片段:', (await page.evaluate(() => document.body.innerText)).slice(0, 400).replace(/\n+/g, ' | '))
  } catch { /* 截图失败不掩盖原错误 */ }
  await browser.close()
  process.exit(1)
}
await browser.close()
process.exit(process.exitCode ?? 0)
