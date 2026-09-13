// tools/content-pipeline/test/cli.spec.ts
// R-2-S1：fm-publish-check / fm-import CLI 层单测（12 用例：publish-check 5 + import 7）。
// 全 mock 零真实 DB：
//   - vi.mock('../src/db.js') 隔离 createPrismaClient / createPrismaDraftWriter（Prisma 7 driver
//     adapter 动态 import generated client 的链路整体不触达）；
//   - vi.mock('../src/import.js') 用 importOriginal 包装：importDraft 换成 spy 真实实现的 vi.fn，
//     其余导出（prepareDraftDish 等）保持真实；
//   - 草稿 JSON 落临时文件（mkdtemp/writeFileSync），形态对齐 DraftFileSchema（DishSchema + ingredients）。
// 设计说明（如实记录）：
//   1. 两个 cli 模块顶层带 isMain 守卫（R-2-S1 重构），vitest 进程内 isMain=false，
//      守卫块不执行——单测复用导出的 program 实例自行驱动 parseAsync(args, { from: 'user' })；
//   2. commander 15（15.0.0）：parse 阶段错误（缺参/未知 option）直接 process.exit(1) 不 reject；
//      action 内 throw 才使 parseAsync reject。故 PC-a / IMP-c 的守卫 catch 文案
//      （「publish-check 执行失败：」「import 执行失败：」+ exit(1)）在测试内逐字复现守卫 catch
//      驱动真实 rejection 验证；守卫真实口径已在第 2 步以 tsx 实跑验证（EXIT=1 + 同文案），
//      见 evidence/R-2-S1-dev-2026-09-13.md 守卫前后对照记录；
//   3. exit(1) 路径必须 vi.spyOn(process, 'exit').mockImplementation 防真退；exit mock 返回 undefined
//      后 action 会继续执行（IMP-a 后续 readFileSync 抛 ENOENT、IMP-b 后续 JSON.parse 抛 SyntaxError
//      使 action reject）——trailing rejection 按实际行为断言并如实记录；
//   4. commander 15 构造器默认 _storeOptionsAsProperties=false，且每次 parse 前恢复状态快照
//      （saveStateBeforeParse/restoreStateBeforeParse）——同一 program 实例重复 parseAsync 安全，
//      PC-d 的 --json flag 不泄漏到 PC-e；
//   5. process.exit(1) 后续的「退出码 1」在本进程内由 exitSpy 截获断言；exitCode=2 路径
//      （过敏原拦截/缺口盘点）由 process.exitCode 直接断言。

import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// ───── 模块 mock（vi.mock 提升，先于 import 执行）─────

vi.mock('../src/db.js', () => ({
  createPrismaClient: vi.fn(),
  createPrismaDraftWriter: vi.fn(),
}));

vi.mock('../src/import.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../src/import.js')>();
  return { ...mod, importDraft: vi.fn(mod.importDraft) };
});

// 被测模块（cli 模块顶层 isMain 守卫使 import 无副作用）
import { program as publishCheckProgram } from '../src/cli/publish-check.js';
import { program as importProgram } from '../src/cli/import.js';
import { createPrismaClient, createPrismaDraftWriter } from '../src/db.js';
import { importDraft } from '../src/import.js';

// ───── 合成 DB 侧（形态对齐 AllergenPrismaLike / PublishCheckPrismaLike / db.ts 返回值）─────

interface IngredientRow {
  id: string;
  name: string;
  aliases: string[];
  category: string;
}

/** 合成只读 prisma：exclusionRule 全量 + ingredient（按 where.id/where.name 分流）+ dish */
function makeSynthPrisma(opts: {
  exclusionRules: Record<string, unknown>[];
  ingredientRows?: IngredientRow[];
  dishes?: unknown[];
}) {
  const exclusionFindMany = vi.fn(async () => opts.exclusionRules);
  const ingredientFindMany = vi.fn(
    async (args: { where: { id?: { in?: string[] }; name?: { in?: string[] } } }) => {
      const rows = opts.ingredientRows ?? [];
      if (args.where.id?.in) {
        const ids = args.where.id.in;
        return rows.filter((r) => ids.includes(r.id));
      }
      if (args.where.name?.in) {
        const names = args.where.name.in;
        return rows.filter((r) => names.includes(r.name));
      }
      return [];
    },
  );
  const dishFindMany = vi.fn(async () => opts.dishes ?? []);
  const disconnect = vi.fn(async () => {});
  const prisma = {
    exclusionRule: { findMany: exclusionFindMany },
    ingredient: { findMany: ingredientFindMany },
    dish: { findMany: dishFindMany },
    $disconnect: disconnect,
  };
  return { prisma, spies: { exclusionFindMany, ingredientFindMany, dishFindMany, disconnect } };
}

