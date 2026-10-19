// apps/h5/src/lib/entry.ts
// 入口判定（C-8 冷启动）：登录态之后的落地页 = 无家庭设置 → 冷启动引导（S-02）；
// 已填过 → 直达首页（S-03）。纯函数便于单测；页面只负责请求与跳转。
// 「已吃菜避开池」为空属正常，不参与判定（C-8：无历史也能出餐）。

export type LandingTarget = 'onboarding' | 'home'

/** 判定落地页：有无家庭规则决定走引导还是直达主流程 */
export function resolveLanding(hasFamilyRule: boolean): LandingTarget {
  return hasFamilyRule ? 'home' : 'onboarding'
}

const PAGE_URLS: Record<LandingTarget | 'login' | 'settings' | 'history', string> = {
  login: '/pages/login/index',
  onboarding: '/pages/onboarding/index',
  home: '/pages/home/index',
  history: '/pages/history/index',
  settings: '/pages/settings/index',
}

export function pageUrl(page: keyof typeof PAGE_URLS): string {
  return PAGE_URLS[page]
}
