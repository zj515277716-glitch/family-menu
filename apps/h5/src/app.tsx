// apps/h5/src/app.tsx
// 应用入口：NutUI ConfigProvider 主题定制 + 全量样式导入
import { Component, PropsWithChildren } from 'react'
import { ConfigProvider } from '@nutui/nutui-react-taro'
import '@nutui/nutui-react-taro/dist/style.css'
import { themeConfig } from './theme/tokens'
import './app.css'

class App extends Component<PropsWithChildren> {
  componentDidMount() {
    // H5 模式设置 access_token cookie（口令鉴权，对齐 STEP-05 API）
    // 未配置 TARO_APP_API_ACCESS_TOKEN 时不写 cookie——API 将返回 401，页面如实提示，绝不内置默认口令
    const token = process.env.TARO_APP_ACCESS_TOKEN
    if (token && typeof document !== 'undefined') {
      document.cookie = `access_token=${token}; path=/`
    } else if (!token && typeof console !== 'undefined') {
      console.warn('[family-menu] 未配置 TARO_APP_ACCESS_TOKEN，API 请求将因未授权被拒绝')
    }
  }

  componentDidShow() {}

  componentDidHide() {}

  render() {
    return <ConfigProvider theme={themeConfig}>{this.props.children}</ConfigProvider>
  }
}

export default App
