// apps/h5/src/pages/setup/index.tsx
// F1 家庭规则设置（/pages/setup，Tab）
// 对齐 wireframes.md 第37-95行：人数/时长/器具/菜系/禁忌Popup，PUT /api/family/rules
import { useEffect, useState } from 'react'
import Taro from '@tarojs/taro'
import { View, Text } from '@tarojs/components'
import {
  InputNumber,
  Checkbox,
  CheckboxGroup,
  Tag,
  Cell,
  Popup,
  Radio,
  RadioGroup,
  Input,
  Button,
} from '@nutui/nutui-react-taro'
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
      const rule = await api.getFamilyRules()
      if (rule) {
        setFamilyRule(rule)
        setDefaultPeople(rule.defaultPeople)
        setTimeBudgets(rule.timeBudgets)
        setEquipment(rule.equipment)
        setCuisines(rule.cuisines)
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

  const hardCount = exclusions.filter((e) => e.severity === 'HARD').length
  const softCount = exclusions.filter((e) => e.severity === 'SOFT').length

  return (
    <View className="fm-page setup-page">
      <View className="fm-page-header">
        <Text className="fm-page-title">家庭规则设置</Text>
      </View>

      <View className="fm-card">
        <Text className="fm-label">默认人数</Text>
        <View className="fm-row">
          <InputNumber
            value={defaultPeople}
            min={1}
            max={20}
            onChange={(v) => setDefaultPeople(Number(v))}
          />
        </View>
      </View>

      <View className="fm-card">
        <Text className="fm-label">常用时长（可多选）</Text>
        <CheckboxGroup
          value={timeBudgets}
          onChange={(v) => setTimeBudgets((v as unknown[]).map(Number))}
        >
          <View className="fm-checkbox-row">
            {TIME_BUDGETS.map((t) => (
              <Checkbox key={t} value={t} label={`${t}分钟`} />
            ))}
          </View>
        </CheckboxGroup>
      </View>

      <View className="fm-card">
        <Text className="fm-label">厨房器具（可多选）</Text>
        <CheckboxGroup
          value={equipment}
          onChange={(v) => setEquipment(v as string[])}
        >
          <View className="fm-checkbox-row">
            {EQUIPMENT.map((eq) => (
              <Checkbox key={eq} value={eq} label={EQUIPMENT_LABELS[eq] || eq} />
            ))}
          </View>
        </CheckboxGroup>
      </View>

      <View className="fm-card">
        <Text className="fm-label">偏好菜系</Text>
        <View className="fm-tag-row">
          {CUISINE_OPTIONS.map((c) => (
            <Tag
              key={c}
              type={cuisines.includes(c) ? 'primary' : 'default'}
              onClick={() => toggleCuisine(c)}
            >
              {c}
            </Tag>
          ))}
        </View>
      </View>

      <View className="fm-card">
        <Cell
          title="禁忌设置"
          subTitle={`硬禁忌${hardCount}项 · 软禁忌${softCount}项`}
          onClick={() => setPopupVisible(true)}
          isLink
        />
        {exclusions.length > 0 && (
          <View className="fm-exclusion-list">
            {exclusions.map((ex) => (
              <View key={ex.id} className="fm-exclusion-item">
                <Tag type={ex.severity === 'HARD' ? 'danger' : 'warning'}>
                  {ex.severity === 'HARD' ? '硬' : '软'}
                </Tag>
                <Text className="fm-exclusion-text">
                  {SCOPE_LABELS.find((s) => s.value === ex.scope)?.label}：{ex.targetId || ex.targetTag}
                  {ex.note ? `（${ex.note}）` : ''}
                </Text>
                <Text className="fm-exclusion-del" onClick={() => removeExclusion(ex.id)}>删除</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      <View className="fm-bottom-bar">
        <Button type="primary" block loading={loading} onClick={handleSave}>
          保存规则
        </Button>
      </View>

      <View style={{ height: '120px' }} />

      <Popup
        visible={popupVisible}
        position="bottom"
        round
        onClose={() => setPopupVisible(false)}
      >
        <View className="fm-popup-content">
          <Text className="fm-popup-title">添加禁忌</Text>
          <Text className="fm-label">分类</Text>
          <RadioGroup
            value={exScope}
            direction="horizontal"
            onChange={(v) => setExScope(v as ExclusionScope)}
          >
            {SCOPE_LABELS.map((s) => (
              <Radio key={s.value} value={s.value}>
                {s.label}
              </Radio>
            ))}
          </RadioGroup>
          <Text className="fm-label">名称/标签</Text>
          <Input
            placeholder={`输入${SCOPE_LABELS.find((s) => s.value === exScope)?.label}名称`}
            value={exTarget}
            onChange={(v) => setExTarget(v)}
          />
          <Text className="fm-label">严重度</Text>
          <RadioGroup
            value={exSeverity}
            direction="horizontal"
            onChange={(v) => setExSeverity(v as Severity)}
          >
            <Radio value="HARD">硬禁忌（过敏/绝对）</Radio>
            <Radio value="SOFT">软禁忌（不喜欢）</Radio>
          </RadioGroup>
          <Text className="fm-label">备注（选填）</Text>
          <Input placeholder="如：爸爸不吃" value={exNote} onChange={(v) => setExNote(v)} />
          <View className="fm-popup-actions">
            <Button onClick={() => setPopupVisible(false)}>取消</Button>
            <Button type="primary" onClick={addExclusion}>添加</Button>
          </View>
        </View>
      </Popup>

      <CustomTabBar />
    </View>
  )
}
