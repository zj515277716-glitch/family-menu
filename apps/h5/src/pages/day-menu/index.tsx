// apps/h5/src/pages/day-menu/index.tsx
// S-05 生成中骨架 / S-06 三餐菜单（换一道/换一餐/换一批）/ S-07 空手 / S-13 错误态。
// 路由参数：date（计划日）、generate=1（首次生成，成功后 redirectTo 去掉参数，刷新不重生成）、
// tb（时长档）、avoid（已吃菜避开天数）。所有请求走 client.ts 统一封装。
// 原型：docs/design/v2/prototypes/style-1/v3/generating.html、b.html、empty-hand.html。
import { useCallback, useEffect, useRef, useState } from 'react'
import Taro from '@tarojs/taro'
import { View, Text, Input } from '@tarojs/components'
import { Button, Popup } from '@nutui/nutui-react-taro'
import type { DayPlan, DayPlanDish, MealFailure, MealSlot, Plan } from '@family-menu/shared'
import { MEAL_SLOTS, MEAL_SLOT_LABELS } from '@family-menu/shared'
import { planApi, UnauthorizedError } from '../../api/client'
import DishImage from '../../components/DishImage'
import { useMealSetupStore } from '../../store/meal-setup'
import { formatDateCN, mealKindHint, mealTimeHint, tomorrowDateStr } from '../../lib/day-plan'
import {
  buildMustUseBanner,
  dayTotalActiveMinutes,
  displayMealSlots,
  failureKindLabel,
  humanizeFailureDetail,
  isEmptyHand,
  mealRoleLabel,
  mustUseBannerText,
  swapReducer,
  swapTargetToRequest,
  type SwapState,
  type SwapTarget,
} from '../../lib/day-menu'
import { buildRecommendPayload } from '../../lib/meal-setup-draft'
import { formatTimeHM } from '../../lib/format'
import { pageUrl } from '../../lib/entry'

type Phase = 'loading' | 'ready' | 'empty' | 'error' | 'expired' | 'gen-error' | 'legacy'

function parseTimeBudget(v?: string): 15 | 30 | 60 {
  return v === '15' ? 15 : v === '60' ? 60 : 30
}

function parseAvoidDays(v?: string): number | undefined {
  const n = Number(v)
  return Number.isInteger(n) && n > 0 ? n : undefined
}

function errorText(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback
}

/** 空手/失败卡（S-07）：哪一餐 + 原因类型 + 脱敏 detail + suggestions（点任一建议回 S-04 调整） */
function FailureCard({
  failure,
  dayPlan,
  onAdjust,
}: {
  failure: MealFailure
  dayPlan: DayPlan
  onAdjust: () => void
}) {
  return (
    <View className="card mt-3">
      <View className="form-title">
        {MEAL_SLOT_LABELS[failure.slot]} · {failureKindLabel(failure.kind)}
      </View>
      <View className="form-note">{humanizeFailureDetail(failure.detail, dayPlan)}</View>
      {failure.suggestions.length > 0 && (
        <View className="opts">
          {failure.suggestions.map((s) => (
            <View className="opt" key={s} onClick={onAdjust}>
              {s}
            </View>
          ))}
        </View>
      )}
      <View className="btn-row">
        <Button className="btn-ghost" onClick={onAdjust}>
          去调整
        </Button>
      </View>
    </View>
  )
}

function MealSkeleton({ slot }: { slot: MealSlot }) {
  return (
    <View className="section">
      <View className="section-head">
        <Text className="section-title">{MEAL_SLOT_LABELS[slot]}</Text>
        <Text className="section-note">{mealTimeHint(slot)}</Text>
      </View>
      <View className="grid2">
        {[0, 1].map((i) => (
          <View className="sk-card" key={i}>
            <View className="sk sk-img" />
            <View className="sk-body">
              <View className="sk sk-line w70" />
              <View className="sk sk-line w45" />
            </View>
          </View>
        ))}
      </View>
    </View>
  )
}