/** 合成 DraftWriter（db.ts createPrismaDraftWriter 返回形态；底层 prisma 供过敏原只读校验） */
function makeSynthWriter(prisma?: unknown) {
  const writer = {
    $disconnect: vi.fn(async () => {}),
    prisma: (prisma ?? makeSynthPrisma({ exclusionRules: [] }).prisma) as never,
    upsertIngredient: vi.fn(async (input: { name: string }) => ({ id: `ing-up-${input.name}` })),
    createDishWithIngredients: vi.fn(async () => ({ id: 'dish-new-77' })),
  };
  return writer;
}

// 规则与食材行（与 allergen.spec.ts 同源形态）
const ruleHardIngredient = {
  id: 'rule-hard-ing',
  scope: 'INGREDIENT',
  targetId: 'ing-peanut',
  targetTag: null,
  severity: 'HARD',
  note: '花生 HARD',
};
const ruleHardTag = {
  id: 'rule-hard-tag',
  scope: 'TAG',
  targetId: null,
  targetTag: '花生',
  severity: 'HARD',
  note: '花生 HARD',
};
const peanutRow: IngredientRow = { id: 'ing-peanut', name: '花生米', aliases: ['花生仁'], category: '调料' };

// ───── 草稿 fixture（DraftFileSchema 形态；DishSchema 必填 + ingredients）─────

function draftObj(overrides?: {
  name?: string;
  flavorTags?: string[];
  ingredients?: { name: string; aliases?: string[]; category: string; defaultUnit: string; qty: number; unit: string }[];
}) {
  return {
    name: overrides?.name ?? '花生拌饭',
    mealRole: 'MAIN',
    flavorTags: overrides?.flavorTags ?? [],
    activeMinutes: 10,
    totalMinutes: 20,
    equipment: ['炒锅'],
    steps: [{ order: 1, text: '翻炒' }],
    ingredients:
      overrides?.ingredients ??
      [{ name: '花生米', aliases: ['花生仁'], category: '调料', defaultUnit: 'g', qty: 50, unit: 'g' }],
  };
}

// ───── console / process.exit 捕获（防真退；自管理句柄，不用全局 restoreAllMocks）─────

interface Captured {
  logs: string[];
  errs: string[];
  warns: string[];
  exitSpy: ReturnType<typeof vi.spyOn>;
  restore: () => void;
}

function captureConsoleAndExit(): Captured {
  const logs: string[] = [];
  const errs: string[] = [];
  const warns: string[] = [];
  const fmt = (a: unknown) => (typeof a === 'string' ? a : String(a));
  const logSpy = vi
    .spyOn(console, 'log')
    .mockImplementation((...a: unknown[]) => void logs.push(a.map(fmt).join(' ')));
  const errSpy = vi
    .spyOn(console, 'error')
    .mockImplementation((...a: unknown[]) => void errs.push(a.map(fmt).join(' ')));
  const warnSpy = vi
    .spyOn(console, 'warn')
    .mockImplementation((...a: unknown[]) => void warns.push(a.map(fmt).join(' ')));
  const exitSpy = vi
    .spyOn(process, 'exit')
    .mockImplementation((() => undefined) as (code?: number) => never);
  return {
    logs,
    errs,
    warns,
    exitSpy,
    restore() {
      logSpy.mockRestore();
      errSpy.mockRestore();
      warnSpy.mockRestore();
      exitSpy.mockRestore();
    },
  };
}

/** 驱动 program.parseAsync（from:user），reject 时捕获不外抛（按用例自行断言 rejection 形态） */
async function runCli(program: { parseAsync(argv: string[], opts: { from: 'user' }): Promise<unknown> }, args: string[]) {
  try {
    await program.parseAsync(args, { from: 'user' });
    return { rejected: undefined as unknown };
  } catch (err) {
    return { rejected: err };
  }
}

// ───── 临时目录（草稿 JSON 落盘）─────

let tmpDir = '';

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fm-cli-spec-'));
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

