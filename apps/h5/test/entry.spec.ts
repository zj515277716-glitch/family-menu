// apps/h5/test/entry.spec.ts
// 冷启动判定单测（C-8）：无家庭设置 → 引导页（S-02）；已填过 → 首页直达。
// 「已吃菜避开池」为空不参与判定（无历史也能出餐，不阻断）。
import { describe, it, expect } from 'vitest'
import { pageUrl, resolveLanding } from '../src/lib/entry'

describe('冷启动判定：resolveLanding', () => {
  it('无家庭设置 → onboarding（先填长期设置才能进主流程）', () => {
    expect(resolveLanding(false)).toBe('onboarding')
  })

  it('已有家庭设置 → home（直达主流程）', () => {
    expect(resolveLanding(true)).toBe('home')
  })
})

describe('路由表：pageUrl', () => {
  it('五个路由骨架页齐全', () => {
    expect(pageUrl('login')).toBe('/pages/login/index')
    expect(pageUrl('onboarding')).toBe('/pages/onboarding/index')
    expect(pageUrl('home')).toBe('/pages/home/index')
    expect(pageUrl('history')).toBe('/pages/history/index')
    expect(pageUrl('settings')).toBe('/pages/settings/index')
  })
})
