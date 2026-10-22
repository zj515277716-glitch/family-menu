// apps/h5/src/pages/meal-setup/index.tsx
// S-04 定明天的餐（C-2）：人数步进（默认带出长期设置）、必消食材、临时忌口（仅明天生效）、
// 想吃的菜（从菜谱池点选，禁止输入系统编号）、餐次勾选（默认全选，至少留一餐）。
// 编辑会话草稿存 store（按计划日为键）：同日重进原样保留，跨日重建（设计规则 5）。
// 原型：docs/design/v2/prototypes/style-1/v3/meal-setup.html。
import { useCallback, useEffect, useState } from 'react'
import Taro from '@tarojs/taro'
import { View, Text, Input } from '@tarojs/components'
import { Button, Popup } from '@nutui/nutui-react-taro'
import type { Dish, FamilyRule } from '@family-menu/shared'
import { MEAL_SLOTS, MEAL_SLOT_LABELS } from '@family-menu/shared'
import { api, dishApi, UnauthorizedError } from '../../api/client'
import { useMealSetupStore } from '../../store/meal-setup'
import { formatDateCN, tomorrowDateStr } from '../../lib/day-plan'
import { buildRecommendPayload } from '../../lib/meal-setup-draft'
import { pageUrl } from '../../lib/entry'

type Phase = 'loading' | 'ready' | 'error' | 'no-rule'
type DishPhase = 'loading' | 'ready' | 'error'
type PopupMode = 'must' | 'temp' | null

