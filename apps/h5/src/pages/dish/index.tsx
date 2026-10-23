// apps/h5/src/pages/dish/index.tsx
// S-09 菜品做法（T-Q13，C-5 / PD-016 方向 A）：4:3 全出血大图 + 渐变遮罩菜名/餐次/人数/chips；
// 用料按（成人+儿童）/4 缩放凑整；分步序号圆点；同餐同日上一道/下一道（redirectTo 替换当前页）；
// 底部 stickybar：今天记一笔，过去日期返回历史。三态如实（加载骨架 / 服务失败可重试 / 计划或菜缺失）。
// 路由参数：date / planId / slot / dishId。请求全部走 client.ts。
import { useCallback, useEffect, useState } from 'react'
import Taro from '@tarojs/taro'
import { View, Text } from '@tarojs/components'
import { Button } from '@nutui/nutui-react-taro'
import type { FeedbackResponse, MealSlot, Plan } from '@family-menu/shared'
import { MEAL_SLOT_LABELS } from '@family-menu/shared'
import { dishApi, planApi, UnauthorizedError, type DishDetail } from '../../api/client'
import DishImage from '../../components/DishImage'
import FeedbackSheet from '../../components/FeedbackSheet'
import { formatDateCN, todayDateStr } from '../../lib/day-plan'
import {
  buildDishPageUrl,
  dishChips,
  findDishNav,
  orderedSteps,
  peopleLabel,
  scaleIngredientQty,
} from '../../lib/dish-detail'
import { pageUrl } from '../../lib/entry'
import { formatQty } from '../../lib/shopping-list'

type Phase = 'loading' | 'ready' | 'error' | 'missing'
type MissingKind = 'params' | 'plan' | 'legacy' | 'dish'

const MISSING_TEXT: Record<MissingKind, { title: string; text: string; retry: boolean }> = {
  params: {
    title: '做法页参数不完整',
    text: '从首页或历史点菜名进来，就能看这道菜的做法。',
    retry: false,
  },
  plan: {
    title: '这天的计划不在了',
    text: '计划可能已被替换或删除；回上一页重新点菜名。',
    retry: true,
  },
  legacy: {
    title: '旧版计划，暂不能看做法',
    text: '这份计划是三餐结构上线前生成的；内容如实保留，但没有三餐上下文。',
    retry: false,
  },
  dish: {
    title: '这道菜不在了',
    text: '菜谱可能已下架；回上一页重新选。',
    retry: true,
  },
}

function parseSlot(v?: string): MealSlot | null {
  return v === 'breakfast' || v === 'lunch' || v === 'dinner' ? v : null
}

function errorText(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback
}

