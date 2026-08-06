// packages/engine/src/diversify.ts
// 第四层多样化：取 Top-N 后错开主蛋白/风格，输出 3 套 + 每套 reasons[]（4.1 第 276 行）
import type { MenuView, ScoredMenu } from './types.js';

/** 获取菜单的主蛋白集合（食材 category='肉类' 的 ingredientId） */
function getMenuProteins(menu: MenuView | undefined): Set<string> {
  const proteins = new Set<string>();
  if (!menu) return proteins;
  for (const dish of menu.dishes) {
    for (const ing of dish.ingredients) {
      if (ing.category === '肉类') proteins.add(ing.ingredientId);
    }
  }
  return proteins;
}

/** 获取菜单的风格标识（首个菜品 cuisine，否则 scene） */
function getMenuStyle(menu: MenuView | undefined): string {
  if (!menu) return '';
  return menu.dishes.find((d) => d.cuisine)?.cuisine ?? menu.scene;
}

/** 判断两组主蛋白是否完全不交集 */
function proteinsDisjoint(a: Set<string>, b: Set<string>): boolean {
  for (const p of a) {
    if (b.has(p)) return false;
  }
  return true;
}

/**
 * 第四层多样化（4.1 第 276 行）。
 * 取 Top-N 后错开主蛋白/风格，输出 3 套 + reasons[]。
 * 策略：候选1 取最高分；候选2-3 优先选主蛋白不交集的，其次风格不同的，最后按分数补足。
 * 不足 3 套时如实返回（recommend 主函数负责说明）。
 */
export function diversify(
  scored: ScoredMenu[],
  library: MenuView[],
): ScoredMenu[] {
  if (scored.length <= 3) return scored;

  const menuMap = new Map(library.map((m) => [m.id, m]));
  const result: ScoredMenu[] = [];
  const usedProteins = new Set<string>();
  const usedStyles = new Set<string>();
  const remaining = [...scored];

  // 候选1：最高分
  const first = remaining.shift()!;
  result.push(first);
  const firstMenu = menuMap.get(first.menuId);
  for (const p of getMenuProteins(firstMenu)) usedProteins.add(p);
  usedStyles.add(getMenuStyle(firstMenu));

  // 候选2-3
  for (let slot = 1; slot < 3 && remaining.length > 0; slot++) {
    let picked: ScoredMenu | undefined;
    let pickedIndex = -1;

    // 第一轮：主蛋白完全不交集
    for (let i = 0; i < remaining.length; i++) {
      const menu = menuMap.get(remaining[i].menuId);
      const proteins = getMenuProteins(menu);
      if (proteinsDisjoint(proteins, usedProteins)) {
        picked = remaining[i];
        pickedIndex = i;
        break;
      }
    }

    // 第二轮：主蛋白有交集但风格不同
    if (picked === undefined) {
      for (let i = 0; i < remaining.length; i++) {
        const menu = menuMap.get(remaining[i].menuId);
        const style = getMenuStyle(menu);
        if (!usedStyles.has(style)) {
          picked = remaining[i];
          pickedIndex = i;
          break;
        }
      }
    }

    // 第三轮：按分数补足（取剩余最高分）
    if (picked === undefined) {
      picked = remaining[0];
      pickedIndex = 0;
    }

    result.push(picked);
    remaining.splice(pickedIndex, 1);
    const pickedMenu = menuMap.get(picked.menuId);
    for (const p of getMenuProteins(pickedMenu)) usedProteins.add(p);
    usedStyles.add(getMenuStyle(pickedMenu));
    if (!picked.reasons.includes('与已选菜单错开主蛋白/风格')) {
      picked.reasons.push('与已选菜单错开主蛋白/风格');
    }
  }

  return result;
}