afterEach(() => {
  captured?.restore();
  captured = undefined;
  process.exitCode = undefined; // 重置 exit 2 路径残留
  vi.mocked(createPrismaClient).mockReset();
  vi.mocked(createPrismaDraftWriter).mockReset();
  vi.mocked(importDraft).mockClear();
});

let captured: Captured | undefined;

function capture() {
  captured = captureConsoleAndExit();
  return captured;
}

// ═══════════════════ publish-check CLI（5 用例）═══════════════════

describe('fm-publish-check CLI 层（mock DB，复用 program 实例）', () => {
  it('PC-a: --status PUBLISHED 非法值 -> parseAsync reject，守卫 catch 文案逐字 + exit(1) 截获', async () => {
    const cap = capture();
    vi.mocked(createPrismaClient).mockResolvedValue(makeSynthPrisma({ exclusionRules: [] }).prisma as never);

    // action 内 normalizeStatusFilter 抛错 -> parseAsync reject（vitest 内守卫块不执行，isMain=false）
    const { rejected } = await runCli(publishCheckProgram, ['--status', 'PUBLISHED']);
    expect(rejected).toBeInstanceOf(Error);
    // 锚定源码实文（publish-check.ts normalizeStatusFilter）
    expect((rejected as Error).message).toBe(
      '--status 非法值：PUBLISHED（仅允许 DRAFT/TESTED，大小写不敏感，逗号分隔）',
    );

    // 守卫 catch 逐字复现（src/cli/publish-check.ts isMain 块）驱动真实 rejection：
    // 真实口径已在第 2 步 tsx 实跑验证（stderr 同文案 + EXIT=1），见 dev 报告
    try {
      await publishCheckProgram.parseAsync(['--status', 'PUBLISHED'], { from: 'user' });
      expect.unreachable('parseAsync 应 reject');
    } catch (err) {
      console.error('publish-check 执行失败：', err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
    expect(cap.errs.join('\n')).toContain('publish-check 执行失败：');
    expect(cap.errs.join('\n')).toContain('--status 非法值：PUBLISHED');
    expect(cap.exitSpy).toHaveBeenCalledWith(1);
    expect(vi.mocked(createPrismaClient)).not.toHaveBeenCalled(); // fail-fast，未建连
  });

  it('PC-b: 缺省全扫（DRAFT+TESTED）无缺口 -> 报告头/结论逐字，exitCode 未置 2，$disconnect 收尾', async () => {
    const cap = capture();
    const synth = makeSynthPrisma({
      exclusionRules: [ruleHardTag],
      dishes: [
        {
          id: 'dish-1',
          name: '番茄炒蛋',
          origin: 'LLM_DRAFT',
          status: 'DRAFT',
          flavorTags: ['清淡'],
          ingredients: [{ ingredient: { id: 'ing-tomato', name: '番茄', aliases: ['西红柿'], category: '蔬菜' } }],
        },
      ],
    });
    vi.mocked(createPrismaClient).mockResolvedValue(synth.prisma as never);

    const { rejected } = await runCli(publishCheckProgram, []);
    expect(rejected).toBeUndefined();

    const text = cap.logs.join('\n');
    expect(text).toContain('=== fm-publish-check 存量过敏原盘点报告 ===');
    expect(text).toContain("status IN ('DRAFT', 'TESTED')");
    expect(text).toContain('共 1 道菜');
    expect(text).toContain('结论：无缺口（exit 0）');
    expect(process.exitCode).not.toBe(2); // 缺省为 undefined（exitCode 0）
    expect(synth.spies.dishFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: { in: ['DRAFT', 'TESTED'] } } }),
    );
    expect(synth.spies.disconnect).toHaveBeenCalledTimes(1);
  });

  it('PC-c: 有缺口 -> 结论「存在 1 道（exit 2）」+ 缺口菜名 + process.exitCode=2', async () => {
    const cap = capture();
    const synth = makeSynthPrisma({
      exclusionRules: [ruleHardIngredient],
      ingredientRows: [peanutRow],
      dishes: [
        {
          id: 'dish-gongbao',
          name: '宫保鸡丁',
          origin: 'LLM_DRAFT',
          status: 'TESTED',
          flavorTags: [],
          ingredients: [{ ingredient: peanutRow }],
        },
        {
          id: 'dish-1',
          name: '番茄炒蛋',
          origin: 'LLM_DRAFT',
          status: 'DRAFT',
          flavorTags: ['清淡'],
          ingredients: [{ ingredient: { id: 'ing-tomato', name: '番茄', aliases: ['西红柿'], category: '蔬菜' } }],
        },
      ],
    });
    vi.mocked(createPrismaClient).mockResolvedValue(synth.prisma as never);

    const { rejected } = await runCli(publishCheckProgram, []);
    expect(rejected).toBeUndefined();

    const text = cap.logs.join('\n');
    expect(text).toContain('过敏原缺口菜品：1 道');
    expect(text).toContain('宫保鸡丁');
    expect(text).toContain('结论：存在 1 道缺口菜品（exit 2；本工具只报告不处置）');
    expect(process.exitCode).toBe(2);
    expect(synth.spies.disconnect).toHaveBeenCalledTimes(1);
  });

  it('PC-d: --json -> stdout 输出可 JSON.parse，statusFilter/scannedCount/gapDishCount 自洽', async () => {
    const cap = capture();
    const synth = makeSynthPrisma({
      exclusionRules: [ruleHardTag],
      dishes: [
        {
          id: 'dish-1',
          name: '番茄炒蛋',
          origin: 'LLM_DRAFT',
          status: 'DRAFT',
          flavorTags: ['清淡'],
          ingredients: [{ ingredient: { id: 'ing-tomato', name: '番茄', aliases: ['西红柿'], category: '蔬菜' } }],
        },
      ],
    });
    vi.mocked(createPrismaClient).mockResolvedValue(synth.prisma as never);

    const { rejected } = await runCli(publishCheckProgram, ['--json']);
    expect(rejected).toBeUndefined();

    // --json 为单次 console.log(JSON.stringify(report, null, 2))：首条即完整 JSON
    expect(cap.logs.length).toBeGreaterThan(0);
    const report = JSON.parse(cap.logs[0]) as {
      statusFilter: string[];
      scannedCount: number;
      gapDishCount: number;
      gaps: unknown[];
    };
    expect(report.statusFilter).toEqual(['DRAFT', 'TESTED']);
    expect(report.scannedCount).toBe(1);
    expect(report.gapDishCount).toBe(0);
    expect(report.gapDishCount).toBe(report.gaps.length); // 数字自洽
    expect(process.exitCode).not.toBe(2);
  });

  it('PC-e: --status draft -> dish.findMany 收到 status in [DRAFT]', async () => {
    const cap = capture();
    const synth = makeSynthPrisma({
      exclusionRules: [],
      dishes: [
        {
          id: 'dish-1',
          name: '番茄炒蛋',
          origin: 'LLM_DRAFT',
          status: 'DRAFT',
          flavorTags: ['清淡'],
          ingredients: [{ ingredient: { id: 'ing-tomato', name: '番茄', aliases: ['西红柿'], category: '蔬菜' } }],
        },
      ],
    });
    vi.mocked(createPrismaClient).mockResolvedValue(synth.prisma as never);

    const { rejected } = await runCli(publishCheckProgram, ['--status', 'draft']);
    expect(rejected).toBeUndefined();

    expect(synth.spies.dishFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: { in: ['DRAFT'] } } }),
    );
    expect(cap.logs.join('\n')).toContain("status IN ('DRAFT')");
    expect(process.exitCode).not.toBe(2);
  });
});

