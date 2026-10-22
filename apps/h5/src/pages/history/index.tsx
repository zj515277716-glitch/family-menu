// apps/h5/src/pages/history/index.tsx
// S-11 历史（T-Q13，C-6）：GET /api/plans 全量 → 纯函数按本地日分组（近 14 天、同日取最新、
// 旧版无 dayPlan 跳过）。每餐按餐并发 GET feedback；失败整页错误横幅+重试，绝不拿「还没评价」冒充。
// 点菜名进 S-09 复看做法；保留 Tabbar；加载/空/错误三态齐备。
import { useCallback, useEffect, useState } from 'react'
import Taro from '@tarojs/taro'
import { View, Text } from '@tarojs/components'
import { Button } from '@nutui/nutui-react-taro'
import type { FeedbackResponse, MealSlot } from '@family-menu/shared'
import { planApi, UnauthorizedError } from '../../api/client'
import CustomTabBar from '../../components/CustomTabBar'
import DishImage from '../../components/DishImage'
import { buildDishPageUrl } from '../../lib/dish-detail'
import { feedbackMeta, feedbackTag } from '../../lib/feedback'
import { formatDateCN, todayDateStr } from '../../lib/day-plan'
import { buildHistoryDays, historyDayNote, mealSlotShortLabel, type HistoryDay } from '../../lib/history'

type Phase = 'loading' | 'ready' | 'empty' | 'error'

function errorText(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback
}

function feedbackKey(planId: string, slot: MealSlot): string {
  return `${planId}:${slot}`
}

function goDish(day: HistoryDay, slot: MealSlot, dishId: string) {
  Taro.navigateTo({
    url: buildDishPageUrl({ date: day.date, planId: day.plan.id, slot, dishId }),
  }).catch(() => {
    Taro.showToast({ title: '跳转失败，请重试', icon: 'none' })
  })
}

function HistoryDayCard({
  day,
  feedbacks,
}: {
  day: HistoryDay
  feedbacks: Record<string, FeedbackResponse | null>
}) {
  return (
    <View className="section history-day">
      <View className="card">
        <View className="day-head">
          <Text className="day-title">{formatDateCN(new Date(`${day.date}T00:00:00`))}</Text>
          <Text className="day-note">{historyDayNote(day)}</Text>
        </View>

        {day.meals.length === 0 ? (
          <View className="form-note">这天没排上餐</View>
        ) : (
          day.meals.map((m) => {
            const fb = feedbacks[feedbackKey(day.plan.id, m.slot)] ?? null
            const tag =
              m.dishes.length === 0 && !fb
                ? { label: '没排上', cls: 'tag-none' }
                : feedbackTag(fb, true)
            return (
              <View className="meal-row" key={m.slot}>
                <Text className="meal-row-name">{mealSlotShortLabel(m.slot)}</Text>
                {m.dishes.length > 0 && (
                  <View className="gthumbs">
                    {m.dishes.slice(0, 3).map((d) => (
                      <DishImage key={d.id} imageUrl={d.imageUrl} seed={d.id} alt={d.name} />
                    ))}
                  </View>
                )}
                <View className="meal-row-body">
                  {m.dishes.length === 0 ? (
                    <Text className="meal-row-dishes muted">没排上</Text>
                  ) : (
                    <View className="meal-row-dishes">
                      {m.dishes.map((d, i) => (
                        <Text
                          className="meal-dish"
                          key={d.id}
                          onClick={() => goDish(day, m.slot, d.id)}
                        >
                          {i > 0 ? ' · ' : ''}
                          {d.name}
                        </Text>
                      ))}
                    </View>
                  )}
                  <View className="meal-row-meta">{feedbackMeta(fb)}</View>
                </View>
                <Text className={`tag ${tag.cls}`}>{tag.label}</Text>
              </View>
            )
          })
        )}
      </View>
    </View>
  )
}

