// packages/list-merger/test/day-merge.spec.ts
// 三餐合并测试（T-Q10/C-4）：合并去重 + 成人/儿童换算凑整 + 必消标已有不删
// + 常备调料不出现 + 备菜建议分今晚预处理/明早先做
import { describe, it, expect } from 'vitest';
import {
  mergeDayShoppingList,
  type DayShoppingDish,
  type DayShoppingMenu,
  type ShoppingIngredient,
} from '../src/index.js';

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

function dish(name: string, ingredients: ShoppingIngredient[], steps: Array<{ order: number; text: string }>): DayShoppingDish {
  return { name, ingredients, steps };
}

/** 早餐：鸡蛋饼（泡、腌工序在午晚餐菜上更典型，早餐放常规工序） */
const breakfastMenu: DayShoppingMenu = {
  slot: 'breakfast',
  dishes: [
    dish('鸡蛋饼', [ing('egg', '鸡蛋', [], '蛋奶', '个', 3, '个')], [
      { order: 1, text: '面粉加水调成糊' },
      { order: 2, text: '平底锅摊至两面金黄' },
    ]),
    dish('小米粥', [ing('millet', '小米', [], '主食', 'g', 80, 'g')], [
      { order: 1, text: '小米淘洗后加水煮 25 分钟' },
    ]),
  ],
};

const lunchMenu: DayShoppingMenu = {
  slot: 'lunch',
  dishes: [
    dish('青椒肉丝', [
      ing('pork', '猪肉', ['里脊'], '肉类', 'g', 300, 'g'),
      ing('pepper', '青椒', ['柿子椒'], '蔬菜', 'g', 200, 'g'),
      ing('soy', '酱油', [], '调料', 'ml', 15, 'ml'),
      ing('salt', '盐', [], '调料', 'g', 3, 'g'),
    ], [
      { order: 1, text: '肉丝加酱油腌制 15 分钟' },
    ]),
  ],
};

const dinnerMenu: DayShoppingMenu = {
  slot: 'dinner',
  dishes: [
    dish('木耳炒山药', [
      ing('wood-ear', '木耳', ['黑木耳'], '蔬菜', 'g', 30, 'g'),
      ing('salt2', '盐', [], '调料', 'g', 2, 'g'),
    ], [
      { order: 1, text: '木耳提前泡发 2 小时' },
    ]),
    dish('牛排', [ing('beef', '牛排', [], '肉类', 'g', 400, 'g')], [
      { order: 1, text: '冷藏解冻后回温' },
    ]),
  ],
};

describe('mergeDayShoppingList：三餐合并去重', () => {
  it('三餐食材合并一张清单，跨餐同名/别名食材合并（盐两餐各一次）', () => {
    const result = mergeDayShoppingList([breakfastMenu, lunchMenu, dinnerMenu], {
      adults: 4,
      children: 0,
    });
    const saltItems = result.groups.flatMap((g) => g.items).filter((i) => i.name === '盐');
    // 常备调料非必消不出现——盐命中 DEFAULT_PANTRY_STAPLES 被剔除
    expect(saltItems).toHaveLength(0);
    // 木耳（30g）与小米（80g）等非常备食材在列
    const names = result.groups.flatMap((g) => g.items.map((i) => i.name));
    expect(names).toContain('小米');
    expect(names).toContain('木耳');
  });

  it('必消命中常备调料时保留并标已有（PD-004 优先于 C-4 精简）', () => {
    const result = mergeDayShoppingList([lunchMenu], {
      adults: 4,
      children: 0,
      alreadyHaveIds: new Set(['salt']),
    });
    const salt = result.groups.flatMap((g) => g.items).find((i) => i.name === '盐');
    expect(salt).toBeDefined();
    expect(salt?.alreadyHave).toBe(true);
  });

  it('必消非调料标已有且不删', () => {
    const result = mergeDayShoppingList([dinnerMenu], {
      adults: 4,
      children: 0,
      alreadyHaveIds: new Set(['wood-ear']),
    });
    const woodEar = result.groups.flatMap((g) => g.items).find((i) => i.name === '木耳');
    expect(woodEar).toBeDefined();
    expect(woodEar?.alreadyHave).toBe(true);
  });
});

describe('mergeDayShoppingList：成人/儿童换算凑整', () => {
  it('人数=成人+儿童：3 成人+1 儿童（=4 人基准）不缩放，400g 牛排原量', () => {
    const result = mergeDayShoppingList([dinnerMenu], { adults: 3, children: 1 });
    const beef = result.groups.flatMap((g) => g.items).find((i) => i.name === '牛排');
    expect(beef?.qty).toBe(400);
  });

  it('2 成人+2 儿童=4 人基准不缩放；6 人按 1.5 倍缩放向上取整', () => {
    const result = mergeDayShoppingList([dinnerMenu], { adults: 6, children: 0 });
    // 木耳 30g × 1.5 = 45
    const woodEar = result.groups.flatMap((g) => g.items).find((i) => i.name === '木耳');
    expect(woodEar?.qty).toBe(45);
  });

  it('儿童参与口径：1 成人+1 儿童=2 人按 0.5 倍缩放，最小 1 不归零', () => {
    const result = mergeDayShoppingList([dinnerMenu], { adults: 1, children: 1 });
    // 木耳 30g × 0.5 = 15
    const woodEar = result.groups.flatMap((g) => g.items).find((i) => i.name === '木耳');
    expect(woodEar?.qty).toBe(15);
  });
});

describe('mergeDayShoppingList：备菜建议', () => {
  it('泡/腌/解冻工序入今晚预处理（泡发木耳/腌制肉丝/解冻牛排）', () => {
    const result = mergeDayShoppingList([breakfastMenu, lunchMenu, dinnerMenu], {
      adults: 4,
      children: 0,
    });
    expect(result.prepAdvice.tonight).toContain('木耳炒山药：木耳提前泡发 2 小时');
    expect(result.prepAdvice.tonight).toContain('青椒肉丝：肉丝加酱油腌制 15 分钟');
    expect(result.prepAdvice.tonight).toContain('牛排：冷藏解冻后回温');
  });

  it('早餐工序（非泡/腌/解冻）入明早先做', () => {
    const result = mergeDayShoppingList([breakfastMenu, lunchMenu, dinnerMenu], {
      adults: 4,
      children: 0,
    });
    expect(result.prepAdvice.tomorrowMorning).toContain('鸡蛋饼：面粉加水调成糊');
    expect(result.prepAdvice.tomorrowMorning).toContain('小米粥：小米淘洗后加水煮 25 分钟');
    // 午晚餐工序不进明早清单
    expect(result.prepAdvice.tomorrowMorning.every((s) => !s.includes('肉丝'))).toBe(true);
  });

  it('同一工序同时是早餐+泡/腌：按今晚预处理归置（今晚优先）', () => {
    const menu: DayShoppingMenu = {
      slot: 'breakfast',
      dishes: [
        dish('红豆粥', [ing('red-bean', '红豆', [], '主食', 'g', 50, 'g')], [
          { order: 1, text: '红豆提前泡 4 小时' },
        ]),
      ],
    };
    const result = mergeDayShoppingList([menu], { adults: 4, children: 0 });
    expect(result.prepAdvice.tonight).toContain('红豆粥：红豆提前泡 4 小时');
    expect(result.prepAdvice.tomorrowMorning).not.toContain('红豆粥：红豆提前泡 4 小时');
  });
});
