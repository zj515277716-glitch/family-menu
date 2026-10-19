// apps/h5/src/pages/home/index.tsx
// 首页（S-03 双区：今天三餐 + 定明天的餐）——本卡（T-Q11）只给空壳占位，主流程 T-Q12 实现。
// 保留一件真实行为：冷启动守卫（C-8）——无家庭设置时不进主流程，引导先去填设置；
// 连不上服务提示「服务未连接」可重试（真实数据原则，不假装有内容）。
import { useCallback, useEffect, useState } from 'react'
import Taro from '@tarojs/taro'
import { View, Text } from '@tarojs/components'
import { Button } from '@nutui/nutui-react-taro'
import { api, UnauthorizedError } from '../../api/client'
import CustomTabBar from '../../components/CustomTabBar'
import { pageUrl } from '../../lib/entry'

type Phase = 'loading' | 'ready' | 'error'

export default function HomePage() {
  const [phase, setPhase] = useState<Phase>('loading')
  const [hasRule, setHasRule] = useState(false)

  const check = useCallback(async () => {
    setPhase('loading')
    try {
      const rule = await api.getFamilyRules()
      setHasRule(rule !== null)
      setPhase('ready')
    } catch (e) {
      if (e instanceof UnauthorizedError) return // 401 已由封装导回登录页
      console.error('[Home] 家庭设置探测失败', e)
      setPhase('error')
    }
  }, [])

  useEffect(() => {
    check()
  }, [check])

  return (
    <View className="fm-page with-tabbar">
      <View className="topbar">
        <View className="h1">首页</View>
        <View className="sub">今天三餐 · 定明天的餐</View>
      </View>

      {phase === 'loading' && (
        <View className="card">
          <View className="sk sk-label" />
          <View className="sk sk-row" />
        </View>
      )}

      {phase === 'error' && (
        <View className="banner banner-warn">
          <Text>⚠ 服务未连接，内容拿不出来</Text>
          <Text className="act" onClick={check}>
            重试
          </Text>
        </View>
      )}

      {phase === 'ready' && !hasRule && (
        <View className="card empty-box">
          <View className="empty-title">先填家庭设置</View>
          <View className="empty-text">
            家里几口人、忌口与喜好设一次，今晚就能出餐；没有历史记录也能推荐。
          </View>
          <Button className="btn-main" onClick={() => Taro.reLaunch({ url: pageUrl('settings') })}>
            去填家庭设置
          </Button>
        </View>
      )}

      {phase === 'ready' && hasRule && (
        <View className="card empty-box">
          <View className="empty-title">主流程下一卡实现</View>
          <View className="empty-text">今天三餐与「定明天的餐」在 T-Q12 落地，本卡先搭好门与设置。</View>
        </View>
      )}

      <CustomTabBar />
    </View>
  )
}
