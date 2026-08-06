// packages/list-merger/src/units.ts
// 单位换算：g/kg、ml/l 等同体系单位换算与合并（4.4 故障点，独立测试）
// 单位合并是 9.2 点名的故障点，错误率 <1% 门槛

/** 单位换算因子表（key=目标单位，value={源单位: 因子}） */
const UNIT_FACTORS: Record<string, Record<string, number>> = {
  g: { g: 1, kg: 1000 },
  kg: { kg: 1, g: 0.001 },
  ml: { ml: 1, l: 1000 },
  l: { l: 1, ml: 0.001 },
};

/** 检查两个单位是否可换算（属于同一体系） */
export function canConvert(from: string, to: string): boolean {
  for (const target of Object.keys(UNIT_FACTORS)) {
    const factors = UNIT_FACTORS[target];
    if (factors[from] !== undefined && factors[to] !== undefined) {
      return true;
    }
  }
  return false;
}

/** 换算数量；不可换算返回 null */
export function convert(qty: number, from: string, to: string): number | null {
  if (from === to) return qty;
  for (const target of Object.keys(UNIT_FACTORS)) {
    const factors = UNIT_FACTORS[target];
    if (factors[from] !== undefined && factors[to] !== undefined) {
      const inTarget = qty * factors[from];
      return inTarget / factors[to];
    }
  }
  return null;
}

export interface MergedQuantity {
  qty: number;
  unit: string;
}

/** 四舍五入到 2 位小数，避免浮点误差 */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * 合并同一食材的多个 (qty, unit) 条目。
 * 策略：可换算的统一到 defaultUnit 合并；不可换算的按原单位分组合并。
 */
export function mergeQuantities(
  entries: Array<{ qty: number; unit: string }>,
  defaultUnit: string,
): MergedQuantity[] {
  const convertible: number[] = [];
  const nonConvertible: Array<{ qty: number; unit: string }> = [];

  for (const e of entries) {
    const converted = convert(e.qty, e.unit, defaultUnit);
    if (converted !== null) {
      convertible.push(converted);
    } else {
      nonConvertible.push(e);
    }
  }

  const results: MergedQuantity[] = [];

  if (convertible.length > 0) {
    results.push({
      qty: round2(convertible.reduce((s, n) => s + n, 0)),
      unit: defaultUnit,
    });
  }

  // 不可换算的按单位分组
  const byUnit = new Map<string, number>();
  for (const e of nonConvertible) {
    byUnit.set(e.unit, (byUnit.get(e.unit) ?? 0) + e.qty);
  }
  for (const [unit, qty] of byUnit) {
    results.push({ qty: round2(qty), unit });
  }

  return results;
}
