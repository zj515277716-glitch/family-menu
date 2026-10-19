// apps/h5/src/components/CustomTabBar/index.tsx
// 底部 Tabbar：3 常驻入口（首页 / 历史 / 设置），NutUI Tabbar 实现。
// 定稿：design-spec-v2 §1/§4——全局唯一磨砂处（75% 半透 + blur 12px，降级 95% 实色），
// 文字 + 激活小圆点（样式在 app.css .nut-tabbar 族）；tab 间跳转 reLaunch 清栈切 tab。
import Taro from '@tarojs/taro'
import { Tabbar, TabbarItem } from '@nutui/nutui-react-taro'
import { pageUrl } from '../../lib/entry'

const TABS = [
  { path: pageUrl('home'), text: '首页' },
  { path: pageUrl('history'), text: '历史' },
  { path: pageUrl('settings'), text: '设置' },
]

export default function CustomTabBar() {
  const currentPath = Taro.getCurrentInstance().router?.path || ''
  let active = 0
  TABS.forEach((t, i) => {
    if (currentPath.includes(t.path)) active = i
  })

  const handleSwitch = (value: number) => {
    if (value === active) return
    Taro.reLaunch({ url: TABS[value].path })
  }

  return (
    <Tabbar value={active} onSwitch={handleSwitch} fixed safeArea>
      {TABS.map((t) => (
        <TabbarItem key={t.path} title={t.text} />
      ))}
    </Tabbar>
  )
}
