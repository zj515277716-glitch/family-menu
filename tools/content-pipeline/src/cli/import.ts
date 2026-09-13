#!/usr/bin/env node
// tools/content-pipeline/src/cli/import.ts
// import CLI 入口：审核通过的 JSON -> DB status=DRAFT
// 对齐 AC5/AC6/AC9：仅写入 DRAFT（双保险）；T-C03 起支持显式授权 --origin FETCHED（R-4 处置），默认仍强制 origin=LLM_DRAFT
// R-2 AC1：写库前过敏原纵深校验（规则源=DB ExclusionRule 全量动态读取；HARD 未标注默认拦截，
//   --allow-allergen-draft 显式豁免放行并保留警告；SOFT 只警告不阻断；dry-run 同样执行校验，
//   fail-closed：DB 不可达 -> exit 1 自身错误）
// R-2 AC3：category 漂移警告（消费 shared CATEGORIES，只警告不阻断、不改退出码）。

import { Command } from 'commander';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createPrismaDraftWriter } from '../db.js';
import {
  importDraft,
  prepareDraftDish,
  normalizeOriginOption,
  findNonStandardCategories,
  formatNonStandardCategoryWarning,
} from '../import.js';
import {
  loadAllergenRules,
  loadIngredientProfilesByNames,
  checkDishAllergen,
  resolveAllergenDecision,
  describeMatched,
  type AllergenIngredientProfile,
} from '../allergen.js';

const program = new Command();

program
  .name('import')
  .description(
    '导入审核通过的草稿 JSON -> DB（强制 status=DRAFT；写库前过敏原校验：HARD 未标注默认拦截，SOFT 警告；origin 默认 LLM_DRAFT，显式授权 --origin FETCHED）',
  )
  .argument('<file>', '草稿 JSON 文件路径（out/*.draft.json 或 fetch2dish 产物 *.dish.json）')
  .option('--dry-run', '只校验不写入 DB（含过敏原校验，需本地 DB 只读查询）')
  .option(
    '--origin <value>',
    '显式授权入库来源：仅允许 FETCHED（落 origin=FETCHED + status=DRAFT）；缺省强制 LLM_DRAFT（双保险不削弱）',
  )
  .option(
    '--allow-allergen-draft',
    '显式豁免 HARD 过敏原未标注拦截（放行导入并保留警告；SOFT 始终只警告不阻断）',
  )
  .helpOption('-h, --help', '显示帮助');