export default function DayMenuPage() {
  const router = Taro.useRouter()
  const rawDate = router.params.date
  const date = rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : tomorrowDateStr()
  const generate = router.params.generate === '1'
  const timeBudgetMin = parseTimeBudget(router.params.tb)
  const avoidRecentDays = parseAvoidDays(router.params.avoid)

  const [phase, setPhase] = useState<Phase>('loading')
  const [plan, setPlan] = useState<Plan | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [swapState, setSwapState] = useState<SwapState>({ phase: 'idle' })
  const [skeletonMeals, setSkeletonMeals] = useState<MealSlot[]>([...MEAL_SLOTS])
  const startedRef = useRef(false)

  const dateText = formatDateCN(new Date(`${date}T00:00:00`))
  const isTomorrow = date === tomorrowDateStr()
  const pageTitle = isTomorrow ? '明天三餐' : '这天的三餐'

  const goHome = useCallback(() => {
    Taro.reLaunch({ url: pageUrl('home') })
  }, [])

  async function backPrev() {
    if (Taro.getCurrentPages().length <= 1) {
      goHome()
      return
    }
    try {
      await Taro.navigateBack({ delta: 1 })
    } catch {
      goHome()
    }
  }

  function goSetup() {
    Taro.redirectTo({ url: '/pages/meal-setup/index' }).catch(() => {
      Taro.showToast({ title: '跳转失败，请重试', icon: 'none' })
    })
  }

  /**
   * 回 S-04 调整：只有上一页确实是 S-04 才 navigateBack（保留草稿与原栈）；
   * 从首页「查看菜单」等直接进来时上一页不是 S-04，必须 redirectTo 进设置，
   * 不能 navigateBack 回首页（首页有计划时没有 S-04 入口，调整会断链）。
   */
  function backToSetup() {
    const pages = Taro.getCurrentPages()
    const prev = pages[pages.length - 2] as { route?: string } | undefined
    if (prev?.route?.includes('pages/meal-setup')) {
      Taro.navigateBack({ delta: 1 }).catch(() => {
        Taro.showToast({ title: '跳转失败，请重试', icon: 'none' })
      })
      return
    }
    goSetup()
  }

  // ───── 生成（S-05）：从同日草稿发 POST /api/recommend，成功后去掉 generate 参数 ─────
  const startGenerate = useCallback(async () => {
    const draft = useMealSetupStore.getState().draft
    if (!draft || draft.date !== date) {
      // 刷新/跨日导致内存草稿丢失：如实说内容过期，请重新填
      setPhase('expired')
      return
    }
    setSkeletonMeals(draft.meals.length > 0 ? [...draft.meals] : [...MEAL_SLOTS])
    setPhase('loading')
    setError(null)
    try {
      const payload = buildRecommendPayload(draft, { timeBudgetMin, avoidRecentDays })
      const created = await planApi.recommend(payload)
      try {
        // 清掉 generate 参数：刷新/重进只读最新计划，不重新生成（C-3）
        await Taro.redirectTo({ url: `/pages/day-menu/index?date=${date}` })
      } catch {
        setPlan(created)
        setPhase(created.dayPlan ? 'ready' : 'legacy')
      }
    } catch (e) {
      if (e instanceof UnauthorizedError) return // 401 已由封装导回登录页
      console.error('[DayMenu] 推荐失败', e)
      setError(errorText(e, '没生成出来，请重试'))
      setPhase('gen-error')
    }
  }, [avoidRecentDays, date, timeBudgetMin])

  // ───── 读取（非 generate）：该日最新一份计划；无计划=空态，旧版计划=如实说明 ─────
  const loadPlan = useCallback(async () => {
    setPhase('loading')
    setError(null)
    try {
      const plans = await planApi.listPlansByDate(date)
      if (plans.length === 0) {
        setPlan(null)
        setPhase('empty')
        return
      }
      const first = plans[0]
      setPlan(first)
      setPhase(first.dayPlan ? 'ready' : 'legacy')
    } catch (e) {
      if (e instanceof UnauthorizedError) return
      console.error('[DayMenu] 读取计划失败', e)
      setError(errorText(e, '服务未连接'))
      setPhase('error')
    }
  }, [date])

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    if (generate) startGenerate()
    else loadPlan()
  }, [generate, loadPlan, startGenerate])

  // ───── 换菜三操作（C-3a） ─────
  const submitting = swapState.phase === 'submitting'

  async function openDishSwap(dishId: string) {
    if (!plan) return
    if (submitting) {
      Taro.showToast({ title: '正在换，稍等', icon: 'none' })
      return
    }
    setSwapState((s) => swapReducer(s, { type: 'open-dish', dishId }))
    try {
      const res = await planApi.getSwapOptions(plan.id, dishId)
      setSwapState((s) =>
        s.phase === 'loading' && s.dishId === dishId
          ? swapReducer(s, { type: 'options-loaded', dishId, candidates: res.candidates })
          : s,
      )
    } catch (e) {
      if (e instanceof UnauthorizedError) return
      setSwapState((s) =>
        s.phase === 'loading' && s.dishId === dishId
          ? swapReducer(s, { type: 'options-failed', dishId, message: errorText(e, '候选没读出来') })
          : s,
      )
    }
  }

  async function submitSwap(target: SwapTarget) {
    if (!plan) return
    try {
      const next = await planApi.swapPlan(plan.id, swapTargetToRequest(target))
      // 用响应 Plan 替换整页数据：横幅/总时长/三餐随之同步
      setPlan(next)
      setSwapState({ phase: 'idle' })
      Taro.showToast({ title: '换好了', icon: 'success' })
    } catch (e) {
      if (e instanceof UnauthorizedError) return
      console.error('[DayMenu] 换菜失败', e)
      setSwapState((s) => swapReducer(s, { type: 'failed', message: errorText(e, '没换成，请重试') }))
      Taro.showToast({ title: '没换成，请重试', icon: 'none' })
    }
  }

  function confirmDishSwap() {
    if (swapState.phase !== 'picking') return
    if (!swapState.selectedId) {
      Taro.showToast({ title: '先选一道想换的菜', icon: 'none' })
      return
    }
    const target: SwapTarget = {
      kind: 'dish',
      dishId: swapState.dishId,
      newDishId: swapState.selectedId,
      reason: swapState.reason.trim() || undefined,
    }
    setSwapState((s) => swapReducer(s, { type: 'confirm-dish' }))
    submitSwap(target)
  }

  function startMealSwap(slot: MealSlot) {
    if (submitting) {
      Taro.showToast({ title: '正在换，稍等', icon: 'none' })
      return
    }
    setSwapState((s) => swapReducer(s, { type: 'start-meal', slot }))
    submitSwap({ kind: 'meal', slot })
  }

  function startAllSwap() {
    if (submitting) {
      Taro.showToast({ title: '正在换，稍等', icon: 'none' })
      return
    }
    setSwapState((s) => swapReducer(s, { type: 'start-all' }))
    submitSwap({ kind: 'all' })
  }

  function retrySwap() {
    if (swapState.phase !== 'submit-error') return
    const target = swapState.target
    setSwapState((s) => swapReducer(s, { type: 'retry' }))
    submitSwap(target)
  }

  function closeSwap() {
    if (submitting) {
      Taro.showToast({ title: '正在换，稍等', icon: 'none' })
      return
    }
    setSwapState((s) => swapReducer(s, { type: 'close' }))
  }

  function goShopping() {
    if (!plan) return
    if (submitting) {
      Taro.showToast({ title: '正在换，稍等', icon: 'none' })
      return
    }
    Taro.navigateTo({ url: `/pages/shopping-list/index?planId=${encodeURIComponent(plan.id)}` })
  }

  // ───── 三态：加载（S-05 骨架） / 错误 / 过期 ─────

  if (phase === 'loading') {
    return (
      <View className="fm-page">
        <View className="topbar">
          <Text className="back" onClick={backPrev}>
            ‹ 返回
          </Text>
          <View className="h1">{pageTitle}</View>
          <View className="sub">
            {generate ? '正在为明天搭配三餐…' : '正在读取这天的三餐…'}
          </View>
        </View>
        <View className="sk sk-banner" />
        {skeletonMeals.map((slot) => (
          <MealSkeleton key={slot} slot={slot} />
        ))}
        {generate && (
          <View className="section">
            <View className="card">
              <View className="form-note">
                正在综合：必消食材、忌口、{avoidRecentDays ? `已吃菜避开（${avoidRecentDays} 天）` : '已吃菜避开'}
                、三餐不重复、儿童适配…
              </View>
            </View>
          </View>
        )}
      </View>
    )
  }

  if (phase === 'expired') {
    return (
      <View className="fm-page">
        <View className="topbar">
          <Text className="back" onClick={backPrev}>
            ‹ 返回
          </Text>
          <View className="h1">{pageTitle}</View>
          <View className="sub">{dateText}</View>
        </View>
        <View className="card empty-box">
          <View className="empty-title">这次填写的内容已过期</View>
          <View className="empty-text">
            填写的内容只保留在这次会话里；重新填一次人数、必消和忌口，再点推荐就行。
          </View>
          <Button className="btn-main" onClick={backToSetup}>
            回设置重新填
          </Button>
        </View>
      </View>
    )
  }

  if (phase === 'gen-error') {
    return (
      <View className="fm-page">
        <View className="topbar">
          <Text className="back" onClick={backPrev}>
            ‹ 返回
          </Text>
          <View className="h1">{pageTitle}</View>
          <View className="sub">{dateText}</View>
        </View>
        <View className="banner banner-warn">
          <Text>⚠ {error || '没生成出来，请重试'}</Text>
        </View>
        <View className="card empty-box mt-3">
          <View className="empty-title">没生成出来</View>
          <View className="empty-text">填写的内容没丢；服务恢复后重试，或回去改一改再试。</View>
          <View className="btn-row">
            <Button className="btn-plain" onClick={backToSetup}>
              返回修改
            </Button>
            <Button className="btn-main" onClick={startGenerate}>
              重试
            </Button>
          </View>
        </View>
      </View>
    )
  }

  if (phase === 'error') {
    return (
      <View className="fm-page">
        <View className="topbar">
          <Text className="back" onClick={backPrev}>
            ‹ 返回
          </Text>
          <View className="h1">{pageTitle}</View>
          <View className="sub">{dateText}</View>
        </View>
        <View className="banner banner-warn">
          <Text>⚠ 服务未连接，暂时拿不到三餐菜单{error ? `（${error}）` : ''}</Text>
          <Text className="act" onClick={loadPlan}>
            重试
          </Text>
        </View>
      </View>
    )
  }

  if (phase === 'empty') {
    return (
      <View className="fm-page">
        <View className="topbar">
          <Text className="back" onClick={backPrev}>
            ‹ 返回
          </Text>
          <View className="h1">{pageTitle}</View>
          <View className="sub">{dateText}</View>
        </View>
        <View className="card empty-box">
          <View className="empty-title">这一天还没定菜单</View>
          <View className="empty-text">先把明天的人数、必消和忌口填好，点推荐菜谱就有了。</View>
          <Button
            className="btn-main"
            onClick={() => Taro.navigateTo({ url: '/pages/meal-setup/index' })}
          >
            去定明天的餐
          </Button>
        </View>
      </View>
    )
  }

  if (phase === 'legacy' || !plan || !plan.dayPlan) {
    return (
      <View className="fm-page">
        <View className="topbar">
          <Text className="back" onClick={backPrev}>
            ‹ 返回
          </Text>
          <View className="h1">{pageTitle}</View>
          <View className="sub">{dateText}</View>
        </View>
        <View className="card empty-box">
          <View className="empty-title">旧版计划，暂不能展示三餐</View>
          <View className="empty-text">
            这份计划是三餐结构上线前生成的；内容如实保留，但这一版页面只能展示新的三餐计划。
          </View>
          <Button className="btn-main" onClick={goHome}>
            回首页
          </Button>
        </View>
      </View>
    )
  }

  const dayPlan = plan.dayPlan

  // ───── S-07 全天空手：整页如实说明，不显示假菜单 ─────
  if (isEmptyHand(dayPlan)) {
    return (
      <View className="fm-page with-stickybar">
        <View className="topbar">
          <Text className="back" onClick={backPrev}>
            ‹ 返回
          </Text>
          <View className="h1">明天三餐出不来？</View>
          <View className="sub">如实说明是哪一餐、因为什么，绝不拿假菜单凑数</View>
        </View>
        {dayPlan.failures.length > 0 ? (
          dayPlan.failures.map((f, i) => (
            <FailureCard
              key={`${f.slot}-${f.kind}-${i}`}
              failure={f}
              dayPlan={dayPlan}
              onAdjust={backToSetup}
            />
          ))
        ) : (
          <View className="card empty-box">
            <View className="empty-title">这次没凑出三餐</View>
            <View className="empty-text">没有符合条件的菜；回设置放宽临时忌口或删掉必消再试。</View>
          </View>
        )}
        <View className="stickybar">
          <Button className="btn-main" onClick={backToSetup}>
            调好重新生成
          </Button>
        </View>
      </View>
    )
  }

  // ───── S-06 三餐菜单 ─────
  const bannerItems = buildMustUseBanner(dayPlan, plan.dayContext?.mustUseIngredients ?? [])
  const { usedText, unusedText } = mustUseBannerText(bannerItems)
  const totalActiveMinutes = dayTotalActiveMinutes(dayPlan)
  const orderedSlots = displayMealSlots(
    plan.dayContext?.meals,
    dayPlan.meals.map((m) => m.slot),
    dayPlan.failures.map((f) => f.slot),
  )
  const createdRaw = plan.createdAt as Date | string
  const createdTime = createdRaw instanceof Date ? createdRaw : new Date(createdRaw)

  function mustUseHint(dish: DayPlanDish, slot: MealSlot): string | null {
    const alloc = dayPlan.mustUseAllocation.find((a) => a.dishId === dish.id && a.slot === slot)
    if (!alloc) return null
    const item = bannerItems.find(
      (i) => i.used && i.slot === alloc.slot && i.dishName === alloc.dishName,
    )
    return item ? `用上必消${item.name ?? item.raw}` : '用上必消食材'
  }

  const dishPopupVisible =
    swapState.phase === 'loading' ||
    swapState.phase === 'picking' ||
    swapState.phase === 'load-error' ||
    ((swapState.phase === 'submitting' || swapState.phase === 'submit-error') &&
      swapState.target.kind === 'dish')

  const subtitleParts = [dateText]
  if (plan.dayContext) {
    subtitleParts.push(`${plan.dayContext.adults} 大 ${plan.dayContext.children} 小`)
  }
  subtitleParts.push(`合计动火约 ${totalActiveMinutes} 分钟`)
  if (!Number.isNaN(createdTime.getTime())) {
    subtitleParts.push(`今晚 ${formatTimeHM(createdTime)} 生成`)
  }

  return (
    <View className="fm-page with-stickybar">
      <View className="topbar">
        <Text className="back" onClick={backPrev}>
          ‹ 返回
        </Text>
        <View className="h1">{pageTitle}</View>
        <View className="sub">{subtitleParts.join(' · ')}</View>
      </View>

      {swapState.phase === 'submit-error' && swapState.target.kind !== 'dish' && (
        <View className="banner banner-warn">
          <Text>⚠ 没换成：{swapState.message}</Text>
          <Text className="act" onClick={retrySwap}>
            重试
          </Text>
        </View>
      )}

      {usedText && (
        <View className="banner mt-3">
          <Text>{usedText}</Text>
        </View>
      )}
      {unusedText && (
        <View className="banner banner-warn mt-3">
          <Text>{unusedText}</Text>
        </View>
      )}

      {dayPlan.desiredNotes.length > 0 && (
        <View className="section">
          <View className="card">
            <View className="form-title">想吃的菜</View>
            {dayPlan.desiredNotes.map((n) => (
              <View className="form-note" key={n.dishId}>
                {n.included
                  ? `✓ 想吃的「${n.dishName}」已排入${n.slot ? MEAL_SLOT_LABELS[n.slot] : ''}`
                  : `想吃的「${n.dishName}」未排入：${n.reason}`}
              </View>
            ))}
          </View>
        </View>
      )}

      <View className="section">
        {orderedSlots.map((slot) => {
          const meal = dayPlan.meals.find((m) => m.slot === slot)
          const failure = dayPlan.failures.find((f) => f.slot === slot)
          const mealSubmitting =
            swapState.phase === 'submitting' &&
            swapState.target.kind === 'meal' &&
            swapState.target.slot === slot
          return (
            <View className="meal-block" key={slot}>
              <View className="meal-head">
                <Text className="meal-name">{MEAL_SLOT_LABELS[slot]}</Text>
                <Text className="meal-time">
                  {mealTimeHint(slot)} · {mealKindHint(slot)}
                </Text>
              </View>

              {!meal || meal.dishes.length === 0 ? (
                <>
                  <View className="slot-empty">这一餐没凑出来</View>
                  {failure && (
                    <FailureCard failure={failure} dayPlan={dayPlan} onAdjust={backToSetup} />
                  )}
                </>
              ) : (
                <View className="grid2">
                  {meal.dishes.map((d) => {
                    const hint = mustUseHint(d, slot)
                    return (
                      <View className="fcard" key={d.id}>
                        <DishImage imageUrl={d.imageUrl} seed={d.id} alt={d.name} />
                        <View className="fcard-body">
                          <View className="fcard-name">{d.name}</View>
                          <View className="fcard-meta">
                            {d.activeMinutes} 分钟动火{hint ? ` · ${hint}` : ''}
                          </View>
                          <View className="fcard-act">
                            <View className="mini" onClick={() => openDishSwap(d.id)}>
                              换一道
                            </View>
                          </View>
                        </View>
                      </View>
                    )
                  })}
                </View>
              )}

              {/* 该餐无 meal（引擎失败餐不产 menuId）时不提供「换一餐」，避免服务端无从承接 */}
              {meal && (
                <View className="btn-row">
                  <Button
                    className="btn-plain"
                    loading={mealSubmitting}
                    onClick={() => startMealSwap(slot)}
                  >
                    {MEAL_SLOT_LABELS[slot]}换一餐
                  </Button>
                </View>
              )}
            </View>
          )
        })}
      </View>

      <Text className="img-note">示意图·正式版为试做实拍</Text>

      <View className="stickybar">
        <Button
          className="btn-ghost"
          loading={swapState.phase === 'submitting' && swapState.target.kind === 'all'}
          onClick={startAllSwap}
        >
          全部换一批
        </Button>
        <Button className="btn-main" onClick={goShopping}>
          确认三餐，查看采购清单
        </Button>
      </View>

      {/* 换一道候选弹层：0 候选如实展示；未选中确认不关闭；失败可重试 */}
      <Popup visible={dishPopupVisible} position="bottom" round onClose={closeSwap}>
        <View className="sheet-body">
          <View className="sheet-grab" />

          {swapState.phase === 'loading' && (
            <>
              <View className="sheet-title">正在找可换的菜…</View>
              <View className="sk sk-line w70 mt-3" />
              <View className="sk sk-line w45 mt-2" />
              <View className="btn-row">
                <Button className="btn-plain" onClick={closeSwap}>
                  取消
                </Button>
              </View>
            </>
          )}

          {swapState.phase === 'load-error' && (
            <>
              <View className="sheet-title">候选没读出来</View>
              <View className="form-note">{swapState.message}</View>
              <View className="btn-row">
                <Button className="btn-plain" onClick={closeSwap}>
                  取消
                </Button>
                <Button className="btn-main" onClick={() => openDishSwap(swapState.dishId)}>
                  重试
                </Button>
              </View>
            </>
          )}

          {swapState.phase === 'picking' && (
            <>
              <View className="sheet-title">换一道</View>
              <View className="sheet-sub">从同餐型候选里挑一道；不选就关掉，原菜单不动</View>
              {swapState.candidates.length === 0 ? (
                <View className="empty-box">
                  <View className="empty-text">暂时没有可换的候选</View>
                </View>
              ) : (
                <View className="cand-list">
                  {swapState.candidates.map((c) => (
                    <View
                      className={`cand-item${swapState.selectedId === c.dishId ? ' on' : ''}`}
                      key={c.dishId}
                      onClick={() =>
                        setSwapState((s) => swapReducer(s, { type: 'select', dishId: c.dishId }))
                      }
                    >
                      <View>
                        <View className="cand-name">{c.name}</View>
                        <View className="cand-meta">
                          {mealRoleLabel(c.mealRole)} · 动火 {c.activeMinutes} 分钟
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              )}
              <View className="sheet-label">
                为什么换？<Text className="sheet-note">（选填）</Text>
              </View>
              <Input
                className="input"
                placeholder="选填，如：太麻烦"
                value={swapState.reason}
                onInput={(e) =>
                  setSwapState((s) => swapReducer(s, { type: 'reason', text: e.detail.value }))
                }
              />
              <View className="btn-row">
                <Button className="btn-plain" onClick={closeSwap}>
                  取消
                </Button>
                <Button className="btn-main" onClick={confirmDishSwap}>
                  换成这道
                </Button>
              </View>
            </>
          )}

          {swapState.phase === 'submitting' && swapState.target.kind === 'dish' && (
            <>
              <View className="sheet-title">正在换…</View>
              <View className="form-note">原菜单先不动，换好了整页一起更新。</View>
            </>
          )}

          {swapState.phase === 'submit-error' && swapState.target.kind === 'dish' && (
            <>
              <View className="sheet-title">没换成</View>
              <View className="form-note">{swapState.message}</View>
              <View className="btn-row">
                <Button className="btn-plain" onClick={closeSwap}>
                  取消
                </Button>
                <Button className="btn-main" onClick={retrySwap}>
                  重试
                </Button>
              </View>
            </>
          )}
        </View>
      </Popup>
    </View>
  )
}
