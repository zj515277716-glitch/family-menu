// apps/h5/src/pages/feedback/index.tsx
// F6 反馈三问（/pages/feedback，流式页，TP-05/DEC-015 契约 v0.6，对应 C-10/PD-006）
// 对齐 e-final.html 屏⑨（三问填写）/屏⑩（成功复述）：
// ①做了吗 ②味道怎么样（做了才问） ③下次还做吗 + 耗时选填；
// 同一天再次进入显示已提交答案、可修改重提；提交失败「没记上」已选答案不丢；
// 文案原则：「反馈只用于以后推荐，不评判谁做饭」。
import { useEffect, useState } from 'react'
import Taro, { useDidShow } from '@tarojs/taro'
import { View, Text } from '@tarojs/components'
import { NavBar, Button, Input } from '@nutui/nutui-react-taro'
import { ArrowLeft } from '@nutui/icons-react-taro'
import { api } from '../../api/client'
import { useStore } from '../../store'
import type { Taste } from '../../types'
import './index.css'

export default function FeedbackPage() {
  const { currentPlanId } = useStore()

  const [planId, setPlanId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitted, setSubmitted] = useState(false)
  // 已提交过（C-10：再次进入显示已提交答案，可修改重提）
  const [alreadyAnswered, setAlreadyAnswered] = useState(false)

  // 三问答案（回显/重提共用同一状态）
  const [didCook, setDidCook] = useState<boolean | null>(null)
  const [taste, setTaste] = useState<Taste | null>(null)
  const [willRepeat, setWillRepeat] = useState<boolean | null>(null)
  const [actualMinutes, setActualMinutes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    resolvePlan()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 每次进入页面都重新拉取（从历史页/今晚页跳转回来时状态最新）
  useDidShow(() => {
    if (planId && !submitted) loadFeedback(planId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  })

  async function resolvePlan() {
    // 计划 id：路由参数 > 会话态 > 最近一条活动/已记录计划
    const params = Taro.getCurrentInstance().router?.params
    const fromRoute = typeof params?.planId === 'string' ? params.planId : null
    let id = fromRoute || currentPlanId
    if (!id) {
      try {
        const list = await api.listPlans()
        const target =
          list.find((p) => p.id === currentPlanId) ||
          list.find((p) => p.status === 'LOCKED') ||
          list.find((p) => p.status === 'COOKED') ||
          list.find((p) => p.status === 'SKIPPED')
        id = target?.id ?? null
      } catch (e) {
        console.error('[Feedback] listPlans error', e)
      }
    }
    setPlanId(id)
    await loadFeedback(id)
  }

  async function loadFeedback(id: string | null) {
    if (!id) {
      setLoading(false)
      return
    }
    try {
      // 404 = 无反馈 -> 空表单（getFeedback 内部已把 404 转为 null）
      const fb = await api.getFeedback(id)
      if (fb) {
        setDidCook(fb.didCook)
        setTaste(fb.taste ?? null)
        setWillRepeat(fb.willRepeat ?? null)
        setActualMinutes(fb.actualMinutes !== undefined ? String(fb.actualMinutes) : '')
        setAlreadyAnswered(true)
      } else {
        setAlreadyAnswered(false)
      }
    } catch (e) {
      console.error('[Feedback] getFeedback error', e)
    } finally {
      setLoading(false)
    }
  }

  // 三问全答才可提交（第②问做了才答；没做时 taste 置空由契约 superRefine 双向兜底）
  const canSubmit =
    didCook !== null && willRepeat !== null && (didCook === false || taste !== null)

  async function submit() {
    if (!planId || !canSubmit || submitting) return
    setSubmitting(true)
    try {
      const body = {
        didCook: didCook as boolean,
        taste: didCook ? (taste as Taste) : undefined,
        willRepeat: willRepeat as boolean,
        actualMinutes: actualMinutes ? Number(actualMinutes) : undefined,
      }
      await api.addFeedback(planId, body)
      setSubmitted(true)
    } catch (e) {
      console.error('[Feedback] submit error', e)
      // C-10：提交失败提示「没记上」，已选答案不丢，可直接再提交
      Taro.showToast({ title: '没记上，答案还在，再试一次', icon: 'none' })
    } finally {
      setSubmitting(false)
    }
  }

  function summaryText(): string {
    const parts: string[] = []
    parts.push(didCook ? '做了' : '没做')
    if (didCook && taste) parts.push(taste === 'good' ? '好吃' : taste === 'ok' ? '一般' : '翻车')
    parts.push(willRepeat ? '下次还做' : '不做了')
    return parts.join(' · ')
  }

  // ── 屏⑩：成功复述态 ──
  if (submitted) {
    const now = new Date()
    return (
      <View className="fm-page feedback-page">
        <NavBar
          title="反馈"
          back={<ArrowLeft width={16} height={16} />}
          onBackClick={() => Taro.reLaunch({ url: '/pages/tonight/index' })}
        />
        <View className="fm-done-wrap">
          <View className="fm-done-ico">✓</View>
          <Text className="fm-done-title">记好了</Text>
          <Text className="fm-done-text">
            {now.getMonth() + 1}月{now.getDate()}日这顿已记下：{summaryText()}。
            {'\n'}反馈只用于以后推荐，不评判谁做饭。
          </Text>
        </View>
        <Button type="primary" block onClick={() => Taro.reLaunch({ url: '/pages/tonight/index' })}>
          回今晚
        </Button>
        <Button
          plain
          block
          style={{ marginTop: '12px' }}
          onClick={() => Taro.reLaunch({ url: '/pages/history/index' })}
        >
          看看历史
        </Button>
      </View>
    )
  }

  // ── 屏⑨：三问填写态 ──
  return (
    <View className="fm-page feedback-page">
      <NavBar
        title="反馈"
        back={<ArrowLeft width={16} height={16} />}
        onBackClick={() => Taro.navigateBack({ delta: 1 })}
      />

      <Text className="fm-fb-title">今晚吃得怎么样？</Text>
      <Text className="fm-fb-sub">
        {alreadyAnswered
          ? '今天已记过一次，改完再交一次就行'
          : '三个问题，十秒答完'}
      </Text>

      {loading && <Text className="fm-fb-sub">加载中…</Text>}

      {!loading && !planId && (
        <View className="fm-card fm-fb-noplan">
          <Text className="fm-fb-noplan-text">还没有可反馈的这顿饭</Text>
          <Button
            type="primary"
            block
            style={{ marginTop: '16px' }}
            onClick={() => Taro.reLaunch({ url: '/pages/tonight/index' })}
          >
            去定今晚吃什么
          </Button>
        </View>
      )}

      {!loading && planId && (
        <View>
          {/* ① 做了吗 */}
          <Text className="fm-fb-q">① 今天这顿做了吗？</Text>
          <View className="fm-fb-opts">
            <View
              className={`fm-fb-opt${didCook === true ? ' on' : ''}`}
              onClick={() => setDidCook(true)}
            >
              做了
            </View>
            <View
              className={`fm-fb-opt${didCook === false ? ' on' : ''}`}
              onClick={() => {
                setDidCook(false)
                setTaste(null) // 没做不答味道（契约：禁传）
              }}
            >
              没做
            </View>
          </View>

          {/* ② 味道怎么样（做了才问） */}
          {didCook === true && (
            <View>
              <Text className="fm-fb-q">② 味道怎么样？</Text>
              <View className="fm-fb-opts">
                <View
                  className={`fm-fb-opt${taste === 'good' ? ' on' : ''}`}
                  onClick={() => setTaste('good')}
                >
                  好吃
                </View>
                <View
                  className={`fm-fb-opt warn${taste === 'ok' ? ' on' : ''}`}
                  onClick={() => setTaste('ok')}
                >
                  一般
                </View>
                <View
                  className={`fm-fb-opt bad${taste === 'fail' ? ' on' : ''}`}
                  onClick={() => setTaste('fail')}
                >
                  翻车
                </View>
              </View>
            </View>
          )}

          {/* ③ 下次还做吗（没做也答） */}
          <Text className="fm-fb-q">③ 下次还做吗？</Text>
          <View className="fm-fb-opts">
            <View
              className={`fm-fb-opt${willRepeat === true ? ' on' : ''}`}
              onClick={() => setWillRepeat(true)}
            >
              还做
            </View>
            <View
              className={`fm-fb-opt${willRepeat === false ? ' on' : ''}`}
              onClick={() => setWillRepeat(false)}
            >
              不做了
            </View>
          </View>

          {/* 耗时（选填，PD-006） */}
          <View className="fm-card fm-fb-minutes">
            <Text className="fm-fb-minutes-label">实际用时（选填）</Text>
            <Input
              type="number"
              placeholder="如：30 分钟"
              value={actualMinutes}
              onChange={(v) => setActualMinutes(v)}
            />
          </View>

          <Button
            type="primary"
            block
            loading={submitting}
            disabled={!canSubmit}
            onClick={submit}
            style={{ marginTop: '24px' }}
          >
            提交反馈
          </Button>
          <Text className="fm-fb-footer">反馈只用于以后推荐，不评判谁做饭</Text>
        </View>
      )}
    </View>
  )
}
