// apps/h5/src/pages/plan/index.tsx
// F4/F5 采购清单 + 备菜顺序（/pages/plan，流式页）
// 对齐 wireframes.md 第238-314行：Tabs切换清单/备菜，勾选PATCH，Timeline备菜
// TP-03（DEC-013）：新增今晚菜单菜卡区 + 「换一道」真实换菜弹窗（e-final 屏②③④）
// 弹窗两态：有候选（屏③：挑选+原因可选） / 无候选（屏④：共 0 个如实展示）
import { useEffect, useState } from 'react'
import Taro from '@tarojs/taro'
import { View, Text, ScrollView } from '@tarojs/components'
import {
  NavBar,
  Tabs,
  TabPane,
  Checkbox,
  Button,
  Popup,
  Tag,
} from '@nutui/nutui-react-taro'
import { ArrowLeft } from '@nutui/icons-react-taro'
import { api } from '../../api/client'
import { useStore } from '../../store'
import EmptyState from '../../components/EmptyState'
import type { DishSnapshot, MenuSnapshot, ShoppingListData } from '../../types'
import type { SwapOption, SwapOptionsResponse } from '../../types'
import emptyImage from '../../assets/asset-plan-empty@2x.png'
import './index.css'

const MEAL_ROLE_LABELS: Record<string, string> = {
  MAIN: '主菜',
  SIDE: '配菜',
  SOUP: '汤',
  STAPLE: '主食',
}
// e-final 屏③ 原因快捷项（选填，v0.4 reason 可选）
const QUICK_REASONS = ['做腻了', '家里没有食材', '时间不够', '想换个口味']

