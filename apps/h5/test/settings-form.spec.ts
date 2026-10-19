// apps/h5/test/settings-form.spec.ts
// 设置页（S-12）纯逻辑单测：保存载荷 + 刷新还原 + 选项并入口径（主控裁决 2/3）+ 禁忌合并（PE-1）。
import { describe, it, expect } from 'vitest'
import type { ExclusionRule, FamilyRule } from '@family-menu/shared'
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
  pickAvoidDays,
  pickTimeBudget,
} from '../src/lib/settings-form'

const baseRule: FamilyRule = {
  id: 'seed-family-rule',
  familyId: 'seed-family',
  defaultPeople: 4,
  defaultAdults: 2,
  defaultChildren: 1,
  avoidRecentDays: 5,
  timeBudgets: [30, 60],
  equipment: ['wok', 'rice_cooker'],
  cuisines: ['家常', '湘菜'],
  updatedAt: new Date('2026-08-06T00:00:00Z'),
}

describe('读取：formStateFromRule（刷新还原的还原侧）', () => {
  it('冷启动（null）：全家默认值 成人2/儿童0/30分钟/窗口7，锅与菜系待选', () => {
    expect(formStateFromRule(null)).toEqual({
      adults: 2,
      children: 0,
      timeBudget: 30,
      equipment: [],
      cuisines: [],
      avoidDays: 7,
    })
  })

  it('既有行：新三字段原样读出；时长档取已存数组中首个合法档', () => {
    const form = formStateFromRule(baseRule)
    expect(form.adults).toBe(2)
    expect(form.children).toBe(1)
    expect(form.avoidDays).toBe(5)
    expect(form.timeBudget).toBe(30) // [30, 60] → 首个在选项内的值
    expect(form.equipment).toEqual(['wok', 'rice_cooker'])
    expect(form.cuisines).toEqual(['家常', '湘菜'])
  })

  it('时长档兜底：已存 [60] 选 60；已存 [45]（非法档）回默认 30', () => {
    expect(pickTimeBudget([60])).toBe(60)
    expect(pickTimeBudget([45])).toBe(30)
    expect(pickTimeBudget([])).toBe(30)
    expect(pickTimeBudget(undefined)).toBe(30)
  })

  it('避开窗口兜底：非正整数回默认 7', () => {
    expect(pickAvoidDays(3)).toBe(3)
    expect(pickAvoidDays(0)).toBe(7)
    expect(pickAvoidDays(undefined)).toBe(7)
  })
})

describe('选项并入（裁决口径 3：已存值动态并入选项集，不丢已填）', () => {
  it('预设在前、已存额外值追加在后、不去重不出双份', () => {
    expect(mergeOptions(CUISINE_OPTIONS, ['湘菜', '家常'])).toEqual([
      ...CUISINE_OPTIONS,
      '湘菜',
    ])
    expect(mergeOptions(POT_OPTIONS, ['电饭煲'])).toEqual([...POT_OPTIONS])
  })

  it('避开窗口：已存值并入并保持升序（如库存 14 天也显示可选中）', () => {
    expect(mergeDayOptions(7)).toEqual([3, 5, 7])
    expect(mergeDayOptions(14)).toEqual([3, 5, 7, 14])
    expect(mergeDayOptions(4)).toEqual([3, 4, 5, 7])
  })

  it('时长档文案按裁决：15/30/60 三档（快手/标准/从容）', () => {
    expect(TIME_BUDGET_OPTIONS.map((o) => o.value)).toEqual([15, 30, 60])
    expect(TIME_BUDGET_OPTIONS.map((o) => o.label)).toEqual([
      '快手 15 分钟',
      '标准 30 分钟',
      '从容 60 分钟',
    ])
  })
})

describe('保存与刷新还原：buildRulePayload ↔ formStateFromRule 往返恒等', () => {
  it('有既有行：id/familyId/defaultPeople 保留，表单字段全量覆盖', () => {
    const form = {
      adults: 3,
      children: 2,
      timeBudget: 60,
      equipment: ['炒锅', '烤箱'],
      cuisines: ['家常', '川式'],
      avoidDays: 3,
    }
    const payload = buildRulePayload(baseRule, form)
    expect(payload.id).toBe('seed-family-rule')
    expect(payload.familyId).toBe('seed-family')
    expect(payload.defaultPeople).toBe(4) // 旧字段本页不编辑，原样保留
    expect(payload.timeBudgets).toEqual([60]) // 单选存储为 [选中档]
    // 刷新还原：保存的值重新读出必须与编辑态一致（C-1「刷新/重进原样还在」）
    expect(formStateFromRule(payload)).toEqual(form)
  })

  it('冷启动首存（无既有行）：占位 id + seed-family + defaultPeople=成人+儿童', () => {
    const form = {
      adults: 2,
      children: 1,
      timeBudget: 15,
      equipment: ['炒锅'],
      cuisines: ['粤式'],
      avoidDays: 7,
    }
    const payload = buildRulePayload(null, form)
    expect(payload.id).toBe('rule-new')
    expect(payload.familyId).toBe('seed-family')
    expect(payload.defaultPeople).toBe(3)
    expect(formStateFromRule(payload)).toEqual(form)
  })
})

describe('禁忌合并（PE-1）与新行构造', () => {
  const local: ExclusionRule = {
    id: 'ex-local',
    familyId: 'seed-family',
    scope: 'INGREDIENT',
    targetId: 'ing-a',
    severity: 'HARD',
  }
  const remoteOnly: ExclusionRule = {
    id: 'ex-remote',
    familyId: 'seed-family',
    scope: 'TAG',
    targetTag: '内脏',
    severity: 'SOFT',
  }
  const remoteDup: ExclusionRule = { ...local, note: '远端版本' }

  it('本地优先 + 远端独有追加 − 已删 id', () => {
    const merged = mergeExclusions([local], [remoteDup, remoteOnly], new Set())
    expect(merged.map((e) => e.id)).toEqual(['ex-local', 'ex-remote'])
    expect(merged[0].note).toBeUndefined() // 本地版本优先，不被远端覆盖
  })

  it('本次会话删除的行不从远端追加回来（删除随保存持久化）', () => {
    const merged = mergeExclusions([], [remoteOnly], new Set(['ex-remote']))
    expect(merged).toEqual([])
  })

  it('buildExclusion：TAG 走 targetTag，其余走 targetId', () => {
    const tag = buildExclusion({ familyId: 'f', scope: 'TAG', target: '内脏', severity: 'SOFT', now: 1 })
    expect(tag.targetTag).toBe('内脏')
    expect(tag.targetId).toBeUndefined()
    const ing = buildExclusion({ familyId: 'f', scope: 'INGREDIENT', target: '花生', severity: 'HARD', now: 2 })
    expect(ing.targetId).toBe('花生')
    expect(ing.targetTag).toBeUndefined()
    expect(ing.id).toBe('ex-2')
  })
})
