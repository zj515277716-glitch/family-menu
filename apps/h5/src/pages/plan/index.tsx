// apps/h5/src/pages/plan/index.tsx
// F4/F5 今晚的菜单 + 购物清单（/pages/plan，流式页）
// UI 定稿对齐：e-final 屏②（今晚的菜单）/ 屏⑦（购物清单）/ 屏⑧（清单空）/ 屏③④（换菜弹窗）——PD-011
// 单页滚动融合：菜卡（首张强调底）+ 备菜顺序 + 人数步进清单 + 单底部条
import { useEffect, useState } from 'react'
import Taro from '@tarojs/taro'
import { View, Text } from '@tarojs/components'
import { Button, Checkbox, Popup } from '@nutui/nutui-react-taro'
import { api } from '../../api/client'
import { useStore } from '../../store'
import CustomTabBar from '../../components/CustomTabBar'
import EmptyState from '../../components/EmptyState'
import type {
  DishSnapshot,
  MenuSnapshot,
  ShoppingListData,
  SwapOption,
  SwapOptionsResponse,
} from '../../types'
import type { ExclusionRule } from '@family-menu/shared'
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
// e-final 屏③ 原因快捷项（选填，v0.4 reason 可选）
const QUICK_REASONS = ['做腻了', '家里没有食材', '时间不够', '想换个口味']

