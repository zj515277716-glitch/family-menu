// packages/engine/src/composition.ts
// T-P16/PD-018 槽位组合层：PUBLISHED 菜按 mealRole 归池，按槽位映射动态组合虚拟菜单。
// 骨架不变：主菜=⌈people/2⌉、SIDE=1、SOUP=1；STAPLE 暂不设槽（挂账，不参与组合）。
// 铁律：
// - 纯函数零 IO（engine 四层管道约定），输出确定性（同输入同输出，无随机）；
// - dish 级安全预过滤（safety.ts filterSafeDishes，口径与 safetyFilter 菜单级一致），
//   硬禁忌食材/菜绝不进入任何槽位（AC2 安全零回归）；
// - 覆盖式生成：每个安全合格菜至少出现在一个虚拟菜单——保 feasibility 宽集语义
//   （T-P10：宽集=器具齐全+可达（含超时但器具齐全）菜单的食材并集，组合层漏菜会把
//   TIME_BUDGET 误报成 NO_DISH，破坏 C-7 空手口径）；
// - 缺槽降级（AC5/PD-018）：槽位无可用菜 -> 该槽留空、其余槽位照常出单，
//   原因记入 slotShortages 侧车（planService 并入候选 reasons[] 透传，AC7 零契约变更），
//   绝不拿不合条件的菜凑数；
// - mustUse 定向套（AC3/PD-001）：必消非空时贪心选覆盖菜同桌生成定向组合，
//   槽位冲突（如同角色代表菜超过槽位数）则放弃定向套——此时任何合法槽位组合都无法
//   同桌覆盖全部必消，空手是真实口径，不伪造可行解。
import type { DishView, ExclusionView, MenuView } from './types.js';
import type { MealRole, PrepSequenceItem } from '@family-menu/shared';
import { filterSafeDishes } from './safety.js';

/** 槽位映射（PD-018）：主菜槽 = ⌈people/2⌉（向下防御：至少 1） */
export function mainSlotCount(people: number): number {
  return Math.max(1, Math.ceil(people / 2));
}

/** 组合输入（全部来自调用方装载，组合层零 IO；菜池由第一参数 dishes 传入，不在此重复） */
export interface ComposeInput {
  /** 用餐人数（主菜槽位数来源） */
  people: number;
  /** 禁忌规则（dish 级安全预过滤，AC2） */
  exclusions: ExclusionView[];
  /** 必消食材 ingredientId（AC3：非空时生成必消定向套） */
  mustUseIngredientIds?: string[];
  /** 换一批（PD-013）：从池中剔除的菜 id（当前菜单已用菜不回池） */
  excludeDishIds?: string[];
}

/** 组合结果 */
export interface CompositionResult {
  /** 虚拟菜单集（覆盖式生成，供 recommend 当作普通 MenuView 评分/过滤） */
  virtualMenus: MenuView[];
  /** 缺槽说明侧车（menuId -> 说明列表），AC5；planService 并入候选 reasons[] */
  slotShortages: Record<string, string[]>;
  /** 安全预过滤+换批剔除后各角色池计数（STAPLE 挂账不设槽但计数可见） */
  poolSizes: Record<MealRole, number>;
  /** 被安全预过滤排除的菜（dishId -> 原因），排查用 */
  safetyExcluded: Record<string, string>;
}

/** 单菜食材 id 集 */
function dishIngredientIds(dish: DishView): Set<string> {
  return new Set(dish.ingredients.map((ing) => ing.ingredientId));
}

/**
 * 备菜顺序确定性串行展开（与 apps/api planService.buildPrepSequence v1 同构，
 * engine 内独立实现，不跨包引用 API 层）。
 */
function buildPrepSequence(dishes: DishView[]): PrepSequenceItem[] {
  const sequence: PrepSequenceItem[] = [];
  let cursor = 0;
  for (const dish of dishes) {
    const steps = [...dish.steps].sort((a, b) => a.order - b.order);
    if (steps.length === 0) {
      // steps 空的条目如实占位
      sequence.push({ minute: cursor, action: `做「${dish.name}」` });
      cursor += Math.max(1, Math.ceil(dish.activeMinutes));
      continue;
    }
    const perStep = Math.max(1, Math.ceil(dish.activeMinutes / steps.length));
    for (const step of steps) {
      sequence.push({ minute: cursor, action: step.text });
      cursor += perStep;
    }
  }
  return sequence;
}

