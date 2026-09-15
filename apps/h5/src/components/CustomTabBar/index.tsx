// apps/h5/src/components/CustomTabBar/index.tsx
// 自定义 TabBar：NutUI Tabbar 实现 3 常驻入口（今晚🍛 / 历史📔 / 设置⚙️）
// 定稿基准：docs/ai-rebuild/ui/e-final.html（TabBar emoji 图标）+ design-spec.md §3
// tab 间跳转用 Taro.reLaunch（清栈切 tab，Zustand 全局状态保留）
//
// 真机遮挡自适应兜底（三次排查定案）：rem 静态数学在部分真机与预期不符（清缓存后仍遮挡），
//   运行时实测 .nut-tabbar-fixed 真实高度写入 --fm-tabbar-h（内联 px 优先级高于 :root），
//   各页 padding / 操作条 bottom 用 var(--fm-tabbar-extra) 自动补足超出基准的部分； `?debug=1` 诊断浮层：展示 UA/字号基准/TabBar 实测 rect/env 探针/已加载 css hash，
//   用于远程判定真机渲染环境（点浮标→面板→复制回传）。
import Taro from '@tarojs/taro'
import { Tabbar, TabbarItem } from '@nutui/nutui-react-taro'
import { Text, View } from '@tarojs/components'
import { useEffect, useState } from 'react'

const TABS = [
  { path: '/pages/tonight/index', text: '今晚', emoji: '🍛' },
  { path: '/pages/history/index', text: '历史', emoji: '📔' },
  { path: '/pages/setup/index', text: '设置', emoji: '⚙️' },
]

// 实测 TabBar 高度 → CSS 变量（px 真值，不受 rem 基准/字体缩放影响）
function syncTabbarHeight() {
  const el =
    document.querySelector('.nut-tabbar-fixed') ||
    document.querySelector('.nut-tabbar')
  if (!el) return
  const h = el.getBoundingClientRect().height
  if (!h) return
  document.documentElement.style.setProperty('--fm-tabbar-h', h + 'px')
}

// hash 路由：debug 参数可能在 search（域名/?debug=1#/...）也可能在 hash 内（#/...?debug=1）
function hasDebugFlag(): boolean {
  return (window.location.search + window.location.hash).includes('debug=1')
}

function collectDebugInfo(): string {
  const de = document.documentElement
  const cs = getComputedStyle(de)
  const tabbar =
    document.querySelector('.nut-tabbar-fixed') ||
    document.querySelector('.nut-tabbar')
  const wrap = document.querySelector('.nut-tabbar-wrap')
  const page = document.querySelector('.fm-page')
  const rect = tabbar?.getBoundingClientRect()
  // env() 探针：临时固定元素实测 safe-area-inset-bottom 真实像素
  const probe = document.createElement('div')
  probe.style.cssText =
    'position:fixed;bottom:0;left:0;visibility:hidden;padding-bottom:env(safe-area-inset-bottom);'
  document.body.appendChild(probe)
  const envPx = getComputedStyle(probe).paddingBottom
  probe.remove()
  const cssList = performance
    .getEntriesByType('resource')
    .map((entry) => entry.name)
    .filter((name) => name.endsWith('.css'))
    .map((name) => name.slice(name.lastIndexOf('/') + 1))
    .join('\n')
  return [
    'UA: ' + navigator.userAgent.slice(0, 120),
    'innerW/H: ' + window.innerWidth + ' x ' + window.innerHeight,
    'vvHeight: ' + (window.visualViewport ? Math.round(window.visualViewport.height) : 'n/a'),
    'htmlFS(style): ' + (de.style.fontSize || '(unset)'),
    'htmlFS(computed): ' + cs.fontSize,
    '--nut-scale-f: ' + (cs.getPropertyValue('--nut-scale-f').trim() || '(unset)'),
    '--fm-tabbar-h(inline): ' + (de.style.getPropertyValue('--fm-tabbar-h').trim() || '(unset)'),
    'env(safe-b): ' + envPx,
    'tabbar(rect): ' + (rect
      ? 'h=' + Math.round(rect.height) + ' top=' + Math.round(rect.top) + ' bottom=' + Math.round(rect.bottom)
      : 'NOT FOUND'),
    'tabbar(wrap-h): ' + (wrap ? getComputedStyle(wrap).height : 'NOT FOUND'),
    'page(padding-b): ' + (page ? getComputedStyle(page).paddingBottom : 'NOT FOUND'),
    'css loaded:',
    cssList || '(none)',
  ].join('\n')
}

export default function CustomTabBar() {
  const router = Taro.getCurrentInstance().router
  const currentPath = router?.path || ''
  let active = 0
  TABS.forEach((t, i) => {
    if (currentPath.includes(t.path)) active = i
  })

  const [debugOpen, setDebugOpen] = useState(false)
  const [debugText, setDebugText] = useState('')
  const debugEnabled = hasDebugFlag()

  useEffect(() => {
    syncTabbarHeight()
    // NutUI 异步渲染 / emoji 字体回流的延迟二次校准
    const t1 = window.setTimeout(syncTabbarHeight, 300)
    const t2 = window.setTimeout(syncTabbarHeight, 1500)
    window.addEventListener('resize', syncTabbarHeight)
    return () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
      window.removeEventListener('resize', syncTabbarHeight)
    }
  }, [])

  const handleSwitch = (value: number) => {
    if (value === active) return
    Taro.reLaunch({ url: TABS[value].path })
  }

  const openDebug = () => {
    setDebugText(collectDebugInfo())
    setDebugOpen(true)
  }

  const copyDebug = (e: { stopPropagation: () => void }) => {
    e.stopPropagation()
    try {
      Taro.setClipboardData({ data: debugText })
    } catch {
      // 剪贴板失败不阻断面板
    }
  }

  return (
    <>
      <Tabbar
        defaultValue={active}
        value={active}
        onSwitch={handleSwitch}
        fixed
        safeArea
        activeColor="#C8392E"
        inactiveColor="#7A6A55"
      >
        {TABS.map((t) => (
          <TabbarItem
            key={t.path}
            title={t.text}
            icon={<Text className="fm-tab-emoji">{t.emoji}</Text>}
          />
        ))}
      </Tabbar>
      {debugEnabled && (
        <>
          <View className="fm-debug-float" onClick={openDebug}>诊断</View>
          {debugOpen && (
            <View className="fm-debug-panel" onClick={() => setDebugOpen(false)}>
              <View className="fm-debug-title">
                fm-debug {new Date().toLocaleTimeString()}（点空白处关闭）
              </View>
              <Text className="fm-debug-code">{debugText}</Text>
              <View className="fm-debug-copy" onClick={copyDebug}>复制诊断数据</View>
            </View>
          )}
        </>
      )}
    </>
  )
}
