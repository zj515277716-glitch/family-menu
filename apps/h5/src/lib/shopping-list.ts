// apps/h5/src/lib/shopping-list.ts
// S-08 采购清单纯逻辑（T-Q12，C-4）：勾选本地切换（乐观更新）、PATCH 响应合并
// （快照行重写后 prepAdvice 由本地保留）、待买计数（「已有」不计）、用量格式化。
import type { ShoppingList } from '@family-menu/shared'

/** 勾选本地切换：按 ingredientId 改 checked，其它条目与 prepAdvice 原样（不改原对象） */
export function toggleItemLocal(list: ShoppingList, ingredientId: string, checked: boolean): ShoppingList {
  return {
    ...list,
    groups: list.groups.map((g) => ({
      ...g,
      items: g.items.map((i) => (i.ingredientId === ingredientId ? { ...i, checked } : i)),
    })),
  }
}

/**
 * PATCH 响应合并：groups 以服务端响应为准（勾选保存的真源）；
 * 响应缺 prepAdvice 时保留本地备菜建议（换菜后全量重算会自带，则用响应的）。
 */
export function mergePatchResponse(prev: ShoppingList, next: ShoppingList): ShoppingList {
  return {
    groups: next.groups,
    prepAdvice: next.prepAdvice ?? prev.prepAdvice,
  }
}

/** 待买计数：未勾且非「必消已有」的条目（「就按这个买（N 样待买）」） */
export function countToBuy(list: ShoppingList): number {
  return list.groups.reduce(
    (sum, g) => sum + g.items.filter((i) => !i.checked && !i.alreadyHave).length,
    0,
  )
}

/** 清单总条目数（空态判定） */
export function totalItems(list: ShoppingList): number {
  return list.groups.reduce((sum, g) => sum + g.items.length, 0)
}

/** 用量格式化：整数不带小数点；非整数保留 1 位小数（单位统一由服务端给出） */
export function formatQty(qty: number, unit: string): string {
  const n = Number.isInteger(qty) ? `${qty}` : qty.toFixed(1)
  return `${n} ${unit}`
}
