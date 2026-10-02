// apps/h5/src/app.config.ts
// 全局配置：6 页面路由 + window 主题
// 入口页为 pages/login（T-A2 访问控制：进门先输一次家庭口令，服务端校验通过才进首页）；
// 已登录设备由登录页探测（GET /api/auth/me）后自动 reLaunch 进首页。
// TabBar 3 常驻入口（今晚/历史/设置）由 NutUI Tabbar 组件实现（对齐 wireframes.md 第139行），
// 不使用 Taro 原生 tabBar（H5 端图标需图片文件，assets-spec 指定功能图标用图标库）。
// tab 间跳转用 Taro.reLaunch（清栈切 tab）；candidates/plan 为流式页用 navigateTo/navigateBack。

export default defineAppConfig({
  pages: [
    'pages/login/index',
    'pages/tonight/index',
    'pages/history/index',
    'pages/setup/index',
    'pages/candidates/index',
    'pages/plan/index',
    'pages/dish/index',
    'pages/feedback/index',
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#FBF6EC',
    navigationBarTitleText: '家庭菜谱',
    navigationBarTextStyle: 'black',
  },
})
