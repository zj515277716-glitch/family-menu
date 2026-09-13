// apps/api/test/dishes.spec.ts
// R-9 AC5：dishes 只读口集成测试（buildApp + inject + 真实 PG），禁止 Mock 冒充真实环境。
// 覆盖：无 cookie 401 / 列表缺省全量 + id asc + status 单值/多值去重/空格 trim/非法值 400 /
//       详情 200 含 ingredients（对齐 engine DishIngredientView 形状与 DB join 实值）+ 404 /
//       origin 投影 FETCHED 实测（zod default('LLM_DRAFT') 不得吞 FETCHED 实值）/
//       存量全量行 DishSchema.parse 幂等验证（防畸形 DRAFT 行挂全列表）。
// 真实 PG（127.0.0.1:54329/family_menu，DATABASE_URL 由 src/db.ts 内 dotenv 从根 .env 加载）。
// 测试行 id 一律 rm9- 前缀（3 条：DRAFT/TESTED/PUBLISHED 各一，无 ingredients）；
// afterAll 清理并断言零残留（rm9- 行 0 条 + Dish 总数回到测试前基线）。
// 本机 PG 不可达时用例显式 skip（计数在 vitest 摘要可见，不假绿），
// 处置：.pg/bin/pg_ctl.exe start -D .pg/data -o "-p 54329"

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { DishSchema } from '@family-menu/shared';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/db.js';
import { toDishView } from '../src/services/mappers.js';
import { DishDetailResponseSchema } from '../src/routes/dishes.js';

const PREFIX = 'rm9-';
const TOKEN = 'test-token';

/** 带 cookie 的 inject 选项（全局 authHook 口令） */
function authOpts(): { cookies: { access_token: string } } {
  return { cookies: { access_token: TOKEN } };
}

