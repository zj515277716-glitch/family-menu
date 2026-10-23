// apps/h5/test/feedback.spec.ts
// S-10 记一笔纯逻辑单测（T-Q13）：预填/切换清空、必填校验、请求报文（没做不带味道/耗时）、
// 标签映射与历史 meta 文案。
import { describe, it, expect } from 'vitest'
import type { FeedbackResponse } from '@family-menu/shared'
import {
  actualMinutesLabel,
  actualMinuteOptions,
  buildFeedbackRequest,
  chooseDidCook,
  EMPTY_FEEDBACK_DRAFT,
  feedbackMeta,
  feedbackTag,
  initFeedbackDraft,
  validateFeedbackDraft,
  type FeedbackDraft,
} from '../src/lib/feedback'

function fb(overrides: Partial<FeedbackResponse> = {}): FeedbackResponse {
  return {
    didCook: true,
    taste: 'good',
    willRepeat: true,
    submittedAt: new Date(2026, 9, 21, 18, 5),
    ...overrides,
  }
}

function draft(overrides: Partial<FeedbackDraft> = {}): FeedbackDraft {
  return { ...EMPTY_FEEDBACK_DRAFT, ...overrides }
}

describe('预填与切换', () => {
  it('无反馈：四问全空，不臆造默认答案', () => {
    expect(initFeedbackDraft(null)).toEqual(EMPTY_FEEDBACK_DRAFT)
  })

  it('已有反馈：还原做了/味道/下次还做/耗时', () => {
    expect(
      initFeedbackDraft(
        fb({ taste: 'ok', willRepeat: false, actualMinutes: 30 }),
      ),
    ).toEqual({ didCook: true, taste: 'ok', willRepeat: false, actualMinutes: 30 })
  })

  it('已有反馈是没做：味道与耗时预填为空，仍保留下次还做', () => {
    expect(initFeedbackDraft(fb({ didCook: false, taste: undefined, actualMinutes: undefined, willRepeat: false }))).toEqual({
      didCook: false,
      taste: null,
      willRepeat: false,
      actualMinutes: null,
    })
  })

  it('切到没做：味道/耗时保留在草稿里，但报文不发送；切回「做了」原选择仍在', () => {
    const before = draft({ didCook: true, taste: 'good', willRepeat: true, actualMinutes: 30 })
    const notCooked = chooseDidCook(before, false)
    expect(notCooked).toEqual({
      didCook: false,
      taste: 'good',
      willRepeat: true,
      actualMinutes: 30,
    })
    expect(buildFeedbackRequest(notCooked, 'lunch')).toEqual({
      didCook: false,
      willRepeat: true,
      mealSlot: 'lunch',
    })

    const back = chooseDidCook(notCooked, true)
    expect(back.taste).toBe('good')
    expect(back.actualMinutes).toBe(30)
  })
})

describe('必填校验', () => {
  it('缺第①问：指出做了没还没选', () => {
    expect(validateFeedbackDraft(draft())).toContain('做了没')
  })

  it('做了但缺第②问：指出好吃吗还没选', () => {
    expect(validateFeedbackDraft(draft({ didCook: true, willRepeat: true }))).toContain('好吃吗')
  })

  it('没做时第②问隐藏，不参与校验', () => {
    expect(validateFeedbackDraft(draft({ didCook: false, willRepeat: true }))).toBeNull()
  })

  it('缺第③问：指出下次还做吗还没选', () => {
    expect(validateFeedbackDraft(draft({ didCook: false, willRepeat: null }))).toContain('下次还做吗')
  })
})

describe('请求报文', () => {
  it('没做：不携带 taste/actualMinutes，只带 didCook/willRepeat/mealSlot', () => {
    const req = buildFeedbackRequest(
      draft({ didCook: false, taste: 'good', willRepeat: false, actualMinutes: 30 }),
      'lunch',
    )
    expect(req).toEqual({ didCook: false, willRepeat: false, mealSlot: 'lunch' })
    expect('taste' in req).toBe(false)
    expect('actualMinutes' in req).toBe(false)
  })

  it('做了且选了耗时：三问 + 耗时 + 餐次齐全', () => {
    expect(
      buildFeedbackRequest(draft({ didCook: true, taste: 'fail', willRepeat: true, actualMinutes: 50 }), 'dinner'),
    ).toEqual({
      didCook: true,
      taste: 'fail',
      willRepeat: true,
      actualMinutes: 50,
      mealSlot: 'dinner',
    })
  })

  it('做了但没选耗时：不带 actualMinutes 键', () => {
    const req = buildFeedbackRequest(draft({ didCook: true, taste: 'good', willRepeat: true }), 'breakfast')
    expect(req).toEqual({
      didCook: true,
      taste: 'good',
      willRepeat: true,
      mealSlot: 'breakfast',
    })
    expect('actualMinutes' in req).toBe(false)
  })

  it('未通过必填校验：拒绝组报文（组件层已 toast 指明缺哪问）', () => {
    expect(() => buildFeedbackRequest(draft(), 'dinner')).toThrow('做了没')
  })
})

describe('耗时快捷块', () => {
  it('固定 15/30/50；存量特殊值追加原值不丢', () => {
    expect(actualMinuteOptions(null)).toEqual([15, 30, 50])
    expect(actualMinuteOptions(20)).toEqual([15, 30, 50, 20])
  })

  it('15 文案为「15 分钟内」', () => {
    expect(actualMinutesLabel(15)).toBe('15 分钟内')
    expect(actualMinutesLabel(50)).toBe('50 分钟')
  })
})

describe('评价标签与历史 meta', () => {
  it('无反馈=还没评价灰；没做=没做灰', () => {
    expect(feedbackTag(null)).toEqual({ label: '还没评价', cls: 'tag-none' })
    expect(feedbackTag(fb({ didCook: false }))).toEqual({ label: '没做', cls: 'tag-none' })
  })

  it('四色标签：好吃/一般/翻车', () => {
    expect(feedbackTag(fb({ taste: 'good' }))).toEqual({ label: '好吃', cls: 'tag-ok' })
    expect(feedbackTag(fb({ taste: 'ok' }))).toEqual({ label: '一般', cls: 'tag-mid' })
    expect(feedbackTag(fb({ taste: 'fail' }))).toEqual({ label: '翻车', cls: 'tag-bad' })
  })

  it('历史标签带「做了 · 」前缀', () => {
    expect(feedbackTag(fb({ taste: 'good' }), true)).toEqual({ label: '做了 · 好吃', cls: 'tag-ok' })
    expect(feedbackTag(fb({ taste: 'fail' }), true)).toEqual({ label: '做了 · 翻车', cls: 'tag-bad' })
  })

  it('meta：没做/下次还做/不做了/还没评价', () => {
    expect(feedbackMeta(null)).toBe('还没评价')
    expect(feedbackMeta(fb({ didCook: false }))).toBe('18:05 记过 · 没做')
    expect(feedbackMeta(fb({ willRepeat: true }))).toBe('18:05 记过 · 下次还做')
    expect(feedbackMeta(fb({ willRepeat: false }))).toBe('18:05 记过 · 不做了')
  })
})
