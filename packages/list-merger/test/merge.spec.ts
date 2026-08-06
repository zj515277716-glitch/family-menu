// packages/list-merger/test/merge.spec.ts
// 采购清单合并测试：归一 -> 换算 -> 分组 -> 去常备（4.4）
// 错误率 <1% 门槛（9.2 故障点）
import { describe, it, expect } from 'vitest';
import {
  mergeShoppingList,
  DEFAULT_PANTRY_STAPLES,
  normalize,
  canConvert,
  convert,
  mergeQuantities,
  type ShoppingIngredient,
  type ShoppingMenu,
} from '../src/index.js';

// ───── 工具函数 ─────

function ing(
  id: string,
  name: string,
  aliases: string[],
  category: string,
  defaultUnit: string,
  qty: number,
  unit: string,
  optional = false,
): ShoppingIngredient {
  return {
    ingredientId: id,
    ingredientName: name,
    aliases,
    category,
    defaultUnit,
    qty,
    unit,
    optional,
  };
}

function makeMenu(dishes: ShoppingIngredient[][]): ShoppingMenu {
  return {
    id: 'menu-1',
    name: '测试套餐',
    dishes: dishes.map((ingredients) => ({ ingredients })),
  };
}

// ───── units.ts ─────

describe('units 单位换算', () => {
  it('canConvert: g/kg 互通', () => {
    expect(canConvert('g', 'kg')).toBe(true);
    expect(canConvert('kg', 'g')).toBe(true);
  });

  it('canConvert: ml/l 互通', () => {
    expect(canConvert('ml', 'l')).toBe(true);
    expect(canConvert('l', 'ml')).toBe(true);
  });

  it('canConvert: g/个 不互通', () => {
    expect(canConvert('g', '个')).toBe(false);
    expect(canConvert('个', 'g')).toBe(false);
  });

  it('convert: 1kg -> 1000g', () => {
    expect(convert(1, 'kg', 'g')).toBe(1000);
  });

  it('convert: 500g -> 0.5kg', () => {
    expect(convert(500, 'g', 'kg')).toBe(0.5);
  });

  it('convert: 同单位原值返回', () => {
    expect(convert(100, 'g', 'g')).toBe(100);
  });

  it('convert: 不可换算返回 null', () => {
    expect(convert(100, 'g', '个')).toBeNull();
  });

  it('mergeQuantities: 全可换算合并到 defaultUnit', () => {
    const result = mergeQuantities(
      [{ qty: 500, unit: 'g' }, { qty: 1, unit: 'kg' }],
      'g',
    );
    expect(result).toEqual([{ qty: 1500, unit: 'g' }]);
  });

  it('mergeQuantities: 部分不可换算保留原单位', () => {
    const result = mergeQuantities(
      [{ qty: 200, unit: 'g' }, { qty: 2, unit: '个' }],
      'g',
    );
    expect(result).toContainEqual({ qty: 200, unit: 'g' });
    expect(result).toContainEqual({ qty: 2, unit: '个' });
  });

  it('mergeQuantities: 全不可换算按单位分组', () => {
    const result = mergeQuantities(
      [{ qty: 1, unit: '个' }, { qty: 2, unit: '个' }, { qty: 100, unit: 'ml' }],
      'g',
    );
    expect(result).toContainEqual({ qty: 3, unit: '个' });
    expect(result).toContainEqual({ qty: 100, unit: 'ml' });
  });

  it('mergeQuantities: 浮点四舍五入到2位', () => {
    const result = mergeQuantities(
      [{ qty: 0.1, unit: 'kg' }, { qty: 0.2, unit: 'kg' }],
      'g',
    );
    expect(result).toEqual([{ qty: 300, unit: 'g' }]);
  });
});

// ───── normalize.ts ─────

describe('normalize 别名归一', () => {
  it('同 ingredientId 归一为一组', () => {
    const result = normalize([
      ing('a', '番茄', ['西红柿'], '蔬菜', 'g', 100, 'g'),
      ing('a', '番茄', ['西红柿'], '蔬菜', 'g', 200, 'g'),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].canonicalId).toBe('a');
    expect(result[0].entries).toHaveLength(2);
  });

  it('不同 id 但 name/aliases 重叠 -> 归一为一组（番茄/西红柿）', () => {
    const result = normalize([
      ing('ing-tomato', '番茄', ['西红柿'], '蔬菜', 'g', 100, 'g'),
      ing('ing-xihongshi', '西红柿', ['番茄'], '蔬菜', 'g', 200, 'g'),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].entries).toHaveLength(2);
  });

  it('无交集的食材各自独立', () => {
    const result = normalize([
      ing('a', '番茄', ['西红柿'], '蔬菜', 'g', 100, 'g'),
      ing('b', '牛肉', [], '肉类', 'g', 200, 'g'),
    ]);
    expect(result).toHaveLength(2);
  });

  it('空输入返回空数组', () => {
    expect(normalize([])).toHaveLength(0);
  });
});

// ───── mergeShoppingList 集成 ─────

