// apps/h5/src/pages/tonight/index.tsx
// F2 今晚情境（/pages/tonight，首页 Tab）
// UI 定稿对齐：e-final 屏①（设置·必消）/ 屏⑥（空手）/ 屏⑮（未连接）——PD-011
import { useEffect, useState } from 'react'
import Taro from '@tarojs/taro'
import { View, Text, Input } from '@tarojs/components'
import { Button } from '@nutui/nutui-react-taro'
import { api } from '../../api/client'
import { useStore } from '../../store'
import CustomTabBar from '../../components/CustomTabBar'
import { TIME_BUDGETS } from '@family-menu/shared'
import type { ExclusionRule } from '@family-menu/shared'
import './index.css'

export default function TonightPage() {
  const {
    tonightContext,
    setTonightPeople,
    setTonightTimeBudget,
    setTonightMustUse,
    setCandidates,
    setCurrentPlanId,
    familyRule,
  } = useStore()
  const [mustUseInput, setMustUseInput] = useState('')
  const [loading, setLoading] = useState(false)
  // TP-02 空手状态：保存 API 回传的"消耗不了的必消食材"（用户原文）；null=非空手
  const [emptyReason, setEmptyReason] = useState<string[] | null>(null)
  // 定稿屏⑮：推荐失败 -> 页内错误视图（横幅+重试），不再用 toast
  const [connError, setConnError] = useState(false)
  // 定稿屏① sub 行：忌口信息来自禁忌规则
  const [exclusions, setExclusions] = useState<ExclusionRule[]>([])

  // 首次启动检测：无 FamilyRule -> 强制跳 setup（wireframes 第32行）
  useEffect(() => {
    const state = useStore.getState()
    if (!state.familyRuleLoaded) {
      api
        .getFamilyRules()
        .then((rule) => {
          state.setFamilyRule(rule)
          if (!rule) {
            Taro.reLaunch({ url: '/pages/setup/index' })
          }
        })
        .catch(() => {
          // 首屏规则拉取失败不弹错：推荐时统一走屏⑮明示未连接
        })
    }
    api
      .getExclusions()
      .then(setExclusions)
      .catch(() => setExclusions([]))
  }, [])

  function addMustUse() {
    const v = mustUseInput.trim()
    if (!v) return
    if (tonightContext.mustUse.length >= 3) {
      Taro.showToast({ title: '最多3个食材', icon: 'none' })
      return
    }
    if (tonightContext.mustUse.includes(v)) return
    setTonightMustUse([...tonightContext.mustUse, v])
    setMustUseInput('')
  }

  function removeMustUse(item: string) {
    setTonightMustUse(tonightContext.mustUse.filter((x) => x !== item))
  }

  function decPeople() {
    if (tonightContext.people > 1) setTonightPeople(tonightContext.people - 1)
  }

  function incPeople() {
    if (tonightContext.people < 20) setTonightPeople(tonightContext.people + 1)
  }

  function goHistory() {
    Taro.reLaunch({ url: '/pages/history/index' })
  }

  // TP-02：推荐 + 空手处理（C-7）。candidates 为空时不跳转，页内展示空手说明
  async function runRecommend(mustUse: string[]) {
    setLoading(true)
    setConnError(false)
    try {
      const result = await api.recommend({ ...tonightContext, mustUse })
      if (result.candidates.length === 0) {
        // 空手（PD-001）：unmetMustUse = 消耗不了的必消原文；可能为空（必消能分别被
        // 不同菜单消耗、但没有一整套同时用上全部——DEC-012 兜底场景）
        setEmptyReason(result.unmetMustUse ?? [])
        return
      }
      setEmptyReason(null)
      setCandidates(result.candidates)
      setCurrentPlanId(result.planId ?? null)
      Taro.navigateTo({ url: '/pages/candidates/index' })
    } catch (e) {
      console.error('[Tonight] recommend error', e)
      setConnError(true)
    } finally {
      setLoading(false)
    }
  }

  async function handleRecommend() {
    await runRecommend(tonightContext.mustUse)
  }

  // 空手卡「去掉X再试」：移除消耗不了的必消，按剩余必消重新推荐
  function handleRetryWithoutUnmet() {
    if (!emptyReason || emptyReason.length === 0) return
    const remaining = tonightContext.mustUse.filter((x) => !emptyReason.includes(x))
    setTonightMustUse(remaining)
    runRecommend(remaining)
  }

  // 空手卡「返回修改必消食材」：关闭卡片回到表单
  function handleBackToEdit() {
    setEmptyReason(null)
  }

  // 定稿屏① sub 行：菜系 + 忌口（硬=过敏 / 软=不吃）；屏⑥ 空手时显示必消清单
  function buildSub(): string {
    if (emptyReason !== null) {
      return tonightContext.mustUse.length > 0
        ? `必消食材：${tonightContext.mustUse.join('、')}`
        : ''
    }
    const parts: string[] = []
    if (familyRule?.cuisines.length) parts.push(familyRule.cuisines.join('/'))
    const hard = exclusions
      .filter((e) => e.severity === 'HARD')
      .map((e) => e.targetId || e.targetTag || '')
      .filter(Boolean)
    const soft = exclusions
      .filter((e) => e.severity === 'SOFT')
      .map((e) => e.targetId || e.targetTag || '')
      .filter(Boolean)
    const avoid = [
      ...hard.map((n) => `${n}（过敏）`),
      ...soft.map((n) => `${n}（不吃）`),
    ]
    if (avoid.length) parts.push(`忌口：${avoid.join('、')}`)
    return parts.join(' · ')
  }

  const subLine = buildSub()

  return (
    <View className="fm-page tonight-page">
      <Text className="fm-h1">今晚吃什么</Text>
      {subLine && <Text className="fm-sub">{subLine}</Text>}
      <View style={{ height: '32px' }} />

      {connError ? (
        // 定稿屏⑮：未连接——横幅 + 明说不假装 + 重试
        <>
          <View className="fm-error-banner">⚠ 服务未连接，暂时拿不到菜单</View>
          <View className="fm-card fm-empty">
            <View className="fm-empty-emoji">📡</View>
            <View className="fm-empty-title">不假装有数据</View>
            <View className="fm-empty-text">
              推荐菜单需要连接服务才能生成。现在连不上，这一页就没有菜单——等连接恢复后点「重试」就好。
            </View>
          </View>
        </>
      ) : emptyReason !== null ? (
        // 定稿屏⑥：空手（必消无法满足的空态）
        <View className="fm-card fm-empty">
          <View className="fm-empty-emoji">🤔</View>
          <View className="fm-empty-title">
            {emptyReason.length > 0
              ? `今晚没有能用上「${emptyReason.join('、')}」的做法`
              : '今晚没有找到合适的搭配'}
          </View>
          <View className="fm-empty-text">
            {emptyReason.length > 0
              ? `必消食材是硬要求，用不上的方案不会推荐。现在的菜库里暂时没有用上${emptyReason.join('、')}的菜，我们不会随便给你一套凑数的菜单。`
              : '这些食材没能同时出现在同一套菜单里，我们不会随便给你一套凑数的菜单。可以试试调整必消食材或时间。'}
          </View>
        </View>
      ) : (
        // 定稿屏①：设置·必消
        <>
          <View className="fm-card fm-accent">
            <Text className="fm-row-label">几个人吃？</Text>
            <View className="fm-stepper">
              <View className="fm-step-btn" onClick={decPeople}>
                −
              </View>
              <Text className="fm-step-num">{tonightContext.people}</Text>
              <View className="fm-step-btn" onClick={incPeople}>
                ＋
              </View>
              {familyRule && (
                <Text className="fm-sub" style={{ marginLeft: '8px' }}>
                  {`默认 ${familyRule.defaultPeople} 人，可临时改`}
                </Text>
              )}
            </View>
          </View>

          <View className="fm-card">
            <Text className="fm-row-label">今晚有多少时间？</Text>
            <View className="fm-radios">
              {TIME_BUDGETS.map((t) => (
                <View
                  key={t}
                  className={`fm-radio-chip${tonightContext.timeBudgetMin === t ? ' on' : ''}`}
                  onClick={() => setTonightTimeBudget(t)}
                >
                  {`${t} 分钟`}
                </View>
              ))}
            </View>
          </View>

          <View className="fm-card">
            <Text className="fm-row-label">冰箱里必须消耗的？</Text>
            {tonightContext.mustUse.length > 0 && (
              <>
                <View className="fm-chips">
                  {tonightContext.mustUse.map((item) => (
                    <View
                      key={item}
                      className="fm-chip fm-chip-must"
                      onClick={() => removeMustUse(item)}
                    >
                      <b>{item}</b> ×
                    </View>
                  ))}
                </View>
                <View style={{ height: '24px' }} />
              </>
            )}
            <Input
              className="fm-input"
              placeholder="搜索食材，如：土豆、西兰花…"
              value={mustUseInput}
              onInput={(e) => setMustUseInput(e.detail.value)}
              onConfirm={addMustUse}
            />
          </View>

          {loading && (
            <View className="fm-hint">
              正在从菜库里挑能同时满足这些条件的菜。加载完会自动进入菜单；如果一直连不上，会明说「服务未连接」，不会假装有菜单。
            </View>
          )}
        </>
      )}

      <View className="fm-bottom-bar">
        {connError ? (
          <>
            <Button className="fm-btn-primary" onClick={handleRecommend}>
              重试
            </Button>
            <Text
              className="fm-sub"
              style={{ textAlign: 'center', marginTop: '10px' }}
            >
              重试还是不行？检查网络后稍后再来。
            </Text>
          </>
        ) : emptyReason !== null ? (
          emptyReason.length > 0 ? (
            <>
              <Button
                className="fm-btn-primary"
                loading={loading}
                onClick={handleRetryWithoutUnmet}
              >
                {loading
                  ? '正在生成菜单…'
                  : `去掉「${emptyReason.join('、')}」再试`}
              </Button>
              <Button className="fm-btn-ghost" onClick={handleBackToEdit}>
                返回修改必消食材
              </Button>
            </>
          ) : (
            <Button className="fm-btn-ghost" onClick={handleBackToEdit}>
              返回修改必消食材
            </Button>
          )
        ) : (
          <>
            <Button
              className="fm-btn-primary"
              loading={loading}
              onClick={handleRecommend}
            >
              {loading ? '正在生成菜单…' : '推荐今晚吃什么'}
            </Button>
            <Button className="fm-btn-ghost" onClick={goHistory}>
              先看看历史吃过什么
            </Button>
          </>
        )}
      </View>

      <CustomTabBar />
    </View>
  )
}
