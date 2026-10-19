// apps/h5/src/app.config.ts
// 全局配置：路由骨架（T-Q11）+ window 主题（design-spec-v2 §1 暖白极简）。
// 入口页 = pages/login（T-A2 登录门：进门先输一次家庭口令，服务端校验通过才放行）；
// 已登录设备由登录页探测（GET /api/auth/me）后按冷启动判定（C-8）reLaunch：
//   无家庭设置 → pages/onboarding（S-02 引导）；已填过 → pages/home（S-03 首页）。
// Tab 3 常驻入口（首页/历史/设置）由 NutUI Tabbar 实现（磨砂全局唯一保留处），
// tab 间跳转用 Taro.reLaunch（清栈切 tab）；主流程子页与弹层路由由 T-Q12/T-Q13 追加。

export default defineAppConfig({
  pages: [
    'pages/login/index',
    'pages/onboarding/index',
    'pages/home/index',
    'pages/history/index',
    'pages/settings/index',
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#FAFAF8',
    navigationBarTitleText: '家庭菜谱',
    navigationBarTextStyle: 'black',
    backgroundColor: '#FAFAF8',
  },
})