/**
 * 必消定向选菜（AC3）：贪心选覆盖剩余必消最多的安全菜，直到覆盖全部必消。
 * 必消 <= 3（TonightContext 上限），贪心足够；池内无菜可覆盖剩余必消 -> null。
 */
function pickMustUseCoverDishes(
  pools: { MAIN: DishView[]; SIDE: DishView[]; SOUP: DishView[] },
  mustUseIds: string[],
): DishView[] | null {
  const remaining = new Set(mustUseIds);
  const picked: DishView[] = [];
  const pickedIds = new Set<string>();
  while (remaining.size > 0) {
    let best: DishView | null = null;
    let bestCover = 0;
    for (const pool of [pools.MAIN, pools.SIDE, pools.SOUP]) {
      for (const dish of pool) {
        if (pickedIds.has(dish.id)) continue;
        let cover = 0;
        for (const ing of dish.ingredients) {
          if (remaining.has(ing.ingredientId)) cover++;
        }
        if (cover > bestCover) {
          best = dish;
          bestCover = cover;
        }
      }
    }
    if (best === null || bestCover === 0) return null;
    picked.push(best);
    pickedIds.add(best.id);
    for (const id of dishIngredientIds(best)) remaining.delete(id);
  }
  return picked;
}

/** 定向选菜能否同桌：各角色代表菜数不超过该角色槽位数（STAPLE 不设槽，不应出现） */
function fitsSlots(picked: DishView[], mainSlots: number): boolean {
  const byRole: Record<'MAIN' | 'SIDE' | 'SOUP', number> = { MAIN: 0, SIDE: 0, SOUP: 0 };
  for (const dish of picked) {
    const role = dish.mealRole;
    if (role === 'STAPLE') return false;
    byRole[role] += 1;
  }
  return byRole.MAIN <= mainSlots && byRole.SIDE <= 1 && byRole.SOUP <= 1;
}

/**
 * 槽位组合主函数（PD-018）。
 * 生成顺序：覆盖轮转套（保宽集）-> 必消定向套（AC3，去重后追加）。
 * 每套虚拟菜单：MAIN 槽在前、SIDE 次之、SOUP 最后；
 * totalActiveMinutes = 各菜时长之和（AC4 明文口径：组合菜单各菜时长之和 ≤ 档位），
 * prepSequence 串行展开（与 planService v1 同构）。
 */
