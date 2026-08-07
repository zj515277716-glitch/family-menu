// apps/h5/src/app.tsx
// 应用入口：NutUI ConfigProvider 主题定制 + 全量样式导入
import { Component, PropsWithChildren } from 'react'
import { ConfigProvider } from '@nutui/nutui-react-taro'
import '@nutui/nutui-react-taro/dist/style.css'
import { themeConfig } from './theme/tokens'
import './app.css'

class App extends Component<PropsWithChildren> {
  componentDidMount() {
    // H5 模式设置 ACCESS_TOKEN cookie（口令鉴权，对齐 STEP-05 API）
    // 生产环境由 TARO_APP_ACCESS_TOKEN 注入；开发 Mock 模式不调 API 无需鉴权
    const token = process.env.TARO_APP_ACCESS_TOKEN || 'change-me'
    if (typeof document !== 'undefined') {
      document.cookie = `ACCESS_TOKEN=${token}; path=/`
    }
  }

  componentDidShow() {}

  componentDidHide() {}

  render() {
    return <ConfigProvider theme={themeConfig}>{this.props.children}</ConfigProvider>
  }
}

export default App
