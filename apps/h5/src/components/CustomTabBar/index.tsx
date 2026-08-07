// apps/h5/src/components/CustomTabBar/index.tsx
// 自定义 TabBar：NutUI Tabbar 实现 3 常驻入口（今晚/历史/设置）
// 对齐 wireframes.md 第11-34行 + 第139行 [NutUI:Tabbar]
// tab 间跳转用 Taro.reLaunch（清栈切 tab，Zustand 全局状态保留）
import Taro from '@tarojs/taro'
import { Tabbar, TabbarItem } from '@nutui/nutui-react-taro'
import { Home, Clock, Setting } from '@nutui/icons-react-taro'

const TABS = [
  { path: '/pages/tonight/index', text: '今晚', Icon: Home },
  { path: '/pages/history/index', text: '历史', Icon: Clock },
  { path: '/pages/setup/index', text: '设置', Icon: Setting },
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
      activeColor="#FF6B35"
      inactiveColor="#8C7B6B"
    >
      {TABS.map((t) => (
        <TabbarItem key={t.path} title={t.text} icon={<t.Icon width={20} height={20} />} />
      ))}
    </Tabbar>
  )
}