export default function PlanPage() {
  const { currentPlanId, lockedMenuId, lockedMenu, setLockedMenu } = useStore()
  const [shoppingList, setShoppingList] = useState<ShoppingListData | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<string | number>('list')

  // ── 换菜弹窗状态（TP-03） ──
  const [swapVisible, setSwapVisible] = useState(false)
  const [swapDish, setSwapDish] = useState<DishSnapshot | null>(null)
  const [swapOptions, setSwapOptions] = useState<SwapOptionsResponse | null>(null)
  const [swapOptionsLoading, setSwapOptionsLoading] = useState(false)
  const [selectedNewId, setSelectedNewId] = useState<string | null>(null)
  const [swapReason, setSwapReason] = useState<string | null>(null)
  const [swapping, setSwapping] = useState(false)

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

  // ── 换菜（TP-03/DEC-013：真实替换） ──

  // 点「换一道」：打开弹窗并拉取同角色候选（空候选=200+空数组，屏④）
  async function openSwapPopup(dish: DishSnapshot) {
    setSwapDish(dish)
    setSwapOptions(null)
    setSelectedNewId(null)
    setSwapReason(null)
    setSwapVisible(true)
    if (!currentPlanId) return
    setSwapOptionsLoading(true)
    try {
      const options = await api.getSwapOptions(currentPlanId, dish.id)
      setSwapOptions(options)
    } catch (e) {
      console.error('[Plan] getSwapOptions error', e)
      setSwapVisible(false)
      Taro.showToast({
        title: e instanceof Error && e.message ? e.message : '暂时拿不到候选，重试',
        icon: 'none',
      })
    } finally {
      setSwapOptionsLoading(false)
    }
  }

  function closeSwap() {
    setSwapVisible(false)
    setSwapDish(null)
    setSwapOptions(null)
    setSelectedNewId(null)
    setSwapReason(null)
  }

  function goSetup() {
    closeSwap()
    Taro.navigateTo({ url: '/pages/setup/index' })
  }

  // 确认换菜：服务端复检不过会返回中文原因（SwapRecheckError 400），如实展示
  async function confirmSwap() {
    if (!currentPlanId || !swapDish || !selectedNewId || !lockedMenuId) return
    setSwapping(true)
    try {
      const plan = await api.swapPlan(currentPlanId, {
        swapType: '单菜换',
        dishId: swapDish.id,
        newDishId: selectedNewId,
        ...(swapReason ? { reason: swapReason } : {}),
      })
      // 界面与数据库一致：从响应提取重写后的锁定菜单快照（prepSequence/总工时已重算）
      const lockedCandidate = plan.candidates.find((c) => c.menuId === lockedMenuId)
      const newMenu = lockedCandidate?.menu as MenuSnapshot | undefined
      if (newMenu) {
        setLockedMenu(lockedMenuId, newMenu)
      }
      // 清单已联动重算，重新拉取
      const list = await api.getShoppingList(currentPlanId)
      setShoppingList(list)
      Taro.showToast({ title: '已换菜', icon: 'success' })
      closeSwap()
    } catch (e) {
      console.error('[Plan] swap error', e)
      Taro.showToast({
        title: e instanceof Error && e.message ? e.message : '换菜失败，重试',
        icon: 'none',
      })
    } finally {
      setSwapping(false)
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

  const swapRoleLabel = swapOptions
    ? MEAL_ROLE_LABELS[swapOptions.mealRole] || swapOptions.mealRole
    : ''

  return (
    <View className="fm-page plan-page">
      <NavBar
        title={`${lockedMenu.name}·已锁定`}
        back={<ArrowLeft width={16} height={16} />}
        onBackClick={() => Taro.reLaunch({ url: '/pages/tonight/index' })}
      />

      {/* 今晚菜单菜卡区（e-final 屏②）：每张菜卡带「换一道」 */}
      <View className="fm-menu-block">
        <View className="fm-menu-block-head">
          <Text className="fm-menu-block-title">今晚菜单</Text>
          <Text className="fm-menu-block-meta">
            全程 {lockedMenu.totalActiveMinutes} 分钟 · {tonightPeopleLabel()}
          </Text>
        </View>
        {lockedMenu.dishes.map((d) => (
          <View key={d.id} className="fm-menu-dish-card">
            <View className="fm-menu-dish-info">
              <View className="fm-menu-dish-name-row">
                <Text className="fm-menu-dish-name">{d.name}</Text>
                <Tag type="primary">{MEAL_ROLE_LABELS[d.mealRole] || d.mealRole}</Tag>
              </View>
              <Text className="fm-menu-dish-meta">
                约 {d.activeMinutes} 分钟
                {d.flavorTags.length > 0 ? ` · ${d.flavorTags.join(' · ')}` : ''}
              </Text>
            </View>
            <Text className="fm-menu-swap-btn" onClick={() => openSwapPopup(d)}>
              换一道
            </Text>
          </View>
        ))}
      </View>

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

      {/* 换菜弹窗（e-final 屏③有候选 / 屏④无候选） */}
      <Popup visible={swapVisible} position="bottom" round onClose={closeSwap}>
        <View className="fm-popup-content fm-swap-popup">
          <Text className="fm-popup-title">
            {swapDish ? `换掉「${swapDish.name}」` : '换菜'}
          </Text>

          {swapOptionsLoading && (
            <Text className="fm-swap-sub">正在找能换的菜…</Text>
          )}

          {/* 屏④：无候选（共 0 个如实展示，C-6） */}
          {!swapOptionsLoading && swapOptions && swapOptions.candidates.length === 0 && (
            <View>
              <Text className="fm-swap-sub">
                候选来自同角色（{swapRoleLabel}），共 0 个——有多少如实展示。
              </Text>
              <View className="fm-swap-empty">
                <Text className="fm-swap-empty-emoji">🤷</Text>
                <Text className="fm-swap-empty-title">
                  暂时没有能换的{swapRoleLabel}
                </Text>
                <Text className="fm-swap-empty-text">
                  {`同样条件下，菜库里暂时没有别的${swapRoleLabel}。我们不会拿不合条件的菜凑数。`}
                </Text>
              </View>
              <View className="fm-popup-actions">
                <Button type="primary" block onClick={closeSwap}>
                  先保持这道菜
                </Button>
              </View>
              <View className="fm-popup-actions">
                <Button block onClick={goSetup}>
                  去长期设置看看
                </Button>
              </View>
            </View>
          )}

          {/* 屏③：有候选（挑选+原因选填） */}
          {!swapOptionsLoading && swapOptions && swapOptions.candidates.length > 0 && (
            <View>
              <Text className="fm-swap-sub">
                候选来自同角色（{swapRoleLabel}），共 {swapOptions.candidates.length}{' '}
                个——有多少如实展示。
              </Text>
              <ScrollView scrollY className="fm-swap-cand-list">
                {swapOptions.candidates.map((c: SwapOption) => (
                  <View
                    key={c.dishId}
                    className={`fm-swap-cand${selectedNewId === c.dishId ? ' on' : ''}`}
                    onClick={() => setSelectedNewId(c.dishId)}
                  >
                    <View className="fm-swap-cand-info">
                      <Text className="fm-swap-cand-name">{c.name}</Text>
                      <Text className="fm-swap-cand-meta">
                        {`约 ${c.activeMinutes} 分钟`}
                        {c.flavorTags.length > 0 ? ` · ${c.flavorTags.join(' · ')}` : ''}
                        {c.equipment.includes('steamer') ? ' · 需蒸锅' : ''}
                      </Text>
                    </View>
                    <Text className="fm-swap-cand-pick">
                      {selectedNewId === c.dishId ? '✓ 已选' : '换成这道'}
                    </Text>
                  </View>
                ))}
              </ScrollView>

              <Text className="fm-label">为什么换？（可选）</Text>
              <View className="fm-tag-row">
                {QUICK_REASONS.map((r) => (
                  <Tag
                    key={r}
                    type={swapReason === r ? 'primary' : 'default'}
                    onClick={() => setSwapReason(swapReason === r ? null : r)}
                  >
                    {r}
                  </Tag>
                ))}
              </View>
              <Text className="fm-swap-hint">不选原因也可以直接换。</Text>

              <View className="fm-popup-actions">
                <Button onClick={closeSwap}>先不换了</Button>
                <Button
                  type="primary"
                  disabled={!selectedNewId}
                  loading={swapping}
                  onClick={confirmSwap}
                >
                  确认换菜
                </Button>
              </View>
            </View>
          )}
        </View>
      </Popup>
    </View>
  )

  // 人数文案（store 里的今晚情境）
  function tonightPeopleLabel() {
    const { people } = useStore.getState().tonightContext
    return `按 ${people} 人份`
  }
}