export default function DishPage() {
  const router = Taro.useRouter()
  const rawDate = router.params.date
  const date = rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : ''
  const planId = router.params.planId ?? ''
  const slot = parseSlot(router.params.slot)
  const dishId = router.params.dishId ?? ''

  const [phase, setPhase] = useState<Phase>('loading')
  const [missingKind, setMissingKind] = useState<MissingKind>('params')
  const [dish, setDish] = useState<DishDetail | null>(null)
  const [plan, setPlan] = useState<Plan | null>(null)
  const [feedback, setFeedback] = useState<FeedbackResponse | null>(null)
  const [feedbackError, setFeedbackError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sheetVisible, setSheetVisible] = useState(false)

  const load = useCallback(async () => {
    if (!date || !planId || !slot || !dishId) {
      setMissingKind('params')
      setPhase('missing')
      return
    }
    setPhase('loading')
    setError(null)
    setFeedbackError(null)
    setSheetVisible(false)

    // 菜谱 / 当日计划 / 该餐已有评价并行读；评价失败不拖垮做法本体的展示
    const [dishRes, plansRes, fbRes] = await Promise.allSettled([
      dishApi.getDish(dishId),
      planApi.listPlansByDate(date),
      planApi.getFeedback(planId, slot),
    ] as const)

    const settled = [dishRes, plansRes, fbRes]
    if (settled.some((r) => r.status === 'rejected' && r.reason instanceof UnauthorizedError)) {
      return // 401 已由封装导回登录页
    }

    if (dishRes.status === 'rejected') {
      console.error('[Dish] 菜谱加载失败', dishRes.reason)
      setError(errorText(dishRes.reason, '服务未连接'))
      setPhase('error')
      return
    }
    if (plansRes.status === 'rejected') {
      console.error('[Dish] 计划加载失败', plansRes.reason)
      setError(errorText(plansRes.reason, '服务未连接'))
      setPhase('error')
      return
    }

    if (dishRes.value === null) {
      setDish(null)
      setMissingKind('dish')
      setPhase('missing')
      return
    }

    const found = plansRes.value.find((p) => p.id === planId) ?? null
    if (!found) {
      setDish(dishRes.value)
      setMissingKind('plan')
      setPhase('missing')
      return
    }
    if (!found.dayPlan) {
      setDish(dishRes.value)
      setPlan(found)
      setMissingKind('legacy')
      setPhase('missing')
      return
    }

    setDish(dishRes.value)
    setPlan(found)
    if (fbRes.status === 'fulfilled') {
      setFeedback(fbRes.value)
    } else {
      setFeedback(null)
      setFeedbackError(errorText(fbRes.reason, '评价没读出来'))
    }
    setPhase('ready')
  }, [date, dishId, planId, slot])

  useEffect(() => {
    void load()
  }, [load])

  async function backPrev() {
    if (Taro.getCurrentPages().length <= 1) {
      Taro.reLaunch({ url: pageUrl('home') })
      return
    }
    try {
      await Taro.navigateBack({ delta: 1 })
    } catch {
      Taro.reLaunch({ url: pageUrl('home') })
    }
  }

  function goHistory() {
    const pages = Taro.getCurrentPages()
    const prev = pages[pages.length - 2] as { route?: string } | undefined
    if (prev?.route?.includes('pages/history')) {
      Taro.navigateBack({ delta: 1 }).catch(() => {
        Taro.reLaunch({ url: pageUrl('history') })
      })
      return
    }
    Taro.reLaunch({ url: pageUrl('history') })
  }

  function goDish(targetId: string) {
    if (!plan || !slot) return
    Taro.redirectTo({
      url: buildDishPageUrl({ date, planId: plan.id, slot, dishId: targetId }),
    }).catch(() => {
      Taro.showToast({ title: '跳转失败，请重试', icon: 'none' })
    })
  }

  async function loadFeedback() {
    if (!plan || !slot) return
    try {
      const fb = await planApi.getFeedback(plan.id, slot)
      setFeedback(fb)
      setFeedbackError(null)
    } catch (e) {
      if (e instanceof UnauthorizedError) return
      console.error('[Dish] 评价回读失败', e)
      setFeedbackError(errorText(e, '评价没读出来'))
      Taro.showToast({ title: '还是没读出来，请稍后再试', icon: 'none' })
    }
  }

  function openFeedback() {
    if (!plan || !slot) {
      Taro.showToast({ title: '这餐已不在计划里', icon: 'none' })
      return
    }
    if (feedbackError) {
      Taro.showToast({ title: '上次评价没读出来，先点上方重试', icon: 'none' })
      return
    }
    setSheetVisible(true)
  }

  const dateObj = date ? new Date(`${date}T00:00:00`) : new Date()
  const dateText = formatDateCN(dateObj)
  const isToday = date === todayDateStr()

  // ───── 加载骨架：形状照抄大图 + 用料/步骤 ─────
  if (phase === 'loading') {
    return (
      <View className="fm-page dish-page">
        <View className="dhero sk" />
        <View className="dish-main">
          <View className="sk sk-line w45" />
          <View className="sk sk-banner mt-4" />
          <View className="sk sk-line w70 mt-4" />
          <View className="sk sk-line w45 mt-2" />
          <View className="sk sk-line w70 mt-2" />
        </View>
      </View>
    )
  }

  // ───── 服务失败：可重试 ─────
  if (phase === 'error') {
    return (
      <View className="fm-page dish-page">
        <View className="dish-main">
          <View className="topbar">
            <Text className="back" onClick={backPrev}>
              ‹ 返回
            </Text>
            <View className="h1">做法</View>
            <View className="sub">{dateText}</View>
          </View>
          <View className="banner banner-warn">
            <Text>⚠ {error || '服务未连接，暂时拿不到这道菜'}</Text>
            <Text className="act" onClick={() => void load()}>
              重试
            </Text>
          </View>
          <View className="btn-row mt-4">
            <Button className="btn-ghost" onClick={backPrev}>
              返回上一页
            </Button>
          </View>
        </View>
      </View>
    )
  }

  // ───── 参数/计划/菜缺失：如实说明，可重试或返回 ─────
  if (phase === 'missing' || !dish || !plan || !slot) {
    const copy = MISSING_TEXT[missingKind]
    return (
      <View className="fm-page dish-page">
        <View className="dish-main">
          <View className="topbar">
            <Text className="back" onClick={backPrev}>
              ‹ 返回
            </Text>
            <View className="h1">做法</View>
            <View className="sub">{dateText}</View>
          </View>
          <View className="card empty-box">
            <View className="empty-title">{copy.title}</View>
            <View className="empty-text">{copy.text}</View>
            <View className="btn-row">
              {copy.retry && (
                <Button className="btn-ghost" onClick={() => void load()}>
                  重新读取
                </Button>
              )}
              <Button className="btn-main" onClick={backPrev}>
                返回上一页
              </Button>
            </View>
          </View>
        </View>
      </View>
    )
  }

  // ───── S-09 正常态 ─────
  const dayPlan = plan.dayPlan
  const meal = dayPlan?.meals.find((m) => m.slot === slot) ?? null
  const nav = findDishNav(meal?.dishes ?? [], dish.id)
  const people = plan.dayContext
    ? { adults: plan.dayContext.adults, children: plan.dayContext.children }
    : null
  const chips = dishChips(dish).slice(0, 4)
  const steps = orderedSteps(dish.steps)
  const hasMealContext = !!meal && meal.dishes.length > 0

  const subParts = [isToday ? '今天' : dateText, MEAL_SLOT_LABELS[slot]]
  if (people) subParts.push(peopleLabel(people.adults, people.children))

  return (
    <View className="fm-page dish-page with-stickybar">
      <View className="dhero">
        <DishImage variant="hero" imageUrl={dish.imageUrl} seed={dish.id} alt={dish.name} />
        <Text className="dhero-back" onClick={backPrev}>
          ‹
        </Text>
        <View className="dhero-mask">
          <View className="dhero-name">{dish.name}</View>
          <View className="dhero-sub">{subParts.join(' · ')}</View>
          <View className="dchips">
            {chips.map((c) => (
              <Text className={`dchip${c.hot ? ' hot' : ''}`} key={c.text}>
                {c.text}
              </Text>
            ))}
          </View>
        </View>
      </View>

      <View className="dish-main">
        <View className="dswitch">
          {nav.prev ? (
            <Text className="nav" onClick={() => goDish(nav.prev!.id)}>
              ‹ 上一道：{nav.prev.name}
            </Text>
          ) : (
            <Text className="dimmed">‹ 上一道：没有了</Text>
          )}
          {nav.next ? (
            <Text className="nav" onClick={() => goDish(nav.next!.id)}>
              下一道：{nav.next.name} ›
            </Text>
          ) : (
            <Text className="dimmed">下一道：没有了 ›</Text>
          )}
        </View>

        {feedbackError && (
          <View className="banner banner-warn mt-3">
            <Text>⚠ 上次评价没读出来：{feedbackError}</Text>
            <Text className="act" onClick={() => void loadFeedback()}>
              重试
            </Text>
          </View>
        )}

        <View className="section">
          <View className="card">
            <View className="form-title">
              用料{people ? `（${peopleLabel(people.adults, people.children)}）` : ''}
            </View>
            <View className="form-note">
              {people
                ? '用量已按人数缩放凑整；改默认人数在「设置」里'
                : '菜谱按 4 人份标注；这次没有计划人数，未做缩放'}
            </View>
            {dish.ingredients.length === 0 ? (
              <View className="form-note mt-2">这道菜还没录用料</View>
            ) : (
              <View className="ing-list">
                {dish.ingredients.map((ing) => {
                  const qty = people
                    ? scaleIngredientQty(ing.qty, people.adults, people.children)
                    : ing.qty
                  return (
                    <View className="ing-row" key={ing.ingredientId}>
                      <Text className="ing-name">{ing.ingredientName}</Text>
                      <Text className="ing-qty">
                        {formatQty(qty, ing.unit)}
                        {ing.optional ? '（可选）' : ''}
                      </Text>
                    </View>
                  )
                })}
              </View>
            )}
          </View>
        </View>

        <View className="section">
          <View className="prep-card">
            <View className="prep-title">分步做法</View>
            <View className="prep-sub">共 {steps.length} 步</View>
            {steps.length === 0 ? (
              <View className="form-note">这道菜还没录步骤</View>
            ) : (
              steps.map((s, i) => (
                <View className="step" key={`${s.order}-${i}`}>
                  <Text className="num">{i + 1}</Text>
                  <Text className="txt">{s.text}</Text>
                </View>
              ))
            )}
          </View>
        </View>

        <Text className="img-note">示意图·正式版为试做实拍</Text>
      </View>

      <View className="stickybar">
        {isToday ? (
          hasMealContext ? (
            <Button className="btn-main" onClick={openFeedback}>
              做完记一笔
            </Button>
          ) : (
            <Button className="btn-main" onClick={() => Taro.reLaunch({ url: pageUrl('home') })}>
              回首页看今天三餐
            </Button>
          )
        ) : (
          <Button className="btn-main" onClick={goHistory}>
            返回历史
          </Button>
        )}
      </View>

      {/* 评价未读成功时不挂载弹层：重读成功后才带服务端值首次挂载，避免空表单覆盖已有评价 */}
      {plan && !feedbackError && (
        <FeedbackSheet
          visible={sheetVisible}
          planId={plan.id}
          slot={slot}
          initialFeedback={feedback}
          onClose={() => setSheetVisible(false)}
          onSubmitted={(fb) => setFeedback(fb)}
        />
      )}
    </View>
  )
}
