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
  // PE-1 返工（review T-1 修复）：本次编辑会话中用户删除的行 id 集合。
  // 产品口径：用户行=用户数据，删除须持久化（保存合并时从远端追加中排除，随 PUT 生效）；
  //          seed 行=出厂配置，从 UI 删除后保存仍会由 API 层 seed 保护复活（S-5 语义保持，见 handleSave 注释）。
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [popupVisible, setPopupVisible] = useState(false)
  // PE-1：禁忌规则加载中/失败标记——true 时禁用保存，防止空 state 全量 PUT 覆盖库内规则。
  // PE-1 返工（review S2）：初始值 false→true（加载完成前同样不可保存，消除加载窗口）；
  //   settle 后由 loadRule 的 allSettled 分路置位：exclusions GET 成功 → false，失败 → true。
  const [exclusionsLoadFailed, setExclusionsLoadFailed] = useState(true)
  // 禁忌编辑临时状态
  const [exTarget, setExTarget] = useState('')
  const [exScope, setExScope] = useState<ExclusionScope>('INGREDIENT')
  const [exSeverity, setExSeverity] = useState<Severity>('HARD')
  const [exNote, setExNote] = useState('')

  useEffect(() => {
    loadRule()
  }, [])

  async function loadRule() {
    // PE-1：家庭规则与禁忌规则分开处理错误——
    //   familyRule 加载失败维持现状（catch + console.error）；
    //   exclusions GET 失败时置 exclusionsLoadFailed 禁用保存（空 state 保存 = 全量 PUT 清掉库内用户行），
    //   成功则恢复可保存。API 层（planService.putExclusions）另有 seed- 行保护兜底，双层防御。
    const [ruleRes, exRes] = await Promise.allSettled([
      api.getFamilyRules(),
      api.getExclusions(),
    ])
    if (ruleRes.status === 'fulfilled') {
      const rule = ruleRes.value
      if (rule) {
        setFamilyRule(rule)
        setDefaultPeople(rule.defaultPeople)
        setTimeBudgets(rule.timeBudgets)
        setEquipment(rule.equipment)
        setCuisines(rule.cuisines)
      }
    } else {
      console.error('[Setup] loadFamilyRules error', ruleRes.reason)
    }
    if (exRes.status === 'fulfilled') {
      const exclusionsData = exRes.value
      setExclusionsLoadFailed(false)
      if (exclusionsData && exclusionsData.length > 0) {
        setExclusions(exclusionsData)
      }
    } else {
      console.error('[Setup] loadExclusions error', exRes.reason)
      setExclusionsLoadFailed(true)
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
      // 持久化禁忌规则（v0.2：PUT /api/family/exclusions 为全量替换【仅对用户行】，seed- 行有 API 层保护）。
      // PE-1 兜底：保存前 re-GET 远端行，与本地 state 按 id 合并去重（本地版本优先、远端独有行追加）再 PUT——
      // 兜住「本地缺 seed 行」与「其它端新增行被本地旧 state 覆盖」两类误伤。
      // PE-1 返工（review T-1 修复）：合并额外排除 removedIds，两侧删除语义完整披露：
      //   用户行删除 → 不从远端追加 → PUT payload 不含该行 → deleteMany 清除 → 删除持久化（用户数据可删）；
      //   seed 行删除 → 同样不进 payload，但库内 seed 行受 API 层保护仍在 → 保存后/重进页面即复活
      //     （S-5 语义保持：seed=出厂配置不可经 UI 删除；正式解法为长期方案 3：ExclusionRule 加 source 列
      //     SEED/USER，涉 shared 契约+迁移，另立卡）。
      // re-GET 失败则中止保存（走 catch 提示重试）：宁可让用户重按一次保存，
      // 也不静默用本地旧 state 全量回传覆盖远端（避免静默覆盖其它端新增的用户行）。
      const remote = await api.getExclusions()
      const localIds = new Set(exclusions.map((e) => e.id))
      const merged = [
        ...exclusions,
        ...remote.filter((r) => !localIds.has(r.id) && !removedIds.has(r.id)),
      ]
      await api.putExclusions(merged)
      // 保存成功后才清空 removedIds（删除已随 PUT 持久化）；保存失败/中止时保留，用户重试仍生效
      setRemovedIds(new Set())
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
    // PE-1 返工（review T-1 修复）：记录待删 id，保存合并时从远端追加中排除——
    // 否则远端仍存在的已删行会被合并追加回去，用户删除操作被保存动作静默回滚（T-1 行为回归）。
    setRemovedIds((prev) => new Set(prev).add(id))
  }

  // 忌口行展示：目标名（非食材带前缀）+ 标签（备注 · 硬禁忌/软偏好）
  function exTargetLabel(ex: ExclusionRule): string {
    // 优先 targetName（api join 回填的食材名），避免直渲 targetId 的 cuid 串（乱码 bug）
    const target = ex.targetName || ex.targetId || ex.targetTag || ''
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
        {/* PE-1：禁忌规则加载失败时禁用保存并提示，防止空 state 全量 PUT 覆盖库内规则 */}
        {exclusionsLoadFailed && (
          <Text className="fm-sub" style={{ color: '#c0392b', textAlign: 'center' }}>
            忌口规则加载失败，暂不能保存；请返回重进本页重试
          </Text>
        )}
        <Button
          className="fm-btn-primary"
          loading={loading}
          disabled={loading || exclusionsLoadFailed}
          onClick={handleSave}
        >
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
