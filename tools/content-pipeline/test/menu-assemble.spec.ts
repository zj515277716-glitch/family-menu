// tools/content-pipeline/test/menu-assemble.spec.ts
// TP-06 单元测试：菜单组装纯函数（纯规则零 LLM）

import { describe, it, expect } from 'vitest';
import {
  assembleOneMenu,
  buildPrepSequence,
  pickSide,
  type AccompanimentPool,
  type AssembleDishRef,
} from '../src/menu-assemble.js';

const main: AssembleDishRef = {
  id: 'dish-main',
  name: '测试主菜',
  mealRole: 'MAIN',
  activeMinutes: 10,
  steps: [
    { order: 2, text: '步骤二' },
    { order: 1, text: '步骤一' },
  ],
};

const sideA: AssembleDishRef = {
  id: 'dish-side-a',
  name: '蒜蓉青菜',
  mealRole: 'SIDE',
  activeMinutes: 5,
  steps: [{ order: 1, text: '炒青菜' }],
};

const sideB: AssembleDishRef = {
  id: 'dish-side-b',
  name: '凉拌黄瓜',
  mealRole: 'SIDE',
  activeMinutes: 5,
  steps: [{ order: 1, text: '拌黄瓜' }],
};

const soup: AssembleDishRef = {
  id: 'dish-soup',
  name: '紫菜蛋花汤',
  mealRole: 'SOUP',
  activeMinutes: 5,
  steps: [
    { order: 1, text: '烧水' },
    { order: 2, text: '下紫菜蛋花' },
  ],
};

const staple: AssembleDishRef = {
  id: 'dish-staple',
  name: '蛋炒饭',
  mealRole: 'STAPLE',
  activeMinutes: 8,
  steps: [{ order: 1, text: '炒饭' }],
};

const pool: AccompanimentPool = { sides: [sideA, sideB], soup, staple };

describe('buildPrepSequence', () => {
  it('按 order 排序步骤并顺序展开分钟', () => {
    // main: activeMinutes=10，2 步 -> perStep=ceil(10/2)=5 -> minute 0, 5
    const seq = buildPrepSequence([main]);
    expect(seq).toEqual([
      { minute: 0, action: '步骤一' },
      { minute: 5, action: '步骤二' },
    ]);
  });

  it('多菜依次衔接，cursor 单调递增', () => {
    // main 10 分钟 2 步 -> 0,5；soup 5 分钟 2 步 -> perStep=3 -> 10,13
    const seq = buildPrepSequence([main, soup]);
    expect(seq.map((s) => s.minute)).toEqual([0, 5, 10, 13]);
    expect(seq[2].action).toBe('烧水');
  });

  it('steps 为空的菜如实占位并前进工时', () => {
    const empty: AssembleDishRef = { id: 'dish-x', name: '空菜', mealRole: 'MAIN', activeMinutes: 7, steps: [] };
    const seq = buildPrepSequence([empty]);
    expect(seq).toEqual([{ minute: 0, action: '做「空菜」' }]);
    // cursor 前进 ceil(7)=7
    const seq2 = buildPrepSequence([empty, sideA]);
    expect(seq2[1].minute).toBe(7);
  });
});

describe('pickSide', () => {
  it('按 menuId 尾号轮换配菜（01->A, 02->B, 03->A 循环）', () => {
    expect(pickSide('pipeline-menu-01', [sideA, sideB]).id).toBe('dish-side-a');
    expect(pickSide('pipeline-menu-02', [sideA, sideB]).id).toBe('dish-side-b');
    expect(pickSide('pipeline-menu-03', [sideA, sideB]).id).toBe('dish-side-a');
  });

  it('配菜池为空抛错', () => {
    expect(() => pickSide('pipeline-menu-01', [])).toThrow('配菜池为空');
  });
});

describe('assembleOneMenu', () => {
  it('WEEKDAY_FAST：3 菜（主菜+配菜+汤），status 恒为 DRAFT', () => {
    const menu = assembleOneMenu({ menuId: 'pipeline-menu-01', scene: 'WEEKDAY_FAST', main }, pool);
    expect(menu.status).toBe('DRAFT');
    expect(menu.dishes).toEqual([
      { dishId: 'dish-main', sort: 1 },
      { dishId: 'dish-side-a', sort: 2 },
      { dishId: 'dish-soup', sort: 3 },
    ]);
    expect(menu.serves).toBe(4);
  });

  it('WEEKEND：4 菜（加主食 sort=4）', () => {
    const menu = assembleOneMenu({ menuId: 'pipeline-menu-08', scene: 'WEEKEND', main }, pool);
    expect(menu.dishes.length).toBe(4);
    expect(menu.dishes[3]).toEqual({ dishId: 'dish-staple', sort: 4 });
  });

  it('totalActiveMinutes = 各菜之和', () => {
    const weekday = assembleOneMenu({ menuId: 'pipeline-menu-01', scene: 'WEEKDAY_FAST', main }, pool);
    expect(weekday.totalActiveMinutes).toBe(10 + 5 + 5);
    const weekend = assembleOneMenu({ menuId: 'pipeline-menu-08', scene: 'WEEKEND', main }, pool);
    expect(weekend.totalActiveMinutes).toBe(10 + 5 + 5 + 8);
  });

  it('菜单名缺省 = 主菜名+套餐，可自定义', () => {
    const menu = assembleOneMenu({ menuId: 'pipeline-menu-01', scene: 'WEEKDAY_FAST', main }, pool);
    expect(menu.name).toBe('测试主菜套餐');
    const named = assembleOneMenu({ menuId: 'pipeline-menu-01', scene: 'WEEKDAY_FAST', main, name: '自定义名' }, pool);
    expect(named.name).toBe('自定义名');
  });

  it('prepSequence 首项 minute=0 且单调不减', () => {
    const menu = assembleOneMenu({ menuId: 'pipeline-menu-08', scene: 'WEEKEND', main }, pool);
    expect(menu.prepSequence[0].minute).toBe(0);
    for (let i = 1; i < menu.prepSequence.length; i++) {
      expect(menu.prepSequence[i].minute).toBeGreaterThanOrEqual(menu.prepSequence[i - 1].minute);
    }
  });
});
