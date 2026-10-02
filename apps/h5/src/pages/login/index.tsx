// apps/h5/src/pages/login/index.tsx
// T-A2（主控决定①）：进门先输一次家庭口令。服务端校验通过后下发 HttpOnly cookie，
// 之后这台设备再来直接进首页（cookie 由浏览器保管，前端读不到也不存放口令）。
// 三态齐备：检查中（探测既有登录态）/ 输入态 / 错误可重试；口令错误、限速、网络失败都明说。
import { useEffect, useState } from 'react'
import Taro from '@tarojs/taro'
import { View, Text, Input } from '@tarojs/components'
import { Button } from '@nutui/nutui-react-taro'
import { auth } from '../../api/client'
import './index.css'

export default function LoginPage() {
  // 检查中=正在用 /api/auth/me 探测这台设备是否已登录
  const [checking, setChecking] = useState(true)
  const [token, setToken] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    probe()
  }, [])

  // 探测既有登录态：已登录直接进首页；探测失败（如网络不通）落到输入态并提示可重试
  function probe() {
    setChecking(true)
    setError(null)
    auth
      .status()
      .then((ok) => {
        if (ok) {
          Taro.reLaunch({ url: '/pages/tonight/index' })
        } else {
          setChecking(false)
        }
      })
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
      Taro.reLaunch({ url: '/pages/tonight/index' })
    } catch (e) {
      console.error('[Login] 登录失败', e)
      setError(e instanceof Error ? e.message : '登录失败，请重试')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <View className="fm-page login-page">
      <View className="fm-h1">家庭菜谱</View>
      <Text className="fm-sub">输一次家庭口令，之后这台设备再来就不用输了</Text>

      {checking ? (
        <View className="fm-card fm-empty">
          <View className="fm-empty-emoji">🔍</View>
          <View className="fm-empty-title">正在检查登录状态…</View>
          <View className="fm-empty-text">已经输过口令的设备会直接进首页。</View>
        </View>
      ) : (
        <View className="fm-card">
          <View className="fm-row-label">家庭口令</View>
          <Input
            className="fm-input"
            password
            placeholder="输入家庭口令"
            value={token}
            onInput={(e) => setToken(e.detail.value)}
            onConfirm={handleSubmit}
          />
          <Text className="fm-sub" style={{ marginTop: '12px' }}>
            口令只交给家里服务校验，不经过任何第三方，也不存在这台设备上。
          </Text>
        </View>
      )}

      {error && <View className="fm-error-banner">⚠ {error}</View>}

      <View className="fm-bottom-bar">
        {checking ? (
          <Button className="fm-btn-ghost" disabled>
            正在检查…
          </Button>
        ) : (
          <>
            <Button
              className="fm-btn-primary"
              loading={submitting}
              onClick={handleSubmit}
            >
              {submitting ? '正在校验…' : '进入'}
            </Button>
            <Button className="fm-btn-ghost" onClick={probe}>
              重新检查登录状态
            </Button>
          </>
        )}
      </View>
    </View>
  )
}