export function composeMenusByRole(
  dishes: DishView[],
  options: ComposeInput,
): CompositionResult {
  const { people, exclusions } = options;
  const excludeSet = new Set(options.excludeDishIds ?? []);
  const mainSlots = mainSlotCount(people);

  // 1. dish 级安全预过滤（AC2：禁菜绝不入槽）
  const safety = filterSafeDishes(dishes, exclusions);
  const safetyExcluded: Record<string, string> = {};
  for (const { dish, reason } of safety.excluded) {
    safetyExcluded[dish.id] = reason;
  }

  // 2. mealRole 归池（AC1）：MAIN/SIDE/SOUP 设槽，STAPLE 挂账不设槽；换批菜剔除
  const pools: Record<MealRole, DishView[]> = { MAIN: [], SIDE: [], SOUP: [], STAPLE: [] };
  for (const dish of safety.passed) {
    if (excludeSet.has(dish.id)) continue;
    pools[dish.mealRole].push(dish);
  }
  const poolSizes: Record<MealRole, number> = {
    MAIN: pools.MAIN.length,
    SIDE: pools.SIDE.length,
    SOUP: pools.SOUP.length,
    STAPLE: pools.STAPLE.length,
  };

  const virtualMenus: MenuView[] = [];
  const slotShortages: Record<string, string[]> = {};
  const contentSeen = new Set<string>();
  let seq = 0;

  /** 产出一套虚拟菜单（内容去重；全空桌不产出） */
  const emit = (
    picked: { MAIN: DishView[]; SIDE: DishView[]; SOUP: DishView[] },
    shortages: string[],
  ): void => {
    const dishesOut = [...picked.MAIN, ...picked.SIDE, ...picked.SOUP];
    if (dishesOut.length === 0) return;
    const key = dishesOut.map((d) => d.id).join('|');
    if (contentSeen.has(key)) return;
    contentSeen.add(key);
    seq += 1;
    const id = `virt-${String(seq).padStart(3, '0')}`;
    virtualMenus.push({
      id,
      name: `动态组合 #${seq}`,
      scene: 'WEEKDAY_FAST',
      serves: people,
      totalActiveMinutes: dishesOut.reduce((sum, d) => sum + d.activeMinutes, 0),
      prepSequence: buildPrepSequence(dishesOut),
      status: 'PUBLISHED',
      dishes: dishesOut,
    });
    if (shortages.length > 0) {
      slotShortages[id] = shortages;
    }
  };

  // 3. 覆盖轮转（保宽集）：MAIN 池每 mainSlots 道切一组，SIDE/SOUP 每套轮转一道；
  //    套数 = 各池覆盖所需的最大套数，每个安全菜至少出现一次
  const mainCount = pools.MAIN.length;
  const totalRounds = Math.max(
    Math.ceil(mainCount / mainSlots),
    pools.SIDE.length,
    pools.SOUP.length,
  );
  for (let k = 0; k < totalRounds; k++) {
    const mains = pools.MAIN.slice(k * mainSlots, (k + 1) * mainSlots);
    const side = pools.SIDE[k];
    const soup = pools.SOUP[k];
    const shortages: string[] = [];
    if (mains.length < mainSlots) {
      shortages.push(
        mainCount === 0
          ? `主菜槽缺${mainSlots}道：主菜池无可用菜（安全过滤后）`
          : `主菜槽缺${mainSlots - mains.length}道：主菜池仅${mainCount}道可用`,
      );
    }
    if (!side) {
      shortages.push(
        pools.SIDE.length === 0
          ? '配菜槽留空：配菜池无可用菜（安全过滤后）'
          : '配菜槽留空：配菜池无更多可用菜',
      );
    }
    if (!soup) {
      shortages.push(
        pools.SOUP.length === 0
          ? '汤槽留空：汤池无可用菜（安全过滤后）'
          : '汤槽留空：汤池无更多可用菜',
      );
    }
    emit(
      { MAIN: mains, SIDE: side ? [side] : [], SOUP: soup ? [soup] : [] },
      shortages,
    );
  }

  // 4. 必消定向套（AC3）：贪心覆盖菜同桌 + 空槽从池头确定性填充（只填安全池菜，不凑数）
  const mustUseIds = options.mustUseIngredientIds ?? [];
  if (mustUseIds.length > 0) {
    const coverPicked = pickMustUseCoverDishes(
      { MAIN: pools.MAIN, SIDE: pools.SIDE, SOUP: pools.SOUP },
      mustUseIds,
    );
    // 槽位冲突 -> 任何合法槽位组合都无法同桌覆盖全部必消，放弃定向套（空手为真实口径）
    if (coverPicked !== null && fitsSlots(coverPicked, mainSlots)) {
      const pickedIds = new Set(coverPicked.map((d) => d.id));
      const mainPicked = coverPicked.filter((d) => d.mealRole === 'MAIN');
      const sidePicked = coverPicked.filter((d) => d.mealRole === 'SIDE');
      const soupPicked = coverPicked.filter((d) => d.mealRole === 'SOUP');
      /** 从池头顺序取未用菜填满槽位（确定性；池尽则留空） */
      const fillSlots = (pool: DishView[], taken: DishView[], slots: number): DishView[] => {
        const out = [...taken];
        for (const dish of pool) {
          if (out.length >= slots) break;
          if (pickedIds.has(dish.id)) continue;
          out.push(dish);
        }
        return out;
      };
      const mains = fillSlots(pools.MAIN, mainPicked, mainSlots);
      const side = fillSlots(pools.SIDE, sidePicked, 1);
      const soup = fillSlots(pools.SOUP, soupPicked, 1);
      const shortages: string[] = [];
      if (mains.length < mainSlots) {
        shortages.push(
          mainCount === 0
            ? `主菜槽缺${mainSlots}道：主菜池无可用菜（安全过滤后）`
            : `主菜槽缺${mainSlots - mains.length}道：主菜池仅${mainCount}道可用`,
        );
      }
      if (side.length === 0) {
        shortages.push('配菜槽留空：配菜池无可用菜（安全过滤后）');
      }
      if (soup.length === 0) {
        shortages.push('汤槽留空：汤池无可用菜（安全过滤后）');
      }
      emit({ MAIN: mains, SIDE: side, SOUP: soup }, shortages);
    }
  }

  return { virtualMenus, slotShortages, poolSizes, safetyExcluded };
}