export default function MealSetupPage() {
  const planDate = tomorrowDateStr()
  const [phase, setPhase] = useState<Phase>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [rule, setRule] = useState<FamilyRule | null>(null)

  const [dishPhase, setDishPhase] = useState<DishPhase>('loading')
  const [dishes, setDishes] = useState<Dish[]>([])
  const [query, setQuery] = useState('')

  const [popupMode, setPopupMode] = useState<PopupMode>(null)
  const [popupValue, setPopupValue] = useState('')

  const draft = useMealSetupStore((s) => s.draft)
  const ensure = useMealSetupStore((s) => s.ensure)
  const setPeople = useMealSetupStore((s) => s.setPeople)
  const addMustUse = useMealSetupStore((s) => s.addMustUse)
  const removeMustUse = useMealSetupStore((s) => s.removeMustUse)
  const addTempAvoidance = useMealSetupStore((s) => s.addTempAvoidance)
  const removeTempAvoidance = useMealSetupStore((s) => s.removeTempAvoidance)
  const addDesiredDish = useMealSetupStore((s) => s.addDesiredDish)
  const removeDesiredDish = useMealSetupStore((s) => s.removeDesiredDish)
  const toggleMealSlot = useMealSetupStore((s) => s.toggleMealSlot)

  const load = useCallback(async () => {
    setPhase('loading')
    setLoadError(null)
    try {
      const r = await api.getFamilyRules()
      if (!r) {
        setRule(null)
        setPhase('no-rule')
        return
      }
      setRule(r)
      // 同日重进保留已填；跨日按最新长期设置重建（resolveDraft 保证）
      ensure(planDate, { adults: r.defaultAdults, children: r.defaultChildren })
      setPhase('ready')
    } catch (e) {
      if (e instanceof UnauthorizedError) return // 401 已由封装导回登录页
      console.error('[MealSetup] 家庭规则加载失败', e)
      // S-13：服务未连接也让表单本地可填（人数先给可改的起点，不冒充已存长期设置）；
      // 推荐按钮仍要求规则读回来，恢复后点重试即可继续。
      ensure(planDate, { adults: 2, children: 0 })
      setLoadError(e instanceof Error ? e.message : '服务未连接')
      setPhase('error')
    }
  }, [ensure, planDate])

  const loadDishes = useCallback(async () => {
    setDishPhase('loading')
    try {
      const list = await dishApi.listPublished()
      setDishes(list)
      setDishPhase('ready')
    } catch (e) {
      if (e instanceof UnauthorizedError) return
      console.error('[MealSetup] 菜谱池加载失败', e)
      setDishPhase('error')
    }
  }, [])

  useEffect(() => {
    load()
    loadDishes()
  }, [load, loadDishes])

  function goHome() {
    Taro.reLaunch({ url: pageUrl('home') })
  }

  function changePeople(nextAdults: number, nextChildren: number) {
    if (!draft) return
    if (nextAdults < 1) {
      Taro.showToast({ title: '至少 1 位成人', icon: 'none' })
      return
    }
    if (nextAdults > 20) {
      Taro.showToast({ title: '成人最多 20 位', icon: 'none' })
      return
    }
    if (nextChildren < 0) {
      Taro.showToast({ title: '儿童不能少于 0 位', icon: 'none' })
      return
    }
    if (nextChildren > 10) {
      Taro.showToast({ title: '儿童最多 10 位', icon: 'none' })
      return
    }
    setPeople(nextAdults, nextChildren)
  }

  function openPopup(mode: PopupMode) {
    setPopupValue('')
    setPopupMode(mode)
  }

  function addPopupTag() {
    const v = popupValue.trim()
    if (!v) {
      Taro.showToast({ title: '先填上名称', icon: 'none' })
      return
    }
    if (popupMode === 'must') addMustUse(v)
    if (popupMode === 'temp') addTempAvoidance(v)
    setPopupMode(null)
    setPopupValue('')
  }

  function chooseDish(d: Dish) {
    addDesiredDish({ id: d.id, name: d.name })
    setQuery('')
    Taro.showToast({ title: `已加入：${d.name}`, icon: 'none' })
  }

  function toggleMeal(slot: (typeof MEAL_SLOTS)[number]) {
    if (!draft) return
    if (draft.meals.length === 1 && draft.meals.includes(slot)) {
      Taro.showToast({ title: '至少保留一餐', icon: 'none' })
      return
    }
    toggleMealSlot(slot)
  }

  function handleRecommend() {
    if (!draft) {
      Taro.showToast({ title: '还没准备好，稍等再试', icon: 'none' })
      return
    }
    if (!rule) {
      Taro.showToast({ title: '家庭设置还没读回来，恢复后再生成', icon: 'none' })
      return
    }
    const timeBudgetMin =
      rule.timeBudgets.find((v): v is 15 | 30 | 60 => v === 15 || v === 30 || v === 60) ?? 30
    const payload = buildRecommendPayload(draft, {
      timeBudgetMin,
      avoidRecentDays: rule.avoidRecentDays,
    })
    const avoid = payload.avoidRecentDays ?? rule.avoidRecentDays
    // 只带参数跳转：推荐请求在 day-menu 的骨架屏里发（S-05），不在本页直接调
    Taro.navigateTo({
      url: `/pages/day-menu/index?date=${planDate}&generate=1&tb=${payload.timeBudgetMin}&avoid=${avoid}`,
    })
  }

  const dateText = formatDateCN(new Date(`${planDate}T00:00:00`))
  const q = query.trim()
  const matches = q ? dishes.filter((d) => d.name.includes(q)).slice(0, 10) : []

  const header = (
    <View className="topbar">
      <Text className="back" onClick={goHome}>
        ‹ 返回首页
      </Text>
      <View className="h1">定明天的餐</View>
      <View className="sub">{dateText} · 填完点「推荐菜谱」；重进不丢已填内容</View>
    </View>
  )

  if (phase === 'loading' || (phase === 'ready' && !draft)) {
    return (
      <View className="fm-page">
        {header}
        {[0, 1, 2, 3].map((g) => (
          <View className="sgroup-block" key={g}>
            <View className="sk sk-label" />
            <View className="sk-group">
              <View className="sk-row" />
              <View className="sk-row" />
            </View>
          </View>
        ))}
      </View>
    )
  }

  if (phase === 'error' && !draft) {
    return (
      <View className="fm-page">
        {header}
        <View className="banner banner-warn">
          <Text>⚠ {loadError || '服务未连接'}，家庭设置没读出来</Text>
          <Text className="act" onClick={load}>
            重试
          </Text>
        </View>
      </View>
    )
  }

  if (phase === 'no-rule') {
    return (
      <View className="fm-page">
        {header}
        <View className="card empty-box">
          <View className="empty-title">先填家庭设置</View>
          <View className="empty-text">
            家里几口人、忌口与喜好设一次，定明天的餐才有默认人数可用。
          </View>
          <Button className="btn-main" onClick={() => Taro.reLaunch({ url: pageUrl('settings') })}>
            去填家庭设置
          </Button>
        </View>
      </View>
    )
  }

  if (!draft) return null

  return (
    <View className="fm-page with-stickybar">
      {header}

      {phase === 'error' && (
        <View className="banner banner-warn">
          <Text>
            ⚠ {loadError || '服务未连接'}，家庭设置没读出来；人数先按默认值填，可手动改
          </Text>
          <Text className="act" onClick={load}>
            重试
          </Text>
        </View>
      )}

      {/* 人数：大号步进器（默认带出长期设置，可临时改） */}
      <View className="card">
        <View className="form-title">明天几个人吃</View>
        <View className="form-note">
          {rule ? '默认带出长期设置，可临时改' : '服务未连接，人数先按默认值，可手动改'}
        </View>
        <View className="frow">
          <Text className="frow-label">成人</Text>
          <View className="stepper stepper-lg">
            <View
              className={`step-btn${draft.adults <= 1 ? ' disabled' : ''}`}
              onClick={() => changePeople(draft.adults - 1, draft.children)}
            >
              −
            </View>
            <Text className="step-val">{draft.adults}</Text>
            <View
              className={`step-btn${draft.adults >= 20 ? ' disabled' : ''}`}
              onClick={() => changePeople(draft.adults + 1, draft.children)}
            >
              ＋
            </View>
          </View>
        </View>
        <View className="frow">
          <Text className="frow-label">
            儿童<Text className="frow-note">儿童餐少辣、少刺、软烂</Text>
          </Text>
          <View className="stepper stepper-lg">
            <View
              className={`step-btn${draft.children <= 0 ? ' disabled' : ''}`}
              onClick={() => changePeople(draft.adults, draft.children - 1)}
            >
              −
            </View>
            <Text className="step-val">{draft.children}</Text>
            <View
              className={`step-btn${draft.children >= 10 ? ' disabled' : ''}`}
              onClick={() => changePeople(draft.adults, draft.children + 1)}
            >
              ＋
            </View>
          </View>
        </View>
      </View>

      {/* 必消食材：只填名称（服务端按名归一），不让用户接触系统编号 */}
      <View className="section">
        <View className="card">
          <View className="form-title">必消食材</View>
          <View className="form-note">冰箱里要先用掉的，明天一定排上；没消耗会明说</View>
          <View className="chips">
            {draft.mustUse.map((v) => (
              <View className="chip" key={v}>
                <Text>{v}</Text>
                <Text className="x" onClick={() => removeMustUse(v)}>
                  ×
                </Text>
              </View>
            ))}
            <View className="chip chip-add" onClick={() => openPopup('must')}>
              ＋ 加食材
            </View>
          </View>
        </View>
      </View>

      {/* 临时忌口：独立区，仅明天生效，不影响长期设置 */}
      <View className="section">
        <View className="card">
          <View className="form-title">
            临时忌口　<Text className="tag tag-next">仅明天生效</Text>
          </View>
          <View className="form-note">生病、上火等今天不想吃的，不影响长期设置</View>
          <View className="chips">
            {draft.tempAvoidances.map((v) => (
              <View className="chip chip-temp" key={v}>
                <Text>{v}</Text>
                <Text className="x" onClick={() => removeTempAvoidance(v)}>
                  ×
                </Text>
              </View>
            ))}
            <View className="chip chip-add" onClick={() => openPopup('temp')}>
              ＋ 加忌口
            </View>
          </View>
        </View>
      </View>

      {/* 想吃的菜：输入菜名过滤菜谱池，点选加入；不输入系统编号 */}
      <View className="section">
        <View className="card">
          <View className="form-title">想吃的菜（选填）</View>
          <View className="form-note">
            输入菜名从菜谱池点选；与忌口冲突会如实说明未排入
          </View>
          <Input
            className="input"
            placeholder="例：番茄炒蛋"
            aria-label="想吃的菜"
            value={query}
            onInput={(e) => setQuery(e.detail.value)}
          />

          {draft.desired.length > 0 && (
            <View className="chips">
              {draft.desired.map((d) => (
                <View className="chip" key={d.id}>
                  <Text>{d.name}</Text>
                  <Text className="x" onClick={() => removeDesiredDish(d.id)}>
                    ×
                  </Text>
                </View>
              ))}
            </View>
          )}

          {dishPhase === 'loading' && <View className="form-note mt-2">菜谱池加载中…</View>}
          {dishPhase === 'error' && (
            <View className="banner banner-warn mt-2">
              <Text>菜谱池没读出来，想吃的菜暂时选不了</Text>
              <Text className="act" onClick={loadDishes}>
                重试
              </Text>
            </View>
          )}
          {dishPhase === 'ready' && q && (
            <View className="cand-list">
              {matches.length === 0 ? (
                <View className="form-note">没有找到「{q}」这道菜，换个名字试试</View>
              ) : (
                matches.map((d) => (
                  <View className="cand-item" key={d.id} onClick={() => chooseDish(d)}>
                    <View>
                      <View className="cand-name">{d.name}</View>
                      <View className="cand-meta">约 {d.activeMinutes} 分钟动火</View>
                    </View>
                  </View>
                ))
              )}
            </View>
          )}
        </View>
      </View>

      {/* 餐次：默认全选，点一下可去掉；至少保留一餐 */}
      <View className="section">
        <View className="card">
          <View className="form-title">餐次</View>
          <View className="form-note">默认全选，点一下可去掉；至少保留一餐</View>
          <View className="opts">
            {MEAL_SLOTS.map((slot) => (
              <View
                key={slot}
                className={`opt${draft.meals.includes(slot) ? ' on' : ''}`}
                onClick={() => toggleMeal(slot)}
              >
                {MEAL_SLOT_LABELS[slot]}
              </View>
            ))}
          </View>
        </View>
      </View>

      <View className="stickybar">
        <Button className="btn-main" onClick={handleRecommend}>
          推荐菜谱
        </Button>
      </View>

      {/* 加食材/加忌口弹层：取消不丢已填，添加后清空输入 */}
      <Popup
        visible={popupMode !== null}
        position="bottom"
        round
        onClose={() => {
          setPopupMode(null)
          setPopupValue('')
        }}
      >
        <View className="sheet-body">
          <View className="sheet-grab" />
          <View className="sheet-title">{popupMode === 'temp' ? '加临时忌口' : '加必消食材'}</View>
          <View className="sheet-sub">
            {popupMode === 'temp' ? '只在明天这一顿生效，不改长期设置' : '写食材名称即可，服务端会按名匹配'}
          </View>
          <View className="sheet-label">名称</View>
          <Input
            className="input"
            placeholder={popupMode === 'temp' ? '例：牛肉' : '例：番茄'}
            value={popupValue}
            onInput={(e) => setPopupValue(e.detail.value)}
            onConfirm={addPopupTag}
          />
          <View className="btn-row">
            <Button
              className="btn-plain"
              onClick={() => {
                setPopupMode(null)
                setPopupValue('')
              }}
            >
              取消
            </Button>
            <Button className="btn-main" onClick={addPopupTag}>
              添加
            </Button>
          </View>
        </View>
      </Popup>
    </View>
  )
}
