// apps/h5/src/pages/login/index.tsx
// S-01 登录门（T-A2）：口令输入 → API 校验 → HttpOnly cookie 会话（单家庭口令，不做多人账号）。
// 原型：docs/design/v2/prototypes/style-1/v3/login.html。
// 三态齐备：检查中（探测既有登录态）/ 输入态 / 错误可重试；口令错误、限速、网络失败都明说。
// 进门后的落地页由冷启动判定决定（C-8）：无家庭设置 → S-02 引导；已填过 → 首页。
import { useEffect, useState } from 'react'
import Taro from '@tarojs/taro'
import { View, Text, Input } from '@tarojs/components'
import { Button } from '@nutui/nutui-react-taro'
import { api, auth } from '../../api/client'
import { pageUrl, resolveLanding } from '../../lib/entry'

export default function LoginPage() {
  // 检查中=正在用 /api/auth/me 探测这台设备是否已登录
  const [checking, setChecking] = useState(true)
  const [token, setToken] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    probe()
  }, [])

  // 登录态之后判落地：有规则直达首页；无规则走冷启动引导（C-8）
  async function enterApp() {
    const rule = await api.getFamilyRules()
    const target = resolveLanding(rule !== null)
    Taro.reLaunch({ url: pageUrl(target) })
  }

  // 探测既有登录态：已登录直接判落地；探测失败（如网络不通）落到输入态并提示可重试
  function probe() {
    setChecking(true)
    setError(null)
    auth
      .status()
      .then((ok) => (ok ? enterApp() : setChecking(false)))
      .catch((e) => {
        console.error('[Login] 登录态探测失败', e)
        setChecking(false)
        setError(e instanceof Error ? e.message : '连不上服务，请检查网络后重试')
      })
  }

  async function handleSubmit() {
    const v = token.trim()
    if (!v) {
      // 每个操作都有反馈：空口令也明说，不静默 return
      setError('先输入家庭口令再进入')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await auth.login(v)
      await enterApp()
    } catch (e) {
      console.error('[Login] 进入失败', e)
      setError(e instanceof Error ? e.message : '登录失败，请重试')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <View className="fm-page">
      <View className="gate">
        <View className="gate-title">家庭菜谱</View>
        <Text className="gate-sub">晚上 10 分钟，定好明天一家人的三餐</Text>

        <View className="card">
          <View className="form-title">家庭口令</View>
          <View className="form-note">只有家里人知道；输对一次，这台设备以后直接进</View>
          {checking ? <View className="form-note mt-3">正在检查登录状态…</View> : (
            <>
              <Input
                className="input"
                password
                placeholder="请输入口令"
                aria-label="家庭口令"
                value={token}
                onInput={(e) => setToken(e.detail.value)}
                onConfirm={handleSubmit}
              />
              {error && <View className="field-err">{error}</View>}
              <View className="btn-row">
                <Button className="btn-main" loading={submitting} onClick={handleSubmit}>
                  {submitting ? '正在校验…' : '进入'}
                </Button>
              </View>
            </>
          )}
        </View>

        {!checking && error && (
          <View className="btn-row">
            <Button className="btn-ghost" onClick={probe}>
              重新检查登录状态
            </Button>
          </View>
        )}

        <Text className="img-note">连续输错太多次会请稍等再试 · 口令只存在家里这台服务器上</Text>
      </View>
    </View>
  )
}
