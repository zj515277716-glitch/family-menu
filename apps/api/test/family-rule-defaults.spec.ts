// apps/api/test/family-rule-defaults.spec.ts
// T-Q11 家庭规则扩展字段集成测试（真实 PG）：迁移 20261019020917_family_rule_defaults
//   1) 存量回填：3 个新列（defaultAdults/defaultChildren/avoidRecentDays）无 NULL 且列级默认值在册；
//   2) 新字段存取 + 刷新还原：写入 → 重新查询一致 → 测试结束还原原始行；
//   3) 冷启动首次保存（C-8）：规则行不存在时 updateFamilyRules 走 upsert 建行
//      （修复前旧实现 update() 在此场景抛 P2025 RecordNotFound——先红后绿）。
// 数据安全：beforeAll 快照原始行，afterAll 精确还原（含原 id），不碰其它表。
// 真实 PG 集成：PG 不可达时显式 skip（不假绿，项目规则）。
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { prisma } from '../src/db.js';
import { planService, FAMILY_ID } from '../src/services/planService.js';
import type { FamilyRule } from '@family-menu/shared';

const canConnect = await prisma
  .$queryRaw`SELECT 1`
  .then(() => true)
  .catch(() => false);

type RuleRow = NonNullable<Awaited<ReturnType<typeof prisma.familyRule.findFirst>>>;

describe.skipIf(!canConnect)('T-Q11 家庭规则扩展字段（真实 PG）', () => {
  let original: RuleRow | null = null;

  beforeAll(async () => {
    original = await prisma.familyRule.findFirst({ where: { familyId: FAMILY_ID } });
  });

  afterAll(async () => {
    // 精确还原：清掉测试写入的任何版本，按快照原样建行（含原 id 与时间戳）
    if (original) {
      await prisma.familyRule.deleteMany({ where: { familyId: FAMILY_ID } });
      await prisma.familyRule.create({ data: original });
    }
    await prisma.$disconnect();
  });

  it('存量回填：3 个新列无 NULL 行，且 information_schema 列默认值在册', async () => {
    const nullRows = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*)::bigint AS count FROM "FamilyRule"
      WHERE "defaultAdults" IS NULL OR "defaultChildren" IS NULL OR "avoidRecentDays" IS NULL
    `;
    expect(Number(nullRows[0].count)).toBe(0);

    const defaults = await prisma.$queryRaw<{ column_name: string; column_default: string | null }[]>`
      SELECT column_name, column_default FROM information_schema.columns
      WHERE table_name = 'FamilyRule'
        AND column_name IN ('defaultAdults', 'defaultChildren', 'avoidRecentDays')
      ORDER BY column_name
    `;
    expect(defaults.map((d) => d.column_name)).toEqual([
      'avoidRecentDays',
      'defaultAdults',
      'defaultChildren',
    ]);
    for (const d of defaults) {
      expect(d.column_default).not.toBeNull();
    }
  });

  it('回填语义（裁决）：迁移文件含「defaultAdults = 原 defaultPeople」回填语句，且语义在真实库成立', async () => {
    // 1) 迁移文件守卫：缺了回填语句 = 存量行只吃到列默认值 2，与原总人数脱钩（裁决要求原总人数视为成人）
    const sql = readFileSync(
      new URL('../prisma/migrations/20261019020917_family_rule_defaults/migration.sql', import.meta.url),
      'utf8',
    );
    expect(sql).toMatch(/UPDATE\s+"FamilyRule"\s+SET\s+"defaultAdults"\s*=\s*"defaultPeople"/i);

    // 2) 语义实证：事务内打乱 defaultAdults 后重放回填语句，必须回到 defaultPeople；事务整体回滚不污染库
    const ROLLBACK = 'fm-q11-rollback-marker';
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.$executeRaw`UPDATE "FamilyRule" SET "defaultAdults" = 99 WHERE "familyId" = ${FAMILY_ID}`;
        await tx.$executeRaw`UPDATE "FamilyRule" SET "defaultAdults" = "defaultPeople" WHERE "familyId" = ${FAMILY_ID}`;
        const row = await tx.familyRule.findFirst({ where: { familyId: FAMILY_ID } });
        expect(row?.defaultAdults).toBe(row?.defaultPeople);
        throw new Error(ROLLBACK);
      }),
    ).rejects.toThrow(ROLLBACK);
  });

  it('新字段存取与刷新还原：写入后重新查询一致', async () => {
    const base: FamilyRule = (original as unknown as FamilyRule) ?? {
      id: 'probe-rule',
      familyId: FAMILY_ID,
      defaultPeople: 4,
      defaultAdults: 2,
      defaultChildren: 0,
      avoidRecentDays: 7,
      timeBudgets: [30],
      equipment: [],
      cuisines: [],
      updatedAt: new Date(),
    };
    const probe: FamilyRule = {
      ...base,
      defaultAdults: 3,
      defaultChildren: 2,
      avoidRecentDays: 5,
    };
    await planService.updateFamilyRules(probe);
    // 刷新还原：不经缓存重新查询，字段必须原样还在（C-1「刷新/重进原样还在」的服务端口径）
    const reread = await planService.getFamilyRules();
    expect(reread).not.toBeNull();
    expect(reread).toMatchObject({ defaultAdults: 3, defaultChildren: 2, avoidRecentDays: 5 });
  });

  it('冷启动首次保存：规则行不存在时 upsert 建行（C-8，修复前 P2025 先红）', async () => {
    expect(original).not.toBeNull(); // 本用例需要一个可还原的原始行作前提
    await prisma.familyRule.delete({ where: { familyId: FAMILY_ID } });
    const missing = await planService.getFamilyRules();
    expect(missing).toBeNull();

    const created = await planService.updateFamilyRules({
      ...(original as unknown as FamilyRule),
      defaultAdults: 2,
      defaultChildren: 1,
      avoidRecentDays: 3,
    });
    expect(created.id).toBeTruthy();
    const reread = await planService.getFamilyRules();
    expect(reread).not.toBeNull();
    expect(reread).toMatchObject({ defaultAdults: 2, defaultChildren: 1, avoidRecentDays: 3 });
  });
});
