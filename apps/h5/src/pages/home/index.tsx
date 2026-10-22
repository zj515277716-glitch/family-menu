// apps/h5/src/pages/home/index.tsx
// S-03 双区首页：上半区今天三餐（按当前时间置顶下一餐 + 评价标签 + 做法/记一笔占位），
// 下半区定明天的餐（明天三餐摘要大卡 + 查看菜单 / 看采购清单）。
// S-13：任一路由失败 → 明说「服务未连接」可重试，绝不显示假数据；「定明天的餐」仍可进入。
// 保留 T-Q11 冷启动守卫（无家庭设置先去填设置）与 401 统一处理。
import { useCallback, useEffect, useState } from 'react'
import Taro from '@tarojs/taro'
import { View, Text } from '@tarojs/components'
import { Button } from '@nutui/nutui-react-taro'
import type { DayPlanMeal, FamilyRule, FeedbackResponse, MealSlot, Plan } from '@family-menu/shared'
import { MEAL_SLOTS, MEAL_SLOT_LABELS } from '@family-menu/shared'
import { api, planApi, UnauthorizedError } from '../../api/client'
import CustomTabBar from '../../components/CustomTabBar'
import DishImage from '../../components/DishImage'
import { pageUrl } from '../../lib/entry'
import {
  formatDateCN,
  mealTimeHint,
  nextMealView,
  todayDateStr,
  tomorrowDateStr,
} from '../../lib/day-plan'
import { mealDishSummary } from '../../lib/day-menu'

type Phase = 'loading' | 'ready' | 'error'
type FeedbackMap = Partial<Record<MealSlot, FeedbackResponse | null>>

function errorText(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback
}

/** 评价标签（四色 + 未评价灰）：好吃/一般/翻车/没做/还没评价 */
function feedbackTag(fb: FeedbackResponse | null | undefined): { label: string; cls: string } {
  if (!fb) return { label: '还没评价', cls: 'tag-none' }
  if (!fb.didCook) return { label: '没做', cls: 'tag-none' }
  if (fb.taste === 'good') return { label: '好吃', cls: 'tag-ok' }
  if (fb.taste === 'ok') return { label: '一般', cls: 'tag-mid' }
  if (fb.taste === 'fail') return { label: '翻车', cls: 'tag-bad' }
  return { label: '还没评价', cls: 'tag-none' }
}

