// apps/h5/src/pages/dish/index.tsx
// 菜品做法页（e-final 屏⑪，PD-016 方向 A 沉浸大图流，UI 基准 dish-detail-vA.html）：
// ①全出血大图开场（图上叠菜名+时长/菜系；无图降级色块+菜名占位，本版单图=契约 Dish.imageUrl）
// ②换道导航「‹ 上一道｜下一道 ›」（按今晚菜单 lockedMenu.dishes 数组序=备菜顺序，
//   plan 页已核实结论；直进无菜单上下文走空态页，导航自然不渲染）
// ③主料/调料分组用料（沿用现有人数口径；ingredients 空显示「用料待补齐」不虚构）
// ④笔记式步骤流（有图嵌图无图纯文字——DishStep.image 为可选步骤配图，契约 v0.11 起；重写数据按原图内容逐张绑定）
// ⑤底部悬浮胶囊「做完饭，记一笔」三态（可点/loading 禁点/已提交，R-3 防抖）；
//   提交逻辑沿用现状（跳 feedback 页三问），返回本页时查 getFeedback 回显已提交态
import { useEffect, useState } from 'react'
import Taro, { useDidShow } from '@tarojs/taro'
import { View, Text, Image } from '@tarojs/components'
import { useStore } from '../../store'
import EmptyState from '../../components/EmptyState'
import { api } from '../../api/client'
import type { DishSnapshot } from '../../types'
import './index.css'

const MEAL_ROLE_LABELS: Record<string, string> = {
  MAIN: '主菜',
  SIDE: '配菜',
  SOUP: '汤',
  STAPLE: '主食',
}
// DEC-007：无图降级占位 emoji（按角色映射），禁止 AI 图
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

