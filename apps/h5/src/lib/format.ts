// apps/h5/src/lib/format.ts
// 公共格式化函数（设计规则 3：枚举一律中文、时间本地格式、单位统一，由公共函数格式化）。

/** 本地时刻 HH:mm（如 22:10），用于「已保存 22:10」等界面反馈 */
export function formatTimeHM(d: Date): string {
  const hh = `${d.getHours()}`.padStart(2, '0')
  const mm = `${d.getMinutes()}`.padStart(2, '0')
  return `${hh}:${mm}`
}
