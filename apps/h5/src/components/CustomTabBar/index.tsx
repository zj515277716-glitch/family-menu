// apps/h5/src/components/CustomTabBar/index.tsx
// 自定义 TabBar：NutUI Tabbar 实现 3 常驻入口（今晚🍛 / 历史📔 / 设置⚙️）
// 定稿基准：docs/ai-rebuild/ui/e-final.html（TabBar emoji 图标）+ design-spec.md §3
// tab 间跳转用 Taro.reLaunch（清栈切 tab，Zustand 全局状态保留）
import Taro from '@tarojs/taro'
import { Tabbar, TabbarItem } from '@nutui/nutui-react-taro'
import { Text } from '@tarojs/components'

const TABS = [
  { path: '/pages/tonight/index', text: '今晚', emoji: '🍛' },
  { path: '/pages/history/index', text: '历史', emoji: '📔' },
  { path: '/pages/setup/index', text: '设置', emoji: '⚙️' },
]

export default function CustomTabBar() {
  const router = Taro.getCurrentInstance().router
  const currentPath = router?.path || ''
  let active = 0
  TABS.forEach((t, i) => {
    if (currentPath.includes(t.path)) active = i
  })

  const handleSwitch = (value: number) => {
    if (value === active) return
    Taro.reLaunch({ url: TABS[value].path })
  }

  return (
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
          icon={<Text style={{ fontSize: '40px', lineHeight: '48px' }}>{t.emoji}</Text>}
        />
      ))}
    </Tabbar>
  )
}
