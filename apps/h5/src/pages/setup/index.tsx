// apps/h5/src/pages/setup/index.tsx
// F1 长期设置（/pages/setup，Tab，e-final 屏⑭ PD-011 定稿）
// 默认人数步进器 / 时长档·锅·菜系 chip 多选 / 忌口行（硬红描边·软灰）+ 添加弹窗
// 数据与今晚临时设置分开（store: familyRule / resetTonightContext）
import { useEffect, useState } from 'react'
import Taro from '@tarojs/taro'
import { View, Text, Input } from '@tarojs/components'
import { Button, Popup } from '@nutui/nutui-react-taro'
import { api } from '../../api/client'
import { useStore } from '../../store'
import CustomTabBar from '../../components/CustomTabBar'
import type { FamilyRule, ExclusionRule, Severity, ExclusionScope } from '@family-menu/shared'
import { EQUIPMENT, TIME_BUDGETS } from '@family-menu/shared'
import './index.css'

const CUISINE_OPTIONS = ['湘菜', '家常', '清淡', '川菜', '粤菜']
const EQUIPMENT_LABELS: Record<string, string> = {
  wok: '炒锅',
  rice_cooker: '电饭煲',
  steamer: '蒸锅',
  air_fryer: '空气炸锅',
}
const SCOPE_LABELS: { value: ExclusionScope; label: string }[] = [
  { value: 'INGREDIENT', label: '食材' },
  { value: 'DISH', label: '菜品' },
  { value: 'TAG', label: '标签' },
]
// e-final s14 忌口行固定解释（逐字）
const SEVERITY_DESC: Record<Severity, string> = {
  HARD: '硬禁忌：推荐、清单、做法里都绝不会出现。',
  SOFT: '软偏好：有得选就不做；实在避不开会提前告诉你。',
}

