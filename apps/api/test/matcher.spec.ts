// apps/api/test/matcher.spec.ts
// T-P05（AC5）：must-use-matcher 纯函数单测（零 IO，不依赖 DB）
// 覆盖：归一化（trim+lowercase）/ 层 1 精确（name+alias）/ 层 2 双向子串唯一命中 /
//       层 2 歧义 ≥2 透传 / 未命中透传 / 空串边界 / 重复 key 先到先得 / 返回形状兼容
import { describe, it, expect } from 'vitest';
import { matchMustUseNames, type MustUseCandidate } from '../src/utils/must-use-matcher.js';

// 纯内存候选集（不触碰 Prisma）：覆盖层 1/层 2 各分支
const CANDIDATES: MustUseCandidate[] = [
  { id: 'ing-tomato', name: '番茄', aliases: ['西红柿', '洋柿子'] },
  { id: 'ing-potato', name: '土豆', aliases: ['马铃薯', '洋芋'] },
  { id: 'ing-egg', name: '鸡蛋', aliases: ['土鸡蛋', '蛋'] },
  { id: 'ing-chicken-breast', name: '鸡胸肉', aliases: [] },
  { id: 'ing-chicken-leg', name: '鸡腿肉', aliases: [] },
  // F6 重复 key 场景复刻（冰糖既是白糖别名又是独立食材）：先到先得语义保持
  { id: 'ing-sugar', name: '白糖', aliases: ['冰糖'] },
  { id: 'ing-rock-sugar', name: '冰糖', aliases: [] },
  { id: 'ing-tofu', name: 'Tofu', aliases: [] }, // 大小写归一化用例
];

describe('matchMustUseNames: 层 1 精确等值（现状兼容）', () => {
  it('name 精确命中', () => {
    const r = matchMustUseNames(['番茄'], CANDIDATES);
    expect(r.ids).toEqual(['ing-tomato']);
    expect(r.perRaw[0]).toMatchObject({ matchedId: 'ing-tomato', hitCount: 1, ambiguous: false });
  });

  it('alias 精确命中（西红柿/洋柿子）', () => {
    const r = matchMustUseNames(['西红柿', '洋柿子'], CANDIDATES);
    expect(r.ids).toEqual(['ing-tomato', 'ing-tomato']);
    expect(r.idToRaw.get('ing-tomato')).toBe('洋柿子'); // 同 id 多词：后写覆盖（与现状一致）
  });

  it('归一化：trim + toLowerCase', () => {
    const r = matchMustUseNames(['  番茄  ', '  TOFU  '], CANDIDATES);
    expect(r.ids).toEqual(['ing-tomato', 'ing-tofu']);
    expect(r.idToRaw.get('ing-tofu')).toBe('TOFU'); // idToRaw 存 trim 后原文
  });

  it('重复 key 先到先得（F6：冰糖=白糖 alias 先注册，独立食材后到不覆盖）', () => {
    const r = matchMustUseNames(['冰糖'], CANDIDATES);
    expect(r.ids).toEqual(['ing-sugar']);
  });
});

