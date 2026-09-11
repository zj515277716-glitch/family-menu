// apps/api/src/utils/must-use-matcher.ts
// T-P05 方案 E：必消食材分层匹配纯函数（零 IO，可被单测直接覆盖）。
//
// 分层（技术方案 §3.1，已批准 2026-09-11）：
//   层 1  精确等值（现状兼容）：norm(raw) === norm(name) 或 ∈ norm(aliases)
//         norm = trim + toLowerCase（与既有 resolveMustUseIds 完全一致，不新增全角/NFKC）
//   层 2  双向子串（模糊）：norm(raw) ⊇ norm(name/alias) 或 norm(raw) ⊆ norm(name/alias)
//         仅当【恰好命中 1 个食材】时采纳该 id；命中 ≥2 个 = 歧义 → 不猜，按未命中处理
//         （原文透传 → 引擎匹配不到 → 空手 + unmetMustUse 回传原文）
//   层 3  不做：拼音/编辑距离/LLM（DEC-006 禁运行时 LLM）
//
// 行为兼容性：层 1 字典构建与既有实现同构（name+aliases 混合、先到先得、空 key 跳过），
// 既有 5 处调用点（换菜过滤/推荐/单菜换重算/读清单/rescale）行为零回归。

/** 参与匹配的候选食材（由服务层从 DB 投影，纯函数不接触 Prisma） */
export interface MustUseCandidate {
  id: string;
  name: string;
  aliases: string[];
}

/** 单个 raw 词的匹配明细 */
export interface RawNameMatch {
  /** trim 后的用户原文 */
  raw: string;
  /** 进入 ids 的最终值：命中 = 食材 id；未命中/歧义 = 原文透传（与现状一致） */
  id: string;
  /** 层 1 / 层 2 唯一命中时的食材 id；未命中或歧义 = null */
  matchedId: string | null;
  /** 命中的候选食材数（层 1 命中 = 1；层 2 唯一 = 1；歧义 ≥ 2；未命中 = 0） */
  hitCount: number;
  /** 命中 ≥ 2 个食材（歧义，不猜） */
  ambiguous: boolean;
}

export interface MustUseMatchResult {
  /** 与既有 resolveMustUseIds 返回形状兼容：逐词映射结果（顺序 = rawNames 顺序） */
  ids: string[];
  /** ingredientId（或透传原文）-> 用户原文（unmetMustUse 回译用） */
  idToRaw: Map<string, string>;
  /** 每个词的匹配明细（供调试/断言；服务层当前不消费） */
  perRaw: RawNameMatch[];
}

function norm(key: string): string {
  return key.trim().toLowerCase();
}

/**
 * 必消用户原文 -> ingredientId 分层匹配（纯函数，零 IO）。
 */
export function matchMustUseNames(
  rawNames: string[],
  candidates: MustUseCandidate[],
): MustUseMatchResult {
  const ids: string[] = [];
  const idToRaw = new Map<string, string>();
  const perRaw: RawNameMatch[] = [];

  // 层 1 字典：与既有实现完全同构（name+aliases 混合建 key，先到先得，空 key 跳过）
  const exactByKey = new Map<string, string>();
  const subKeys: Array<{ key: string; id: string }> = [];
  for (const ing of candidates) {
    for (const key of [ing.name, ...ing.aliases]) {
      const normalized = norm(key);
      if (!normalized) continue;
      if (!exactByKey.has(normalized)) {
        exactByKey.set(normalized, ing.id);
      }
      subKeys.push({ key: normalized, id: ing.id });
    }
  }

  for (const raw of rawNames) {
    const trimmed = raw.trim();
    const rawNorm = norm(trimmed);

    // 层 1：精确等值（现状兼容，优先）
    const exactId = exactByKey.get(rawNorm);
    if (exactId) {
      ids.push(exactId);
      idToRaw.set(exactId, trimmed);
      perRaw.push({ raw: trimmed, id: exactId, matchedId: exactId, hitCount: 1, ambiguous: false });
      continue;
    }

    // 层 2：双向子串，按食材去重后恰好 1 个才采纳
    // 防御：rawNorm 为空串时跳过（空串是任何串的子串，会误命中全部食材）
    const hitIds = new Set<string>();
    if (rawNorm) {
      for (const { key, id } of subKeys) {
        if (key.includes(rawNorm) || rawNorm.includes(key)) {
          hitIds.add(id);
        }
      }
    }

    if (hitIds.size === 1) {
      const only = hitIds.values().next().value as string;
      ids.push(only);
      idToRaw.set(only, trimmed);
      perRaw.push({ raw: trimmed, id: only, matchedId: only, hitCount: 1, ambiguous: false });
    } else {
      // 未命中(0) 或 歧义(≥2)：按现状未命中处理，原文透传（引擎匹配不到 → 空手）
      ids.push(trimmed);
      idToRaw.set(trimmed, trimmed);
      perRaw.push({
        raw: trimmed,
        id: trimmed,
        matchedId: null,
        hitCount: hitIds.size,
        ambiguous: hitIds.size >= 2,
      });
    }
  }

  return { ids, idToRaw, perRaw };
}
