// apps/h5/src/pages/history/index.tsx
// F7 历史（/pages/history，Tab）—— TP-05/DEC-015 重写为 C-11 历史列表：
// 旧五项反馈表单移除（C-10：反馈统一走 /pages/feedback 三问页）；
// 列表=日期/菜名/结果标签（绿=做了·好吃·还做 / 黄=一般 / 红=翻车 / 灰=没做·不做了·未记）
// + 「约 N 分钟」（记了耗时才显示）+ 顶部「N 条记录 · 反馈只用于以后推荐，不评判谁做饭」。
import { useEffect, useState } from 'react'
import Taro from '@tarojs/taro'
import { View, Text, ScrollView } from '@tarojs/components'
import { Button, Tag } from '@nutui/nutui-react-taro'
import { api } from '../../api/client'
import CustomTabBar from '../../components/CustomTabBar'
import EmptyState from '../../components/EmptyState'
import type { Plan } from '@family-menu/shared'
import type { FeedbackResponse } from '../../types'
import emptyImage from '../../assets/asset-history-empty@2x.png'
import './index.css'

/** C-11 结果标签（DEC-015 裁决 5 派生色：红>黄>灰>绿，味道事实优先于意愿） */
const RESULT_TAG_TYPE: Record<string, string> = {
  ok: 'success', // 绿
  warn: 'warning', // 黄
  bad: 'danger', // 红
  skip: 'default', // 灰
}

/** 对单条 plan 派生 C-11 结果标签：颜色 + 短文案 + 「约 N 分钟」 */
function deriveResultTag(plan: Plan, fb: FeedbackResponse | null) {
  if (plan.status !== 'COOKED' && plan.status !== 'SKIPPED') {
    return { color: 'skip', label: plan.status === 'LOCKED' ? '待反馈' : '未记' }
  }
  if (!fb) return { color: 'skip', label: '未记' } // 事件流无反馈，如实降级
  if (fb.didCook && fb.taste === 'fail') return { color: 'bad', label: '翻车' }
  if (fb.didCook && fb.taste === 'ok') return { color: 'warn', label: '一般' }
  if (!fb.didCook || fb.willRepeat === false) {
    return { color: 'skip', label: fb.didCook ? '不做了' : '没做' }
  }
  return { color: 'ok', label: '做了·好吃' }
}

export default function HistoryPage() {
  const [plans, setPlans] = useState<Plan[]>([])
  const [feedbacks, setFeedbacks] = useState<Record<string, FeedbackResponse | null>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadPlans()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadPlans() {
    try {
      const list = await api.listPlans()
      setPlans(list)
      // C-11：对已记录的 plan 并发取最新反馈（404=未记，getFeedback 已把 404 转 null）
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
    } finally {
      setLoading(false)
    }
  }

  async function handleRepeat(planId: string) {
    try {
      await api.repeatPlan(planId)
      Taro.showToast({ title: '已生成新计划', icon: 'success' })
      setTimeout(() => Taro.reLaunch({ url: '/pages/tonight/index' }), 500)
    } catch (e) {
      console.error('[History] repeat error', e)
      Taro.showToast({ title: '复做失败，重试', icon: 'none' })
    }
  }

  function getMenuName(plan: Plan): string {
    const menuId = plan.lockedMenuId
    return menuId ? `菜单${menuId.slice(-4)}` : '未锁定'
  }

  function formatDate(date: Date): string {
    const d = new Date(date)
    return `${d.getMonth() + 1}-${d.getDate().toString().padStart(2, '0')}`
  }

  // 空状态（无死胡同，wireframes 第405行）
  if (!loading && plans.length === 0) {
    return (
      <View className="fm-page history-page">
        <View className="fm-page-header">
          <Text className="fm-page-title">历史记录</Text>
        </View>
        <EmptyState
          image={emptyImage}
          title="还没有做饭记录"
          desc="定今晚吃什么，开始记录吧"
          btnText="定今晚吃什么"
          onBtnClick={() => Taro.reLaunch({ url: '/pages/tonight/index' })}
        />
        <View style={{ height: '120px' }} />
        <CustomTabBar />
      </View>
    )
  }

  return (
    <View className="fm-page history-page">
      <View className="fm-page-header">
        <Text className="fm-page-title">历史记录</Text>
        <Text className="fm-history-meta">
          {plans.length} 条记录 · 反馈只用于以后推荐，不评判谁做饭
        </Text>
      </View>

      <ScrollView scrollY className="fm-history-scroll">
        {plans.map((plan) => {
          const fb = feedbacks[plan.id] ?? null
          const tag = deriveResultTag(plan, fb)
          return (
            <View key={plan.id} className="fm-card fm-history-item">
              <View className="fm-history-row">
                <Text className="fm-history-date">{formatDate(plan.planDate)}</Text>
                <View className="fm-history-main">
                  <Text className="fm-history-name">{getMenuName(plan)}</Text>
                  <View className="fm-history-result">
                    <Tag type={RESULT_TAG_TYPE[tag.color] as never}>{tag.label}</Tag>
                    {fb?.actualMinutes !== undefined && (
                      <Text className="fm-history-minutes">约 {fb.actualMinutes} 分钟</Text>
                    )}
                  </View>
                </View>
                <Button size="small" onClick={() => handleRepeat(plan.id)}>
                  复做
                </Button>
              </View>
            </View>
          )
        })}
      </ScrollView>

      <View style={{ height: '120px' }} />
      <CustomTabBar />
    </View>
  )
}
