// apps/h5/test/shopping-list.spec.ts
// S-08 采购清单纯逻辑单测（T-Q12）：勾选本地切换、PATCH 响应合并
// （响应无 prepAdvice 时保留本地备菜建议）、待买计数（已有不计）、用量格式化。
import { describe, it, expect } from 'vitest'
import type { ShoppingList } from '@family-menu/shared'
import {
  countToBuy,
  formatQty,
  mergePatchResponse,
  toggleItemLocal,
  totalItems,
} from '../src/lib/shopping-list'

const list: ShoppingList = {
  groups: [
    {
      category: '肉禽蛋',
      items: [
        { ingredientId: 'ing-beef', name: '牛腩', category: '肉禽蛋', qty: 500, unit: 'g', checked: false },
        { ingredientId: 'ing-egg', name: '鸡蛋', category: '肉禽蛋', qty: 6, unit: '枚', checked: true, alreadyHave: true },
      ],
    },
    {
      category: '蔬菜',
      items: [
        { ingredientId: 'ing-tomato', name: '番茄', category: '蔬菜', qty: 3, unit: '个', checked: false, alreadyHave: true },
        { ingredientId: 'ing-potato', name: '土豆', category: '蔬菜', qty: 400, unit: 'g', checked: true },
      ],
    },
  ],
  prepAdvice: {
    tonight: ['牛腩切块冷水浸泡 30 分钟'],
    tomorrowMorning: ['粥先下锅'],
  },
}

describe('勾选本地切换（乐观更新；失败由页面回滚）', () => {
  it('按 ingredientId 切 checked，其它条目不动', () => {
    const next = toggleItemLocal(list, 'ing-beef', true)
    expect(next.groups[0].items[0].checked).toBe(true)
    expect(next.groups[0].items[1]).toEqual(list.groups[0].items[1])
    expect(next.groups[1]).toEqual(list.groups[1])
    expect(next.prepAdvice).toEqual(list.prepAdvice)
    // 原对象不被改
    expect(list.groups[0].items[0].checked).toBe(false)
  })
})

describe('PATCH 响应合并（勾选保存刷新还在的还原侧）', () => {
  it('响应 groups 为准；响应缺 prepAdvice（快照行被重写）时保留本地备菜建议', () => {
    const patchResponse: ShoppingList = {
      groups: [
        {
          category: '肉禽蛋',
          items: [
            { ingredientId: 'ing-beef', name: '牛腩', category: '肉禽蛋', qty: 500, unit: 'g', checked: true },
            { ingredientId: 'ing-egg', name: '鸡蛋', category: '肉禽蛋', qty: 6, unit: '枚', checked: true, alreadyHave: true },
          ],
        },
        {
          category: '蔬菜',
          items: [
            { ingredientId: 'ing-tomato', name: '番茄', category: '蔬菜', qty: 3, unit: '个', checked: false, alreadyHave: true },
            { ingredientId: 'ing-potato', name: '土豆', category: '蔬菜', qty: 400, unit: 'g', checked: true },
          ],
        },
      ],
    }
    const merged = mergePatchResponse(list, patchResponse)
    expect(merged.groups).toEqual(patchResponse.groups)
    expect(merged.prepAdvice).toEqual(list.prepAdvice)
  })

  it('响应自带 prepAdvice（换菜后全量重算）则用响应的', () => {
    const next: ShoppingList = { ...list, prepAdvice: { tonight: ['新建议'], tomorrowMorning: [] } }
    expect(mergePatchResponse(list, next).prepAdvice).toEqual({ tonight: ['新建议'], tomorrowMorning: [] })
  })
})

describe('待买计数（就按这个买（N 样待买））', () => {
  it('未勾且非「已有」才计入待买；总条数另算', () => {
    // ing-beef 未勾非已有 = 1；ing-tomato 未勾但 alreadyHave 不计
    expect(countToBuy(list)).toBe(1)
    expect(totalItems(list)).toBe(4)
  })

  it('全勾完 → 0 样待买', () => {
    const all = toggleItemLocal(list, 'ing-beef', true)
    expect(countToBuy(all)).toBe(0)
  })
})

describe('用量格式化（单位统一，浮点凑整显示）', () => {
  it('整数不带小数点；一位小数保留', () => {
    expect(formatQty(500, 'g')).toBe('500 g')
    expect(formatQty(6, '枚')).toBe('6 枚')
    expect(formatQty(200.5, 'g')).toBe('200.5 g')
    expect(formatQty(2.25, '杯')).toBe('2.3 杯')
  })
})