describe('R-9 dishes 只读口（真实 PG）', () => {
  let app: FastifyInstance | undefined;
  let dbReady = false;
  let baselineTotal = 0; // 测试前 Dish 总数（清理 rm9- 残留后）
  let baselineFetched = 0; // 测试前 origin=FETCHED 行数

  async function cleanup(): Promise<void> {
    await prisma.dish.deleteMany({ where: { id: { startsWith: PREFIX } } });
  }

  beforeAll(async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbReady = true;
    } catch (e) {
      dbReady = false;
      const reason = e instanceof Error ? e.message : String(e);
      console.warn(
        `[dishes] PG 不可达（${reason}）：本文件用例 skip。` +
          `修复：.pg/bin/pg_ctl.exe start -D .pg/data -o "-p 54329"`,
      );
      return;
    }
    process.env.ACCESS_TOKEN = TOKEN;
    app = await buildApp();
    await cleanup(); // 清失败重跑残留（幂等）
    baselineTotal = await prisma.dish.count();
    baselineFetched = await prisma.dish.count({ where: { origin: 'FETCHED' } });

    // 造 3 条 rm9- 测试行（三状态各一，origin=LLM_DRAFT，无 ingredients）：
    // 保证 status 白名单每个桶都有确定性断言锚点（不依赖存量各桶行数分布）。
    await prisma.dish.createMany({
      data: (['DRAFT', 'TESTED', 'PUBLISHED'] as const).map((status) => ({
        id: `${PREFIX}${status.toLowerCase()}`,
        name: `R9测试菜-${status}`,
        mealRole: 'SIDE',
        flavorTags: ['清淡'],
        spicyLevel: 0,
        splitFlavor: false,
        activeMinutes: 10,
        totalMinutes: 15,
        equipment: [],
        steps: [{ order: 1, text: 'R9测试步骤' }],
        status,
        origin: 'LLM_DRAFT',
      })),
    });
  });

  afterAll(async () => {
    if (dbReady) {
      await cleanup();
      const remaining = await prisma.dish.findMany({ where: { id: { startsWith: PREFIX } } });
      expect(remaining, 'afterAll 终态：rm9- 测试行零残留').toHaveLength(0);
      const total = await prisma.dish.count();
      expect(total, 'afterAll 终态：Dish 总数应回到测试前基线（零污染）').toBe(baselineTotal);
    }
    if (app) {
      await app.close();
    }
    await prisma.$disconnect();
  });

  // ── AC4：鉴权（全局 authHook 自动覆盖，无豁免） ──

  it('a) 无 cookie -> 列表与详情均 401（鉴权先于业务，authHook 全局覆盖）', async ({ skip }) => {
    if (!dbReady) return skip('PG 不可达，真实 PG 集成断言跳过');
    const list = await app!.inject({ method: 'GET', url: '/api/dishes' });
    expect(list.statusCode).toBe(401);
    const detail = await app!.inject({ method: 'GET', url: '/api/dishes/rm9-draft' });
    expect(detail.statusCode).toBe(401);
  });

  // ── AC1：列表缺省全量 + 排序 + 响应形状 ──

  it('b) 列表缺省（无 status）-> 200 全量、id asc 有序、逐行过 DishSchema、rm9 行 null 媒体字段键省略', async ({ skip }) => {
    if (!dbReady) return skip('PG 不可达，真实 PG 集成断言跳过');
    const res = await app!.inject({ method: 'GET', url: '/api/dishes', ...authOpts() });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { id: string; status: string }[];
    expect(body, '缺省应返回全量（基线 + 3 条 rm9 测试行）').toHaveLength(baselineTotal + 3);
    // 排序 id asc（cuid 时间有序 = 入库顺序；rm9- 前缀行排在 cuid 之后）
    const ids = body.map((d) => d.id);
    expect(ids).toEqual([...ids].sort());
    // 响应形状 = shared DishSchema 数组（本地组合 z.array(DishSchema) 的运行时体现）
    for (const item of body) {
      expect(() => DishSchema.parse(item), `行 ${item.id} 应过 DishSchema`).not.toThrow();
    }
    // zod strip：列表响应不泄露 view 侧多余键（ingredients 不在 DishSchema 中）
    const rm9draft = body.find((d) => d.id === `${PREFIX}draft`);
    expect(rm9draft).toBeTruthy();
    expect(rm9draft).not.toHaveProperty('ingredients');
    // null 媒体字段 -> undefined -> JSON 序列化键省略（T-P07 降级口径）
    expect(rm9draft).not.toHaveProperty('imageUrl');
  });

  // ── AC1：status 白名单过滤 ──

  it('c) ?status= 单值（DRAFT/TESTED/PUBLISHED）-> 结果集恰等于 DB 按该 status 过滤', async ({ skip }) => {
    if (!dbReady) return skip('PG 不可达，真实 PG 集成断言跳过');
    for (const status of ['DRAFT', 'TESTED', 'PUBLISHED'] as const) {
      const res = await app!.inject({
        method: 'GET',
        url: `/api/dishes?status=${status}`,
        ...authOpts(),
      });
      expect(res.statusCode, `status=${status}`).toBe(200);
      const body = JSON.parse(res.body) as { id: string; status: string }[];
      const dbIds = (
        await prisma.dish.findMany({ where: { status }, select: { id: true } })
      ).map((r) => r.id);
      expect(body.map((d) => d.id).sort(), `status=${status} 结果集应与 DB 过滤一致`).toEqual(
        [...dbIds].sort(),
      );
      for (const d of body) {
        expect(d.status, `行 ${d.id} status 应为 ${status}`).toBe(status);
      }
    }
  });

  it('d) ?status=TESTED,PUBLISHED,TESTED 多值（含重复段）-> 去重后并集、无重复行；值间带空格（%20）trim 后等效', async ({ skip }) => {
    if (!dbReady) return skip('PG 不可达，真实 PG 集成断言跳过');
    const dbIds = (
      await prisma.dish.findMany({
        where: { status: { in: ['TESTED', 'PUBLISHED'] } },
        select: { id: true },
      })
    ).map((r) => r.id);

    const multi = await app!.inject({
      method: 'GET',
      url: '/api/dishes?status=TESTED,PUBLISHED,TESTED',
      ...authOpts(),
    });
    expect(multi.statusCode).toBe(200);
    const body = JSON.parse(multi.body) as { id: string; status: string }[];
    expect(body.map((d) => d.id).sort(), '多值过滤结果应 = 两状态并集').toEqual([...dbIds].sort());
    expect(new Set(body.map((d) => d.id)).size, '结果不应有重复行').toBe(body.length);
    for (const d of body) {
      expect(['TESTED', 'PUBLISHED']).toContain(d.status);
    }

    const spaced = await app!.inject({
      method: 'GET',
      url: '/api/dishes?status=TESTED,%20PUBLISHED',
      ...authOpts(),
    });
    expect(spaced.statusCode, '值间空格应被 trim 接受').toBe(200);
    const spacedBody = JSON.parse(spaced.body) as { id: string }[];
    expect(spacedBody.map((d) => d.id).sort()).toEqual([...dbIds].sort());
  });

  it('e) ?status= 非法值 -> 400（未知值 / 多值混入非法段 / 空串 / 尾随逗号空段）', async ({ skip }) => {
    if (!dbReady) return skip('PG 不可达，真实 PG 集成断言跳过');
    for (const q of ['?status=FOO', '?status=DRAFT,FOO', '?status=', '?status=PUBLISHED,']) {
      const res = await app!.inject({ method: 'GET', url: `/api/dishes${q}`, ...authOpts() });
      expect(res.statusCode, `查询串 ${q} 应 400`).toBe(400);
    }
  });

  // ── AC2：详情 ──

  it('f) 详情 200：Dish 全字段对齐 DB + ingredients 与 join 实值逐字段一致（engine DishIngredientView 8 字段）', async ({ skip }) => {
    if (!dbReady) return skip('PG 不可达，真实 PG 集成断言跳过');
    const row = await prisma.dish.findFirst({
      where: { ingredients: { some: {} } },
      orderBy: { id: 'asc' },
      include: { ingredients: { include: { ingredient: true } } },
    });
    expect(row, '库内应存在有 ingredients 的菜').toBeTruthy();
    const res = await app!.inject({
      method: 'GET',
      url: `/api/dishes/${row!.id}`,
      ...authOpts(),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const parsed = DishDetailResponseSchema.parse(body); // 响应形状 = DishSchema.extend 本地组合
    // Dish 全字段对齐 DB（含 origin 实值）
    expect(parsed.id).toBe(row!.id);
    expect(parsed.name).toBe(row!.name);
    expect(parsed.mealRole).toBe(row!.mealRole);
    expect(parsed.status).toBe(row!.status);
    expect(parsed.origin).toBe(row!.origin);
    expect(parsed.activeMinutes).toBe(row!.activeMinutes);
    expect(parsed.totalMinutes).toBe(row!.totalMinutes);
    // R-9 返工 T1：licenseNote 投影（DB String? 列；null -> undefined 键缺省，口径对齐 imageUrl）
    expect(parsed.licenseNote).toBe(row!.licenseNote === null ? undefined : row!.licenseNote);
    // R-9 返工 T1：FETCHED 行授权台账文案抽查（fm-import 入库行 licenseNote 有实值，
    // 详情可见性即 R-9 立卡动机）；库内若 FETCHED 行 licenseNote 全为 null 则如实报告、不强造断言
    const fetchedRow = await prisma.dish.findFirst({
      where: { origin: 'FETCHED', licenseNote: { not: null } },
      orderBy: { id: 'asc' },
      select: { id: true, licenseNote: true },
    });
    if (fetchedRow) {
      const fetchedRes = await app!.inject({
        method: 'GET',
        url: `/api/dishes/${fetchedRow.id}`,
        ...authOpts(),
      });
      expect(fetchedRes.statusCode).toBe(200);
      const fetchedBody = DishDetailResponseSchema.parse(JSON.parse(fetchedRes.body));
      expect(typeof fetchedBody.licenseNote, `FETCHED 行 ${fetchedRow.id} licenseNote 应非空`).toBe(
        'string',
      );
      expect(fetchedBody.licenseNote!.length).toBeGreaterThan(0);
      expect(fetchedBody.licenseNote).toBe(fetchedRow.licenseNote!);
      console.log(
        `[dishes] FETCHED 行 licenseNote 实值抽查：${fetchedRow.id} -> ${String(fetchedBody.licenseNote).slice(0, 40)}`,
      );
    } else {
      console.log('[dishes] 库内 FETCHED 行 licenseNote 全为 null，非空抽查断言跳过（如实报告）');
    }
    // ingredients：数量一致 + 首行逐字段对照 join 实值
    expect(parsed.ingredients).toHaveLength(row!.ingredients.length);
    expect(parsed.ingredients.length).toBeGreaterThan(0);
    const dbFirst = row!.ingredients[0]!;
    const viewFirst = parsed.ingredients[0]!;
    expect(Object.keys(viewFirst).sort()).toEqual(
      [
        'ingredientId',
        'ingredientName',
        'aliases',
        'category',
        'defaultUnit',
        'qty',
        'unit',
        'optional',
      ].sort(),
    );
    expect(viewFirst.ingredientId).toBe(dbFirst.ingredientId);
    expect(viewFirst.ingredientName).toBe(dbFirst.ingredient.name);
    expect(viewFirst.aliases).toEqual(dbFirst.ingredient.aliases);
    expect(viewFirst.category).toBe(dbFirst.ingredient.category);
    expect(viewFirst.defaultUnit).toBe(dbFirst.ingredient.defaultUnit);
    expect(viewFirst.qty).toBe(dbFirst.qty);
    expect(viewFirst.unit).toBe(dbFirst.unit);
    expect(viewFirst.optional).toBe(dbFirst.optional);
  });

  it('g) 详情无 ingredients 的 rm9 行 -> 200 且 ingredients=[]（空清单如实空态）', async ({ skip }) => {
    if (!dbReady) return skip('PG 不可达，真实 PG 集成断言跳过');
    const res = await app!.inject({ method: 'GET', url: `/api/dishes/${PREFIX}draft`, ...authOpts() });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { id: string; ingredients: unknown[] };
    expect(body.id).toBe(`${PREFIX}draft`);
    expect(body.ingredients).toEqual([]);
  });

  it('h) 详情不存在 id -> 404（NotFoundError 先例口径）', async ({ skip }) => {
    if (!dbReady) return skip('PG 不可达，真实 PG 集成断言跳过');
    const res = await app!.inject({ method: 'GET', url: '/api/dishes/rm9-not-exist', ...authOpts() });
    expect(res.statusCode).toBe(404);
    expect((JSON.parse(res.body) as { error: string }).error).toContain('rm9-not-exist');
  });

  // ── AC3：origin 投影（正确性关键点） ──

  it('i) origin 投影：全列表逐行 origin 与 DB 实值一致；FETCHED 行不被 zod default(LLM_DRAFT) 吞掉', async ({ skip }) => {
    if (!dbReady) return skip('PG 不可达，真实 PG 集成断言跳过');
    const res = await app!.inject({ method: 'GET', url: '/api/dishes', ...authOpts() });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { id: string; origin: string }[];
    // 逐行对照 DB 实值（任何 default 吞值都会在此暴露）
    const dbRows = await prisma.dish.findMany({ select: { id: true, origin: true } });
    const dbOriginById = new Map(dbRows.map((r) => [r.id, r.origin]));
    for (const d of body) {
      expect(d.origin, `行 ${d.id} origin 应等于 DB 实值`).toBe(dbOriginById.get(d.id));
    }
    // FETCHED 集合逐 id 相等（管线入库菜的审阅正确性主证）
    const dbFetched = dbRows.filter((r) => r.origin === 'FETCHED').map((r) => r.id);
    const apiFetched = body.filter((d) => d.origin === 'FETCHED').map((d) => d.id);
    console.log(`[dishes] origin=FETCHED 实测行数：${dbFetched.length}（基线卡口径 29，以 DB 实测为准）`);
    expect(dbFetched.length).toBe(baselineFetched);
    expect(dbFetched.length).toBeGreaterThan(0);
    expect([...apiFetched].sort()).toEqual([...dbFetched].sort());
    // 抽一道 FETCHED 菜详情：origin 仍为 'FETCHED'
    const one = dbFetched[0]!;
    const detail = await app!.inject({ method: 'GET', url: `/api/dishes/${one}`, ...authOpts() });
    expect(detail.statusCode).toBe(200);
    expect((JSON.parse(detail.body) as { origin: string }).origin).toBe('FETCHED');
    // rm9 行（origin=LLM_DRAFT）投影不串值
    const rm9 = body.find((d) => d.id === `${PREFIX}draft`);
    expect(rm9!.origin).toBe('LLM_DRAFT');
  });

  // ── AC5：存量全量行 DishSchema.parse 幂等验证 ──

  it('j) 存量全量行（排除 rm9- 测试行）经 toDishView 投影后 DishSchema.parse 幂等：零畸形行', async ({ skip }) => {
    if (!dbReady) return skip('PG 不可达，真实 PG 集成断言跳过');
    const rows = await prisma.dish.findMany({
      where: { id: { not: { startsWith: PREFIX } } },
      include: { ingredients: { include: { ingredient: true } } },
    });
    expect(rows.length).toBe(baselineTotal);
    const failures: { id: string; issues: unknown }[] = [];
    for (const row of rows) {
      const parsed = DishSchema.safeParse(toDishView(row));
      if (!parsed.success) {
        failures.push({ id: row.id, issues: parsed.error.issues });
      }
    }
    expect(
      failures,
      `存量行应零畸形（失败行不自行改数据，停报主控）：${JSON.stringify(failures)}`,
    ).toHaveLength(0);
    console.log(`[dishes] 存量全量 DishSchema.parse 幂等验证：${rows.length}/${rows.length} 全过`);
  });
});