describe('mergeShoppingList 合并采购清单（4.4）', () => {
  it('同食材合并 + 单位换算', () => {
    const menu = makeMenu([
      [
        ing('ing-tomato', '番茄', ['西红柿'], '蔬菜', 'g', 500, 'g'),
        ing('ing-egg', '鸡蛋', [], '蛋奶', '个', 2, '个'),
      ],
      [
        ing('ing-tomato', '番茄', ['西红柿'], '蔬菜', 'g', 1, 'kg'),
      ],
    ]);
    const result = mergeShoppingList(menu);
    const tomatoItem = result.groups
      .flatMap((g) => g.items)
      .find((i) => i.ingredientId === 'ing-tomato');
    expect(tomatoItem).toBeDefined();
    expect(tomatoItem!.qty).toBe(1500);
    expect(tomatoItem!.unit).toBe('g');
  });

  it('别名归一合并（番茄/西红柿不同 id）', () => {
    const menu = makeMenu([
      [ing('ing-tomato', '番茄', ['西红柿'], '蔬菜', 'g', 200, 'g')],
      [ing('ing-xihongshi', '西红柿', ['番茄'], '蔬菜', 'g', 300, 'g')],
    ]);
    const result = mergeShoppingList(menu);
    const vegGroup = result.groups.find((g) => g.category === '蔬菜');
    expect(vegGroup).toBeDefined();
    expect(vegGroup!.items).toHaveLength(1);
    expect(vegGroup!.items[0].qty).toBe(500);
  });

  it('按 category 分组', () => {
    const menu = makeMenu([
      [
        ing('ing-tomato', '番茄', [], '蔬菜', 'g', 100, 'g'),
        ing('ing-beef', '牛肉', [], '肉类', 'g', 200, 'g'),
        ing('ing-rice', '大米', [], '主食', 'g', 300, 'g'),
      ],
    ]);
    const result = mergeShoppingList(menu);
    const categories = result.groups.map((g) => g.category);
    expect(categories).toContain('蔬菜');
    expect(categories).toContain('肉类');
    expect(categories).toContain('主食');
  });

  it('分组按 CATEGORIES 顺序排列', () => {
    const menu = makeMenu([
      [
        ing('ing-rice', '大米', [], '主食', 'g', 100, 'g'),
        ing('ing-tomato', '番茄', [], '蔬菜', 'g', 100, 'g'),
        ing('ing-beef', '牛肉', [], '肉类', 'g', 100, 'g'),
      ],
    ]);
    const result = mergeShoppingList(menu);
    const categories = result.groups.map((g) => g.category);
    // CATEGORIES = ['蔬菜','肉类','水产','蛋奶','调料','主食']
    expect(categories.indexOf('蔬菜')).toBeLessThan(categories.indexOf('肉类'));
    expect(categories.indexOf('肉类')).toBeLessThan(categories.indexOf('主食'));
  });

  it('去除家庭常备调料（默认清单）', () => {
    const menu = makeMenu([
      [
        ing('ing-salt', '盐', [], '调料', 'g', 5, 'g'),
        ing('ing-tomato', '番茄', [], '蔬菜', 'g', 100, 'g'),
      ],
    ]);
    const result = mergeShoppingList(menu);
    const items = result.groups.flatMap((g) => g.items);
    expect(items.find((i) => i.name === '盐')).toBeUndefined();
    expect(items.find((i) => i.name === '番茄')).toBeDefined();
  });

  it('按别名去除常备', () => {
    const menu = makeMenu([
      [
        ing('ing-garlic', '蒜', ['大蒜'], '调料', 'g', 10, 'g'),
        ing('ing-tomato', '番茄', [], '蔬菜', 'g', 100, 'g'),
      ],
    ]);
    const result = mergeShoppingList(menu);
    const items = result.groups.flatMap((g) => g.items);
    expect(items.find((i) => i.name === '蒜')).toBeUndefined();
  });

  it('自定义常备清单', () => {
    const menu = makeMenu([
      [
        ing('ing-tomato', '番茄', [], '蔬菜', 'g', 100, 'g'),
        ing('ing-beef', '牛肉', [], '肉类', 'g', 200, 'g'),
      ],
    ]);
    const result = mergeShoppingList(menu, {
      pantryStaples: new Set(['ing-beef']),
    });
    const items = result.groups.flatMap((g) => g.items);
    expect(items.find((i) => i.ingredientId === 'ing-beef')).toBeUndefined();
    expect(items.find((i) => i.ingredientId === 'ing-tomato')).toBeDefined();
  });

  it('空菜单返回空分组', () => {
    const menu: ShoppingMenu = { id: 'empty', name: '空', dishes: [] };
    const result = mergeShoppingList(menu);
    expect(result.groups).toHaveLength(0);
  });

  it('checked 初始为 false', () => {
    const menu = makeMenu([
      [ing('ing-tomato', '番茄', [], '蔬菜', 'g', 100, 'g')],
    ]);
    const result = mergeShoppingList(menu);
    const items = result.groups.flatMap((g) => g.items);
    expect(items.every((i) => i.checked === false)).toBe(true);
  });

  it('DEFAULT_PANTRY_STAPLES 含基础调料', () => {
    expect(DEFAULT_PANTRY_STAPLES.has('盐')).toBe(true);
    expect(DEFAULT_PANTRY_STAPLES.has('酱油')).toBe(true);
    expect(DEFAULT_PANTRY_STAPLES.has('食用油')).toBe(true);
  });

  it('不可换算单位保留多条', () => {
    const menu = makeMenu([
      [
        ing('ing-egg', '鸡蛋', [], '蛋奶', '个', 2, '个'),
        ing('ing-egg', '鸡蛋', [], '蛋奶', '个', 50, 'g'),
      ],
    ]);
    const result = mergeShoppingList(menu);
    const eggGroup = result.groups.find((g) => g.category === '蛋奶');
    expect(eggGroup).toBeDefined();
    expect(eggGroup!.items.filter((i) => i.name === '鸡蛋')).toHaveLength(2);
  });

  it('未分类 category 追加到末尾', () => {
    const menu = makeMenu([
      [ing('ing-xxx', '特殊食材', [], '其他', 'g', 100, 'g')],
    ]);
    const result = mergeShoppingList(menu);
    const lastGroup = result.groups[result.groups.length - 1];
    expect(lastGroup.category).toBe('其他');
  });
});