program.action(
  async (
    file: string,
    opts: { dryRun?: boolean; origin?: string; allowAllergenDraft?: boolean },
  ) => {
    if (!fs.existsSync(file)) {
      console.error(`文件不存在：${file}`);
      process.exit(1);
    }
    const content = fs.readFileSync(file, 'utf-8');

    // T-C03（R-4 处置）：显式授权归一——undefined→LLM_DRAFT；'FETCHED'→FETCHED；其余抛错拒绝。
    // 默认路径（不传 --origin）行为与 T-C03 之前完全一致。
    let origin: 'LLM_DRAFT' | 'FETCHED';
    try {
      origin = normalizeOriginOption(opts.origin);
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }

    // 库接口口径：仅显式授权时传 { origin: 'FETCHED' }；默认路径不传 options（缺省=强制 LLM_DRAFT）。
    const importOptions = origin === 'FETCHED' ? ({ origin: 'FETCHED' } as const) : undefined;

    // 先 prepare（fail-fast：JSON/schema 非法时无需建 DB 连接）
    const input = prepareDraftDish(content, importOptions);

    // R-2 AC3：category 漂移警告（只警告，不阻断、不改退出码；走 stderr）
    const nonStandard = findNonStandardCategories(input.ingredients);
    if (nonStandard.length > 0) {
      console.warn(formatNonStandardCategoryWarning(nonStandard));
    }

    // R-2 AC1：写库前过敏原校验（dry-run 同样执行；fail-closed：DB 不可达 → 抛错 → exit 1）
    const writer = await createPrismaDraftWriter();
    let blocked = false;
    try {
      const { rules, ruleTargetProfiles } = await loadAllergenRules(writer.prisma);
      const hardCount = rules.filter((r) => r.severity === 'HARD').length;
      const softCount = rules.filter((r) => r.severity === 'SOFT').length;
      console.log(
        `过敏原校验：规则源=DB ExclusionRule 全量 ${rules.length} 行（HARD ${hardCount} / SOFT ${softCount}）`,
      );

      const dbProfiles = await loadIngredientProfilesByNames(
        writer.prisma,
        input.ingredients.map((i) => i.name),
      );
      // 合成食材档案：JSON 侧 name/aliases + DB 侧 id/aliases/category（INGREDIENT 规则经 DB join 补全 aliases）
      const profiles: AllergenIngredientProfile[] = input.ingredients.map((ing) => {
        const dbRow = dbProfiles.get(ing.name);
        return {
          name: ing.name,
          aliases: ing.aliases,
          dbId: dbRow?.id,
          dbAliases: dbRow?.aliases,
          dbCategory: dbRow?.category,
        };
      });
      const findings = checkDishAllergen(
        { name: input.name, flavorTags: input.flavorTags },
        profiles,
        rules,
        ruleTargetProfiles,
      );
      const decision = resolveAllergenDecision(findings, {
        allowAllergenDraft: opts.allowAllergenDraft === true,
      });

      // SOFT 警告 / HARD 豁免警告（stderr，不阻断）
      for (const w of decision.warnings) {
        console.warn(`[过敏原警告] ${w}`);
      }

      if (decision.blocked) {
        // HARD 未标注 → 默认拒绝（exit 2），不写库
        blocked = true;
        console.error(
          `[过敏原拦截] ${input.name}：HARD 规则命中且 flavorTags 未标注，已拦截（未写入 DB）。命中明细：`,
        );
        for (const f of findings) {
          const target =
            f.scope === 'TAG'
              ? `tag=${f.targetTag ?? '-'}`
              : `ingredientId=${f.targetId ?? '-'}`;
          console.error(
            `  - [${f.severity}] 规则 ${f.ruleId}（${f.scope} scope，${target}）命中食材 ${describeMatched(f)}` +
              (f.missingTag ? `，flavorTags 缺标注「${f.missingTag}」` : '') +
              (f.ruleNote ? `，备注：${f.ruleNote}` : ''),
          );
        }
        console.error(
          '如确需入库，请显式追加 --allow-allergen-draft（HARD 豁免放行，警告保留）。',
        );
      } else {
        console.log(
          `过敏原校验通过：命中 ${findings.length} 条` +
            (findings.length > 0 ? '（均已按已标注/SOFT/HARD豁免放行）' : '（无规则命中）'),
        );

        if (opts.dryRun) {
          // 只校验（prepareDraftDish 已执行：强制 DRAFT + 过 schema 校验）
          console.log('校验通过（dry-run，未写入 DB）：');
          console.log(`  菜品：${input.name}（${input.mealRole}）`);
          console.log(
            `  状态：status=${input.status} origin=${input.origin}（双保险：仅 DRAFT；${origin === 'FETCHED' ? '显式授权 FETCHED' : '默认强制 LLM_DRAFT'}）`,
          );
          console.log(`  食材：${input.ingredients.length} 个`);
        } else {
          const result = await importDraft(content, writer, importOptions);
          console.log(
            `导入成功：dishId=${result.dishId}（status=DRAFT, origin=${origin}${origin === 'FETCHED' ? '，显式授权 --origin FETCHED' : ''}，食材 ${result.ingredientCount} 个）`,
          );
        }
      }
    } finally {
      await writer.$disconnect();
    }

    if (blocked) {
      process.exitCode = 2;
    }
  },
);

// 可测性守卫（R-2-S1）：仅主模块直跑时执行 parseAsync（argv[1] 与本模块一致）；
// vitest import 本模块不触发顶层副作用，单测复用 program 实例自行驱动 parseAsync。
const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  program.parseAsync(process.argv).catch((err: unknown) => {
    console.error('import 执行失败：', err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}

export { program };