describe('matchMustUseNames: 层 2 双向子串（唯一命中才采纳）', () => {
  it('raw ⊇ name：小番茄 -> 番茄（层 2 路径，番茄未注册「小番茄」别名）', () => {
    const r = matchMustUseNames(['小番茄'], CANDIDATES);
    expect(r.ids).toEqual(['ing-tomato']);
    expect(r.perRaw[0]).toMatchObject({ matchedId: 'ing-tomato', hitCount: 1, ambiguous: false });
  });

  it('raw ⊇ name：土豆丝 -> 土豆', () => {
    const r = matchMustUseNames(['土豆丝'], CANDIDATES);
    expect(r.ids).toEqual(['ing-potato']);
  });

  it('raw ⊇ alias：小洋柿子 -> 番茄（子串命中 alias）', () => {
    const r = matchMustUseNames(['小洋柿子'], CANDIDATES);
    expect(r.ids).toEqual(['ing-tomato']);
  });

  it('raw ⊆ name：胸肉 -> 鸡胸肉（反向子串）', () => {
    const r = matchMustUseNames(['胸肉'], CANDIDATES);
    expect(r.ids).toEqual(['ing-chicken-breast']);
  });

  it('歧义 ≥2：鸡 -> 鸡蛋/鸡胸肉/鸡腿肉，不猜、原文透传', () => {
    const r = matchMustUseNames(['鸡'], CANDIDATES);
    expect(r.perRaw[0]).toMatchObject({
      matchedId: null,
      hitCount: 3,
      ambiguous: true,
      id: '鸡',
    });
    expect(r.ids).toEqual(['鸡']); // 原文透传当 id（现状未命中行为）
    expect(r.idToRaw.get('鸡')).toBe('鸡');
  });

  it('未命中 0：苦瓜透传（库外词行为与现状一致）', () => {
    const r = matchMustUseNames(['苦瓜'], CANDIDATES);
    expect(r.perRaw[0]).toMatchObject({ matchedId: null, hitCount: 0, ambiguous: false, id: '苦瓜' });
    expect(r.ids).toEqual(['苦瓜']);
  });

  it('歧义按食材去重：同一食材多 key 命中只算 1 个', () => {
    // '蛋' 精确命中 ing-egg alias（层 1）；'土鸡蛋丝' ⊇ '土鸡蛋'(alias) 且 ⊇ '蛋'(alias)
    // 且 ⊆ 无——只命中 ing-egg 一个食材 → 唯一采纳（不算歧义）
    const r = matchMustUseNames(['土鸡蛋丝'], CANDIDATES);
    expect(r.ids).toEqual(['ing-egg']);
    expect(r.perRaw[0]).toMatchObject({ hitCount: 1, ambiguous: false });
  });
});

describe('matchMustUseNames: 边界', () => {
  it('空串：透传空串且不命中任何食材（防御空串 ⊆ 一切的误命中）', () => {
    const r = matchMustUseNames([''], CANDIDATES);
    expect(r.ids).toEqual(['']);
    expect(r.perRaw[0]).toMatchObject({ matchedId: null, hitCount: 0, ambiguous: false });
  });

  it('全空白串：trim 后为空，同空串行为', () => {
    const r = matchMustUseNames(['   '], CANDIDATES);
    expect(r.ids).toEqual(['']);
    expect(r.perRaw[0]).toMatchObject({ matchedId: null, hitCount: 0 });
  });

  it('空 rawNames：返回空 ids 与空 idToRaw（形状兼容）', () => {
    const r = matchMustUseNames([], CANDIDATES);
    expect(r.ids).toEqual([]);
    expect(r.idToRaw.size).toBe(0);
    expect(r.perRaw).toEqual([]);
  });
});

describe('matchMustUseNames: 混合与顺序', () => {
  it('混合输入：层 1 / 层 2 / 歧义 / 未命中逐词独立，ids 顺序与输入一致', () => {
    const r = matchMustUseNames(['西红柿', '小番茄', '鸡', '苦瓜'], CANDIDATES);
    expect(r.ids).toEqual(['ing-tomato', 'ing-tomato', '鸡', '苦瓜']);
    expect(r.perRaw.map((p) => p.matchedId)).toEqual([
      'ing-tomato',
      'ing-tomato',
      null,
      null,
    ]);
    expect(r.perRaw.map((p) => p.ambiguous)).toEqual([false, false, true, false]);
  });

  it('idToRaw 命中词映射 id->原文，透传词映射自身', () => {
    const r = matchMustUseNames(['小番茄', '苦瓜'], CANDIDATES);
    expect(r.idToRaw.get('ing-tomato')).toBe('小番茄');
    expect(r.idToRaw.get('苦瓜')).toBe('苦瓜');
  });

  it('空候选集：全部透传（零匹配，不抛错）', () => {
    const r = matchMustUseNames(['小番茄'], []);
    expect(r.ids).toEqual(['小番茄']);
    expect(r.perRaw[0]).toMatchObject({ matchedId: null, hitCount: 0 });
  });
});
