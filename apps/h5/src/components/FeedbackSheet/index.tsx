// apps/h5/src/components/FeedbackSheet/index.tsx
// S-10 记一笔底部弹层（T-Q13，C-5）：首页餐卡与 S-09 做法页共用。
// 只记当前 plan + slot；三问必选 + 耗时选填；已有反馈预填原值；提交成功后
// 以 GET feedback 回读为准再通知父级，失败保留已选与弹层，可重试。
import { useEffect, useState } from 'react'
import Taro from '@tarojs/taro'
import { View, Text } from '@tarojs/components'
import { Button, Popup } from '@nutui/nutui-react-taro'
import type { FeedbackResponse, MealSlot } from '@family-menu/shared'
import { MEAL_SLOT_LABELS } from '@family-menu/shared'
import { planApi, UnauthorizedError } from '../../api/client'
import {
  actualMinutesLabel,
  actualMinuteOptions,
  buildFeedbackRequest,
  chooseDidCook,
  initFeedbackDraft,
  validateFeedbackDraft,
  type FeedbackDraft,
} from '../../lib/feedback'

interface FeedbackSheetProps {
  visible: boolean
  planId: string
  slot: MealSlot
  initialFeedback: FeedbackResponse | null
  onClose: () => void
  onSubmitted: (feedback: FeedbackResponse) => void
}

function errorText(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback
}

export default function FeedbackSheet({
  visible,
  planId,
  slot,
  initialFeedback,
  onClose,
  onSubmitted,
}: FeedbackSheetProps) {
  const [draft, setDraft] = useState<FeedbackDraft>(() => initFeedbackDraft(initialFeedback))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingReadback, setPendingReadback] = useState(false)

  // 每次打开按服务端已有反馈预填；关闭后再开不沿用上一次的临时选择
  useEffect(() => {
    if (!visible) return
    setDraft(initFeedbackDraft(initialFeedback))
    setSubmitting(false)
    setError(null)
    setPendingReadback(false)
  }, [visible, slot, initialFeedback])

  function handleClose() {
    if (submitting) {
      Taro.showToast({ title: '正在保存，稍等', icon: 'none' })
      return
    }
    onClose()
  }

  /** 提交成功后回读：以服务端反馈为准更新父级标签；回读失败只重读，不重复写 */
  async function readBack() {
    setSubmitting(true)
    setError(null)
    try {
      const fb = await planApi.getFeedback(planId, slot)
      if (!fb) throw new Error('服务没返回这次评价')
      setSubmitting(false)
      onSubmitted(fb)
      Taro.showToast({ title: '记好了', icon: 'success' })
      onClose()
    } catch (e) {
      if (e instanceof UnauthorizedError) {
        setSubmitting(false)
        return
      }
      console.error('[FeedbackSheet] 回读评价失败', e)
      setPendingReadback(true)
      setError(`记下了，但没读回来：${errorText(e, '请稍后重试')}`)
      setSubmitting(false)
    }
  }

  async function handleSubmit() {
    const missing = validateFeedbackDraft(draft)
    if (missing) {
      Taro.showToast({ title: missing, icon: 'none' })
      return
    }
    setSubmitting(true)
    setError(null)
    setPendingReadback(false)
    try {
      await planApi.submitFeedback(planId, buildFeedbackRequest(draft, slot))
    } catch (e) {
      if (e instanceof UnauthorizedError) {
        setSubmitting(false)
        return
      }
      console.error('[FeedbackSheet] 反馈提交失败', e)
      setError(`没保存上：${errorText(e, '请重试')}`)
      setSubmitting(false)
      return
    }
    setSubmitting(false)
    await readBack()
  }

  function retry() {
    if (submitting) return
    if (pendingReadback) {
      void readBack()
      return
    }
    void handleSubmit()
  }

  function optionClass(on: boolean): string {
    return on ? 'opt on' : 'opt'
  }

  const minuteOptions = actualMinuteOptions(draft.actualMinutes)

  return (
    <Popup visible={visible} position="bottom" round onClose={handleClose}>
      <View className="sheet-body">
        <View className="sheet-grab" />
        <View className="sheet-title">{MEAL_SLOT_LABELS[slot]}吃得怎么样？</View>
        <View className="sheet-sub">只记这一餐 · 评价可选，漏评不追</View>

        <View className="q">
          <View className="q-title">做了没？</View>
          <View className="opts">
            <View
              className={optionClass(draft.didCook === true)}
              onClick={() => setDraft((d) => chooseDidCook(d, true))}
            >
              做了
            </View>
            <View
              className={optionClass(draft.didCook === false)}
              onClick={() => setDraft((d) => chooseDidCook(d, false))}
            >
              没做
            </View>
          </View>
        </View>

        {draft.didCook === true && (
          <View className="q">
            <View className="q-title">好吃吗？</View>
            <View className="opts">
              <View
                className={optionClass(draft.taste === 'good')}
                onClick={() => setDraft((d) => ({ ...d, taste: 'good' }))}
              >
                好吃
              </View>
              <View
                className={optionClass(draft.taste === 'ok')}
                onClick={() => setDraft((d) => ({ ...d, taste: 'ok' }))}
              >
                一般
              </View>
              <View
                className={optionClass(draft.taste === 'fail')}
                onClick={() => setDraft((d) => ({ ...d, taste: 'fail' }))}
              >
                翻车
              </View>
            </View>
          </View>
        )}

        <View className="q">
          <View className="q-title">下次还做吗？</View>
          <View className="opts">
            <View
              className={optionClass(draft.willRepeat === true)}
              onClick={() => setDraft((d) => ({ ...d, willRepeat: true }))}
            >
              还做
            </View>
            <View
              className={optionClass(draft.willRepeat === false)}
              onClick={() => setDraft((d) => ({ ...d, willRepeat: false }))}
            >
              不做了
            </View>
          </View>
        </View>

        {draft.didCook === true && (
          <View className="q">
            <View className="q-title">
              实际耗时 <Text className="q-note">选填</Text>
            </View>
            <View className="opts">
              {minuteOptions.map((m) => (
                <View
                  className={optionClass(draft.actualMinutes === m)}
                  key={m}
                  onClick={() =>
                    setDraft((d) => ({ ...d, actualMinutes: d.actualMinutes === m ? null : m }))
                  }
                >
                  {actualMinutesLabel(m)}
                </View>
              ))}
            </View>
          </View>
        )}

        {error && (
          <View className="banner banner-warn mt-3">
            <Text>{error}</Text>
            <Text className="act" onClick={retry}>
              {pendingReadback ? '重读' : '重试'}
            </Text>
          </View>
        )}

        <View className="btn-row">
          <Button className="btn-plain" disabled={submitting} onClick={handleClose}>
            取消
          </Button>
          <Button className="btn-main" loading={submitting} disabled={submitting} onClick={handleSubmit}>
            {submitting ? '正在保存…' : '提交'}
          </Button>
        </View>
      </View>
    </Popup>
  )
}