export default function PlanPage() {
  const { currentPlanId, lockedMenuId, lockedMenu, setLockedMenu } = useStore()
  const { mustUse, timeBudgetMin } = useStore().tonightContext
  const [shoppingList, setShoppingList] = useState<ShoppingListData | null>(null)
  const [loading, setLoading] = useState(true)
  // 定稿屏⑮同理：清单拉取失败 -> 页内横幅+明说，不假装空态
  const [listError, setListError] = useState(false)

  // ── 人数步进器（初值=今晚情境人数；rescale 成功后同步 store） ──
  const [people, setPeople] = useState(() => useStore.getState().tonightContext.people)
  const [rescaling, setRescaling] = useState(false)
  // ── C-8「就按这个买」+ PD-015 两态（仅会话态，不持久化） ──
  // 未确认：一次性确认（重复点击无副作用，不重复 set）；确认后：变「开始做菜」，点击跳备菜第一道
  const [bought, setBought] = useState(false)

  // ── 换菜弹窗状态 ──
  const [swapVisible, setSwapVisible] = useState(false)
  const [swapDish, setSwapDish] = useState<DishSnapshot | null>(null)
  const [swapOptions, setSwapOptions] = useState<SwapOptionsResponse | null>(null)
  const [swapOptionsLoading, setSwapOptionsLoading] = useState(false)
  const [selectedNewId, setSelectedNewId] = useState<string | null>(null)
  const [swapReason, setSwapReason] = useState<string | null>(null)
  const [swapping, setSwapping] = useState(false)
  // C-3a：换一批（整套重推）加载态
  const [refreshing, setRefreshing] = useState(false)

  // 屏④空态文案需要忌口信息（避开 X 和 Y）
  const [exclusions, setExclusions] = useState<ExclusionRule[]>([])

  useEffect(() => {
    if (currentPlanId) {
      loadShoppingList()
    } else {
      setLoading(false)
    }
    api
      .getExclusions()
      .then(setExclusions)
      .catch(() => setExclusions([]))
  }, [])

  async function loadShoppingList() {
    if (!currentPlanId) return
    try {
      const list = await api.getShoppingList(currentPlanId)
      setShoppingList(list)
      setListError(false)
    } catch (e) {
      console.error('[Plan] loadShoppingList error', e)
      setListError(true)
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

  // ── 改人数 -> 服务端重算清单（按 ingredientId 保留勾选）-> 同步 store ──
  // UI 防误触范围 1-20 人（契约只要求 >=1 整数）；加载态防连点
  async function handleRescale(next: number) {
    if (!currentPlanId || rescaling) return
    if (next < 1 || next > 20 || next === people) return
    setRescaling(true)
    try {
      const list = await api.rescaleShoppingList(currentPlanId, next)
      setShoppingList(list)
      setPeople(next)
      useStore.getState().setTonightPeople(next)
    } catch (e) {
      console.error('[Plan] rescale error', e)
      Taro.showToast({
        title: e instanceof Error && e.message ? e.message : '改人数失败，重试',
        icon: 'none',
      })
    } finally {
      setRescaling(false)
    }
  }

  // ── 换菜（真实替换） ──

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
    Taro.reLaunch({ url: '/pages/setup/index' })
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

  // ── 换一批（C-3a）：按同样条件（今晚人数、时长档、必消、忌口）整套重推 ──
  // 后端排除当前候选重新推荐；全换请求体只带 swapType（契约 superRefine）
  async function handleRefreshAll() {
    if (!currentPlanId || refreshing) return
    setRefreshing(true)
    try {
      const plan = await api.swapPlan(currentPlanId, { swapType: '全换' })
      // 全换响应的 lockedMenuId 是新一套的 id（与单菜换不同，不能用 store 旧值查）
      const lockedCandidate = plan.candidates.find(
        (c) => c.menuId === plan.lockedMenuId,
      )
      const newMenu = lockedCandidate?.menu as MenuSnapshot | undefined
      if (plan.lockedMenuId && newMenu) {
        // 必消横幅/备菜顺序/总耗时都渲染自 lockedMenu，一次 set 同步更新
        setLockedMenu(plan.lockedMenuId, newMenu)
      }
      // 清单已联动重算，重新拉取；拉取失败走既有 listError 横幅（不谎报"没换成"）
      try {
        const list = await api.getShoppingList(currentPlanId)
        setShoppingList(list)
        setListError(false)
      } catch {
        setListError(true)
      }
      Taro.showToast({ title: '已换一批', icon: 'success' })
    } catch (e) {
      console.error('[Plan] refreshAll error', e)
      // 失败提示「没换成」；原菜单未动（store 未写），保持原样可再试
      Taro.showToast({ title: '没换成', icon: 'none' })
    } finally {
      setRefreshing(false)
    }
  }

  function goFeedback() {
    Taro.navigateTo({ url: '/pages/feedback/index' })
  }

  function goDish(dish: DishSnapshot) {
    Taro.navigateTo({ url: `/pages/dish/index?dishId=${dish.id}` })
  }

  // 无锁定菜单 -> 屏⑧同族空态（无死胡同）
  if (!currentPlanId || !lockedMenu) {
    return (
      <View className="fm-page plan-page">
        <Text className="fm-h1">今晚的菜单</Text>
        <EmptyState
          emoji="🧺"
          title="还没有清单"
          desc="先定好今晚的菜单，清单会自动按人数把用量算好、取整。"
          btnText="去定今晚的菜单"
          onBtnClick={() => Taro.reLaunch({ url: '/pages/tonight/index' })}
        />
        <CustomTabBar />
      </View>
    )
  }

  const swapRoleLabel = swapDish
    ? MEAL_ROLE_LABELS[swapDish.mealRole] || swapDish.mealRole
    : ''

  // PD-015：跳当晚备菜顺序第一道菜的详细做法页（与顶部菜卡同一入口）。
  // 已核实（真实 API 实测）：lockedMenu.dishes 数组顺序 = MenuDish.sort 顺序，
  // 且 prepSequence 即按 dishes 数组顺序串行展开——dishes[0] 就是备菜顺序第一道菜。
  // （?. 仅为通过 TS 闭包收窄检查；主渲染分支已保证 lockedMenu 非空）
  function goFirstDish() {
    const first = lockedMenu?.dishes[0]
    if (first) goDish(first)
  }

  // 屏④文案：同样条件下（配菜 · 30 分钟内 · 避开花生和内脏）
  const hardNames = exclusions
    .filter((e) => e.severity === 'HARD')
    .map((e) => e.targetId || e.targetTag || '')
    .filter(Boolean)
  const softNames = exclusions
    .filter((e) => e.severity === 'SOFT')
    .map((e) => e.targetId || e.targetTag || '')
    .filter(Boolean)
  const avoidText = [...hardNames, ...softNames].join('和')

  return (
    <View className="fm-page plan-page">
      <Text className="fm-h1">今晚的菜单</Text>
      <Text className="fm-sub">
        {`${lockedMenu.name} · 全程 ${lockedMenu.totalActiveMinutes} 分钟 · 按 ${people} 人份 · 点菜卡可看做法`}
      </Text>

      {mustUse.length > 0 && (
        <View className="fm-ok-banner">✓ 必消食材已用上：{mustUse.join('、')}</View>
      )}

      <View style={{ height: '24px' }} />

      {listError ? (
        // 拉取失败：横幅+明说不假装+重试
        <>
          <View className="fm-error-banner">⚠ 服务未连接，暂时拿不到清单</View>
          <View className="fm-card fm-empty">
            <View className="fm-empty-emoji">📡</View>
            <View className="fm-empty-title">清单没取回来</View>
            <View className="fm-empty-text">
              清单需要连接服务才能显示。现在连不上，这一页就先空着——不是没有清单。等连接恢复后点「重试」就好。
            </View>
          </View>
        </>
      ) : loading ? (
        // 骨架屏加载态
        <>
          <View className="fm-skel fm-skel-banner" />
          <View className="fm-card">
            <View className="fm-skel fm-skel-line" />
            <View className="fm-skel fm-skel-line fm-skel-line-short" />
            <View className="fm-skel fm-skel-line" />
            <View className="fm-skel fm-skel-line fm-skel-line-short" />
          </View>
        </>
      ) : (
        <>
          {/* 屏②：菜卡列表（首张强调底） */}
          {lockedMenu.dishes.map((d, i) => (
            <View
              key={d.id}
              className={`fm-card fm-dish${i === 0 ? ' fm-accent' : ''}`}
              onClick={() => goDish(d)}
            >
              <View className="fm-dish-img">{ROLE_EMOJI[d.mealRole] || '🍳'}</View>
              <View className="fm-dish-main">
                <View>
                  <Text className="fm-dish-name">{d.name}</Text>
                  <Text className="fm-role-tag">
                    {MEAL_ROLE_LABELS[d.mealRole] || d.mealRole}
                  </Text>
                </View>
                <Text className="fm-dish-meta">
                  {`约 ${d.activeMinutes} 分钟`}
                  {d.flavorTags.length > 0 ? ` · ${d.flavorTags.join(' · ')}` : ''}
                </Text>
              </View>
              <View
                className="fm-btn-swap"
                onClick={(e) => {
                  e.stopPropagation()
                  openSwapPopup(d)
                }}
              >
                换一道
              </View>
            </View>
          ))}

          {/* 屏②：备菜顺序卡 */}
          <View className="fm-card">
            <Text className="fm-row-label">备菜顺序</Text>
            <View className="fm-timeline">
              {lockedMenu.prepSequence.map((step, i) => (
                <View key={i} className="fm-timeline-li">
                  <Text className="fm-timeline-t">{`${step.minute} 分钟`}</Text>
                  <Text>{step.action}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* 屏②：换一批——整套按同样条件重新推荐（e-final s2 顺序：备菜顺序卡之后，C-3a） */}
          <Button
            className="fm-btn-ghost"
            loading={refreshing}
            onClick={handleRefreshAll}
          >
            换一批
          </Button>

          {/* 屏⑦：购物清单 */}
          <Text className="fm-row-label" style={{ margin: '24px 24px 0' }}>
            购物清单
          </Text>
          <View className="fm-card">
            <View className="fm-stepper">
              <View
                className={`fm-step-btn${rescaling || people <= 1 ? ' disabled' : ''}`}
                onClick={() => handleRescale(people - 1)}
              >
                −
              </View>
              <Text className="fm-step-num">{`${people} 人份`}</Text>
              <View
                className={`fm-step-btn${rescaling || people >= 20 ? ' disabled' : ''}`}
                onClick={() => handleRescale(people + 1)}
              >
                ＋
              </View>
            </View>
            <Text className="fm-sub" style={{ marginTop: '12px' }}>
              改人数，用量自动缩放
            </Text>
          </View>

          {shoppingList?.groups.map((group, gi) => (
            <View key={group.category}>
              <Text className="fm-group-title">{group.category}</Text>
              <View className="fm-card">
                {group.items.map((item, ii) => (
                  <View
                    key={item.ingredientId}
                    className={`fm-li${ii === group.items.length - 1 ? ' fm-li-last' : ''}`}
                  >
                    <Checkbox
                      checked={item.checked}
                      onChange={(v) => handleCheck(item.ingredientId, !!v)}
                    />
                    <Text className="fm-li-name">
                      <Text className={item.checked ? 'fm-li-checked' : ''}>
                        {item.name}
                      </Text>
                    </Text>
                    {item.alreadyHave && (
                      <Text className="fm-tag-have">已有 · 必消</Text>
                    )}
                    {item.pantryStaple && (
                      <Text className="fm-tag-pantry">家里常备</Text>
                    )}
                    <Text className="fm-li-qty">
                      {item.qty}
                      {item.unit}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ))}

          <View className="fm-hint">
            标了「已有」的不用买——留在清单里是为了提醒你别漏用。
          </View>
        </>
      )}

      <View className="fm-bottom-bar">
        {listError ? (
          <Button className="fm-btn-primary" onClick={loadShoppingList}>
            重试
          </Button>
        ) : (
          <>
            {/* PD-015 两态：未确认=「就按这个买」一次性确认；确认后=「开始做菜」跳备菜第一道。
                不保留「✓ 已按这个买」静止文案。 */}
            <Button
              className="fm-btn-primary"
              onClick={() => (bought ? goFirstDish() : setBought(true))}
            >
              {bought ? '开始做菜' : '就按这个买'}
            </Button>
            <Button className="fm-btn-ghost" onClick={goFeedback}>
              做完饭回来记录一下 →
            </Button>
          </>
        )}
      </View>

      {/* 换菜弹窗（e-final 屏③有候选 / 屏④无候选） */}
      <Popup visible={swapVisible} position="bottom" round onClose={closeSwap}>
        <View className="fm-swap-popup">
          <Text className="fm-swap-title">
            {swapDish ? `换掉「${swapDish.name}」` : '换菜'}
          </Text>

          {swapOptionsLoading && (
            <Text className="fm-swap-sub">正在找能换的菜…</Text>
          )}

          {/* 屏④：无候选（共 0 个如实展示，C-6） */}
          {!swapOptionsLoading && swapOptions && swapOptions.candidates.length === 0 && (
            <View>
              <Text className="fm-swap-sub">
                {`候选来自同角色（${swapRoleLabel}），共 0 个——有多少如实展示。`}
              </Text>
              <View className="fm-card fm-swap-empty">
                <View className="fm-empty-emoji">🤷</View>
                <View className="fm-empty-title">
                  {`暂时没有能换的${swapRoleLabel}`}
                </View>
                <View className="fm-empty-text">
                  {`同样条件下（${swapRoleLabel} · ${timeBudgetMin} 分钟内 · ${
                    avoidText ? `避开${avoidText}` : '没有忌口'
                  }），菜库里暂时没有别的${swapRoleLabel}。我们不会拿不合条件的菜凑数。`}
                </View>
              </View>
              <Button className="fm-btn-primary" onClick={closeSwap}>
                先保持这道菜
              </Button>
              <Button className="fm-btn-ghost" onClick={goSetup}>
                去长期设置看看
              </Button>
            </View>
          )}

          {/* 屏③：有候选（挑选+原因选填） */}
          {!swapOptionsLoading && swapOptions && swapOptions.candidates.length > 0 && (
            <View>
              <Text className="fm-swap-sub">
                {`候选来自同角色（${swapRoleLabel}），共 ${swapOptions.candidates.length} 个——有多少如实展示。`}
              </Text>
              <View className="fm-swap-cand-list">
                {swapOptions.candidates.map((c: SwapOption) => (
                  <View
                    key={c.dishId}
                    className={`fm-card fm-dish fm-swap-cand${selectedNewId === c.dishId ? ' on' : ''}`}
                    onClick={() => setSelectedNewId(c.dishId)}
                  >
                    <View className="fm-dish-img">
                      {swapDish ? ROLE_EMOJI[swapDish.mealRole] || '🍳' : '🍳'}
                    </View>
                    <View className="fm-dish-main">
                      <View>
                        <Text className="fm-dish-name">{c.name}</Text>
                      </View>
                      <Text className="fm-dish-meta">
                        {`约 ${c.activeMinutes} 分钟`}
                        {c.flavorTags.length > 0
                          ? ` · ${c.flavorTags.join(' · ')}`
                          : ''}
                        {c.equipment.includes('steamer') ? ' · 需蒸锅' : ''}
                      </Text>
                    </View>
                    <View className="fm-btn-swap">
                      {selectedNewId === c.dishId ? '✓ 已选' : '换成这道'}
                    </View>
                  </View>
                ))}
              </View>

              <Text className="fm-row-label">为什么换？（可选）</Text>
              <View className="fm-chip-opts">
                {QUICK_REASONS.map((r) => (
                  <View
                    key={r}
                    className={`fm-chip-opt${swapReason === r ? ' on' : ''}`}
                    onClick={() => setSwapReason(swapReason === r ? null : r)}
                  >
                    {r}
                  </View>
                ))}
              </View>
              <Text className="fm-swap-sub" style={{ marginTop: '12px' }}>
                不选原因也可以直接换。
              </Text>

              <Button
                className="fm-btn-primary"
                disabled={!selectedNewId}
                loading={swapping}
                onClick={confirmSwap}
              >
                确认换菜
              </Button>
              <Button className="fm-btn-ghost" onClick={closeSwap}>
                先不换了
              </Button>
            </View>
          )}
        </View>
      </Popup>

      <CustomTabBar />
    </View>
  )
}
