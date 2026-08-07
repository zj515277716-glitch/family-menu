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

  async function handleRecommend() {
    setLoading(true)
    try {
      const result = await api.recommend(tonightContext)
      setCandidates(result.candidates)
      setCurrentPlanId(result.planId)
      Taro.navigateTo({ url: '/pages/candidates/index' })
    } catch (e) {
      console.error('[Tonight] recommend error', e)
      Taro.showToast({ title: '网络开了小差，重试', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  const mustUseFull = tonightContext.mustUse.length >= 3

  return (
    <View className="fm-page tonight-page">
      <View className="fm-page-header">
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
                closable
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
