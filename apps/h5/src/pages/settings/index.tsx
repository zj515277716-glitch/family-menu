// apps/h5/src/pages/settings/index.tsx
// S-12 设置（C-1，长期生效）：iOS 分组列表——成人/儿童步进、常做时长档（15/30/60 单选）、
// 家里的锅（多选）、喜欢的菜系（多选）、忌口（硬禁忌红/软偏好灰）、已吃菜避开窗口（3/5/7 默认 7）。
// 原型：docs/design/v2/prototypes/style-1/v3/settings.html。
// 行为：选中即高亮；保存后「已保存 HH:mm」；刷新/重进原样还在（真实存取，不造假兜底）；
// 保存失败提示「没保存上」且保留已改值；连不上服务提示「服务未连接」可重试（三态齐备）。
import { useCallback, useEffect, useState } from 'react'
import Taro from '@tarojs/taro'
import { View, Text, Input } from '@tarojs/components'
import { Button, Popup } from '@nutui/nutui-react-taro'
import { api, UnauthorizedError } from '../../api/client'
import CustomTabBar from '../../components/CustomTabBar'
import type { ExclusionRule, ExclusionScope, FamilyRule, Severity } from '@family-menu/shared'
import {
  CUISINE_OPTIONS,
  POT_OPTIONS,
  TIME_BUDGET_OPTIONS,
  buildExclusion,
  buildRulePayload,
  formStateFromRule,
  mergeDayOptions,
  mergeExclusions,
  mergeOptions,
} from '../../lib/settings-form'
import { formatTimeHM } from '../../lib/format'

const SCOPE_LABELS: { value: ExclusionScope; label: string }[] = [
  { value: 'INGREDIENT', label: '食材' },
  { value: 'DISH', label: '菜品' },
  { value: 'TAG', label: '标签' },
]
// C-1 忌口标注（逐字，硬禁忌红 / 软偏好灰）
const SEVERITY_DESC: Record<Severity, string> = {
  HARD: '硬禁忌：推荐、清单、做法里都绝不会出现。',
  SOFT: '软偏好：有得选就不做，实在避不开会提前告诉你。',
}

type Phase = 'loading' | 'ready' | 'error'
type SaveState = 'idle' | 'saving' | 'saved' | 'failed'

