// apps/h5/src/pages/dish/index.tsx
// 菜品详细做法页面 - 食材用量 + 烹饪步骤 + 可并行标注
import Taro from '@tarojs/taro'
import { View, Text, ScrollView } from '@tarojs/components'
import { NavBar, Button } from '@nutui/nutui-react-taro'
import { ArrowLeft } from '@nutui/icons-react-taro'
import { useStore } from '../../store'
import EmptyState from '../../components/EmptyState'
import emptyImage from '../../assets/asset-plan-empty@2x.png'
import './index.css'

export default function DishPage() {
  const { lockedMenu } = useStore()

  if (!lockedMenu) {
    return (
      <View className="fm-page">
        <NavBar
          title="菜品做法"
          back={<ArrowLeft width={16} height={16} />}
          onBackClick={() => Taro.navigateBack()}
        />
        <EmptyState
          image={emptyImage}
          title="还没有锁定菜单"
          desc="先选定一套候选菜单"
          btnText="回今晚"
          onBtnClick={() => Taro.reLaunch({ url: '/pages/tonight/index' })}
        />
      </View>
    )
  }

  return (
    <View className="fm-page dish-page">
      <NavBar
        title={`${lockedMenu.name}·做法`}
        back={<ArrowLeft width={16} height={16} />}
        onBackClick={() => Taro.navigateBack()}
      />

      <ScrollView scrollY className="fm-dish-scroll">
        {lockedMenu.dishes.map((dish, idx) => (
          <View key={idx} className="fm-dish-detail">
            <View className="fm-dish-header">
              <Text className="fm-dish-name">{dish.name}</Text>
              <Text className="fm-dish-meta">{dish.activeMinutes}分钟·{dish.cuisine}</Text>
            </View>

            <View className="fm-dish-section">
              <Text className="fm-dish-section-title">食材用量</Text>
              {dish.ingredients.map((ing, i) => (
                <View key={i} className="fm-dish-ing">
                  <Text className="fm-dish-ing-name">{ing.ingredientName}</Text>
                  <Text className="fm-dish-ing-qty">{ing.qty}{ing.unit}</Text>
                </View>
              ))}
            </View>

            <View className="fm-dish-section">
              <Text className="fm-dish-section-title">烹饪步骤</Text>
              {dish.steps.map((step, i) => (
                <View key={i} className="fm-dish-step">
                  <Text className="fm-dish-step-num">{step.order}</Text>
                  <View className="fm-dish-step-content">
                    <Text className="fm-dish-step-text">{step.text}</Text>
                    {step.parallel && (
                      <Text className="fm-dish-step-tag">可并行</Text>
                    )}
                  </View>
                </View>
              ))}
            </View>

            {dish.flavorTags.length > 0 && (
              <View className="fm-dish-tags">
                {dish.flavorTags.map((tag) => (
                  <Text key={tag} className="fm-dish-tag">{tag}</Text>
                ))}
              </View>
            )}
          </View>
        ))}
      </ScrollView>

      <View className="fm-dish-bottom">
        <Button type="primary" block onClick={() => Taro.reLaunch({ url: '/pages/history/index' })}>
          做完了，去反馈
        </Button>
      </View>
    </View>
  )
}
