// apps/h5/src/pages/history/index.tsx
// F7 历史（/pages/history，Tab）—— e-final 屏⑫/⑬（PD-011 定稿）重写：
// h1「吃过的饭」+ 纵排 rec 卡（真实日期/真实菜名/三问标签）+ 空态 📔 + 断连明示屏⑮。
// 真实菜名来自 GET /api/plans 的 dishNames（planService 按锁定菜单查出，取代「菜单a1b2」机器名）。
// 旧「复做」按钮定稿无此入口，已移除；反馈统一走 /pages/feedback 三问页（C-10）。
import { useEffect, useState } from 'react'
import Taro from '@tarojs/taro'
import { View, Text } from '@tarojs/components'
import { Button } from '@nutui/nutui-react-taro'
import { api } from '../../api/client'
import CustomTabBar from '../../components/CustomTabBar'
import EmptyState from '../../components/EmptyState'
import type { Plan } from '@family-menu/shared'
import type { FeedbackResponse } from '../../types'
import './index.css'

/** 单个结果标签（e-final 屏⑫ tag-ok/tag-warn/tag-hard/tag-skip） */
interface MetaTag {
  cls: string
  label: string
}

/**
 * e-final 屏⑫ rec-meta：三问各成一标签。
 * 做了 → 绿「做了」+ 味道（绿好吃/黄一般/红翻车）+ 意愿（绿下次还做/灰不做了）；
 * 没做 → 灰「没做」+ 文字「这顿没做成，没记味道」；未记/未锁定 → 灰。
 */
function buildMeta(plan: Plan, fb: FeedbackResponse | null): { tags: MetaTag[]; extra: string } {
  const tags: MetaTag[] = []
  let extra = ''
  if (plan.status !== 'COOKED' && plan.status !== 'SKIPPED') {
    tags.push({ cls: 'fm-tag-skip', label: plan.status === 'LOCKED' ? '待反馈' : '未记' })
  } else if (!fb) {
    tags.push({ cls: 'fm-tag-skip', label: '未记' })
  } else if (!fb.didCook) {
    tags.push({ cls: 'fm-tag-skip', label: '没做' })
    extra = '这顿没做成，没记味道'
  } else {
    tags.push({ cls: 'fm-tag-ok', label: '做了' })
    if (fb.taste === 'good') tags.push({ cls: 'fm-tag-ok', label: '好吃' })
    else if (fb.taste === 'ok') tags.push({ cls: 'fm-tag-warn', label: '一般' })
    else if (fb.taste === 'fail') tags.push({ cls: 'fm-tag-hard', label: '翻车' })
    if (fb.willRepeat === true) tags.push({ cls: 'fm-tag-ok', label: '下次还做' })
    else if (fb.willRepeat === false) tags.push({ cls: 'fm-tag-skip', label: '不做了' })
  }
  return { tags, extra }
}

function formatDate(date: Date | string): string {
  const d = new Date(date)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

export default function HistoryPage() {
  const [plans, setPlans] = useState<Plan[]>([])
  const [feedbacks, setFeedbacks] = useState<Record<string, FeedbackResponse | null>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    loadPlans()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadPlans() {
    setLoading(true)
    setError(false)
    try {
      const list = await api.listPlans()
      setPlans(list)
      // C-11：对已记录的 plan 并发取最新反馈（v0.9/T-P12：无反馈响应体即 null；plan 不存在 404 由 getFeedback notFoundAsNull 兜底转 null）
      const recorded = list.filter((p) => p.status === 'COOKED' || p.status === 'SKIPPED')
      const pairs = await Promise.all(
        recorded.map(async (p) => {
          try {
            return [p.id, await api.getFeedback(p.id)] as const
          } catch {
            return [p.id, null] as const
          }
        }),
      )
      const map: Record<string, FeedbackResponse | null> = {}
      for (const [id, fb] of pairs) map[id] = fb
      setFeedbacks(map)
    } catch (e) {
      console.error('[History] loadPlans error', e)
      // 定稿屏⑮：断连明示，不假装空态
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  // 屏⑬ 空态：📔 + 出口去今晚
  if (!loading && !error && plans.length === 0) {
    return (
      <View className="fm-page history-page">
        <View className="fm-h1">吃过的饭</View>
        <EmptyState
          emoji="📔"
          title="还没有记录"
          desc="做完第一顿饭，花十秒记一笔，这里就会长出你们家的吃饭历史。"
          btnText="去定今晚的菜单"
          onBtnClick={() => Taro.reLaunch({ url: '/pages/tonight/index' })}
        />
        <CustomTabBar />
      </View>
    )
  }

  // 屏⑮ 断连：横幅 + 明说不假装 + 重试
  if (!loading && error) {
    return (
      <View className="fm-page history-page">
        <View className="fm-h1">吃过的饭</View>
        <View className="fm-error-banner">⚠ 服务未连接，暂时拿不到记录</View>
        <EmptyState
          emoji="📡"
          title="不假装有数据"
          desc="历史记录需要连接服务才能读取。现在连不上，这一页就是空的——等连接恢复后点「重试」就好。"
          btnText="重试"
          onBtnClick={loadPlans}
        />
        <CustomTabBar />
      </View>
    )
  }

  return (
    <View className="fm-page history-page">
      <View className="fm-h1">吃过的饭</View>
      <Text className="fm-sub">{plans.length} 条记录 · 反馈只用于以后推荐，不评判谁做饭</Text>

      {loading && <Text className="fm-sub">加载中…</Text>}
      {plans.map((plan) => {
        const fb = feedbacks[plan.id] ?? null
        const meta = buildMeta(plan, fb)
        return (
          <View key={plan.id} className="fm-rec">
            <View className="fm-rec-date">{formatDate(plan.planDate)}</View>
            <View className="fm-rec-dishes">
              {plan.dishNames && plan.dishNames.length > 0
                ? plan.dishNames.join(' · ')
                : '（这顿没有锁定菜单）'}
            </View>
            <View className="fm-rec-meta">
              {meta.tags.map((t) => (
                <Text key={t.label} className={`fm-tag ${t.cls}`}>
                  {t.label}
                </Text>
              ))}
              {fb?.actualMinutes !== undefined && (
                <Text>{`约 ${fb.actualMinutes} 分钟`}</Text>
              )}
              {meta.extra && <Text>{meta.extra}</Text>}
            </View>
          </View>
        )
      })}

      <View className="fm-bottom-bar">
        <Button
          className="fm-btn-primary"
          onClick={() => Taro.reLaunch({ url: '/pages/tonight/index' })}
        >
          定今晚的菜单
        </Button>
      </View>
      <CustomTabBar />
    </View>
  )
}
