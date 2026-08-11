// apps/h5/src/pages/plan/index.tsx
// F4/F5 采购清单 + 备菜顺序（/pages/plan，流式页）
// 对齐 wireframes.md 第238-314行：Tabs切换清单/备菜，勾选PATCH，Timeline备菜
import { useEffect, useState } from 'react'
import Taro from '@tarojs/taro'
import { View, Text, ScrollView } from '@tarojs/components'
import { NavBar, Tabs, TabPane, Checkbox, Button } from '@nutui/nutui-react-taro'
import { ArrowLeft } from '@nutui/icons-react-taro'
import { api } from '../../api/client'
import { useStore } from '../../store'
import EmptyState from '../../components/EmptyState'
import type { ShoppingListData } from '../../types'
import emptyImage from '../../assets/asset-plan-empty@2x.png'
import './index.css'

export default function PlanPage() {
  const { currentPlanId, lockedMenu } = useStore()
  const [shoppingList, setShoppingList] = useState<ShoppingListData | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<string | number>('list')

  useEffect(() => {
    if (currentPlanId) {
      loadShoppingList()
    } else {
      setLoading(false)
    }
  }, [])

  async function loadShoppingList() {
    try {
      const list = await api.getShoppingList(currentPlanId!)
      setShoppingList(list)
    } catch (e) {
      console.error('[Plan] loadShoppingList error', e)
    } finally {
      setLoading(false)
    }
  }

  async function handleCheck(itemId: string, checked: boolean) {
    if (!currentPlanId || !shoppingList) return
    // 乐观更新
    const optimistic: ShoppingListData = {
      groups: shoppingList.groups.map((g) => ({
        ...g,
        items: g.items.map((it) =>
          it.ingredientId === itemId ? { ...it, checked } : it,
        ),
      })),
    }
    setShoppingList(optimistic)
    try {
      const result = await api.patchShoppingList(currentPlanId, itemId, checked)
      setShoppingList(result)
    } catch (e) {
      console.error('[Plan] patch error', e)
      setShoppingList(shoppingList) // 回滚
      Taro.showToast({ title: '更新失败，重试', icon: 'none' })
    }
  }

  function goFeedback() {
    Taro.reLaunch({ url: '/pages/history/index' })
  }

  // 无锁定菜单 -> 空状态（无死胡同）
  if (!currentPlanId || !lockedMenu) {
    return (
      <View className="fm-page">
        <NavBar
          title="采购清单"
          back={<ArrowLeft width={16} height={16} />}
          onBackClick={() => Taro.reLaunch({ url: '/pages/tonight/index' })}
        />
        <EmptyState
          image={emptyImage}
          title="还没有采购清单"
          desc="先选定一套候选菜单"
          btnText="回今晚"
          onBtnClick={() => Taro.reLaunch({ url: '/pages/tonight/index' })}
        />
      </View>
    )
  }

  const totalItems = shoppingList?.groups.reduce(
    (sum, g) => sum + g.items.length,
    0,
  ) || 0
  const checkedCount =
    shoppingList?.groups.reduce(
      (sum, g) => sum + g.items.filter((it) => it.checked).length,
      0,
    ) || 0

  return (
    <View className="fm-page plan-page">
      <NavBar
        title={`${lockedMenu.name}·已锁定`}
        back={<ArrowLeft width={16} height={16} />}
        onBackClick={() => Taro.reLaunch({ url: '/pages/tonight/index' })}
      />

      <Tabs value={activeTab} onChange={(v) => setActiveTab(v as string | number)}>
        <TabPane value="list" title={`采购清单(${checkedCount}/${totalItems})`}>
          <ScrollView scrollY className="fm-plan-scroll">
            {loading && <Text className="fm-text-secondary">加载中...</Text>}
            {shoppingList?.groups.map((group) => (
              <View key={group.category} className="fm-group">
                <View className="fm-group-header">
                  <Text className="fm-group-title">{group.category}</Text>
                  <Text className="fm-group-count">{group.items.length}项</Text>
                </View>
                {group.items.map((item) => (
                  <View key={item.ingredientId} className="fm-list-item">
                    <Checkbox
                      checked={item.checked}
                      onChange={(v) => handleCheck(item.ingredientId, !!v)}
                    />
                    <Text
                      className={
                        item.checked ? 'fm-item-name fm-item-checked' : 'fm-item-name'
                      }
                    >
                      {item.name}
                    </Text>
                    <Text className="fm-item-qty">
                      {item.qty}
                      {item.unit}
                    </Text>
                  </View>
                ))}
              </View>
            ))}
          </ScrollView>
        </TabPane>

        <TabPane value="prep" title="备菜顺序">
          <View className="fm-timeline">
            {lockedMenu.prepSequence.map((step, i) => (
              <View key={i} className="fm-timeline-item">
                <View className="fm-timeline-dot" />
                {i < lockedMenu.prepSequence.length - 1 && (
                  <View className="fm-timeline-line" />
                )}
                <View className="fm-timeline-content">
                  <Text className="fm-timeline-time">{step.minute}分钟</Text>
                  <Text className="fm-timeline-action">{step.action}</Text>
                </View>
              </View>
            ))}
            <View className="fm-timeline-total">
              <Text>总工时 {lockedMenu.totalActiveMinutes}分钟（并行工序，≠单菜相加）</Text>
            </View>
          </View>
        </TabPane>


      </Tabs>

      <View className="fm-bottom-bar">
        <Button type="primary" block onClick={goFeedback}>
          做完了，去反馈
        </Button>
      </View>
      <View className="fm-bottom-bar-secondary">
        <Button plain block onClick={() => Taro.navigateTo({ url: '/pages/dish/index' })}>
          查看菜品做法
        </Button>
      </View>
    </View>
  )
}