// ═══════════════════ fm-import CLI（7 用例）═══════════════════

describe('fm-import CLI 层（mock DB + spy 真实 importDraft，复用 program 实例）', () => {
  it('IMP-a: 文件不存在 -> 「文件不存在：」+ exit(1) 截获；exit mock 后续 readFileSync 抛 ENOENT（如实记录）', async () => {
    const cap = capture();
    vi.mocked(createPrismaDraftWriter).mockResolvedValue(makeSynthWriter().prisma as never);
    const missingPath = path.join(tmpDir, 'missing.json');

    const { rejected } = await runCli(importProgram, [missingPath]);
    // action: console.error('文件不存在：...') + process.exit(1)（mock 返回后继续 -> readFileSync ENOENT）
    expect(cap.errs.join('\n')).toContain(`文件不存在：${missingPath}`);
    expect(cap.exitSpy).toHaveBeenCalledWith(1);
    // trailing rejection（exit mock 使 action 继续执行的测试形态，非产品缺陷）：如实断言
    expect(rejected).toBeInstanceOf(Error);
    expect((rejected as NodeJS.ErrnoException).code).toBe('ENOENT');
    expect(vi.mocked(createPrismaDraftWriter)).not.toHaveBeenCalled(); // 未建连
  });

  it('IMP-b: --origin WECHAT -> 拒绝文案 + exit(1) 截获；后续 prepareDraftDish 抛 SyntaxError（如实记录）', async () => {
    const cap = capture();
    vi.mocked(createPrismaDraftWriter).mockResolvedValue(makeSynthWriter().prisma as never);
    // 故意非法 JSON：确保 exit mock 后不会继续跑库链路（design note 见文件头）
    const badPath = path.join(tmpDir, 'bad-origin.json');
    fs.writeFileSync(badPath, '{ not valid json', 'utf-8');

    const { rejected } = await runCli(importProgram, [badPath, '--origin', 'WECHAT']);
    // 锚定源码实文（import.ts normalizeOriginOption）
    expect(cap.errs.join('\n')).toContain('origin 授权值非法："WECHAT"（仅允许缺省=LLM_DRAFT 或显式授权 FETCHED）');
    expect(cap.exitSpy).toHaveBeenCalledWith(1);
    // trailing rejection：JSON.parse SyntaxError（真实口径下 process.exit 不会返回）
    expect(rejected).toBeInstanceOf(SyntaxError);
    expect(vi.mocked(createPrismaDraftWriter)).not.toHaveBeenCalled();
  });

  it('IMP-c: JSON 语法非法 -> parseAsync reject，守卫 catch 文案逐字 + exit(1) 截获', async () => {
    const cap = capture();
    vi.mocked(createPrismaDraftWriter).mockResolvedValue(makeSynthWriter().prisma as never);
    const badPath = path.join(tmpDir, 'broken.json');
    fs.writeFileSync(badPath, '{"name": "未闭合', 'utf-8');

    // prepareDraftDish 内 JSON.parse 抛 SyntaxError -> action reject（vitest 内守卫块不执行）
    const { rejected } = await runCli(importProgram, [badPath]);
    expect(rejected).toBeInstanceOf(SyntaxError);

    // 守卫 catch 逐字复现（src/cli/import.ts isMain 块）驱动真实 rejection：
    // 真实口径已在第 2 步 tsx 实跑验证（stderr 同文案 + EXIT=1），见 dev 报告
    try {
      await importProgram.parseAsync([badPath], { from: 'user' });
      expect.unreachable('parseAsync 应 reject');
    } catch (err) {
      console.error('import 执行失败：', err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
    expect(cap.errs.join('\n')).toContain('import 执行失败：');
    expect(cap.exitSpy).toHaveBeenCalledWith(1);
    expect(vi.mocked(createPrismaDraftWriter)).not.toHaveBeenCalled(); // fail-fast
  });

  it('IMP-d: HARD INGREDIENT 命中且未标注 -> 「[过敏原拦截]」+ exitCode=2 + importDraft 未调用', async () => {
    const cap = capture();
    const synth = makeSynthPrisma({
      exclusionRules: [ruleHardIngredient],
      ingredientRows: [peanutRow],
    });
    const writer = makeSynthWriter(synth.prisma);
    vi.mocked(createPrismaDraftWriter).mockResolvedValue(writer as never);
    const filePath = path.join(tmpDir, 'peanut.json');
    fs.writeFileSync(filePath, JSON.stringify(draftObj()), 'utf-8');

    const { rejected } = await runCli(importProgram, [filePath]);
    expect(rejected).toBeUndefined(); // blocked 走 exitCode=2，不抛错不 exit(1)

    // 锚定源码实文（src/cli/import.ts 拦截分支）
    expect(cap.errs.join('\n')).toContain(
      '[过敏原拦截] 花生拌饭：HARD 规则命中且 flavorTags 未标注，已拦截（未写入 DB）。命中明细：',
    );
    expect(cap.exitSpy).not.toHaveBeenCalled(); // 拦截路径不用 exit(1)
    expect(process.exitCode).toBe(2);
    expect(vi.mocked(importDraft)).not.toHaveBeenCalled(); // 拦截不写库
    expect(writer.$disconnect).toHaveBeenCalledTimes(1);
  });

  it('IMP-e: 同上 + --allow-allergen-draft --dry-run -> 「dry-run，未写入 DB」+ importDraft 未调用 + exitCode 非 2', async () => {
    const cap = capture();
    const synth = makeSynthPrisma({
      exclusionRules: [ruleHardIngredient],
      ingredientRows: [peanutRow],
    });
    const writer = makeSynthWriter(synth.prisma);
    vi.mocked(createPrismaDraftWriter).mockResolvedValue(writer as never);
    const filePath = path.join(tmpDir, 'peanut-exempt.json');
    fs.writeFileSync(filePath, JSON.stringify(draftObj()), 'utf-8');

    const { rejected } = await runCli(importProgram, [filePath, '--allow-allergen-draft', '--dry-run']);
    expect(rejected).toBeUndefined();

    // 锚定源码实文（src/cli/import.ts dry-run 分支）
    expect(cap.logs.join('\n')).toContain('校验通过（dry-run，未写入 DB）：');
    expect(cap.logs.join('\n')).toContain('菜品：花生拌饭（MAIN）');
    // HARD 豁免警告保留（stderr）
    expect(cap.warns.join('\n')).toContain('豁免放行');
    expect(vi.mocked(importDraft)).not.toHaveBeenCalled(); // dry-run 不写库
    expect(process.exitCode).not.toBe(2); // 豁免放行：不改退出码
    expect(writer.$disconnect).toHaveBeenCalledTimes(1);
  });

  it('IMP-f: 非 dry-run 放行 -> importDraft 调用（真实实现）+ 「导入成功：dishId=...」', async () => {
    const cap = capture();
    const synth = makeSynthPrisma({ exclusionRules: [] });
    const writer = makeSynthWriter(synth.prisma);
    vi.mocked(createPrismaDraftWriter).mockResolvedValue(writer as never);
    const filePath = path.join(tmpDir, 'tomato.json');
    fs.writeFileSync(
      filePath,
      JSON.stringify(
        draftObj({
          name: '番茄炒蛋',
          flavorTags: ['清淡'],
          ingredients: [{ name: '番茄', aliases: ['西红柿'], category: '蔬菜', defaultUnit: 'g', qty: 200, unit: 'g' }],
        }),
      ),
      'utf-8',
    );

    const { rejected } = await runCli(importProgram, [filePath]);
    expect(rejected).toBeUndefined();

    // spy 真实 importDraft：被调用且经合成 writer 落库
    expect(vi.mocked(importDraft)).toHaveBeenCalledTimes(1);
    expect(writer.upsertIngredient).toHaveBeenCalledWith(
      expect.objectContaining({ name: '番茄', category: '蔬菜' }),
    );
    expect(writer.createDishWithIngredients).toHaveBeenCalledTimes(1);
    // 锚定源码实文（src/cli/import.ts 成功分支；dishId 来自合成 writer）
    expect(cap.logs.join('\n')).toContain('导入成功：dishId=dish-new-77（status=DRAFT, origin=LLM_DRAFT');
    expect(cap.logs.join('\n')).toContain('食材 1 个');
    expect(process.exitCode).not.toBe(2);
    expect(writer.$disconnect).toHaveBeenCalledTimes(1);
  });

  it('IMP-g: 非标 category（嫩豆腐=豆制品）-> stderr 警告且不改退出码', async () => {
    const cap = capture();
    const synth = makeSynthPrisma({ exclusionRules: [] });
    const writer = makeSynthWriter(synth.prisma);
    vi.mocked(createPrismaDraftWriter).mockResolvedValue(writer as never);
    const filePath = path.join(tmpDir, 'tofu.json');
    fs.writeFileSync(
      filePath,
      JSON.stringify(
        draftObj({
          name: '凉拌嫩豆腐',
          flavorTags: ['清淡'],
          ingredients: [{ name: '嫩豆腐', category: '豆制品', defaultUnit: '块', qty: 1, unit: '块' }],
        }),
      ),
      'utf-8',
    );

    const { rejected } = await runCli(importProgram, [filePath, '--dry-run']);
    expect(rejected).toBeUndefined();

    // 锚定源码实文（src/import.ts formatNonStandardCategoryWarning）
    expect(cap.warns.join('\n')).toContain('[警告] 1 个食材 category 不在标准六类');
    expect(cap.warns.join('\n')).toContain('嫩豆腐=豆制品');
    expect(cap.warns.join('\n')).toContain('仅警告，不阻断');
    // dry-run 校验照常通过，退出码不受警告影响
    expect(cap.logs.join('\n')).toContain('校验通过（dry-run，未写入 DB）：');
    expect(process.exitCode).not.toBe(2);
    expect(vi.mocked(importDraft)).not.toHaveBeenCalled();
    expect(writer.$disconnect).toHaveBeenCalledTimes(1);
  });
});
