// apps/h5/src/lib/settings-form.ts
// 设置页（S-12）表单纯逻辑：选项集、读取（刷新还原）、保存载荷构造、禁忌合并。
// 与渲染解耦便于单测；口径依据主控裁决（2026-10-19）：
//   - 时长档 = 契约 15/30/60，单选，存 timeBudgets=[选中档]；
//   - 锅 5 项 / 菜系 5 项以原型为准，已存值动态并入选项集（不丢已填），存自由字符串；
//   - 已吃菜避开窗口 3/5/7 默认 7，已存值同样并入；
//   - 禁忌保存沿用 PE-1 合并语义（本地优先 + 远端追加 − 已删 id），seed 行服务端兜底。
import type { ExclusionRule, FamilyRule } from '@family-menu/shared'

// ───── 选项集（原型 S-12 定稿） ─────

/** 家里的锅（原型 5 项，自由字符串存储） */
export const POT_OPTIONS = ['炒锅', '蒸锅', '电饭煲', '烤箱', '高压锅'] as const

/** 喜欢的菜系（原型 5 项，自由字符串存储） */
export const CUISINE_OPTIONS = ['家常', '粤式', '川式', '江浙', '东北'] as const

/** 常做时长档（契约 15/30/60，文案沿用原型口径） */
export const TIME_BUDGET_OPTIONS: { value: number; label: string }[] = [
  { value: 15, label: '快手 15 分钟' },
  { value: 30, label: '标准 30 分钟' },
  { value: 60, label: '从容 60 分钟' },
]

/** 已吃菜避开窗口（天），默认 7 */
export const AVOID_DAY_OPTIONS = [3, 5, 7] as const
export const DEFAULT_AVOID_DAYS = 7
export const DEFAULT_TIME_BUDGET = 30

// ───── 表单状态 ─────

export interface SettingsForm {
  adults: number
  children: number
  timeBudget: number
  equipment: string[]
  cuisines: string[]
  avoidDays: number
}

/** 已存值动态并入选项集：预设顺序在前，已存额外值追加在后（不丢已填，裁决口径 3） */
export function mergeOptions(preset: readonly string[], stored: readonly string[]): string[] {
  const out = [...preset]
  for (const v of stored) {
    if (!out.includes(v)) out.push(v)
  }
  return out
}

/** 数字档并入（避开窗口）：升序归并，已存额外值插入正确位置 */
export function mergeDayOptions(stored: number): number[] {
  const out = [...AVOID_DAY_OPTIONS] as number[]
  if (!out.includes(stored)) {
    out.push(stored)
    out.sort((a, b) => a - b)
  }
  return out
}

/** 时长档读取：已存数组中第一个落在选项内的值；都没有（或空）回默认 30（裁决口径 2） */
export function pickTimeBudget(stored: readonly number[] | undefined): number {
  const hit = (stored ?? []).find((t) => TIME_BUDGET_OPTIONS.some((o) => o.value === t))
  return hit ?? DEFAULT_TIME_BUDGET
}

/** 避开窗口读取：非正整数回默认 7 */
export function pickAvoidDays(stored: number | undefined): number {
  return stored && Number.isInteger(stored) && stored > 0 ? stored : DEFAULT_AVOID_DAYS
}

/**
 * 读取：规则行 → 表单状态（刷新还原的「还原」侧）。
 * rule 为 null（冷启动首用）时给全家默认值：成人 2 / 儿童 0 / 30 分钟 / 窗口 7，锅与菜系待选。
 */
export function formStateFromRule(rule: FamilyRule | null): SettingsForm {
  if (!rule) {
    return {
      adults: 2,
      children: 0,
      timeBudget: DEFAULT_TIME_BUDGET,
      equipment: [],
      cuisines: [],
      avoidDays: DEFAULT_AVOID_DAYS,
    }
  }
  return {
    adults: rule.defaultAdults,
    children: rule.defaultChildren,
    timeBudget: pickTimeBudget(rule.timeBudgets),
    equipment: [...rule.equipment],
    cuisines: [...rule.cuisines],
    avoidDays: pickAvoidDays(rule.avoidRecentDays),
  }
}

/**
 * 保存：表单状态 + 既有规则行 → PUT 载荷（刷新还原的「保存」侧）。
 * defaultPeople 为旧单餐字段，本页不再编辑：有既有行原样保留，新家庭落成成人+儿童合计。
 */
export function buildRulePayload(base: FamilyRule | null, form: SettingsForm): FamilyRule {
  return {
    id: base?.id ?? 'rule-new',
    familyId: base?.familyId ?? 'seed-family',
    defaultPeople: base?.defaultPeople ?? form.adults + form.children,
    defaultAdults: form.adults,
    defaultChildren: form.children,
    avoidRecentDays: form.avoidDays,
    timeBudgets: [form.timeBudget],
    equipment: [...form.equipment],
    cuisines: [...form.cuisines],
    updatedAt: new Date(),
  }
}

/**
 * 禁忌保存合并（PE-1 语义）：本地行优先 + 远端独有行追加 − 本次会话已删 id。
 * 兜住「本地缺 seed 行」与「其它端新增行被本地旧 state 覆盖」两类误伤；
 * 用户行删除不追加回来（删除随 PUT 持久化）；seed 行复活由服务端保护兜底。
 */
export function mergeExclusions(
  local: readonly ExclusionRule[],
  remote: readonly ExclusionRule[],
  removedIds: ReadonlySet<string>,
): ExclusionRule[] {
  const localIds = new Set(local.map((e) => e.id))
  return [
    ...local,
    ...remote.filter((r) => !localIds.has(r.id) && !removedIds.has(r.id)),
  ]
}

/** 新禁忌行（页面加忌口弹层确认时构造） */
export function buildExclusion(input: {
  familyId: string
  scope: ExclusionRule['scope']
  target: string
  severity: ExclusionRule['severity']
  note?: string
  now?: number
}): ExclusionRule {
  return {
    id: `ex-${input.now ?? Date.now()}`,
    familyId: input.familyId,
    scope: input.scope,
    targetId: input.scope === 'TAG' ? undefined : input.target,
    targetTag: input.scope === 'TAG' ? input.target : undefined,
    severity: input.severity,
    note: input.note || undefined,
  }
}
