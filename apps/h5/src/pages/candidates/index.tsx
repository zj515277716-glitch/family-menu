// apps/h5/src/pages/candidates/index.tsx
// F3 三套候选（/pages/candidates，流式页 NavBar 带返回）
// 对齐 wireframes.md 第150-234行：评分/理由/菜品详情/整套换/单菜换/锁定
import { useState } from 'react'
import Taro from '@tarojs/taro'
import { View, Text, Image, ScrollView } from '@tarojs/components'
import { NavBar, Tag, Rate, Button, Popup, Input } from '@nutui/nutui-react-taro'
import { ArrowLeft } from '@nutui/icons-react-taro'
import { api, isMockMode } from '../../api/client'
import { mockMenuMap } from '../../api/mock'
import { useStore } from '../../store'
import EmptyState from '../../components/EmptyState'
import type { Candidate, CandidateView, DishSnapshot, MenuSnapshot } from '../../types'
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
const QUICK_REASONS = ['太麻烦', '食材不够', '不喜欢', '其他']

/**
 * 换菜后将 swapPlan 返回的 Plan.candidates（不含 menu 详情）合并 menu 快照，
 * 更新候选显示（对齐 wireframes 第227行「返回新候选替换该卡」）。
 * menu 详情优先复用旧候选已有快照；Mock 模式下从 mockMenuMap 补充；真 API 降级为 undefined。
 */
function mergeCandidates(
  newCandidates: Candidate[],
  oldCandidates: CandidateView[],
): CandidateView[] {
  const menuMap: Record<string, MenuSnapshot | undefined> = {}
  oldCandidates.forEach((c) => {
    if (c.menu) menuMap[c.menuId] = c.menu
  })
  if (isMockMode) {
    Object.keys(mockMenuMap).forEach((id) => {
      if (!menuMap[id]) menuMap[id] = mockMenuMap[id]
    })
  }
  return newCandidates.map((c) => ({
    ...c,
    // 优先使用 API 返回的 menu 详情（swapPlan 已含 menu），降级到旧候选/mock 快照
    menu: (c as CandidateView).menu ?? menuMap[c.menuId],
  }))
}

export default function CandidatesPage() {
  const { candidates, currentPlanId, setLockedMenu, setCandidates } = useStore()
  const tonightContext = useStore((s) => s.tonightContext)
  const [loading, setLoading] = useState(false)
  const [swapPopupVisible, setSwapPopupVisible] = useState(false)
  const [swapDish, setSwapDish] = useState<DishSnapshot | null>(null)
  const [swapReason, setSwapReason] = useState('')
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

  async function handleSwapMenu() {
    setLoading(true)
    try {
      const plan = await api.swapPlan(currentPlanId!, '全换', '整套换')
      setCandidates(mergeCandidates(plan.candidates, candidates))
      Taro.showToast({ title: '已换一套', icon: 'success' })
    } catch (e) {
      console.error('[Candidates] swapMenu error', e)
      Taro.showToast({ title: '换菜失败，重试', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  function openSwapDish(dish: DishSnapshot) {
    setSwapDish(dish)
    setSwapReason('')
    setSwapPopupVisible(true)
  }

  async function confirmSwapDish() {
    if (!swapReason.trim()) {
      Taro.showToast({ title: '请填写换菜原因', icon: 'none' })
      return
    }
    setLoading(true)
    try {
      const plan = await api.swapPlan(currentPlanId!, '单菜换', swapReason, swapDish?.id)
      setCandidates(mergeCandidates(plan.candidates, candidates))
      Taro.showToast({ title: '已换菜', icon: 'success' })
      setSwapPopupVisible(false)
    } catch (e) {
      console.error('[Candidates] swapDish error', e)
      Taro.showToast({ title: '换菜失败，重试', icon: 'none' })
    } finally {
      setLoading(false)
    }
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
                    <Text className="fm-dish-swap" onClick={() => openSwapDish(d)}>
                      换
                    </Text>
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
              <Button size="small" onClick={handleSwapMenu} loading={loading}>
                整套换
              </Button>
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

      <Popup
        visible={swapPopupVisible}
        position="bottom"
        round
        onClose={() => setSwapPopupVisible(false)}
      >
        <View className="fm-popup-content">
          <Text className="fm-popup-title">换菜：{swapDish?.name}</Text>
          <Text className="fm-label">换菜原因（必填，用于推荐学习）</Text>
          <View className="fm-tag-row">
            {QUICK_REASONS.map((r) => (
              <Tag
                key={r}
                type={swapReason === r ? 'primary' : 'default'}
                onClick={() => setSwapReason(r)}
              >
                {r}
              </Tag>
            ))}
          </View>
          <Input
            placeholder="或输入原因"
            value={swapReason}
            onChange={(v) => setSwapReason(v)}
            style={{ marginTop: '12px' }}
          />
          <View className="fm-popup-actions">
            <Button onClick={() => setSwapPopupVisible(false)}>取消</Button>
            <Button type="primary" onClick={confirmSwapDish} loading={loading}>
              确认换菜
            </Button>
          </View>
        </View>
      </Popup>

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
