// apps/h5/src/pages/tonight/index.tsx
// F2 今晚情境（/pages/tonight，首页 Tab）
// 对齐 wireframes.md 第99-147行：人数/时间档/必消食材，预填默认值，POST /api/recommend
import { useEffect, useState } from 'react'
import Taro from '@tarojs/taro'
import { View, Text, Image } from '@tarojs/components'
import {
  InputNumber,
  Radio,
  RadioGroup,
  Tag,
  SearchBar,
  Button,
} from '@nutui/nutui-react-taro'
import { api } from '../../api/client'
import { useStore } from '../../store'
import CustomTabBar from '../../components/CustomTabBar'
import { TIME_BUDGETS } from '@family-menu/shared'
import heroImage from '../../assets/asset-tonight-hero@2x.png'
import logoImage from '../../assets/asset-common-logo@2x.png'
import './index.css'

export default function TonightPage() {
  const {
    tonightContext,
    setTonightPeople,
    setTonightTimeBudget,
    setTonightMustUse,
    setCandidates,
    setCurrentPlanId,
  } = useStore()
  const [mustUseInput, setMustUseInput] = useState('')
  const [loading, setLoading] = useState(false)
  // TP-02 空手状态：保存 API 回传的"消耗不了的必消食材"（用户原文）；null=非空手
  const [emptyReason, setEmptyReason] = useState<string[] | null>(null)

  // 首次启动检测：无 FamilyRule -> 强制跳 setup（wireframes 第32行）
  useEffect(() => {
    const state = useStore.getState()
    if (!state.familyRuleLoaded) {
      api.getFamilyRules().then((rule) => {
        state.setFamilyRule(rule)
        if (!rule) {
          Taro.reLaunch({ url: '/pages/setup/index' })
        }
      })
    }
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

  // TP-02：推荐 + 空手处理（C-7）。candidates 为空时不跳转，页内展示空手说明
  async function runRecommend(mustUse: string[]) {
    setLoading(true)
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
      Taro.showToast({ title: '网络开了小差，重试', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  async function handleRecommend() {
    await runRecommend(tonightContext.mustUse)
  }

  // 空手卡片「去掉X再试」：移除消耗不了的必消，按剩余必消重新推荐
  function handleRetryWithoutUnmet() {
    if (!emptyReason || emptyReason.length === 0) return
    const remaining = tonightContext.mustUse.filter((x) => !emptyReason.includes(x))
    setTonightMustUse(remaining)
    runRecommend(remaining)
  }

  // 空手卡片「返回修改必消食材」：关闭卡片回到表单
  function handleBackToEdit() {
    setEmptyReason(null)
  }

  const mustUseFull = tonightContext.mustUse.length >= 3

  return (
    <View className="fm-page tonight-page">
      <View className="fm-page-header">
        <Image src={logoImage} mode="aspectFit" className="fm-logo" />
        <Text className="fm-page-title">今晚吃什么</Text>
      </View>

      <Image src={heroImage} mode="aspectFill" className="fm-hero" />

      <View className="fm-card">
        <Text className="fm-label">几个人吃？</Text>
        <InputNumber
          value={tonightContext.people}
          min={1}
          max={20}
          onChange={(v) => setTonightPeople(Number(v))}
        />
      </View>

      <View className="fm-card">
        <Text className="fm-label">今晚有多少时间？</Text>
        <RadioGroup
          value={tonightContext.timeBudgetMin}
          direction="horizontal"
          onChange={(v) => setTonightTimeBudget(Number(v))}
        >
          {TIME_BUDGETS.map((t) => (
            <Radio key={t} value={t}>
              {t}分钟
            </Radio>
          ))}
        </RadioGroup>
      </View>

      <View className="fm-card">
        <Text className="fm-label">冰箱里必须消耗的？（最多3个）</Text>
        <SearchBar
          placeholder="搜索食材，回车添加"
          value={mustUseInput}
          onChange={(v) => setMustUseInput(v)}
          onSearch={addMustUse}
          disabled={mustUseFull}
        />
        {tonightContext.mustUse.length > 0 && (
          <View className="fm-tag-row" style={{ marginTop: '12px' }}>
            {tonightContext.mustUse.map((item) => (
              <Tag
                key={item}
                type="primary"
                closeable
                onClose={() => removeMustUse(item)}
              >
                {item}
              </Tag>
            ))}
          </View>
        )}
        {mustUseFull && (
          <Text className="fm-text-secondary" style={{ marginTop: '8px' }}>
            已达3个上限，删除后可继续添加
          </Text>
        )}
      </View>

      {emptyReason && (
        <View className="fm-card fm-empty-card">
          <Text className="fm-empty-emoji">🤔</Text>
          {emptyReason.length > 0 ? (
            <>
              <Text className="fm-empty-title">
                {`今晚没有能用上「${emptyReason.join('、')}」的做法`}
              </Text>
              <Text className="fm-empty-text">
                {`必消食材是硬要求，用不上的方案不会推荐。现在的菜库里暂时没有用上${emptyReason.join('、')}的菜，我们不会随便给你一套凑数的菜单。`}
              </Text>
              <Button
                type="primary"
                block
                loading={loading}
                onClick={handleRetryWithoutUnmet}
              >
                {`去掉「${emptyReason.join('、')}」再试`}
              </Button>
            </>
          ) : (
            <>
              <Text className="fm-empty-title">今晚没有找到合适的搭配</Text>
              <Text className="fm-empty-text">
                这些食材没能同时出现在同一套菜单里，我们不会随便给你一套凑数的菜单。可以试试调整必消食材或时间。
              </Text>
            </>
          )}
          <Button block style={{ marginTop: '12px' }} onClick={handleBackToEdit}>
            返回修改必消食材
          </Button>
        </View>
      )}

      <View className="fm-bottom-bar">
        <Button type="primary" block loading={loading} onClick={handleRecommend}>
          推荐今晚吃什么
        </Button>
      </View>

      <View style={{ height: '120px' }} />
      <CustomTabBar />
    </View>
  )
}
