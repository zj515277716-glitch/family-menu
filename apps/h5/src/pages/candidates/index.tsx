// apps/h5/src/pages/candidates/index.tsx
// F3 三套候选（/pages/candidates，流式页 NavBar 带返回）
// 对齐 wireframes.md 第150-234行：评分/理由/菜品详情/锁定
// TP-03（DEC-013）：换菜移除——换菜要求 LOCKED 状态的真实替换，入口在锁定后的
// 今晚菜单页（pages/plan）；「整套换」功能明确推迟，删除假合并与假换菜（杜绝假成功）
import { useState } from 'react'
import Taro from '@tarojs/taro'
import { View, Text, Image, ScrollView } from '@tarojs/components'
import { NavBar, Tag, Rate, Button } from '@nutui/nutui-react-taro'
import { ArrowLeft } from '@nutui/icons-react-taro'
import { api } from '../../api/client'
import { useStore } from '../../store'
import EmptyState from '../../components/EmptyState'
import type { CandidateView } from '../../types'
import emptyImage from '../../assets/asset-candidates-empty@2x.png'
import lockSuccessImage from '../../assets/asset-candidates-lock-success@2x.png'
import dishPlaceholderImage from '../../assets/asset-common-dish-placeholder@2x.png'
import './index.css'

const MEAL_ROLE_LABELS: Record<string, string> = {
  MAIN: '主菜',
  SIDE: '配菜',
  SOUP: '汤',
  STAPLE: '主食',
}

export default function CandidatesPage() {
  const { candidates, currentPlanId, setLockedMenu } = useStore()
  const tonightContext = useStore((s) => s.tonightContext)
  const [loading, setLoading] = useState(false)
  const [lockSuccess, setLockSuccess] = useState(false)

  // 0套空状态（无死胡同，wireframes 第234行）
  if (candidates.length === 0) {
    return (
      <View className="fm-page">
        <NavBar
          title="今晚候选"
          back={<ArrowLeft width={16} height={16} />}
          onBackClick={() => Taro.navigateBack()}
        />
        <EmptyState
          image={emptyImage}
          title="今晚没有符合条件的候选"
          desc="可放宽情境或检查禁忌设置"
          btnText="回今晚调整"
          onBtnClick={() => Taro.reLaunch({ url: '/pages/tonight/index' })}
        />
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

  return (
    <View className="fm-page candidates-page">
      <NavBar
        title="今晚候选"
        back={<ArrowLeft width={16} height={16} />}
        onBackClick={() => Taro.navigateBack()}
      />

      {tonightContext.mustUse.length > 0 && (
        <View className="fm-mustuse-banner">
          <Text>{`✓ 必消食材已用上：${tonightContext.mustUse.join('、')}`}</Text>
        </View>
      )}

      <View className="fm-context-summary">
        <Text>
          {tonightContext.people}人 · {tonightContext.timeBudgetMin}分钟 ·
          必用{tonightContext.mustUse.join('、') || '无'}
        </Text>
      </View>

      {candidates.length < 3 && (
        <View className="fm-few-hint">
          <Text>候选较少（{candidates.length}套），可调整情境或去设置补充菜库</Text>
        </View>
      )}

      <ScrollView scrollY className="fm-candidates-scroll">
        {candidates.map((c, i) => (
          <View key={c.menuId} className="fm-card candidate-card">
            {i === 0 && (
              <View className="fm-recommend-badge">
                <Tag type="danger">推荐</Tag>
              </View>
            )}
            <Text className="fm-menu-name">{c.menu?.name || `菜单${c.menuId}`}</Text>
            <View className="fm-menu-meta">
              <Rate value={Math.max(1, Math.round(c.score * 5))} readOnly />
              <Text className="fm-score">{c.score.toFixed(2)}</Text>
              {c.menu && (
                <Text className="fm-text-secondary"> · {c.menu.totalActiveMinutes}分钟</Text>
              )}
            </View>

            {c.menu && c.menu.dishes.length > 0 && (
              <View className="fm-dish-list">
                {c.menu.dishes.map((d) => (
                  <View key={d.id} className="fm-dish-item">
                    <Image
                      src={dishPlaceholderImage}
                      mode="aspectFill"
                      className="fm-dish-placeholder"
                    />
                    <View className="fm-dish-info">
                      <Text className="fm-dish-name">{d.name}</Text>
                      <View className="fm-dish-tags">
                        <Tag type="primary">{MEAL_ROLE_LABELS[d.mealRole] || d.mealRole}</Tag>
                        {d.cuisine && <Tag>{d.cuisine}</Tag>}
                        {d.flavorTags.map((f) => (
                          <Tag key={f}>{f}</Tag>
                        ))}
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            )}

            <View className="fm-reasons">
              {c.reasons.map((r, idx) => (
                <View key={idx} className="fm-reason-item">
                  <Text className="fm-reason-check">✓</Text>
                  <Text className="fm-reason-text">{r}</Text>
                </View>
              ))}
            </View>

            <View className="fm-card-actions">
              <Button
                type="primary"
                size="small"
                onClick={() => handleLock(c)}
                loading={loading}
              >
                选定此套
              </Button>
            </View>
          </View>
        ))}
      </ScrollView>

      {lockSuccess && (
        <View className="fm-lock-success-mask">
          <Image
            src={lockSuccessImage}
            mode="aspectFit"
            className="fm-lock-success-img"
          />
          <Text className="fm-lock-success-text">已锁定</Text>
        </View>
      )}
    </View>
  )
}
