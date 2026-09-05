// apps/h5/src/pages/dish/index.tsx
// 菜品做法页（e-final 屏⑪，PD-011 定稿）：单菜一屏——
// 返回链接 → 菜名/信息行 → emoji 实拍占位（DEC-007）→ 用料卡 → 做法卡（唯一朱砂条）→ 底部主按钮
import Taro from '@tarojs/taro'
import { View, Text } from '@tarojs/components'
import { Button } from '@nutui/nutui-react-taro'
import { useStore } from '../../store'
import EmptyState from '../../components/EmptyState'
import type { DishSnapshot } from '../../types'
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
// s11 信息行「用炒锅」等（shared EQUIPMENT 取值域：wok/rice_cooker/steamer/air_fryer）
const EQUIPMENT_LABELS: Record<string, string> = {
  wok: '用炒锅',
  rice_cooker: '用电饭煲',
  steamer: '用蒸锅',
  air_fryer: '用空气炸锅',
}

export default function DishPage() {
  const { lockedMenu } = useStore()
  const people = useStore.getState().tonightContext.people || 4

  // plan 页菜卡跳入携带 dishId；无参默认第一道
  const dishId = Taro.getCurrentInstance().router?.params?.dishId
  const dish: DishSnapshot | undefined =
    (dishId && lockedMenu?.dishes.find((d) => d.id === dishId)) ||
    lockedMenu?.dishes[0]

  const goBack = () => {
    const pages = Taro.getCurrentPages()
    if (pages.length > 1) Taro.navigateBack()
    else Taro.reLaunch({ url: '/pages/plan/index' })
  }
  const goFeedback = () => Taro.navigateTo({ url: '/pages/feedback/index' })

  if (!lockedMenu || !dish) {
    return (
      <View className="fm-page">
        <EmptyState
          emoji="🍳"
          title="还没有锁定菜单"
          desc="先选定一套候选菜单，再回来看做法"
          btnText="回今晚"
          onBtnClick={() => Taro.reLaunch({ url: '/pages/tonight/index' })}
        />
      </View>
    )
  }

  // s11 信息行：主菜 · 家常 · 约 15 分钟 · 用炒锅 · 清淡 · 酸甜（空段跳过）
  const subParts = [
    MEAL_ROLE_LABELS[dish.mealRole] || dish.mealRole,
    dish.cuisine,
    `约 ${dish.activeMinutes} 分钟`,
    dish.equipment.length > 0
      ? dish.equipment.map((e) => EQUIPMENT_LABELS[e] || e).join('、')
      : '',
    ...dish.flavorTags,
  ].filter(Boolean)

  const ingredients = dish.ingredients ?? []
  const steps = dish.steps ?? []

  return (
    <View className="fm-page dish-page">
      <Text className="fm-back" onClick={goBack}>
        {'‹ 返回今晚菜单'}
      </Text>
      <View className="fm-h1">{dish.name}</View>
      <Text className="fm-sub">{subParts.join(' · ')}</Text>

      {/* DEC-007：emoji 实拍占位（按角色映射） */}
      <View className="fm-photo-ph">
        {ROLE_EMOJI[dish.mealRole] || '🍳'}
        <Text className="fm-photo-ph-note">试做实拍位</Text>
      </View>

      <View className="fm-card">
        <View className="fm-row-label">{`用料（${people} 人份）`}</View>
        {ingredients.length > 0 ? (
          ingredients.map((ing, i) => (
            <View
              key={i}
              className={`fm-li${i === ingredients.length - 1 ? ' fm-li-last' : ''}`}
            >
              <Text className="fm-li-name">{ing.ingredientName}</Text>
              <Text className="fm-li-qty">{`${ing.qty}${ing.unit}`}</Text>
            </View>
          ))
        ) : (
          <Text className="fm-hint">这道菜的用料还没有录入菜库。</Text>
        )}
      </View>

      {/* s11：关键卡只有「做法」一张带朱砂条 */}
      <View className="fm-card fm-accent">
        <View className="fm-row-label">做法</View>
        {steps.length > 0 ? (
          steps.map((step, i) => (
            <View key={i} className="fm-step-li">
              <Text className="fm-step-no">{step.order}</Text>
              <View className="fm-step-body">
                <Text className="fm-step-text">{step.text}</Text>
                {step.parallel && (
                  <Text className="fm-tag fm-tag-skip">可并行</Text>
                )}
              </View>
            </View>
          ))
        ) : (
          <Text className="fm-hint">这道菜的做法还没有录入菜库。</Text>
        )}
      </View>

      <View className="fm-bottom-bar">
        <Button className="fm-btn-primary" onClick={goFeedback}>
          做完饭，记一笔
        </Button>
      </View>
    </View>
  )
}