export default function SetupPage() {
  const { familyRule, setFamilyRule, resetTonightContext } = useStore()
  const [defaultPeople, setDefaultPeople] = useState(4)
  const [timeBudgets, setTimeBudgets] = useState<number[]>([30])
  const [equipment, setEquipment] = useState<string[]>(['wok', 'rice_cooker'])
  const [cuisines, setCuisines] = useState<string[]>(['家常'])
  const [exclusions, setExclusions] = useState<ExclusionRule[]>([])
  const [loading, setLoading] = useState(false)
  const [popupVisible, setPopupVisible] = useState(false)
  // 禁忌编辑临时状态
  const [exTarget, setExTarget] = useState('')
  const [exScope, setExScope] = useState<ExclusionScope>('INGREDIENT')
  const [exSeverity, setExSeverity] = useState<Severity>('HARD')
  const [exNote, setExNote] = useState('')

  useEffect(() => {
    loadRule()
  }, [])

  async function loadRule() {
    try {
      // 并行加载家庭规则与禁忌规则（v0.2：禁忌持久化到 /api/family/exclusions）
      const [rule, exclusionsData] = await Promise.all([
        api.getFamilyRules(),
        api.getExclusions(),
      ])
      if (rule) {
        setFamilyRule(rule)
        setDefaultPeople(rule.defaultPeople)
        setTimeBudgets(rule.timeBudgets)
        setEquipment(rule.equipment)
        setCuisines(rule.cuisines)
      }
      if (exclusionsData && exclusionsData.length > 0) {
        setExclusions(exclusionsData)
      }
    } catch (e) {
      console.error('[Setup] loadRule error', e)
    }
  }

  async function handleSave() {
    setLoading(true)
    try {
      const base: FamilyRule = familyRule || {
        id: 'rule-new',
        familyId: 'seed-family',
        defaultPeople: 4,
        timeBudgets: [30],
        equipment: [],
        cuisines: [],
        updatedAt: new Date(),
      }
      const rule: FamilyRule = {
        ...base,
        defaultPeople,
        timeBudgets,
        equipment,
        cuisines,
        updatedAt: new Date(),
      }
      const updated = await api.putFamilyRules(rule)
      // 持久化禁忌规则（v0.2：全量替换 /api/family/exclusions）
      await api.putExclusions(exclusions)
      setFamilyRule(updated)
      resetTonightContext(updated)
      Taro.showToast({ title: '规则已保存', icon: 'success' })
      setTimeout(() => Taro.reLaunch({ url: '/pages/tonight/index' }), 500)
    } catch (e) {
      console.error('[Setup] save error', e)
      Taro.showToast({ title: '保存失败，请重试', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  function toggleTimeBudget(t: number) {
    setTimeBudgets((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
    )
  }
  function toggleEquipment(eq: string) {
    setEquipment((prev) =>
      prev.includes(eq) ? prev.filter((x) => x !== eq) : [...prev, eq]
    )
  }
  function toggleCuisine(c: string) {
    setCuisines((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]))
  }

  function addExclusion() {
    if (!exTarget.trim()) {
      Taro.showToast({ title: '请输入内容', icon: 'none' })
      return
    }
    const newEx: ExclusionRule = {
      id: `ex-${Date.now()}`,
      familyId: familyRule?.familyId || 'seed-family',
      scope: exScope,
      targetId: exScope === 'TAG' ? undefined : exTarget,
      targetTag: exScope === 'TAG' ? exTarget : undefined,
      severity: exSeverity,
      note: exNote || undefined,
    }
    setExclusions([...exclusions, newEx])
    setExTarget('')
    setExNote('')
    setExSeverity('HARD')
    setExScope('INGREDIENT')
    setPopupVisible(false)
  }

  function removeExclusion(id: string) {
    setExclusions(exclusions.filter((e) => e.id !== id))
  }

  // 忌口行展示：目标名（非食材带前缀）+ 标签（备注 · 硬禁忌/软偏好）
  function exTargetLabel(ex: ExclusionRule): string {
    const target = ex.targetId || ex.targetTag || ''
    if (ex.scope === 'DISH') return `菜品：${target}`
    if (ex.scope === 'TAG') return `标签：${target}`
    return target
  }
  function exTagLabel(ex: ExclusionRule): string {
    const kind = ex.severity === 'HARD' ? '硬禁忌' : '软偏好'
    return ex.note ? `${ex.note} · ${kind}` : kind
  }

  return (
    <View className="fm-page setup-page">
      <View className="fm-h1">长期设置</View>
      <Text className="fm-sub">改一次天天生效 · 今晚的临时设置在「今晚」页，互不影响</Text>

      {/* 默认人数：步进器 */}
      <View className="fm-card setup-gap">
        <View className="fm-row-label">默认几个人吃</View>
        <View className="fm-stepper">
          <View
            className={`fm-step-btn${defaultPeople <= 1 ? ' disabled' : ''}`}
            onClick={() => setDefaultPeople((p) => Math.max(1, p - 1))}
          >
            −
          </View>
          <Text className="fm-step-num">{defaultPeople}</Text>
          <View
            className={`fm-step-btn${defaultPeople >= 20 ? ' disabled' : ''}`}
            onClick={() => setDefaultPeople((p) => Math.min(20, p + 1))}
          >
            ＋
          </View>
          <Text className="fm-sub" style={{ marginLeft: '4px' }}>
            今晚页可临时改
          </Text>
        </View>
      </View>

      {/* 时长档：chip 多选 */}
      <View className="fm-card setup-gap">
        <View className="fm-row-label">常做的时长档（可多选）</View>
        <View className="fm-chip-opts" style={{ margin: 0 }}>
          {TIME_BUDGETS.map((t) => (
            <View
              key={t}
              className={`fm-chip-opt${timeBudgets.includes(t) ? ' on' : ''}`}
              onClick={() => toggleTimeBudget(t)}
            >
              {`${t} 分钟`}
            </View>
          ))}
        </View>
      </View>

      {/* 家里的锅：chip 多选 */}
      <View className="fm-card setup-gap">
        <View className="fm-row-label">家里的锅</View>
        <View className="fm-chip-opts" style={{ margin: 0 }}>
          {EQUIPMENT.map((eq) => (
            <View
              key={eq}
              className={`fm-chip-opt${equipment.includes(eq) ? ' on' : ''}`}
              onClick={() => toggleEquipment(eq)}
            >
              {EQUIPMENT_LABELS[eq] || eq}
            </View>
          ))}
        </View>
        <Text className="fm-sub" style={{ marginTop: '12px' }}>
          只用做得到的锅来推荐，不做你做不了的菜。
        </Text>
      </View>

      {/* 喜欢的菜系：chip 多选 */}
      <View className="fm-card setup-gap">
        <View className="fm-row-label">喜欢的菜系</View>
        <View className="fm-chip-opts" style={{ margin: 0 }}>
          {CUISINE_OPTIONS.map((c) => (
            <View
              key={c}
              className={`fm-chip-opt${cuisines.includes(c) ? ' on' : ''}`}
              onClick={() => toggleCuisine(c)}
            >
              {c}
            </View>
          ))}
        </View>
      </View>

      {/* 忌口与不吃：avoid-li 行（hard 朱砂描边 / soft 灰） */}
      <View className="fm-card setup-gap">
        <View className="fm-row-label">忌口与不吃</View>
        {exclusions.length === 0 && (
          <Text className="fm-sub" style={{ margin: 0 }}>
            还没有忌口。家里人过敏、绝对不吃的东西，加成硬禁忌。
          </Text>
        )}
        {exclusions.map((ex) => (
          <View key={ex.id} className="fm-avoid-li">
            <View className="fm-avoid-head">
              <Text className="fm-avoid-name">{exTargetLabel(ex)}</Text>
              <Text
                className={`fm-tag ${ex.severity === 'HARD' ? 'fm-tag-hard' : 'fm-tag-soft'}`}
              >
                {exTagLabel(ex)}
              </Text>
              <Text className="fm-avoid-del" onClick={() => removeExclusion(ex.id)}>
                删除
              </Text>
            </View>
            <View className="fm-avoid-desc">{SEVERITY_DESC[ex.severity]}</View>
          </View>
        ))}
        <View className="fm-btn-swap fm-avoid-add" onClick={() => setPopupVisible(true)}>
          ＋ 添加忌口
        </View>
      </View>

      <View className="fm-bottom-bar">
        <Button className="fm-btn-primary" loading={loading} onClick={handleSave}>
          保存设置
        </Button>
      </View>

      {/* 添加忌口弹窗 */}
      <Popup
        visible={popupVisible}
        position="bottom"
        round
        onClose={() => setPopupVisible(false)}
      >
        <View className="fm-setup-popup">
          <Text className="fm-setup-title">添加忌口</Text>
          <View className="fm-setup-label">分类</View>
          <View className="fm-chip-opts" style={{ margin: 0 }}>
            {SCOPE_LABELS.map((s) => (
              <View
                key={s.value}
                className={`fm-chip-opt${exScope === s.value ? ' on' : ''}`}
                onClick={() => setExScope(s.value)}
              >
                {s.label}
              </View>
            ))}
          </View>
          <View className="fm-setup-label">名称</View>
          <Input
            className="fm-input"
            placeholder={`输入${SCOPE_LABELS.find((s) => s.value === exScope)?.label}名称`}
            value={exTarget}
            onInput={(e) => setExTarget(e.detail.value)}
          />
          <View className="fm-setup-label">严重度</View>
          <View className="fm-chip-opts" style={{ margin: 0 }}>
            <View
              className={`fm-chip-opt${exSeverity === 'HARD' ? ' on' : ''}`}
              onClick={() => setExSeverity('HARD')}
            >
              硬禁忌（过敏/绝对）
            </View>
            <View
              className={`fm-chip-opt${exSeverity === 'SOFT' ? ' on' : ''}`}
              onClick={() => setExSeverity('SOFT')}
            >
              软偏好（不喜欢）
            </View>
          </View>
          <View className="fm-setup-label">备注（选填）</View>
          <Input
            className="fm-input"
            placeholder="如：爸爸不吃"
            value={exNote}
            onInput={(e) => setExNote(e.detail.value)}
          />
          <Button className="fm-btn-primary" onClick={addExclusion}>
            添加
          </Button>
          <Button className="fm-btn-ghost" onClick={() => setPopupVisible(false)}>
            取消
          </Button>
        </View>
      </Popup>

      <CustomTabBar />
    </View>
  )
}
