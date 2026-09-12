// apps/h5/src/pages/feedback/index.tsx
// F6 反馈三问（/pages/feedback，TP-05/DEC-015 契约 v0.6，对应 C-10/PD-006）
// 对齐 e-final 屏⑨（三问填写）/屏⑩（成功复述）：
// ①做了吗 ②味道怎么样（做了才问） ③下次还做吗 + 耗时选填；
// 同一天再次进入显示已提交答案、可修改重提；提交失败「没记上」已选答案不丢；
// 文案原则：「反馈只用于以后推荐，不评判谁做饭」。
// 样式全部复用 app.css 公共类（fm-q-title/fm-opts/fm-opt 三态/fm-done-*），本页只留差异。
import { useEffect, useState } from 'react'
import Taro, { useDidShow } from '@tarojs/taro'
import { View, Text, Input } from '@tarojs/components'
import { Button } from '@nutui/nutui-react-taro'
import { api } from '../../api/client'
import { useStore } from '../../store'
import EmptyState from '../../components/EmptyState'
import type { Taste } from '../../types'
import './index.css'

export default function FeedbackPage() {
  const { currentPlanId, lockedMenu } = useStore()

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
      // v0.9/T-P12：plan 存在但无反馈时响应体即 JSON null -> 空表单（plan 不存在仍 404，getFeedback 的 notFoundAsNull 兜底转 null）
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

  const backOut = () => {
    const pages = Taro.getCurrentPages()
    if (pages.length > 1) Taro.navigateBack()
    else Taro.reLaunch({ url: '/pages/tonight/index' })
  }

  // ── 屏⑩：成功复述态（大绿圆 ✓，app.css 公共类） ──
  if (submitted) {
    const now = new Date()
    return (
      <View className="fm-page feedback-page">
        <View className="fm-done-wrap">
          <View className="fm-done-ico">✓</View>
          <Text className="fm-done-title">记好了</Text>
          <Text className="fm-done-text">
            {now.getMonth() + 1}月{now.getDate()}日这顿已记下：{summaryText()}。
            {'\n'}反馈只用于以后推荐，不评判谁做饭。
          </Text>
        </View>
        <Button
          className="fm-btn-primary"
          onClick={() => Taro.reLaunch({ url: '/pages/tonight/index' })}
        >
          回今晚
        </Button>
        <Button
          className="fm-btn-ghost"
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
      <Text className="fm-back" onClick={backOut}>
        {'‹ 返回'}
      </Text>
      <View className="fm-h1">今晚吃得怎么样？</View>
      <Text className="fm-sub">
        {alreadyAnswered
          ? `${lockedMenu?.name ? `${lockedMenu.name} · ` : ''}今天已记过一次，改完再交一次就行`
          : `${lockedMenu?.name ? `${lockedMenu.name} · ` : ''}三个问题，十秒答完`}
      </Text>

      {loading && <Text className="fm-sub">加载中…</Text>}

      {!loading && !planId && (
        <EmptyState
          emoji="🧾"
          title="还没有可反馈的这顿饭"
          desc="先定好今晚的菜单，吃完饭回来就能记一笔。"
          btnText="去定今晚吃什么"
          onBtnClick={() => Taro.reLaunch({ url: '/pages/tonight/index' })}
        />
      )}

      {!loading && planId && (
        <View>
          {/* ① 做了吗 */}
          <View className="fm-q-title">① 今天这顿做了吗？</View>
          <View className="fm-opts">
            <View
              className={`fm-opt${didCook === true ? ' on' : ''}`}
              onClick={() => setDidCook(true)}
            >
              做了
            </View>
            <View
              className={`fm-opt${didCook === false ? ' on' : ''}`}
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
              <View className="fm-q-title">② 味道怎么样？</View>
              <View className="fm-opts">
                <View
                  className={`fm-opt${taste === 'good' ? ' on' : ''}`}
                  onClick={() => setTaste('good')}
                >
                  好吃
                </View>
                <View
                  className={`fm-opt fm-opt-warn${taste === 'ok' ? ' on' : ''}`}
                  onClick={() => setTaste('ok')}
                >
                  一般
                </View>
                <View
                  className={`fm-opt fm-opt-bad${taste === 'fail' ? ' on' : ''}`}
                  onClick={() => setTaste('fail')}
                >
                  翻车
                </View>
              </View>
            </View>
          )}

          {/* ③ 下次还做吗（没做也答） */}
          <View className="fm-q-title">③ 下次还做吗？</View>
          <View className="fm-opts">
            <View
              className={`fm-opt${willRepeat === true ? ' on' : ''}`}
              onClick={() => setWillRepeat(true)}
            >
              还做
            </View>
            <View
              className={`fm-opt${willRepeat === false ? ' on' : ''}`}
              onClick={() => setWillRepeat(false)}
            >
              不做了
            </View>
          </View>

          {/* 耗时（选填，PD-006） */}
          <View className="fm-card fm-fb-minutes">
            <Text className="fm-row-label fm-fb-minutes-label">实际用时（选填）</Text>
            <Input
              className="fm-input"
              type="number"
              placeholder="如：30 分钟"
              value={actualMinutes}
              onInput={(e) => setActualMinutes(e.detail.value)}
            />
          </View>

          <Button
            className="fm-btn-primary"
            loading={submitting}
            disabled={!canSubmit}
            onClick={submit}
          >
            提交反馈
          </Button>
          <Text className="fm-fb-footer">反馈只用于以后推荐，不评判谁做饭</Text>
        </View>
      )}
    </View>
  )
}
