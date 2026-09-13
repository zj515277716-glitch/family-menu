// apps/api/test/put-exclusions.spec.ts
// PE-1（AC2）：putExclusions 全量替换【仅对用户行】+ seed- 前缀行 API 层保护的持久回归测试
// 真实 PG（127.0.0.1:54329/family_menu，DATABASE_URL 由 src/db.ts 内 dotenv 从根 .env 加载），禁止 Mock 冒充真实环境。
// 直接调用生产服务层 planService.putExclusions（路由层仅 zod 透传，服务层即被测保护逻辑本体）。
// 测试数据 id 一律 pe1-test- 前缀；afterAll 清理并复核 ExclusionRule 终态 = seed 3 行（基线零残留）。
// seed 3 行 id 实测口径（verify V3 修正）：seed-excl-peanut / seed-excl-organ / seed-excl-peanut-ing（无 -tag 后缀）。
// 本机 PG 不可达时用例显式 skip（计数在 vitest 摘要可见，不假绿），处置：.pg/bin/pg_ctl.exe start -D .pg/data -o "-p 54329"

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../src/db.js';
import { planService } from '../src/services/planService.js';
// seed-data.ts 只读引用做断言对照（PE-1 任务书第三节明确允许；不修改该文件）
import { exclusionRules as seedExclusions } from '../prisma/seed-data.js';
import type { ExclusionRule, PutExclusionsRequest } from '@family-menu/shared';

const PREFIX = 'pe1-test-';
const SEED_IDS = ['seed-excl-peanut', 'seed-excl-organ', 'seed-excl-peanut-ing'];
const FAMILY_ID = 'seed-family';

/** getExclusions 口径的行（null -> undefined），用作 seed 库内现值快照与用户行构造 */
type ExclusionRow = ExclusionRule;

async function listAllRows(): Promise<ExclusionRow[]> {
  return planService.getExclusions();
}

/** 构造一条 pe1-test- 用户行（形状符合 ExclusionRuleSchema） */
function userRule(
  id: string,
  overrides: Partial<ExclusionRule> = {},
): ExclusionRule {
  return {
    id: `${PREFIX}${id}`,
    familyId: FAMILY_ID,
    scope: 'TAG',
    targetId: undefined,
    targetTag: `PE1测试标签-${id}`,
    severity: 'SOFT',
    note: 'PE-1 回归测试行',
    ...overrides,
  };
}

/** seed 行库内现值快照（按 id 索引） */
type SeedSnapshot = Record<string, ExclusionRow>;
function snapshotSeedRows(rows: ExclusionRow[]): SeedSnapshot {
  const snap: SeedSnapshot = {};
  for (const r of rows) {
    if (r.id.startsWith('seed-')) snap[r.id] = { ...r };
  }
  return snap;
}

async function cleanup(): Promise<void> {
  await prisma.exclusionRule.deleteMany({ where: { id: { startsWith: PREFIX } } });
}

