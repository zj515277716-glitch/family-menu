// apps/h5/src/pages/onboarding/index.tsx
// S-02 冷启动引导（C-8）：第一次使用、没有任何历史时先进这里——
// 引导填长期设置（偏好/忌口/厨具），完成才能进主流程；「已吃菜避开池」为空属正常不阻断。
// 原型：docs/design/v2/prototypes/style-1/v3/onboarding.html。
// 本页无 Tabbar（主流程之外的门页）；「去填家庭设置」保存成功即落地首页。
import Taro from '@tarojs/taro'
import { View, Text, Image } from '@tarojs/components'
import { Button } from '@nutui/nutui-react-taro'
import { pageUrl } from '../../lib/entry'
import dishImg from '../../assets/asset-onboarding-dish.jpg'

export default function OnboardingPage() {
  return (
    <View className="fm-page with-stickybar">
      <View className="topbar">
        <Text className="back" onClick={() => Taro.reLaunch({ url: pageUrl('login') })}>
          ‹ 返回登录
        </Text>
        <View className="h1">第一次用，先花 1 分钟</View>
        <View className="sub">填好家庭设置，今晚就能出餐；没有历史记录也能推荐</View>
      </View>

      <View className="fcard">
        <Image className="fcard-img" src={dishImg} mode="aspectFill" aria-label="番茄炒蛋（示意图）" />
        <View className="fcard-body">
          <View className="fcard-name">从今天起，吃什么不再发愁</View>
          <View className="fcard-meta">买菜一次买齐 · 备菜按顺序来</View>
        </View>
      </View>

      <View className="section">
        <View className="prep-card">
          <View className="prep-title">只要 3 步</View>
          <View className="prep-sub">设一次长期生效，以后每天晚上照常用</View>
          <View className="step">
            <Text className="num">1</Text>
            <Text className="txt">家里几口人：成人几位、孩子几位。</Text>
          </View>
          <View className="step">
            <Text className="num">2</Text>
            <Text className="txt">忌口与喜好：过敏的绝不出现，爱吃的常安排。</Text>
          </View>
          <View className="step">
            <Text className="num">3</Text>
            <Text className="txt">点「推荐菜谱」，明天三餐立刻出来。</Text>
          </View>
        </View>
      </View>

      <Text className="img-note">示意图·正式版为试做实拍</Text>

      <View className="stickybar">
        <Button className="btn-ghost" onClick={() => Taro.reLaunch({ url: pageUrl('home') })}>
          先看看首页
        </Button>
        <Button className="btn-main" onClick={() => Taro.reLaunch({ url: pageUrl('settings') })}>
          去填家庭设置
        </Button>
      </View>
    </View>
  )
}
