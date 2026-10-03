// apps/h5/src/app.tsx
// 应用入口：NutUI ConfigProvider 主题定制 + 全量样式导入
// 鉴权（T-A2）：家庭口令只由服务端校验，通过后下发 HttpOnly cookie（POST /api/auth/login）；
// 本文件不读写任何口令/token。app.config.ts 第一个页面即登录页——未登录先输口令再进首页。
import { Component, PropsWithChildren } from 'react'
import { ConfigProvider } from '@nutui/nutui-react-taro'
import '@nutui/nutui-react-taro/dist/style.css'
import { themeConfig } from './theme/tokens'
import './app.css'

class App extends Component<PropsWithChildren> {
  componentDidShow() {}

  componentDidHide() {}

  render() {
    return <ConfigProvider theme={themeConfig}>{this.props.children}</ConfigProvider>
  }
}

export default App
