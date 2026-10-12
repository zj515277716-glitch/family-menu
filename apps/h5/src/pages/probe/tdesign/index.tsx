// apps/h5/src/pages/probe/tdesign/index.tsx
// 探针页，非产品界面：tdesign-mobile-react × Taro 4 H5 一次性技术验证。
// 直达路由，不进 Tabbar，无产品入口；验证结论与证据见 evidence/T-Q06/。
// 样式按需引入（组件 css.js + 全局 token），与正式迁移的引入方式一致，包体积数据才真实。
import { useEffect, useState } from 'react'
import { View, Text } from '@tarojs/components'
import { Button as NutButton, Cell as NutCell, Tag as NutTag } from '@nutui/nutui-react-taro'
import {
  Button,
  Cell,
  CellGroup,
  TabBar,
  TabBarItem,
  Form,
  FormItem,
  Input,
  Stepper,
  Picker,
  Popup,
  Dialog,
  Toast,
  Tag,
  List,
  Loading,
  Empty,
} from 'tdesign-mobile-react'
import 'tdesign-mobile-react/es/style/css.js'
import 'tdesign-mobile-react/es/button/style/css.js'
import 'tdesign-mobile-react/es/cell/style/css.js'
import 'tdesign-mobile-react/es/tab-bar/style/css.js'
import 'tdesign-mobile-react/es/form/style/css.js'
import 'tdesign-mobile-react/es/input/style/css.js'
import 'tdesign-mobile-react/es/stepper/style/css.js'
import 'tdesign-mobile-react/es/picker/style/css.js'
import 'tdesign-mobile-react/es/popup/style/css.js'
import 'tdesign-mobile-react/es/dialog/style/css.js'
import 'tdesign-mobile-react/es/toast/style/css.js'
import 'tdesign-mobile-react/es/tag/style/css.js'
import 'tdesign-mobile-react/es/list/style/css.js'
import 'tdesign-mobile-react/es/loading/style/css.js'
import 'tdesign-mobile-react/es/empty/style/css.js'
import './index.css'

interface ProbeMetrics {
  vw: number
  rootFontSize: string
  remBoxWidth: number
  tdButtonHeight: number
  nutButtonHeight: number
  tdBrandColor: string
  nutPrimary: string
}

const TIME_OPTIONS = [
  { label: '15 分钟快手', value: '15分钟' },
  { label: '30 分钟常规', value: '30分钟' },
  { label: '45 分钟从容', value: '45分钟' },
]

