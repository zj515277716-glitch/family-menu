// apps/h5/src/pages/shopping-list/index.tsx
// S-08 采购清单 + 备菜建议（C-4）：三餐食材合并去重后的一张清单；必消「已有」划线不删；
// 勾选乐观更新 → PATCH，成功后以服务端响应合并，失败回滚该条并提示重试（同一时间只提交一条）。
// 原型：docs/design/v2/prototypes/style-1/v3/c.html。
import { useCallback, useEffect, useState } from 'react'
import Taro from '@tarojs/taro'
import { View, Text } from '@tarojs/components'
import { Button } from '@nutui/nutui-react-taro'
import type { ShoppingList, ShoppingListItem } from '@family-menu/shared'
import { planApi, UnauthorizedError } from '../../api/client'
import {
  countToBuy,
  formatQty,
  mergePatchResponse,
  toggleItemLocal,
  totalItems,
} from '../../lib/shopping-list'
import { pageUrl } from '../../lib/entry'

type Phase = 'loading' | 'ready' | 'empty' | 'error' | 'missing'

function errorText(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback
}

function PrepBlock({ title, sub, steps }: { title: string; sub: string; steps: string[] }) {
  return (
    <View className="prep-card mt-3">
      <View className="prep-title">{title}</View>
      <View className="prep-sub">{sub}</View>
      {steps.map((s, i) => (
        <View className="step" key={`${i}-${s}`}>
          <Text className="num">{i + 1}</Text>
          <Text className="txt">{s}</Text>
        </View>
      ))}
    </View>
  )
}