export default function HomePage() {
  const [phase, setPhase] = useState<Phase>('loading')
  const [error, setError] = useState<string | null>(null)
  const [rule, setRule] = useState<FamilyRule | null>(null)
  const [todayPlan, setTodayPlan] = useState<Plan | null>(null)
  const [tomorrowPlan, setTomorrowPlan] = useState<Plan | null>(null)
  const [feedbacks, setFeedbacks] = useState<FeedbackMap>({})

  const today = todayDateStr()
  const tomorrow = tomorrowDateStr()

  const load = useCallback(async () => {
    setPhase('loading')
    setError(null)
    const [ruleRes, todayRes, tomorrowRes] = await Promise.allSettled([
      api.getFamilyRules(),
      planApi.listPlansByDate(today),
      planApi.listPlansByDate(tomorrow),
    ] as const)

    // 401：封装已导回登录页，这里不再改状态
    const unauthorized = [ruleRes, todayRes, tomorrowRes].some(
      (r) => r.status === 'rejected' && r.reason instanceof UnauthorizedError,
    )
    if (unauthorized) return

    if (ruleRes.status === 'rejected') {
      console.error('[Home] 家庭规则加载失败', ruleRes.reason)
      setError(errorText(ruleRes.reason, '服务未连接'))
      setPhase('error')
      return
    }
    setRule(ruleRes.value)
    if (ruleRes.value === null) {
      // 冷启动守卫（C-8）：无家庭设置先去填设置，不显示任何假内容
      setPhase('ready')
      return
    }

    if (todayRes.status === 'rejected' || tomorrowRes.status === 'rejected') {
      const reason =
        todayRes.status === 'rejected'
          ? todayRes.reason
          : tomorrowRes.status === 'rejected'
            ? tomorrowRes.reason
            : null
      console.error('[Home] 计划加载失败', reason)
      setError(errorText(reason, '服务未连接'))
      setPhase('error')
      return
    }

    const tp = todayRes.value[0] ?? null
    const mp = tomorrowRes.value[0] ?? null
    setTodayPlan(tp)
    setTomorrowPlan(mp)

    // 今天三餐评价按餐并发读取；任一失败按 S-13 处理，不拿旧数据冒充
    if (tp?.dayPlan) {
      const slots = tp.dayPlan.meals.map((m) => m.slot)
      const fbRes = await Promise.allSettled(slots.map((slot) => planApi.getFeedback(tp.id, slot)))
      if (fbRes.some((r) => r.status === 'rejected' && r.reason instanceof UnauthorizedError)) return
      const failed = fbRes.find((r) => r.status === 'rejected')
      if (failed && failed.status === 'rejected') {
        console.error('[Home] 评价加载失败', failed.reason)
        setError(errorText(failed.reason, '服务未连接'))
        setPhase('error')
        return
      }
      const map: FeedbackMap = {}
      fbRes.forEach((r, i) => {
        if (r.status === 'fulfilled') map[slots[i]] = r.value
      })
      setFeedbacks(map)
    } else {
      setFeedbacks({})
    }
    setPhase('ready')
  }, [today, tomorrow])

  useEffect(() => {
    load()
  }, [load])

  function placeholder(label: string) {
    Taro.showToast({ title: `${label}在下一版上线`, icon: 'none' })
  }

  function goMealSetup() {
    Taro.navigateTo({ url: '/pages/meal-setup/index' })
  }

  // ───── 加载中 ─────
  if (phase === 'loading') {
    return (
      <View className="fm-page with-tabbar">
        <View className="brand-hero">
          <View className="h1">今天 · {formatDateCN(new Date())}</View>
          <View className="sub">正在读取今天的菜单…</View>
        </View>
        <View className="section">
          <View className="sk sk-label" />
          <View className="sk-group">
            <View className="sk-row" />
            <View className="sk-row" />
            <View className="sk-row" />
          </View>
        </View>
        <CustomTabBar />
      </View>
    )
  }

  // ───── S-13 错误态（可重试；「定明天的餐」仍可进入） ─────
  if (phase === 'error') {
    return (
      <View className="fm-page with-tabbar">
        <View className="topbar">
          <View className="h1">今天 · {formatDateCN(new Date())}</View>
          <View className="sub">暂时拿不到菜单</View>
        </View>

        <View className="banner banner-warn">
          <Text>⚠ 服务未连接，暂时拿不到菜单{error ? `（${error}）` : ''}</Text>
          <Text className="act" onClick={load}>
            重试
          </Text>
        </View>

        <View className="section">
          <View className="section-head">
            <Text className="section-title">今天三餐</Text>
            <Text className="section-note">服务恢复后就显示</Text>
          </View>
          <View className="card empty-box">
            <View className="empty-title">暂时拿不到今天的三餐</View>
            <View className="empty-text">已经记过的评价不会丢。</View>
            <Button className="btn-ghost" onClick={load}>
              重试
            </Button>
          </View>
        </View>

        <View className="section">
          <View className="section-head">
            <Text className="section-title">定明天的餐</Text>
            <Text className="section-note">{formatDateCN(new Date(`${tomorrow}T00:00:00`))}</Text>
          </View>
          <View className="card">
            <View className="form-note">人数、必消、忌口可以先填好，服务恢复后一键生成。</View>
            <View className="btn-row">
              <Button className="btn-ghost" onClick={goMealSetup}>
                先去填写
              </Button>
            </View>
          </View>
        </View>

        <CustomTabBar />
      </View>
    )
  }

  // ───── 冷启动守卫（C-8） ─────
  if (!rule) {
    return (
      <View className="fm-page with-tabbar">
        <View className="topbar">
          <View className="h1">首页</View>
          <View className="sub">今天三餐 · 定明天的餐</View>
        </View>
        <View className="card empty-box">
          <View className="empty-title">先填家庭设置</View>
          <View className="empty-text">
            家里几口人、忌口与喜好设一次，今晚就能出餐；没有历史记录也能推荐。
          </View>
          <Button className="btn-main" onClick={() => Taro.reLaunch({ url: pageUrl('settings') })}>
            去填家庭设置
          </Button>
        </View>
        <CustomTabBar />
      </View>
    )
  }

  // ───── 正常态 ─────
  const view = nextMealView(new Date().getHours())
  const people = todayPlan?.dayContext ?? {
    adults: rule.defaultAdults,
    children: rule.defaultChildren,
  }
  const nextText = view.next ? `${MEAL_SLOT_LABELS[view.next]}是今天的下一餐` : '今天三餐已过完'

  const todayDayPlan = todayPlan?.dayPlan
  const todayMeals = todayDayPlan
    ? view.order
        .map((slot) => todayDayPlan.meals.find((m) => m.slot === slot))
        .filter((m): m is DayPlanMeal => m !== undefined)
    : []

  const tomorrowDayPlan = tomorrowPlan?.dayPlan

  return (
    <View className="fm-page with-tabbar">
      {/* 品牌渐变带：全页唯一装饰面 */}
      <View className="brand-hero">
        <View className="h1">今天 · {formatDateCN(new Date())}</View>
        <View className="sub">
          {people.adults} 大 {people.children} 小 · {nextText}
        </View>
      </View>

      {/* 上半区：今天三餐 */}
      <View className="section">
        <View className="section-head">
          <Text className="section-title">今天三餐</Text>
          <Text className="section-note">做完一餐点「记一笔」</Text>
        </View>

        {todayPlan && !todayDayPlan && (
          <View className="card empty-box">
            <View className="empty-title">旧版计划，暂不能展示三餐</View>
            <View className="empty-text">这份计划是三餐结构上线前生成的；内容如实保留。</View>
          </View>
        )}

        {!todayPlan && (
          <View className="card empty-box">
            <View className="empty-title">今天还没定菜单</View>
            <View className="empty-text">今天的菜单还没生成；先定好明天的，明天一早就有了。</View>
            <Button className="btn-ghost" onClick={goMealSetup}>
              定明天的餐
            </Button>
          </View>
        )}

        {todayMeals.map((m) => {
          const tag = view.next === m.slot ? { label: '下一餐', cls: 'tag-next' } : feedbackTag(feedbacks[m.slot])
          return (
            <View className="meal-block" key={m.slot}>
              <View className="meal-head">
                <Text className="meal-name">{MEAL_SLOT_LABELS[m.slot]}</Text>
                <Text className="meal-time">{mealTimeHint(m.slot)}</Text>
                <Text className={`tag ${tag.cls}`}>{tag.label}</Text>
              </View>

              {m.dishes.length === 0 ? (
                <View className="slot-empty">这一餐没凑出来</View>
              ) : (
                <View className="hscroll">
                  {m.dishes.map((d) => (
                    <View className="fcard" key={d.id}>
                      <DishImage imageUrl={d.imageUrl} seed={d.id} alt={d.name} />
                      <View className="fcard-body">
                        <View className="fcard-name">{d.name}</View>
                        <View className="fcard-meta">{d.activeMinutes} 分钟动火</View>
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {/* T-Q13 入口占位：点击必须说明，不静默 */}
              <View className="btn-row">
                <Button className="btn-ghost" onClick={() => placeholder('看做法')}>
                  看做法
                </Button>
                <Button className="btn-plain" onClick={() => placeholder('记一笔')}>
                  记一笔
                </Button>
              </View>
            </View>
          )
        })}
      </View>

      {/* 下半区：定明天的餐 */}
      <View className="section">
        <View className="section-head">
          <Text className="section-title">定明天的餐</Text>
          <Text className="section-note">{formatDateCN(new Date(`${tomorrow}T00:00:00`))}</Text>
        </View>

        {tomorrowPlan && tomorrowDayPlan ? (
          <>
            <View className="hscroll hscroll-wide">
              {MEAL_SLOTS.map((slot) => tomorrowDayPlan.meals.find((m) => m.slot === slot))
                .filter((m): m is DayPlanMeal => m !== undefined)
                .map((m) => {
                  const first = m.dishes[0]
                  return (
                    <View className="fcard" key={m.slot}>
                      <DishImage imageUrl={first?.imageUrl} seed={first?.id ?? m.slot} alt={MEAL_SLOT_LABELS[m.slot]} />
                      <View className="fcard-body">
                        <View className="fcard-name">{MEAL_SLOT_LABELS[m.slot]}</View>
                        <View className="fcard-meta">
                          {m.dishes.length > 0 ? mealDishSummary(m) : '这一餐没凑出来'}
                        </View>
                      </View>
                    </View>
                  )
                })}
            </View>
            <View className="btn-row">
              <Button
                className="btn-ghost"
                onClick={() =>
                  Taro.navigateTo({ url: `/pages/day-menu/index?date=${tomorrow}` })
                }
              >
                查看菜单
              </Button>
              <Button
                className="btn-main"
                onClick={() =>
                  Taro.navigateTo({
                    url: `/pages/shopping-list/index?planId=${encodeURIComponent(tomorrowPlan.id)}`,
                  })
                }
              >
                看采购清单
              </Button>
            </View>
          </>
        ) : tomorrowPlan ? (
          <View className="card empty-box">
            <View className="empty-title">明天这份是旧版计划</View>
            <View className="empty-text">旧版计划暂不能展示三餐；可以进去看看原始菜单。</View>
            <Button
              className="btn-ghost"
              onClick={() => Taro.navigateTo({ url: `/pages/day-menu/index?date=${tomorrow}` })}
            >
              查看菜单
            </Button>
          </View>
        ) : (
          <View className="card empty-box">
            <View className="empty-title">还没定明天的餐</View>
            <View className="empty-text">今晚花两分钟，明天三餐不用想。</View>
            <Button className="btn-main" onClick={goMealSetup}>
              定明天的餐
            </Button>
          </View>
        )}
      </View>

      <Text className="img-note">示意图·正式版为试做实拍</Text>

      <CustomTabBar />
    </View>
  )
}