describe('PE-1 putExclusions：全量替换仅对用户行生效，seed- 前缀行受 API 层保护', () => {
  let dbReady = false;
  let seedSnap: SeedSnapshot = {};

  beforeAll(async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbReady = true;
    } catch (e) {
      dbReady = false;
      const reason = e instanceof Error ? e.message : String(e);
      console.warn(
        `[put-exclusions] PG 不可达（${reason}）：本文件用例 skip。` +
          `修复：.pg/bin/pg_ctl.exe start -D .pg/data -o "-p 54329"`,
      );
      return;
    }
    await cleanup(); // 清失败重跑残留（幂等）
    // 防污染前置：库内 seed 行现值必须与 seed-data.ts 定义一致，否则先 pnpm db:seed 再跑
    const rows = await listAllRows();
    const seedRows = rows.filter((r) => r.id.startsWith('seed-'));
    expect(
      seedRows.map((r) => r.id).sort(),
      '库内 seed- 行应恰为 seed-data.ts 定义的 3 条（被污染请先 pnpm db:seed）',
    ).toEqual([...SEED_IDS].sort());
    for (const def of seedExclusions) {
      const live = seedRows.find((r) => r.id === def.id);
      expect(live, `seed 行 ${def.id} 应存在`).toBeDefined();
      expect(live!.scope).toBe(def.scope);
      expect(live!.targetId ?? undefined).toBe(def.targetId ?? undefined);
      expect(live!.targetTag ?? undefined).toBe(def.targetTag ?? undefined);
      expect(live!.severity).toBe(def.severity);
      expect(live!.note ?? undefined).toBe(def.note ?? undefined);
    }
    seedSnap = snapshotSeedRows(seedRows);
  });

  afterAll(async () => {
    // 基线零残留是硬约束：清理测试行后复核全表恰剩 seed 3 行；残留会让整个文件 fail
    if (dbReady) {
      await cleanup();
      const remaining = await prisma.exclusionRule.findMany();
      expect(
        remaining.map((r) => r.id).sort(),
        'afterAll 终态：ExclusionRule 应恰剩 seed 3 行（测试数据零残留）',
      ).toEqual([...SEED_IDS].sort());
    }
    await prisma.$disconnect();
  });

  // ── 场景 a：库内存在用户行时 PUT([该用户行]) -> seed 3 行原样保留 + 用户行存在 ──
  it('a) PUT([用户行]) 保留 seed 3 行且用户行写入成功', async ({ skip }) => {
    if (!dbReady) return skip('PG 不可达，真实 PG 集成断言跳过');
    // 预置：库内先有 1 条用户行（含一条将不在 payload 里的干扰行，验证全量替换对用户行生效）
    const keeper = userRule('user1', { severity: 'HARD', targetTag: '花生米' });
    const dropper = userRule('drop1');
    await prisma.exclusionRule.createMany({
      data: [keeper, dropper].map((r) => ({
        id: r.id,
        familyId: r.familyId,
        scope: r.scope,
        targetId: r.targetId ?? null,
        targetTag: r.targetTag ?? null,
        severity: r.severity,
        note: r.note ?? null,
      })),
    });

    const returned = await planService.putExclusions([keeper]);

    // seed 3 行原样保留（逐字段对照快照）
    const seedRows = returned.filter((r) => r.id.startsWith('seed-'));
    expect(seedRows.map((r) => r.id).sort()).toEqual([...SEED_IDS].sort());
    for (const id of SEED_IDS) {
      expect(returned.find((r) => r.id === id), `seed 行 ${id} 应保留`).toEqual(seedSnap[id]);
    }
    // 用户行语义不变：payload 内行写入、payload 外用户行被全量替换删除
    expect(returned.find((r) => r.id === keeper.id)).toEqual(keeper);
    expect(returned.find((r) => r.id === dropper.id)).toBeUndefined();
    expect(returned).toHaveLength(4); // seed 3 + 用户 1
  });

  // ── 场景 b：PUT([]) -> seed 3 行保留、非 seed 用户行清空（原「全表清空」缺口根治的直接证据） ──
  it('b) PUT([]) 后 seed 3 行保留、非 seed 行清空', async ({ skip }) => {
    if (!dbReady) return skip('PG 不可达，真实 PG 集成断言跳过');
    // 预置：库内先有用户行（若 PUT([]) 仍全表清空，此行连同 seed 一起消失）
    await prisma.exclusionRule.create({
      data: {
        id: `${PREFIX}empty-case`,
        familyId: FAMILY_ID,
        scope: 'TAG',
        targetId: null,
        targetTag: 'PE1空payload探测',
        severity: 'SOFT',
        note: null,
      },
    });

    // createMany({data:[]}) 为合法 NOOP（verify V5 实证 count 0 不抛错），此处断言不抛
    const returned = await planService.putExclusions([]);

    const ids = returned.map((r) => r.id).sort();
    expect(ids).toEqual([...SEED_IDS].sort()); // 恰 seed 3 行
    expect(returned.find((r) => r.id === `${PREFIX}empty-case`)).toBeUndefined();
    for (const id of SEED_IDS) {
      expect(returned.find((r) => r.id === id)).toEqual(seedSnap[id]);
    }
  });

  // ── 场景 c：PUT(payload 含 seed-% id 行) -> 不抛 P2002、seed 行以库内现值为准不被覆盖、非 seed 行正常写入 ──
  it('c) payload 混入 seed- 行不抛 P2002，seed 行内容不被覆盖，用户行正常写入', async ({ skip }) => {
    if (!dbReady) return skip('PG 不可达，真实 PG 集成断言跳过');
    // payload：3 条与 seed 同 id 但内容被篡改的行 + 2 条正常用户行
    const tamperedSeedRows: PutExclusionsRequest = SEED_IDS.map((id) => ({
      id,
      familyId: FAMILY_ID,
      scope: 'INGREDIENT' as const, // 与 seed 定义（TAG）不同：若被写入即视为覆盖成功 -> 测试应失败
      targetId: 'pe1-test-fake-ingredient',
      targetTag: undefined,
      severity: 'SOFT' as const, // 与 seed 定义（HARD）不同
      note: 'PE1 篡改探测行（不应落库）',
    }));
    const userA = userRule('user-a', { severity: 'HARD', targetTag: '香菜' });
    const userB = userRule('user-b', { scope: 'DISH', targetId: 'pe1-test-fake-dish' });
    const payload: PutExclusionsRequest = [...tamperedSeedRows, userA, userB];

    // 不抛 P2002（同 id 主键冲突）：seed 行在 createMany 前被过滤
    const returned = await planService.putExclusions(payload);

    // seed 行以库内现值为准（逐字段 = 快照，未被 payload 覆盖）
    for (const id of SEED_IDS) {
      expect(returned.find((r) => r.id === id), `seed 行 ${id} 内容应保持库内现值`).toEqual(
        seedSnap[id],
      );
    }
    // 非 seed 行正常写入
    expect(returned.find((r) => r.id === userA.id)).toEqual(userA);
    expect(returned.find((r) => r.id === userB.id)).toEqual(userB);
    expect(returned).toHaveLength(5); // seed 3 + 用户 2
    // 全表不存在篡改痕迹（targetId=pe1-test-fake-ingredient 的篡改 seed 行未落库）
    const tamperedInDb = await prisma.exclusionRule.findMany({
      where: { targetId: `${PREFIX}fake-ingredient` },
    });
    expect(tamperedInDb).toHaveLength(0);
  });
});
