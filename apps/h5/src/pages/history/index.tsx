// apps/h5/src/pages/history/index.tsx
// F6/F7 反馈 + 历史（/pages/history，Tab）
// 对齐 wireframes.md 第318-405行：反馈表单/历史列表/复做/空状态
import { useEffect, useState } from 'react'
import Taro from '@tarojs/taro'
import { View, Text, Image, ScrollView } from '@tarojs/components'
import {
  Radio,
  RadioGroup,
  Input,
  Tag,
  Switch,
  Button,
} from '@nutui/nutui-react-taro'
import { api, isMockMode } from '../../api/client'
import { useStore } from '../../store'
import CustomTabBar from '../../components/CustomTabBar'
import EmptyState from '../../components/EmptyState'
import { mockMenuMap } from '../../api/mock'
import type { Plan, FeedbackResult, PlanStatus } from '@family-menu/shared'
import emptyImage from '../../assets/asset-history-empty@2x.png'
import feedbackSuccessImage from '../../assets/asset-history-feedback-success@2x.png'
import './index.css'

const STATUS_LABELS: Record<PlanStatus, string> = {
  PROPOSED: '待定',
  LOCKED: '已锁定',
  COOKED: '已做',
  SKIPPED: '已跳过',
}
const STATUS_TAG_TYPE: Record<PlanStatus, string> = {
  PROPOSED: 'primary',
  LOCKED: 'warning',
  COOKED: 'success',
  SKIPPED: 'default',
}
const FAIL_REASONS = ['太耗时', '调味不对', '食材不够', '其他']

export default function HistoryPage() {
  const { currentPlanId } = useStore()
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [feedbackPlanId, setFeedbackPlanId] = useState<string | null>(null)
  const [cooked, setCooked] = useState<'yes' | 'no'>('yes')
  const [actualMinutes, setActualMinutes] = useState('')
  const [cookResult, setCookResult] = useState<'success' | 'partial' | 'fail'>('success')
  const [failReason, setFailReason] = useState('')
  const [willRepeat, setWillRepeat] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [feedbackSuccess, setFeedbackSuccess] = useState(false)

  useEffect(() => {
    loadPlans()
  }, [])

  async function loadPlans() {
    try {
      const list = await api.listPlans()
      setPlans(list)
      const target =
        list.find((p) => p.id === currentPlanId) ||
        list.find((p) => p.status === 'LOCKED')
      if (target) setFeedbackPlanId(target.id)
    } catch (e) {
      console.error('[History] loadPlans error', e)
    } finally {
      setLoading(false)
    }
  }

  async function submitFeedback() {
    if (!feedbackPlanId) return
    setSubmitting(true)
    let result: FeedbackResult
    if (cooked === 'no') {
      result = 'not_cooked'
    } else if (willRepeat) {
      result = 'repeat'
    } else {
      result = 'cooked'
    }
    try {
      const minutes = actualMinutes ? Number(actualMinutes) : undefined
      await api.addFeedback(feedbackPlanId, result, minutes)
      setFeedbackSuccess(true)
      setActualMinutes('')
      setWillRepeat(false)
      setCooked('yes')
      setTimeout(() => {
        setFeedbackSuccess(false)
        setFeedbackPlanId(null)
        loadPlans()
      }, 1500)
    } catch (e) {
      console.error('[History] feedback error', e)
      Taro.showToast({ title: '提交失败，重试', icon: 'none' })
    } finally {
      setSubmitting(false)
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
    if (isMockMode && menuId && mockMenuMap[menuId]) return mockMenuMap[menuId].name
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
          <Text className="fm-page-title">历史与反馈</Text>
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
        <Text className="fm-page-title">历史与反馈</Text>
      </View>

      {/* 今日计划状态条 + 反馈表单 */}
      {feedbackPlanId && (
        <View className="fm-card fm-feedback-form">
          <Text className="fm-feedback-title">烹饪反馈</Text>
          <Text className="fm-label">做了吗？</Text>
          <RadioGroup
            value={cooked}
            direction="horizontal"
            onChange={(v) => setCooked(v as 'yes' | 'no')}
          >
            <Radio value="yes">做了</Radio>
            <Radio value="no">没做</Radio>
          </RadioGroup>

          {cooked === 'yes' && (
            <View className="fm-feedback-expand">
              <Text className="fm-label">实际耗时（分钟）</Text>
              <Input
                type="number"
                placeholder="如 32"
                value={actualMinutes}
                onChange={(v) => setActualMinutes(v)}
              />
              <Text className="fm-label">结果</Text>
              <RadioGroup
                value={cookResult}
                direction="horizontal"
                onChange={(v) => setCookResult(v as 'success' | 'partial' | 'fail')}
              >
                <Radio value="success">成功</Radio>
                <Radio value="partial">部分成功</Radio>
                <Radio value="fail">失败</Radio>
              </RadioGroup>
              {cookResult !== 'success' && (
                <View className="fm-fail-reasons">
                  <Text className="fm-label">失败原因</Text>
                  <View className="fm-tag-row">
                    {FAIL_REASONS.map((r) => (
                      <Tag
                        key={r}
                        type={failReason === r ? 'primary' : 'default'}
                        onClick={() => setFailReason(r)}
                      >
                        {r}
                      </Tag>
                    ))}
                  </View>
                </View>
              )}
              <View className="fm-switch-row">
                <Text className="fm-label">下次还做？</Text>
                <Switch checked={willRepeat} onChange={(v) => setWillRepeat(!!v)} />
              </View>
            </View>
          )}

          <Button
            type="primary"
            block
            loading={submitting}
            onClick={submitFeedback}
            style={{ marginTop: '16px' }}
          >
            提交反馈
          </Button>
        </View>
      )}

      {/* 历史记录列表 */}
      <Text className="fm-section-title">历史记录</Text>
      <ScrollView scrollY className="fm-history-scroll">
        {plans.map((plan) => (
          <View key={plan.id} className="fm-card fm-history-item">
            <View className="fm-history-row">
              <Text className="fm-history-date">{formatDate(plan.planDate)}</Text>
              <Text className="fm-history-name">{getMenuName(plan)}</Text>
              <Tag type={STATUS_TAG_TYPE[plan.status] as never}>
                {STATUS_LABELS[plan.status]}
              </Tag>
            </View>
            <Button size="small" onClick={() => handleRepeat(plan.id)}>
              复做
            </Button>
          </View>
        ))}
      </ScrollView>

      {feedbackSuccess && (
        <View className="fm-lock-success-mask">
          <Image
            src={feedbackSuccessImage}
            mode="aspectFit"
            className="fm-lock-success-img"
          />
          <Text className="fm-lock-success-text">反馈已记录</Text>
        </View>
      )}

      <View style={{ height: '120px' }} />
      <CustomTabBar />
    </View>
  )
}