export default function TdesignProbePage() {
  const [metrics, setMetrics] = useState<ProbeMetrics | null>(null)
  const [lastAction, setLastAction] = useState('（尚无操作）')
  const [tabValue, setTabValue] = useState<string | number>('home')
  const [pickerVisible, setPickerVisible] = useState(false)
  const [timeBudget, setTimeBudget] = useState('未选择')
  const [popupVisible, setPopupVisible] = useState(false)
  const [people, setPeople] = useState(2)
  const [note, setNote] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => {
      const rootStyle = getComputedStyle(document.documentElement)
      const rectOf = (sel: string) => document.querySelector(sel)?.getBoundingClientRect()
      setMetrics({
        vw: window.innerWidth,
        rootFontSize: rootStyle.fontSize,
        remBoxWidth: Math.round(rectOf('.probe-rem-box')?.width ?? -1),
        tdButtonHeight: Math.round(rectOf('.probe-td-btn .t-button')?.height ?? -1),
        nutButtonHeight: Math.round(rectOf('.probe-nut-btn .nut-button')?.height ?? -1),
        tdBrandColor: rootStyle.getPropertyValue('--td-brand-color').trim(),
        nutPrimary: rootStyle.getPropertyValue('--nutui-color-primary').trim(),
      })
    }, 500)
    return () => clearTimeout(timer)
  }, [])

  const metricsText = metrics
    ? [
        `视口宽度: ${metrics.vw} CSS px`,
        `html 根字号: ${metrics.rootFontSize}`,
        `源码 750px 色条实测宽: ${metrics.remBoxWidth}px（≈视口宽 → Taro px2rem 对本工程源码生效）`,
        `TD 主按钮实测高: ${metrics.tdButtonHeight}px（TD 样式为固定 px，不经 px2rem）`,
        `NutUI 主按钮实测高: ${metrics.nutButtonHeight}px（对照组，样式随 rem 缩放）`,
      ].join('\n')
    : '测量中…'

  return (
    <View className="probe-page">
      <View className="probe-banner">探针页，非产品界面（tdesign-mobile-react × Taro 4 H5）</View>

      <View className="probe-sec">
        <View className="probe-sec-title">① 跑得起来 + ④ 单位体系实测</View>
        <View className="probe-rem-box" />
        <View className="probe-note">色条源码宽 750px：若 px2rem 生效，应正好铺满视口宽</View>
        <Text className="probe-metrics">{metricsText}</Text>
      </View>

      <View className="probe-sec">
        <View className="probe-sec-title">⑤ CSS 变量换主色 #C8541F（风格板方向①）</View>
        <View className="probe-note">
          本页样式表在 :root 覆盖 --td-brand-color-1..10（第 7 阶 = #C8541F），全页 TD 组件应跟随
        </View>
        <View className="probe-row">
          <Button theme="primary" onClick={() => setLastAction('点击 TD 主按钮')}>
            TD 主按钮
          </Button>
          <Button theme="primary" variant="outline" onClick={() => setLastAction('点击 TD 描边按钮')}>
            TD 描边
          </Button>
          <Tag theme="primary">主色标签</Tag>
          <Tag theme="primary" variant="light">
            浅色标签
          </Tag>
        </View>
        <View className="probe-note">
          实测 --td-brand-color = {metrics?.tdBrandColor ?? '…'}（期望 #C8541F）；NutUI
          --nutui-color-primary = {metrics?.nutPrimary ?? '…'}（应仍为 #C8392E 不受污染）
        </View>
      </View>

      <View className="probe-sec">
        <View className="probe-sec-title">② Button + ③ 与 NutUI 同排共存</View>
        <View className="probe-row">
          <View className="probe-td-btn">
            <Button theme="primary" onClick={() => setLastAction('点击 TD 主按钮（共存排）')}>
              TD 主按钮
            </Button>
          </View>
          <View className="probe-nut-btn">
            <NutButton type="primary" onClick={() => setLastAction('点击 NutUI 主按钮（共存排）')}>
              NutUI 主按钮
            </NutButton>
          </View>
        </View>
        <View className="probe-note">两库主按钮同排：各自主色独立生效即共存通过</View>
        <CellGroup>
          <Cell title="TD Cell" description="描述文字" note="备注" arrow onClick={() => setLastAction('点击 TD Cell')} />
          <Cell title="TD Cell 纯展示" note="无箭头" />
        </CellGroup>
        <View style={{ margin: '12px 0' }}>
          <NutCell title="NutUI Cell" extra="对照组" onClick={() => setLastAction('点击 NutUI Cell')} />
        </View>
        <View className="probe-row">
          <Tag theme="primary">TD Tag</Tag>
          <Tag theme="success" variant="light">
            TD 成功
          </Tag>
          <Tag theme="warning" variant="outline">
            TD 警告
          </Tag>
          <NutTag type="primary">NutUI Tag</NutTag>
        </View>
      </View>

      <View className="probe-sec">
        <View className="probe-sec-title">② TabBar（内嵌演示，非 fixed）</View>
        <TabBar
          value={tabValue}
          fixed={false}
          onChange={(v) => {
            setTabValue(v)
            setLastAction(`TD TabBar 切换到 ${v}`)
          }}
        >
          <TabBarItem value="home" icon={<Text>🍚</Text>}>
            今晚
          </TabBarItem>
          <TabBarItem value="history" icon={<Text>📖</Text>}>
            历史
          </TabBarItem>
          <TabBarItem value="setup" icon={<Text>⚙️</Text>}>
            设置
          </TabBarItem>
        </TabBar>
      </View>

      <View className="probe-sec">
        <View className="probe-sec-title">② Form 系：Stepper / Input / Picker</View>
        <Form>
          <FormItem label="就餐人数">
            <Stepper
              min={1}
              max={6}
              value={people}
              onChange={(v) => {
                setPeople(Number(v))
                setLastAction(`TD Stepper 调整为 ${v} 人`)
              }}
            />
          </FormItem>
          <FormItem label="备注">
            <Input
              value={note}
              placeholder="TD Input 占位提示"
              onChange={(v) => setNote(String(v))}
            />
          </FormItem>
          <FormItem label="时间预算">
            <Cell
              title={timeBudget}
              arrow
              onClick={() => {
                setPickerVisible(true)
                setLastAction('打开 TD Picker')
              }}
            />
          </FormItem>
        </Form>
        <View className="probe-note">
          注意：TD Picker 是纯面板组件（0.23.3 未消费 visible prop），显隐需自包 Popup
        </View>
        <Popup
          visible={pickerVisible}
          placement="bottom"
          onVisibleChange={(visible) => setPickerVisible(visible)}
        >
          <Picker
            columns={TIME_OPTIONS}
            onCancel={() => setPickerVisible(false)}
            onConfirm={(value) => {
              setTimeBudget(String(value[0]))
              setPickerVisible(false)
              setLastAction(`TD Picker 确认：${value[0]}`)
            }}
          />
        </Popup>
      </View>

      <View className="probe-sec">
        <View className="probe-sec-title">② Popup / Dialog / Toast（反馈三件套）</View>
        <View className="probe-row">
          <Button
            size="small"
            onClick={() => {
              setPopupVisible(true)
              setLastAction('打开 TD Popup')
            }}
          >
            开 Popup
          </Button>
          <Button
            size="small"
            variant="outline"
            onClick={() => {
              Dialog.confirm?.({
                title: 'TD Dialog',
                content: '命令式弹窗，portal 挂载 body',
                confirmBtn: '确定',
                cancelBtn: '取消',
              })
              setLastAction('打开 TD Dialog（命令式）')
            }}
          >
            开 Dialog
          </Button>
          <Button
            size="small"
            variant="outline"
            onClick={() => {
              Toast.success({ message: 'TD Toast：操作成功', duration: 1500 })
              setLastAction('弹出 TD Toast')
            }}
          >
            弹 Toast
          </Button>
        </View>
        <Popup
          visible={popupVisible}
          placement="bottom"
          onVisibleChange={(visible) => setPopupVisible(visible)}
        >
          <View className="probe-popup-body">
            <View className="probe-sec-title">TD Popup 内容区</View>
            <Button theme="primary" block onClick={() => setPopupVisible(false)}>
              关闭 Popup
            </Button>
          </View>
        </Popup>
      </View>

      <View className="probe-sec">
        <View className="probe-sec-title">② List / Loading / Empty</View>
        <List asyncLoading={<Loading theme="spinner" text="正在加载…" />}>
          <Cell title="采购清单 · 西红柿" note="500g" />
          <Cell title="采购清单 · 鸡蛋" note="6 枚" />
        </List>
        <View className="probe-note">上方为 List + asyncLoading 态；下方为 Loading 三形态与 Empty</View>
        <View className="probe-row">
          <Loading theme="circular" text="circular" />
          <Loading theme="dots" text="dots" />
        </View>
        <Empty
          image={<Text className="probe-empty-emoji">🍽️</Text>}
          description="没有符合条件的菜"
          action={
            <Button size="small" theme="primary" onClick={() => setLastAction('点击 TD Empty 出口按钮')}>
              去调整条件
            </Button>
          }
        />
      </View>

      <View className="probe-sec">
        <View className="probe-sec-title">操作反馈（每按钮有反馈）</View>
        <View className="probe-note">最后操作：{lastAction}</View>
      </View>
    </View>
  )
}