// R-10 基址策略 B：库中只存相对路径（/images/dishes/...），绝对 URL 由渲染层按环境拼接
// 与 apps/h5 API client 同源 env（TARO_APP_API_BASE_URL：dev=http://127.0.0.1:3000 / prod=公网域名），
// 避免 Plan.candidates 快照固化环境地址（重蹈 R-10）
const API_BASE = (process.env.TARO_APP_API_BASE_URL || '').replace(/\/+$/, '')
const toAbsoluteImageUrl = (url?: string | null): string | undefined => {
  if (!url) return undefined
  if (/^https?:\/\//.test(url)) return url // 防御：历史绝对 URL 原样直用
  return `${API_BASE}${url}`
}

// R-3 操作条三态：idle 可点 / loading 提交中禁点 / done 已提交
type LogState = 'idle' | 'loading' | 'done'

export default function DishPage() {
  const { lockedMenu } = useStore()
  const people = useStore.getState().tonightContext.people || 4

  // plan 页菜卡跳入携带 dishId；无参默认第一道
  const dishId = Taro.getCurrentInstance().router?.params?.dishId
  const dish: DishSnapshot | undefined =
    (dishId && lockedMenu?.dishes.find((d) => d.id === dishId)) ||
    lockedMenu?.dishes[0]

  // ── 换道导航：lockedMenu.dishes 数组序 = MenuDish.sort = 备菜顺序 ──
  // 有菜单上下文且存在相邻菜才显示；直进（无 lockedMenu）走下方空态，导航不渲染
  const dishIndex = dish && lockedMenu
    ? lockedMenu.dishes.findIndex((d) => d.id === dish.id)
    : -1
  const prevDish =
    lockedMenu && dishIndex > 0 ? lockedMenu.dishes[dishIndex - 1] : undefined
  const nextDish =
    lockedMenu && dishIndex >= 0 && dishIndex < lockedMenu.dishes.length - 1
      ? lockedMenu.dishes[dishIndex + 1]
      : undefined
  const hasSwitcher = Boolean(prevDish || nextDish)

  // ── R-3 三态（沿用现有反馈提交逻辑：本页只做态反馈，提交在 feedback 页三问） ──
  const [logState, setLogState] = useState<LogState>('idle')

  // R-10 onError 降级：hero 图加载失败 → 切 hero-empty 同一降级分支；换道/换菜重置
  const [imgError, setImgError] = useState(false)
  useEffect(() => {
    setImgError(false)
  }, [dish?.id])

  // 每次页面显示（含从 feedback 返回）核对已提交态：有反馈记录=「记好了 ✓」，查询失败保持可点
  useDidShow(() => {
    const planId = useStore.getState().currentPlanId
    if (!planId) return
    api
      .getFeedback(planId)
      .then((fb) => setLogState(fb ? 'done' : 'idle'))
      .catch(() => {
        // R-1：查询失败不动 done/idle（如实，不假装已提交）；仅 loading 回退可点，
        // 否则「点记一笔→feedback 返回→查询失败」会永久卡在「正在记…」禁点态
        setLogState((s) => (s === 'loading' ? 'idle' : s))
      })
  })

  const goBack = () => {
    const pages = Taro.getCurrentPages()
    if (pages.length > 1) Taro.navigateBack()
    else Taro.reLaunch({ url: '/pages/plan/index' })
  }

  const goFeedback = () => {
    if (logState !== 'idle') return // R-3：loading/done 禁点防重复
    setLogState('loading')
    Taro.navigateTo({
      url: '/pages/feedback/index',
      fail: () => setLogState('idle'), // 跳转失败恢复可点
    })
  }

  // 换道：redirectTo 替换当前页（返回键直达菜单页，页面栈不随巡览增长）
  const switchDish = (target: DishSnapshot | undefined) => {
    if (!target) return
    Taro.redirectTo({ url: `/pages/dish/index?dishId=${target.id}` })
  }

  if (!lockedMenu || !dish) {
    return (
      <View className="fm-page dish-page">
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

  // 信息 chips：⏱ 时长（hot）· 角色 · 菜系 · 口味 · 器具（空段跳过）
  const metaChips: { text: string; hot?: boolean }[] = [
    { text: `⏱ 动手 ${dish.activeMinutes} 分`, hot: true },
    { text: MEAL_ROLE_LABELS[dish.mealRole] || dish.mealRole },
    ...(dish.cuisine ? [{ text: dish.cuisine }] : []),
    ...dish.flavorTags.map((t) => ({ text: t })),
    ...(dish.equipment.length > 0
      ? [{ text: dish.equipment.map((e) => EQUIPMENT_LABELS[e] || e).join('、') }]
      : []),
  ]

  // 用料分组：category==='调料' → 调料组，其余（含未标注）→ 主料组；不虚构不排序
  const ingredients = dish.ingredients ?? []
  const mainIngs = ingredients.filter((i) => i.category !== '调料')
  const seasonIngs = ingredients.filter((i) => i.category === '调料')

  const steps = dish.steps ?? []

  const renderChips = (overlay: boolean) => (
    <View className={overlay ? 'dish-hero-chips' : 'dish-meta-chips'}>
      {metaChips.map((c, i) => (
        <Text key={i} className={`dish-chip${c.hot ? ' dish-chip-hot' : ''}`}>
          {c.text}
        </Text>
      ))}
    </View>
  )

  const renderIngList = (list: typeof ingredients) => (
    <View className="dish-ing-grid">
      {list.map((ing, i) => (
        <View
          key={`${ing.ingredientName}-${i}`}
          className={`dish-ing-li${ing.optional ? ' dish-ing-opt' : ''}`}
        >
          <Text className="dish-ing-n">
            {ing.ingredientName}
            {ing.optional && <Text className="dish-opt-tag">可选</Text>}
          </Text>
          <Text className="dish-ing-q">{`${ing.qty}${ing.unit}`}</Text>
        </View>
      ))}
    </View>
  )

  // hero 图展示判定：库值（相对/历史绝对）→ 拼接后的可加载 URL；加载失败（onError）切降级分支
  const heroImageUrl = toAbsoluteImageUrl(dish.imageUrl)
  const showHero = Boolean(heroImageUrl) && !imgError

  return (
    <View className="fm-page dish-page">
      {/* ① 首屏大图区：340px 全出血；图上叠菜名+时长/菜系；无图/加载失败降级色块+菜名占位（.dish-hero 自带底色占位） */}
      <View className={`dish-hero${showHero ? '' : ' dish-hero-empty'}`}>
        {heroImageUrl && !imgError ? (
          <>
            <Image
              className="dish-hero-img"
              src={heroImageUrl}
              mode="aspectFill"
              onError={() => setImgError(true)}
            />
            <View className="dish-hero-fade" />
            <View className="dish-hero-overlay">
              <Text className="dish-hero-name">{dish.name}</Text>
              {renderChips(true)}
            </View>
          </>
        ) : (
          <>
            <View className="dish-hero-dash" />
            <Text className="dish-hero-empty-emoji">
              {ROLE_EMOJI[dish.mealRole] || '🍳'}
            </Text>
            <Text className="dish-hero-empty-name">{dish.name}</Text>
            <Text className="dish-hero-empty-note">
              {imgError
                ? '图片加载失败 · 已自动降级占位'
                : '试做实拍位 · 拍好就换上（本菜暂无图，按契约 imageUrl 缺省降级）'}
            </Text>
          </>
        )}
        {/* 返回浮钮（左上，沿用 goBack 逻辑） */}
        <View className="dish-float-back" onClick={goBack}>
          ‹
        </View>
        {/* 图侧换道箭头（②：仅存在相邻菜时渲染对应一侧） */}
        {prevDish && (
          <View
            className="dish-side-nav prev"
            onClick={() => switchDish(prevDish)}
          >
            ‹
          </View>
        )}
        {nextDish && (
          <View
            className="dish-side-nav next"
            onClick={() => switchDish(nextDish)}
          >
            ›
          </View>
        )}
      </View>

      {/* 无图/降级态：信息 chips 落在图下（菜名已在降级色块中，不重复） */}
      {!showHero && (
        <View className="dish-head">{renderChips(false)}</View>
      )}

      {/* ③ 用料卡：主料/调料分组；空=「用料待补齐」不虚构 */}
      <View className="fm-card">
        <View className="fm-row-label dish-ing-label">
          用料
          <Text className="dish-people">{`${people} 人份`}</Text>
        </View>
        {ingredients.length === 0 ? (
          <View className="dish-pending">
            <Text className="dish-pending-tag">用料待补齐</Text>
            <Text className="dish-pending-text">
              这道菜的用量还没整理进菜库，先按菜谱原帖做；等补齐后会按人数自动换算。
            </Text>
          </View>
        ) : (
          <>
            <View className="dish-ing-group-label">主料</View>
            {renderIngList(mainIngs)}
            {seasonIngs.length > 0 && (
              <>
                <View className="dish-ing-group-label">调料</View>
                {renderIngList(seasonIngs)}
              </>
            )}
          </>
        )}
      </View>

      {/* ④ 做法卡（本页唯一关键卡顶条）：笔记式 1-2-3；步骤有 image 嵌图（widthFix 等比全宽），无图纯文字 */}
      <View className="fm-card fm-accent">
        <View className="fm-row-label">做法</View>
        {steps.length > 0 ? (
          steps.map((step, i) => (
            <View key={i} className="dish-step">
              <Text className="dish-step-no">{step.order}</Text>
              <View className="dish-step-body">
                <Text className="dish-step-text">{step.text}</Text>
                {step.image && (
                  <Image
                    className="dish-step-img"
                    src={toAbsoluteImageUrl(step.image) ?? ''}
                    mode="widthFix"
                    lazyLoad
                  />
                )}
                {step.parallel && (
                  <Text className="dish-parallel-tag">⏸ 可并行</Text>
                )}
              </View>
            </View>
          ))
        ) : (
          <Text className="fm-hint">这道菜的做法还没有录入菜库。</Text>
        )}
      </View>

      {/* ② 页尾换道导航（与图侧箭头双通道）：上一道/下一道 菜名+时长 */}
      {hasSwitcher && (
        <View className="dish-switch">
          <View
            className={`dish-sw${prevDish ? '' : ' dish-sw-none'}`}
            onClick={() => switchDish(prevDish)}
          >
            <Text className="dish-sw-dir">‹ 上一道</Text>
            <Text className="dish-sw-name">
              {prevDish ? `${prevDish.name} · ${prevDish.activeMinutes} 分` : '—'}
            </Text>
          </View>
          <View
            className={`dish-sw dish-sw-next${nextDish ? '' : ' dish-sw-none'}`}
            onClick={() => switchDish(nextDish)}
          >
            <Text className="dish-sw-dir">下一道 ›</Text>
            <Text className="dish-sw-name">
              {nextDish ? `${nextDish.name} · ${nextDish.activeMinutes} 分` : '—'}
            </Text>
          </View>
        </View>
      )}

      {/* ⑤ 悬浮胶囊操作条：三态（可点 / loading 禁点 / 已提交），R-3 防抖 */}
      <View className="dish-dock">
        <View
          className={`dish-dock-btn${logState === 'loading' ? ' loading' : ''}${
            logState === 'done' ? ' done' : ''
          }`}
          onClick={goFeedback}
        >
          {logState === 'idle' && '做完饭，记一笔'}
          {logState === 'loading' && '正在记…'}
          {logState === 'done' && '记好了 ✓'}
        </View>
      </View>
    </View>
  )
}
