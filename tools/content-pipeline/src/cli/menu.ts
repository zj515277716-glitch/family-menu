#!/usr/bin/env node
// tools/content-pipeline/src/cli/menu.ts
// TP-06 菜库扩充 CLI：导入草稿主菜（DRAFT）+ 组装新菜单（DRAFT）——纯规则零 LLM
// 流程：MENU_PLAN 选定 9 份草稿 -> 主菜查重复用/导入（status=DRAFT, origin=LLM_DRAFT）
//       -> 按 DB 既有 PUBLISHED 配菜组装 9 套菜单（DRAFT）-> 产出 out/menus.plan.json
// 产物只落 DRAFT（DEC-006）；发布须产品负责人确认（TP-06 卡内建确认点）
// 注意：发布（DRAFT -> PUBLISHED）后不得再运行本命令，否则会产生无菜单引用的重复 DRAFT 菜

import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPrismaClient, createPrismaDraftWriter } from '../db.js';
import { importDraft, prepareDraftDish } from '../import.js';
import {
  assembleOneMenu,
  pickSide,
  type AccompanimentPool,
  type AssembleDishRef,
  type AssembleScene,
} from '../menu-assemble.js';
import type { DishStep } from '@family-menu/shared';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// src/cli -> src -> content-pipeline -> out/
const OUT_DIR = path.resolve(__dirname, '../../out');

// ───── 菜单计划（显式列出文件名，避免同名草稿歧义；未入选草稿留 out/ 作未来扩充池）─────
// 工作日快手 ×7：鸡/蛋/猪/豆腐用 15 分钟档，牛/鱼/虾用 30 分钟档（蛋白质全覆盖）
// 周末丰盛 ×2：鸡/牛 60 分钟档

const MENU_PLAN: { menuId: string; scene: AssembleScene; draftFile: string }[] = [
  { menuId: 'pipeline-menu-01', scene: 'WEEKDAY_FAST', draftFile: 'weekday_fast_chicken_15min_1786251708130.draft.json' },
  { menuId: 'pipeline-menu-02', scene: 'WEEKDAY_FAST', draftFile: 'weekday_fast_egg_15min_1786251939314.draft.json' },
  { menuId: 'pipeline-menu-03', scene: 'WEEKDAY_FAST', draftFile: 'weekday_fast_pork_15min_1786251821600.draft.json' },
  { menuId: 'pipeline-menu-04', scene: 'WEEKDAY_FAST', draftFile: 'weekday_fast_tofu_15min_1786256099471.draft.json' },
  { menuId: 'pipeline-menu-05', scene: 'WEEKDAY_FAST', draftFile: 'weekday_fast_beef_30min_1786252009000.draft.json' },
  { menuId: 'pipeline-menu-06', scene: 'WEEKDAY_FAST', draftFile: 'weekday_fast_fish_30min_1786252204698.draft.json' },
  { menuId: 'pipeline-menu-07', scene: 'WEEKDAY_FAST', draftFile: 'weekday_fast_shrimp_30min_1786255952402.draft.json' },
  { menuId: 'pipeline-menu-08', scene: 'WEEKEND', draftFile: 'weekend_chicken_60min_1786251315346.draft.json' },
  { menuId: 'pipeline-menu-09', scene: 'WEEKEND', draftFile: 'weekend_beef_60min_1786254983933.draft.json' },
];

// 配菜池（DB 既有 PUBLISHED 菜，按名匹配；SIDE 按 menuId 尾号轮换）
const SIDE_NAMES = ['蒜蓉青菜', '凉拌黄瓜'];
const SOUP_NAME = '紫菜蛋花汤';
const STAPLE_NAME = '蛋炒饭';

// ───── DB 行类型（createPrismaClient 返回 any，本地收敛）─────

interface DishRow {
  id: string;
  name: string;
  activeMinutes: number;
  steps: unknown;
}

// ───── 主菜获取：查重复用（幂等）或导入 ─────