export default function ShoppingListPage() {
  const router = Taro.useRouter()
  const planId = router.params.planId

  const [phase, setPhase] = useState<Phase>(planId ? 'loading' : 'missing')
  const [list, setList] = useState<ShoppingList | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)

  async function backPrev() {
    if (Taro.getCurrentPages().length <= 1) {
      Taro.reLaunch({ url: pageUrl('home') })
      return
    }
    try {
      await Taro.navigateBack({ delta: 1 })
    } catch {
      Taro.reLaunch({ url: pageUrl('home') })
    }
  }

  const load = useCallback(async () => {
    if (!planId) {
      setPhase('missing')
      return
    }
    setPhase('loading')
    setError(null)
    try {
      const data = await planApi.getShoppingList(planId)
      setList(data)
      setPhase(totalItems(data) === 0 ? 'empty' : 'ready')
    } catch (e) {
      if (e instanceof UnauthorizedError) return // 401 已由封装导回登录页
      console.error('[ShoppingList] 清单加载失败', e)
      setError(errorText(e, '服务未连接'))
      setPhase('error')
    }
  }, [planId])

  useEffect(() => {
    load()
  }, [load])

  async function toggleItem(item: ShoppingListItem) {
    if (!list || !planId) return
    if (item.alreadyHave) {
      // 必消已有：不可再勾、不删除，但给一句反馈
      Taro.showToast({ title: '必消已有，不用再买', icon: 'none' })
      return
    }
    if (savingId) {
      Taro.showToast({ title: '正在保存上一项，稍等', icon: 'none' })
      return
    }
    const prev = list
    const nextChecked = !item.checked
    setList(toggleItemLocal(prev, item.ingredientId, nextChecked))
    setSavingId(item.ingredientId)
    try {
      const res = await planApi.patchShoppingList(planId, item.ingredientId, nextChecked)
      setList((current) => (current ? mergePatchResponse(current, res) : res))
    } catch (e) {
      if (e instanceof UnauthorizedError) return
      console.error('[ShoppingList] 勾选保存失败', e)
      // 只回滚这一条（同一时间只提交一个条目，prev 即该条操作前状态）
      setList(prev)
      Taro.showToast({ title: '没保存上，请重试', icon: 'none' })
    } finally {
      setSavingId(null)
    }
  }

  function handleBuy() {
    if (!list) return
    if (countToBuy(list) === 0) {
      Taro.showToast({ title: '清单都齐了', icon: 'none' })
      return
    }
    Taro.showToast({ title: '已记下，按这个买', icon: 'none' })
  }

  const header = (
    <View className="topbar">
      <Text className="back" onClick={backPrev}>
        ‹ 返回菜单
      </Text>
      <View className="h1">明日采购清单</View>
      <View className="sub">三餐食材合并去重 · 必消已有不重复买</View>
    </View>
  )

  if (phase === 'missing') {
    return (
      <View className="fm-page">
        {header}
        <View className="card empty-box">
          <View className="empty-title">缺少计划信息</View>
          <View className="empty-text">从三餐菜单点「查看采购清单」进来，就能看到这张清单。</View>
          <Button className="btn-main" onClick={() => Taro.reLaunch({ url: pageUrl('home') })}>
            回首页
          </Button>
        </View>
      </View>
    )
  }

  if (phase === 'loading') {
    return (
      <View className="fm-page">
        {header}
        {[0, 1, 2].map((g) => (
          <View className="sgroup-block" key={g}>
            <View className="sk sk-label" />
            <View className="sk-group">
              <View className="sk-row" />
              <View className="sk-row" />
              <View className="sk-row" />
            </View>
          </View>
        ))}
      </View>
    )
  }

  if (phase === 'error') {
    return (
      <View className="fm-page">
        {header}
        <View className="banner banner-warn">
          <Text>⚠ {error || '服务未连接，暂时拿不到清单'}</Text>
          <Text className="act" onClick={load}>
            重试
          </Text>
        </View>
      </View>
    )
  }

  if (phase === 'empty' || !list) {
    return (
      <View className="fm-page">
        {header}
        <View className="card empty-box">
          <View className="empty-title">这张清单是空的</View>
          <View className="empty-text">三餐没有需要采购的食材；回到菜单看看是不是还没定餐。</View>
          <Button className="btn-main" onClick={backPrev}>
            回菜单看看
          </Button>
        </View>
      </View>
    )
  }

  const toBuy = countToBuy(list)
  const prepAdvice = list.prepAdvice
  const hasTonight = !!prepAdvice && prepAdvice.tonight.length > 0
  const hasMorning = !!prepAdvice && prepAdvice.tomorrowMorning.length > 0

  return (
    <View className="fm-page with-stickybar">
      {header}

      <View className="banner">三餐食材已合并去重；油盐酱醋等常备调料不列入。</View>

      {list.groups.map((g) => (
        <View key={g.category}>
          <View className="group-title">
            <Text>{g.category}</Text>
            <Text className="group-count">{g.items.length} 样</Text>
          </View>
          <View className="list">
            {g.items.map((item) => (
              <View
                className={`item${item.checked || item.alreadyHave ? ' done' : ''}${
                  item.alreadyHave ? ' owned' : ''
                }`}
                key={item.ingredientId}
                onClick={() => toggleItem(item)}
              >
                <View className="check">{item.checked || item.alreadyHave ? '✓' : ''}</View>
                <View className="name">
                  {item.alreadyHave ? (
                    <Text className="name-text">{item.name}</Text>
                  ) : (
                    <Text>{item.name}</Text>
                  )}
                  {item.alreadyHave && <Text className="src">必消已有</Text>}
                </View>
                <Text className="qty">{formatQty(item.qty, item.unit)}</Text>
              </View>
            ))}
          </View>
        </View>
      ))}

      <View className="section">
        <View className="section-head">
          <Text className="section-title">备菜建议</Text>
          <Text className="section-note">按时间轴排</Text>
        </View>
        {hasTonight && (
          <PrepBlock title="今晚预处理" sub="睡前先做，明天省一半事" steps={prepAdvice.tonight} />
        )}
        {hasMorning && (
          <PrepBlock
            title="明早先做"
            sub="按顺序来，开饭不慌"
            steps={prepAdvice.tomorrowMorning}
          />
        )}
        {!hasTonight && !hasMorning && (
          <View className="card">
            <View className="form-note">这次没有备菜建议，按清单买齐就好。</View>
          </View>
        )}
      </View>

      <Text className="img-note">示意图·正式版为试做实拍</Text>

      <View className="stickybar">
        <Button className="btn-main" onClick={handleBuy}>
          {toBuy === 0 ? '清单都齐了' : `就按这个买（${toBuy} 样待买）`}
        </Button>
      </View>
    </View>
  )
}
