// apps/h5/src/lib/feedback.ts
// S-10 记一笔纯逻辑（T-Q13，C-5）：表单草稿 ↔ FeedbackRequest 报文、必填校验、
// 反馈标签与历史 meta 文案。与渲染解耦便于单测；不伪造服务端事实。
// 问卷顺序：①做了没（必选）→②好吃吗（做了必选/没做隐藏）→③下次还做吗（必选）→④耗时（选填）。
import type { FeedbackRequest, FeedbackResponse, MealSlot, Taste } from '@family-menu/shared'
import { formatTimeHM } from './format'

/** 耗时快捷块（C-5：15/30/50；默认不选，可取消） */
export const QUICK_ACTUAL_MINUTES = [15, 30, 50] as const

export interface FeedbackDraft {
  didCook: boolean | null
  taste: Taste | null
  willRepeat: boolean | null
  /** 实际耗时（分钟）；null=未选/可取消。存量反馈可能是快捷块之外的值，原样预填 */
  actualMinutes: number | null
}

export const EMPTY_FEEDBACK_DRAFT: FeedbackDraft = {
  didCook: null,
  taste: null,
  willRepeat: null,
  actualMinutes: null,
}

function isFiniteInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v > 0
}

/** 打开弹层时的预填：已有该餐反馈则还原原值；没做时味道/耗时一律为空 */
export function initFeedbackDraft(fb: FeedbackResponse | null | undefined): FeedbackDraft {
  if (!fb) return { ...EMPTY_FEEDBACK_DRAFT }
  return {
    didCook: fb.didCook,
    taste: fb.didCook ? fb.taste ?? null : null,
    willRepeat: typeof fb.willRepeat === 'boolean' ? fb.willRepeat : null,
    actualMinutes: fb.didCook && isFiniteInt(fb.actualMinutes) ? fb.actualMinutes : null,
  }
}

/** 切换「做了没」：切到没做时清空味道与实际耗时（隐藏且不发送，切换不残留） */
export function chooseDidCook(draft: FeedbackDraft, didCook: boolean): FeedbackDraft {
  if (didCook) return { ...draft, didCook }
  return { ...draft, didCook, taste: null, actualMinutes: null }
}

/** 本地必填校验：返回缺哪一问的人话；null=可提交 */
export function validateFeedbackDraft(draft: FeedbackDraft): string | null {
  if (draft.didCook === null) return '第①问「做了没」还没选'
  if (draft.didCook && !draft.taste) return '第②问「好吃吗」还没选'
  if (draft.willRepeat === null) return '第③问「下次还做吗」还没选'
  return null
}

/**
 * 表单草稿 → POST /api/plans/:id/feedback 报文：
 * 没做只发 didCook/willRepeat/mealSlot（不携带 taste/actualMinutes）；
 * 做了才带 taste，耗时选了才带。未通过必填校验时抛错（组件层应先 toast）。
 */
export function buildFeedbackRequest(draft: FeedbackDraft, slot: MealSlot): FeedbackRequest {
  const missing = validateFeedbackDraft(draft)
  if (missing) throw new Error(missing)
  if (!draft.didCook) {
    return { didCook: false, willRepeat: draft.willRepeat === true, mealSlot: slot }
  }
  return {
    didCook: true,
    taste: draft.taste as Taste,
    willRepeat: draft.willRepeat === true,
    ...(draft.actualMinutes !== null ? { actualMinutes: draft.actualMinutes } : {}),
    mealSlot: slot,
  }
}

/** 快捷块 + 存量特殊值（不在 15/30/50 内时追加一项原值，避免预填丢失） */
export function actualMinuteOptions(current: number | null): number[] {
  const base: number[] = [...QUICK_ACTUAL_MINUTES]
  if (current !== null && !base.includes(current)) base.push(current)
  return base
}

/** 耗时快捷块文案（15 = 15 分钟内，其余 = N 分钟） */
export function actualMinutesLabel(minutes: number): string {
  return minutes === 15 ? '15 分钟内' : `${minutes} 分钟`
}

export interface FeedbackTagStyle {
  label: string
  cls: string
}

/**
 * 评价标签：首页只显示味道（好吃/一般/翻车），历史显示「做了 · 好吃」；
 * 没做=灰、未评价=灰。四色口径与 app.css .tag-* 对齐。
 */
export function feedbackTag(fb: FeedbackResponse | null | undefined, withDidCook = false): FeedbackTagStyle {
  if (!fb) return { label: '还没评价', cls: 'tag-none' }
  if (!fb.didCook) return { label: '没做', cls: 'tag-none' }
  const tasteLabel = fb.taste === 'good' ? '好吃' : fb.taste === 'ok' ? '一般' : fb.taste === 'fail' ? '翻车' : null
  if (!tasteLabel) return { label: withDidCook ? '做了' : '还没评价', cls: 'tag-mid' }
  const cls = fb.taste === 'good' ? 'tag-ok' : fb.taste === 'ok' ? 'tag-mid' : 'tag-bad'
  return { label: withDidCook ? `做了 · ${tasteLabel}` : tasteLabel, cls }
}

function submittedDate(fb: FeedbackResponse): Date | null {
  const raw = fb.submittedAt as Date | string
  const d = raw instanceof Date ? raw : new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

/** 历史每餐 meta：有反馈「HH:mm 记过 · 下次还做/不做了」；没做「HH:mm 记过 · 没做」；无反馈「还没评价」 */
export function feedbackMeta(fb: FeedbackResponse | null | undefined): string {
  if (!fb) return '还没评价'
  const d = submittedDate(fb)
  const time = d ? formatTimeHM(d) : null
  const head = time ? `${time} 记过` : '记过'
  if (!fb.didCook) return `${head} · 没做`
  if (fb.willRepeat === true) return `${head} · 下次还做`
  if (fb.willRepeat === false) return `${head} · 不做了`
  return head
}