async function obtainMain(
  prisma: Record<string, unknown> & { $disconnect(): Promise<void> },
  plan: (typeof MENU_PLAN)[number],
  writer: Awaited<ReturnType<typeof createPrismaDraftWriter>> | null,
): Promise<{ ref: AssembleDishRef; reused: boolean }> {
  const filePath = path.join(OUT_DIR, plan.draftFile);
  if (!fs.existsSync(filePath)) {
    throw new Error(`草稿不存在：${plan.draftFile}`);
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  const input = prepareDraftDish(content);
  if (input.mealRole !== 'MAIN') {
    throw new Error(`${plan.draftFile} 不是主菜（mealRole=${input.mealRole}）`);
  }

  const dishRepo = prisma.dish as { findFirst(args: unknown): Promise<DishRow | null> };
  // 查重：同名 + 同工时 + 主菜 + 仍是 DRAFT 的管线产物（seed 菜 status=PUBLISHED/origin=MANUAL 天然排除）
  const existing = await dishRepo.findFirst({
    where: {
      name: input.name,
      activeMinutes: input.activeMinutes,
      mealRole: 'MAIN',
      status: 'DRAFT',
      origin: 'LLM_DRAFT',
    },
  });
  if (existing) {
    return {
      reused: true,
      ref: { id: existing.id, name: input.name, mealRole: 'MAIN', activeMinutes: input.activeMinutes, steps: input.steps },
    };
  }

  // dry-run 且库中无：用临时 id 组装预览（不导入）
  if (!writer) {
    const tempId = `dryrun-${plan.menuId}`;
    return {
      reused: false,
      ref: { id: tempId, name: input.name, mealRole: 'MAIN', activeMinutes: input.activeMinutes, steps: input.steps },
    };
  }

  const result = await importDraft(content, writer);
  return {
    reused: false,
    ref: { id: result.dishId, name: input.name, mealRole: 'MAIN', activeMinutes: input.activeMinutes, steps: input.steps },
  };
}

// ───── 配菜查询（DB 既有 PUBLISHED 菜）─────

async function findAccompaniment(
  prisma: Record<string, unknown> & { $disconnect(): Promise<void> },
  name: string,
  mealRole: string,
): Promise<AssembleDishRef> {
  const dishRepo = prisma.dish as { findFirst(args: unknown): Promise<DishRow | null> };
  const row = await dishRepo.findFirst({ where: { name, mealRole, status: 'PUBLISHED' } });
  if (!row) {
    throw new Error(`DB 未找到${mealRole}「${name}」（请先执行 pnpm db:seed）`);
  }
  return {
    id: row.id,
    name: row.name,
    mealRole,
    activeMinutes: row.activeMinutes,
    steps: row.steps as DishStep[],
  };
}

// ───── CLI ─────

const program = new Command();

program
  .name('fm-menu')
  .description('TP-06 菜库扩充：导入草稿主菜（DRAFT）+ 组装新菜单（DRAFT）+ 产出 out/menus.plan.json')
  .option('--dry-run', '只校验与预览组装计划（不导入、不写菜单）')
  .helpOption('-h, --help', '显示帮助');

program.action(async (opts: { dryRun?: boolean }) => {
  const prisma = await createPrismaClient();
  const writer = opts.dryRun ? null : await createPrismaDraftWriter();
  try {
    // 1. 配菜池（DB 既有 PUBLISHED 菜）
    const sides: AssembleDishRef[] = [];
    for (const name of SIDE_NAMES) {
      sides.push(await findAccompaniment(prisma, name, 'SIDE'));
    }
    const pool: AccompanimentPool = {
      sides,
      soup: await findAccompaniment(prisma, SOUP_NAME, 'SOUP'),
      staple: await findAccompaniment(prisma, STAPLE_NAME, 'STAPLE'),
    };

    // 2. 逐套：主菜查重/导入 + 组装
    const planMenus: unknown[] = [];
    let importedCount = 0;
    for (const plan of MENU_PLAN) {
      const { ref, reused } = await obtainMain(prisma, plan, writer);
      if (!reused && writer) importedCount += 1;
      const menu = assembleOneMenu({ menuId: plan.menuId, scene: plan.scene, main: ref }, pool);

      // 实际入菜单的菜品引用（与 assembleOneMenu 的构成规则一致），用于计划留档
      const dishRefs: AssembleDishRef[] = [ref, pickSide(plan.menuId, sides), pool.soup];
      if (plan.scene === 'WEEKEND') {
        dishRefs.push(pool.staple);
      }
      const dishLines = dishRefs.map((r, i) => ({
        name: r.name,
        mealRole: r.mealRole,
        dishId: menu.dishes[i]?.dishId,
        sort: i + 1,
      }));
      planMenus.push({
        menuId: menu.id,
        name: menu.name,
        scene: menu.scene,
        serves: menu.serves,
        totalActiveMinutes: menu.totalActiveMinutes,
        status: menu.status,
        dishes: dishLines,
        prepSequence: menu.prepSequence,
      });

      console.log(
        `${menu.id}  ${menu.name}（${menu.scene}，${menu.totalActiveMinutes} 分钟，DRAFT）` +
          `  主菜=${ref.name}${reused ? '（库中已存在，复用）' : writer ? '（新导入）' : '（dry-run 预览）'}`,
      );

      // 3. 真实模式：upsert 菜单 + 重建菜单-菜品关联（幂等）
      if (writer) {
        const menuRepo = prisma.menu as {
          upsert(args: unknown): Promise<{ id: string }>;
        };
        await menuRepo.upsert({
          where: { id: menu.id },
          create: {
            id: menu.id,
            name: menu.name,
            scene: menu.scene,
            serves: menu.serves,
            totalActiveMinutes: menu.totalActiveMinutes,
            prepSequence: menu.prepSequence,
            status: menu.status,
          },
          update: {
            name: menu.name,
            scene: menu.scene,
            serves: menu.serves,
            totalActiveMinutes: menu.totalActiveMinutes,
            prepSequence: menu.prepSequence,
            status: menu.status,
          },
        });
        const menuDishRepo = prisma.menuDish as {
          deleteMany(args: unknown): Promise<unknown>;
          createMany(args: unknown): Promise<unknown>;
        };
        await menuDishRepo.deleteMany({ where: { menuId: menu.id } });
        await menuDishRepo.createMany({
          data: menu.dishes.map((d) => ({ menuId: menu.id, dishId: d.dishId, sort: d.sort })),
        });
      }
    }

    // 4. 产出组装计划留档（dry-run 与真实运行均产出）
    const planDoc = {
      generatedAt: new Date().toISOString(),
      note: 'TP-06 菜库扩充组装计划：9 套新菜单（status=DRAFT）。发布须产品负责人确认（TP-06 卡内建确认点）。',
      newMenusCount: planMenus.length,
      importedDishes: importedCount,
      menus: planMenus,
    };
    fs.writeFileSync(path.join(OUT_DIR, 'menus.plan.json'), JSON.stringify(planDoc, null, 2), 'utf-8');

    console.log('');
    console.log(
      opts.dryRun
        ? `dry-run 完成：预览 ${planMenus.length} 套菜单（未写库）。计划已写入 out/menus.plan.json`
        : `组装完成：新导入主菜 ${importedCount} 个，组装 ${planMenus.length} 套菜单（全部 status=DRAFT）。计划已写入 out/menus.plan.json`,
    );
  } finally {
    await prisma.$disconnect();
    if (writer) await writer.$disconnect();
  }
});

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error('fm-menu 执行失败：', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
