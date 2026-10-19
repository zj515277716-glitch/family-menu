// apps/h5/src/pages/history/index.tsx
// 历史（S-11，按日回看三餐与评价）——本卡（T-Q11）只给空壳占位，执行回看 T-Q13 实现。
import { View } from '@tarojs/components'
import CustomTabBar from '../../components/CustomTabBar'

export default function HistoryPage() {
  return (
    <View className="fm-page with-tabbar">
      <View className="topbar">
        <View className="h1">历史</View>
        <View className="sub">按日回看吃过的三餐</View>
      </View>
      <View className="card empty-box">
        <View className="empty-title">历史屏下一卡实现</View>
        <View className="empty-text">过去三餐与评价回看在 T-Q13 落地，本卡先搭好门与设置。</View>
      </View>
      <CustomTabBar />
    </View>
  )
}