export default function HistoryPage() {
  const [phase, setPhase] = useState<Phase>('loading')
  const [days, setDays] = useState<HistoryDay[]>([])
  const [feedbacks, setFeedbacks] = useState<Record<string, FeedbackResponse | null>>({})
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setPhase('loading')
    setError(null)
    try {
      const plans = await planApi.listPlans()
      const grouped = buildHistoryDays(plans, todayDateStr())
      if (grouped.length === 0) {
        setDays([])
        setFeedbacks({})
        setPhase('empty')
        return
      }

      const tasks: { key: string; planId: string; slot: MealSlot }[] = []
      for (const day of grouped) {
        for (const meal of day.meals) {
          tasks.push({
            key: feedbackKey(day.plan.id, meal.slot),
            planId: day.plan.id,
            slot: meal.slot,
          })
        }
      }

      // 评价按餐并发取；任一失败整页错误（不拿「还没评价」冒充读取失败）
      const results = await Promise.allSettled(
        tasks.map((t) => planApi.getFeedback(t.planId, t.slot)),
      )
      if (results.some((r) => r.status === 'rejected' && r.reason instanceof UnauthorizedError)) {
        return // 401 已由封装导回登录页
      }
      const failed = results.find((r) => r.status === 'rejected')
      if (failed && failed.status === 'rejected') {
        console.error('[History] 评价加载失败', failed.reason)
        setError(errorText(failed.reason, '服务未连接'))
        setPhase('error')
        return
      }

      const map: Record<string, FeedbackResponse | null> = {}
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') map[tasks[i].key] = r.value
      })
      setDays(grouped)
      setFeedbacks(map)
      setPhase('ready')
    } catch (e) {
      if (e instanceof UnauthorizedError) return
      console.error('[History] 历史加载失败', e)
      setError(errorText(e, '服务未连接'))
      setPhase('error')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function goSetup() {
    Taro.navigateTo({ url: '/pages/meal-setup/index' }).catch(() => {
      Taro.showToast({ title: '跳转失败，请重试', icon: 'none' })
    })
  }

  // ───── 加载骨架：形状照抄日卡 + 餐行 ─────
  if (phase === 'loading') {
    return (
      <View className="fm-page with-tabbar">
        <View className="topbar">
          <View className="h1">历史</View>
          <View className="sub">正在读取过去的三餐…</View>
        </View>
        <View className="sk sk-label" />
        <View className="sk-group">
          <View className="sk-row" />
          <View className="sk-row" />
          <View className="sk-row" />
        </View>
        <View className="sk sk-label mt-4" />
        <View className="sk-group">
          <View className="sk-row" />
          <View className="sk-row" />
          <View className="sk-row" />
        </View>
        <CustomTabBar />
      </View>
    )
  }

  // ───── 错误：服务未连接，可重试 ─────
  if (phase === 'error') {
    return (
      <View className="fm-page with-tabbar">
        <View className="topbar">
          <View className="h1">历史</View>
          <View className="sub">暂时拿不到过去的三餐</View>
        </View>
        <View className="banner banner-warn">
          <Text>⚠ {error || '服务未连接'}</Text>
          <Text className="act" onClick={() => void load()}>
            重试
          </Text>
        </View>
        <View className="card empty-box mt-4">
          <View className="empty-title">服务恢复后就显示</View>
          <View className="empty-text">已经记过的评价不会丢。</View>
          <Button className="btn-ghost" onClick={() => void load()}>
            重试
          </Button>
        </View>
        <CustomTabBar />
      </View>
    )
  }

  // ───── 空态：首次使用无记录 ─────
  if (phase === 'empty') {
    return (
      <View className="fm-page with-tabbar">
        <View className="topbar">
          <View className="h1">历史</View>
          <View className="sub">按日回看吃过的三餐</View>
        </View>
        <View className="card empty-box">
          <View className="empty-title">还没有记录</View>
          <View className="empty-text">定一次明天的餐，做过、吃过之后，这里就按天记下来了。</View>
          <Button className="btn-main" onClick={goSetup}>
            去定明天的餐
          </Button>
        </View>
        <CustomTabBar />
      </View>
    )
  }

  // ───── S-11 正常态 ─────
  return (
    <View className="fm-page with-tabbar">
      <View className="topbar">
        <View className="h1">历史</View>
        <View className="sub">按日分组 · 每餐四色评价标签 · 点菜品可复看做法</View>
      </View>

      {days.map((day) => (
        <HistoryDayCard key={day.date} day={day} feedbacks={feedbacks} />
      ))}

      <Text className="img-note">示意图·正式版为试做实拍</Text>
      <CustomTabBar />
    </View>
  )
}