export default function SettingsPage() {
  const [phase, setPhase] = useState<Phase>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  // 服务端规则行（保存载荷的 base；null=冷启动首用尚无行）
  const [baseRule, setBaseRule] = useState<FamilyRule | null>(null)

  // 表单字段
  const [adults, setAdults] = useState(2)
  const [children, setChildren] = useState(0)
  const [timeBudget, setTimeBudget] = useState(30)
  const [equipment, setEquipment] = useState<string[]>([])
  const [cuisines, setCuisines] = useState<string[]>([])
  const [avoidDays, setAvoidDays] = useState(7)
  const [exclusions, setExclusions] = useState<ExclusionRule[]>([])
  // PE-1：本次编辑会话中用户删除的行 id 集合（保存合并时从远端追加中排除，删除随 PUT 持久化）
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set())
  // PE-1：禁忌规则加载失败时禁用保存，防止空 state 全量 PUT 覆盖库内规则
  const [exclusionsLoadFailed, setExclusionsLoadFailed] = useState(true)

  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [savedAt, setSavedAt] = useState<string | null>(null)

  // 加忌口弹层
  const [popupVisible, setPopupVisible] = useState(false)
  const [exScope, setExScope] = useState<ExclusionScope>('INGREDIENT')
  const [exTarget, setExTarget] = useState('')
  const [exSeverity, setExSeverity] = useState<Severity>('HARD')
  const [exNote, setExNote] = useState('')

  const load = useCallback(async () => {
    setPhase('loading')
    setLoadError(null)
    // 家庭规则与禁忌规则分开处理错误：
    //   规则行失败 → 整页错误态可重试（设置无从还原，不能用默认值冒充已存设置）；
    //   禁忌失败 → 内容可见但禁用保存（空 state 保存 = 全量 PUT 清掉库内用户行）。
    const [ruleRes, exRes] = await Promise.allSettled([
      api.getFamilyRules(),
      api.getExclusions(),
    ])
    if (ruleRes.status === 'fulfilled') {
      const rule = ruleRes.value
      setBaseRule(rule)
      const form = formStateFromRule(rule)
      setAdults(form.adults)
      setChildren(form.children)
      setTimeBudget(form.timeBudget)
      setEquipment(form.equipment)
      setCuisines(form.cuisines)
      setAvoidDays(form.avoidDays)
      setPhase('ready')
    } else {
      if (ruleRes.reason instanceof UnauthorizedError) return // 401 已由封装导回登录页
      console.error('[Settings] loadFamilyRules error', ruleRes.reason)
      setLoadError(ruleRes.reason instanceof Error ? ruleRes.reason.message : '服务未连接')
      setPhase('error')
    }
    if (exRes.status === 'fulfilled') {
      setExclusionsLoadFailed(false)
      setExclusions(exRes.value ?? [])
    } else {
      if (exRes.reason instanceof UnauthorizedError) return
      console.error('[Settings] loadExclusions error', exRes.reason)
      setExclusionsLoadFailed(true)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function handleSave() {
    setSaveState('saving')
    try {
      const payload = buildRulePayload(baseRule, {
        adults,
        children,
        timeBudget,
        equipment,
        cuisines,
        avoidDays,
      })
      const updated = await api.putFamilyRules(payload)
      // PE-1：保存前 re-GET 远端禁忌行，与本地 state 按 id 合并（本地优先、远端追加、排除已删）
      // 再全量 PUT——兜住「本地缺 seed 行」与「其它端新增行被覆盖」两类误伤；
      // re-GET 失败则中止保存走 catch：宁可用户重按一次，也不静默用旧 state 覆盖远端。
      const remote = await api.getExclusions()
      const merged = mergeExclusions(exclusions, remote, removedIds)
      await api.putExclusions(merged)
      setRemovedIds(new Set())
      setBaseRule(updated)
      setSaveState('saved')
      setSavedAt(formatTimeHM(new Date()))
      Taro.showToast({ title: '已保存', icon: 'success' })
    } catch (e) {
      if (e instanceof UnauthorizedError) return // 人已导回登录页
      console.error('[Settings] save error', e)
      // C-1 失败恢复：提示「没保存上」，保留已改值可再点
      setSaveState('failed')
      Taro.showToast({ title: '没保存上', icon: 'none' })
    }
  }

  function toggle(list: string[], v: string): string[] {
    return list.includes(v) ? list.filter((x) => x !== v) : [...list, v]
  }

  function addExclusion() {
    const target = exTarget.trim()
    if (!target) {
      Taro.showToast({ title: '先填上名称', icon: 'none' })
      return
    }
    const rule = buildExclusion({
      familyId: baseRule?.familyId ?? 'seed-family',
      scope: exScope,
      target,
      severity: exSeverity,
      note: exNote.trim() || undefined,
    })
    setExclusions((prev) => [...prev, rule])
    setExTarget('')
    setExNote('')
    setExSeverity('HARD')
    setExScope('INGREDIENT')
    setPopupVisible(false)
  }

  function removeExclusion(id: string) {
    setExclusions((prev) => prev.filter((e) => e.id !== id))
    setRemovedIds((prev) => new Set(prev).add(id))
  }

  // 忌口 chip 文案：目标名（优先服务端回填的食材名，不直渲 cuid）+ 过敏/不爱吃
  function exChipLabel(ex: ExclusionRule): string {
    const target = ex.targetName || ex.targetId || ex.targetTag || ''
    const kind = ex.severity === 'HARD' ? '过敏' : '不爱吃'
    const note = ex.note ? `${ex.note} · ` : ''
    return `${note}${target} · ${kind}`
  }

  // ───── 三态：加载 / 错误可重试 / 内容 ─────

  if (phase === 'loading') {
    return (
      <View className="fm-page with-tabbar">
        <View className="topbar">
          <View className="h1">设置</View>
          <View className="sub">长期生效 · 改一次，以后每天照常用</View>
        </View>
        {[0, 1, 2].map((g) => (
          <View className="sgroup-block" key={g}>
            <View className="sk sk-label" />
            <View className="sk-group">
              <View className="sk-row" />
              <View className="sk-row" />
            </View>
          </View>
        ))}
        <CustomTabBar />
      </View>
    )
  }

  if (phase === 'error') {
    return (
      <View className="fm-page with-tabbar">
        <View className="topbar">
          <View className="h1">设置</View>
          <View className="sub">长期生效 · 改一次，以后每天照常用</View>
        </View>
        <View className="banner banner-warn">
          <Text>⚠ {loadError || '服务未连接'}，已存设置没读出来</Text>
          <Text className="act" onClick={load}>
            重试
          </Text>
        </View>
        <CustomTabBar />
      </View>
    )
  }

  const potOptions = mergeOptions(POT_OPTIONS, equipment)
  const cuisineOptions = mergeOptions(CUISINE_OPTIONS, cuisines)
  const dayOptions = mergeDayOptions(avoidDays)

  return (
    <View className="fm-page with-tabbar with-stickybar">
      <View className="topbar">
        <View className="h1">设置</View>
        <View className="sub">长期生效 · 改一次，以后每天照常用</View>
      </View>

      {/* 人数：成人/儿童分列步进（C-1，S-04 默认带出） */}
      <View className="sgroup-block">
        <View className="sgroup-label">人数</View>
        <View className="sgroup">
          <View className="srow">
            <Text className="srow-label">成人</Text>
            <View className="stepper">
              <View
                className={`step-btn${adults <= 1 ? ' disabled' : ''}`}
                onClick={() => setAdults((p) => Math.max(1, p - 1))}
              >
                −
              </View>
              <Text className="step-val">{adults}</Text>
              <View
                className={`step-btn${adults >= 20 ? ' disabled' : ''}`}
                onClick={() => setAdults((p) => Math.min(20, p + 1))}
              >
                ＋
              </View>
            </View>
          </View>
          <View className="srow">
            <Text className="srow-label">
              儿童<Text className="srow-note">儿童餐少辣、少刺、软烂</Text>
            </Text>
            <View className="stepper">
              <View
                className={`step-btn${children <= 0 ? ' disabled' : ''}`}
                onClick={() => setChildren((p) => Math.max(0, p - 1))}
              >
                −
              </View>
              <Text className="step-val">{children}</Text>
              <View
                className={`step-btn${children >= 10 ? ' disabled' : ''}`}
                onClick={() => setChildren((p) => Math.min(10, p + 1))}
              >
                ＋
              </View>
            </View>
          </View>
        </View>
        <View className="sgroup-note">默认人数，定明天的餐时带出，可临时改</View>
      </View>

      {/* 常做时长档：契约 15/30/60 单选，存 timeBudgets=[选中档]（裁决口径 2） */}
      <View className="sgroup-block">
        <View className="sgroup-label">常做时长档</View>
        <View className="sgroup">
          <View className="srow srow-pad">
            <View className="seg">
              {TIME_BUDGET_OPTIONS.map((o) => (
                <View
                  key={o.value}
                  className={`seg-item${timeBudget === o.value ? ' on' : ''}`}
                  onClick={() => setTimeBudget(o.value)}
                >
                  {o.label}
                </View>
              ))}
            </View>
          </View>
        </View>
        <View className="sgroup-note">超时的菜不推荐；某餐临时来不及可在定餐时单改</View>
      </View>

      {/* 家里的锅：原型 5 项 + 已存值并入（裁决口径 3，存自由字符串） */}
      <View className="sgroup-block">
        <View className="sgroup-label">家里的锅</View>
        <View className="sgroup">
          <View className="chips-row">
            {potOptions.map((p) => (
              <View
                key={p}
                className={`opt${equipment.includes(p) ? ' on' : ''}`}
                onClick={() => setEquipment((prev) => toggle(prev, p))}
              >
                {p}
              </View>
            ))}
          </View>
        </View>
        <View className="sgroup-note">没有的锅，对应的菜不出现</View>
      </View>

      {/* 喜欢的菜系：原型 5 项 + 已存值并入 */}
      <View className="sgroup-block">
        <View className="sgroup-label">喜欢的菜系</View>
        <View className="sgroup">
          <View className="chips-row">
            {cuisineOptions.map((c) => (
              <View
                key={c}
                className={`opt${cuisines.includes(c) ? ' on' : ''}`}
                onClick={() => setCuisines((prev) => toggle(prev, c))}
              >
                {c}
              </View>
            ))}
          </View>
        </View>
        <View className="sgroup-note">爱吃的常安排，三餐尽量不重复</View>
      </View>

      {/* 忌口：硬禁忌红 / 软偏好灰（C-1 标注逐字） */}
      <View className="sgroup-block">
        <View className="sgroup-label">忌口</View>
        <View className="sgroup">
          <View className="chips-row">
            {exclusions.map((ex) => (
              <View
                key={ex.id}
                className={`chip ${ex.severity === 'HARD' ? 'chip-hard' : 'chip-soft'}`}
              >
                <Text>{exChipLabel(ex)}</Text>
                <Text className="x" onClick={() => removeExclusion(ex.id)}>
                  ×
                </Text>
              </View>
            ))}
            <View className="chip chip-add" onClick={() => setPopupVisible(true)}>
              ＋ 加忌口
            </View>
          </View>
          <View className="sev-box">
            <View className="sev-hard">{SEVERITY_DESC.HARD}</View>
            <View className="sev-soft">{SEVERITY_DESC.SOFT}</View>
          </View>
        </View>
        <View className="sgroup-note">硬禁忌绝不出现 · 软偏好尽量避开，避不开提前说</View>
      </View>

      {/* 已吃菜避开窗口：3/5/7 默认 7，已存值并入 */}
      <View className="sgroup-block">
        <View className="sgroup-label">已吃菜避开窗口</View>
        <View className="sgroup">
          <View className="srow srow-pad">
            <View className="seg">
              {dayOptions.map((d) => (
                <View
                  key={d}
                  className={`seg-item${avoidDays === d ? ' on' : ''}`}
                  onClick={() => setAvoidDays(d)}
                >
                  {d} 天
                </View>
              ))}
            </View>
          </View>
        </View>
        <View className="sgroup-note">吃过的菜在窗口期内不再推荐，默认 7 天</View>
      </View>

      {/* 保存反馈（吸底按钮上方）：已保存 HH:mm / 没保存上保留已改值 */}
      {saveState === 'saved' && savedAt && (
        <View className="stickybar-note ok">已保存 {savedAt}</View>
      )}
      {saveState === 'failed' && (
        <View className="stickybar-note bad">没保存上，已改的还留着，再点一次保存</View>
      )}
      <View className="stickybar">
        <Button
          className="btn-main"
          loading={saveState === 'saving'}
          disabled={saveState === 'saving' || exclusionsLoadFailed}
          onClick={handleSave}
        >
          {exclusionsLoadFailed ? '忌口规则没读出来，暂不能保存' : '保存'}
        </Button>
      </View>

      {/* 加忌口弹层（遮罩点击=取消，不丢已填内容） */}
      <Popup
        visible={popupVisible}
        position="bottom"
        round
        onClose={() => setPopupVisible(false)}
      >
        <View className="sheet-body">
          <View className="sheet-grab" />
          <View className="sheet-title">加忌口</View>
          <View className="sheet-sub">过敏、绝对不吃的加成硬禁忌；不爱吃的加成软偏好</View>

          <View className="sheet-label">分类</View>
          <View className="sheet-opts">
            {SCOPE_LABELS.map((s) => (
              <View
                key={s.value}
                className={`opt${exScope === s.value ? ' on' : ''}`}
                onClick={() => setExScope(s.value)}
              >
                {s.label}
              </View>
            ))}
          </View>

          <View className="sheet-label">名称</View>
          <Input
            className="input"
            placeholder={`输入${SCOPE_LABELS.find((s) => s.value === exScope)?.label}名称`}
            value={exTarget}
            onInput={(e) => setExTarget(e.detail.value)}
          />

          <View className="sheet-label">严重度</View>
          <View className="sheet-opts">
            <View
              className={`opt${exSeverity === 'HARD' ? ' on' : ''}`}
              onClick={() => setExSeverity('HARD')}
            >
              硬禁忌（过敏）
            </View>
            <View
              className={`opt${exSeverity === 'SOFT' ? ' on' : ''}`}
              onClick={() => setExSeverity('SOFT')}
            >
              软偏好（不爱吃）
            </View>
          </View>
          <View className="sheet-sev-note">{SEVERITY_DESC[exSeverity]}</View>

          <View className="sheet-label">
            备注<Text className="sheet-note">（选填，如：爸爸不吃）</Text>
          </View>
          <Input
            className="input"
            placeholder="选填"
            value={exNote}
            onInput={(e) => setExNote(e.detail.value)}
          />

          <View className="btn-row">
            <Button className="btn-plain" onClick={() => setPopupVisible(false)}>
              取消
            </Button>
            <Button className="btn-main" onClick={addExclusion}>
              添加
            </Button>
          </View>
        </View>
      </Popup>

      <CustomTabBar />
    </View>
  )
}
