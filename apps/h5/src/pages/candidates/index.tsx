// apps/h5/src/pages/candidates/index.tsx
// F3 候选菜单（/pages/candidates，流式页）
// UI 定稿对齐（PD-011 + 用户拍板）：去 AI 评分星、去 AI 插画——纯浏览候选池，
// 视觉语言与 e-final 屏②菜卡同构（emoji 占位 + 角色 tag + 胶囊小按钮），首张强调底=推荐
// 换菜入口在锁定后的今晚菜单页（pages/plan），此处只做"选定此套"
import { useState } from 'react'
import Taro from '@tarojs/taro'
import { View, Text } from '@tarojs/components'
import { Button } from '@nutui/nutui-react-taro'
import { api } from '../../api/client'
import { useStore } from '../../store'
import CustomTabBar from '../../components/CustomTabBar'
import EmptyState from '../../components/EmptyState'
import type { CandidateView } from '../../types'
import './index.css'

const MEAL_ROLE_LABELS: Record<string, string> = {
  MAIN: '主菜',
  SIDE: '配菜',
  SOUP: '汤',
  STAPLE: '主食',
}
// DEC-007：菜品图一律 emoji 占位（按角色映射），禁止 AI 图
const ROLE_EMOJI: Record<string, string> = {
  MAIN: '🍳',
  SIDE: '🥬',
  SOUP: '🍲',
  STAPLE: '🍚',
}

export default function CandidatesPage() {
  const { candidates, currentPlanId, setLockedMenu } = useStore()
  const { people, timeBudgetMin, mustUse } = useStore((s) => s.tonightContext)
  const [loading, setLoading] = useState(false)
  const [lockSuccess, setLockSuccess] = useState(false)

  // 0套空状态（无死胡同）
  if (candidates.length === 0) {
    return (
      <View className="fm-page candidates-page">
        <Text className="fm-h1">今晚候选</Text>
        <EmptyState
          emoji="🤔"
          title="今晚没有符合条件的候选"
          desc="可放宽情境或检查禁忌设置"
          btnText="回今晚调整"
          onBtnClick={() => Taro.reLaunch({ url: '/pages/tonight/index' })}
        />
        <CustomTabBar />
      </View>
    )
  }

  async function handleLock(candidate: CandidateView) {
    setLoading(true)
    try {
      await api.lockPlan(currentPlanId!, candidate.menuId)
      setLockedMenu(candidate.menuId, candidate.menu)
      setLockSuccess(true)
      setTimeout(() => {
        setLockSuccess(false)
        Taro.navigateTo({ url: '/pages/plan/index' })
      }, 1200)
    } catch (e) {
      console.error('[Candidates] lock error', e)
      Taro.showToast({ title: '锁定失败，重试', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  const contextSub = `${people} 人 · ${timeBudgetMin} 分钟内${
    mustUse.length > 0 ? ` · 必用${mustUse.join('、')}` : ''
  }`

  return (
    <View className="fm-page candidates-page">
      <Text className="fm-h1">选出今晚的一套</Text>
      <Text className="fm-sub">{contextSub}</Text>

      {mustUse.length > 0 && (
        <View className="fm-ok-banner">
          ✓ 必消食材已用上：{mustUse.join('、')}
        </View>
      )}

      {candidates.length < 3 && (
        <View className="fm-hint" style={{ marginTop: '16px' }}>
          {`只找到 ${candidates.length} 套符合条件的——有多少如实展示。想更多选择，去设置补充菜库或放宽今天的条件。`}
        </View>
      )}

      <View style={{ height: '24px' }} />

      {candidates.map((c, i) => (
        <View
          key={c.menuId}
          className={`fm-card candidate-card${i === 0 ? ' fm-accent' : ''}`}
        >
          <View>
            <Text className="fm-menu-name">
              {c.menu?.name || `候选 ${i + 1}`}
            </Text>
            {i === 0 && <Text className="fm-role-tag">推荐</Text>}
          </View>
          {c.menu && (
            <Text className="fm-menu-meta">
              {`全程 ${c.menu.totalActiveMinutes} 分钟 · ${c.menu.dishes.length} 道菜`}
            </Text>
          )}

          {c.menu && c.menu.dishes.length > 0 && (
            <View className="fm-cand-dishes">
              {c.menu.dishes.map((d) => (
                <View key={d.id} className="fm-cand-dish">
                  <View className="fm-dish-img">{ROLE_EMOJI[d.mealRole] || '🍳'}</View>
                  <View className="fm-dish-main">
                    <View>
                      <Text className="fm-dish-name">{d.name}</Text>
                      <Text className="fm-role-tag">
                        {MEAL_ROLE_LABELS[d.mealRole] || d.mealRole}
                      </Text>
                    </View>
                    <Text className="fm-dish-meta">
                      {`约 ${d.activeMinutes} 分钟`}
                      {d.cuisine ? ` · ${d.cuisine}` : ''}
                      {d.flavorTags.length > 0
                        ? ` · ${d.flavorTags.join(' · ')}`
                        : ''}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {c.reasons.length > 0 && (
            <View className="fm-cand-reasons">
              {c.reasons.map((r, idx) => (
                <Text key={idx} className="fm-cand-reason">
                  ✓ {r}
                </Text>
              ))}
            </View>
          )}

          <Button
            className="fm-cand-lock"
            onClick={() => handleLock(c)}
            loading={loading}
          >
            选定此套
          </Button>
        </View>
      ))}

      {lockSuccess && (
        <View className="fm-lock-success-mask">
          <View className="fm-lock-success-check">✓</View>
          <Text className="fm-lock-success-text">已锁定</Text>
        </View>
      )}

      <CustomTabBar />
    </View>
  )
}
