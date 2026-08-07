// tools/content-pipeline/test/coverage.spec.ts
// AC12 单元测试：coverage 覆盖矩阵计算

import { describe, it, expect } from 'vitest';
import {
  computeCoverageGaps,
  inferMainProtein,
  findTimeBucket,
  gapToSlot,
  parseSlot,
  MAIN_PROTEINS,
  TIME_BUCKETS,
  EQUIPMENTS,
  SCENES,
  type CoverageDishView,
} from '../src/coverage.js';

describe('inferMainProtein', () => {
  it('从食材名推断主蛋白', () => {
    expect(inferMainProtein(['鸡肉'])).toBe('chicken');
    expect(inferMainProtein(['猪肉'])).toBe('pork');
    expect(inferMainProtein(['排骨'])).toBe('pork');
    expect(inferMainProtein(['牛腩'])).toBe('beef');
    expect(inferMainProtein(['鲈鱼'])).toBe('fish');
    expect(inferMainProtein(['虾仁'])).toBe('shrimp');
    expect(inferMainProtein(['鸡蛋'])).toBe('egg');
    expect(inferMainProtein(['豆腐'])).toBe('tofu');
  });

  it('无匹配返回 null', () => {
    expect(inferMainProtein(['番茄'])).toBeNull();
    expect(inferMainProtein(['土豆'])).toBeNull();
    expect(inferMainProtein([])).toBeNull();
  });

  it('取第一个匹配的食材', () => {
    expect(inferMainProtein(['番茄', '猪肉'])).toBe('pork');
    expect(inferMainProtein(['猪肉', '鸡肉'])).toBe('pork');
  });
});

describe('findTimeBucket', () => {
  it('<=15 -> 15', () => {
    expect(findTimeBucket(15)).toBe(15);
    expect(findTimeBucket(10)).toBe(15);
    expect(findTimeBucket(1)).toBe(15);
  });

  it('16-30 -> 30', () => {
    expect(findTimeBucket(30)).toBe(30);
    expect(findTimeBucket(20)).toBe(30);
    expect(findTimeBucket(16)).toBe(30);
  });

  it('31-60 -> 60', () => {
    expect(findTimeBucket(60)).toBe(60);
    expect(findTimeBucket(45)).toBe(60);
    expect(findTimeBucket(31)).toBe(60);
  });

  it('>60 -> null（不归入常用档）', () => {
    expect(findTimeBucket(90)).toBeNull();
    expect(findTimeBucket(61)).toBeNull();
  });
});

describe('computeCoverageGaps', () => {
  const fullSize = TIME_BUCKETS.length * MAIN_PROTEINS.length * EQUIPMENTS.length * SCENES.length;

  it('空列表 -> 全矩阵缺口', () => {
    const gaps = computeCoverageGaps([]);
    expect(gaps.length).toBe(fullSize); // 3*7*4*4 = 336
  });

  it('覆盖一个单元格 -> 缺口减1', () => {
    const fullGaps = computeCoverageGaps([]);
    const dish: CoverageDishView = {
      id: 'd1',
      totalMinutes: 15,
      equipment: ['wok'],
      mainProtein: 'chicken',
      scenes: ['WEEKDAY_FAST'],
    };
    const gaps = computeCoverageGaps([dish]);
    expect(gaps.length).toBe(fullGaps.length - 1);
    expect(
      gaps.find(
        (g) =>
          g.timeBudget === 15 &&
          g.mainProtein === 'chicken' &&
          g.equipment === 'wok' &&
          g.scene === 'WEEKDAY_FAST',
      ),
    ).toBeUndefined();
  });

  it('多器具多场景菜品覆盖多个单元格', () => {
    const fullGaps = computeCoverageGaps([]);
    const dish: CoverageDishView = {
      id: 'd1',
      totalMinutes: 15,
      equipment: ['wok', 'steamer'],
      mainProtein: 'chicken',
      scenes: ['WEEKDAY_FAST', 'WEEKEND'],
    };
    const gaps = computeCoverageGaps([dish]);
    // 1时长 × 1蛋白 × 2器具 × 2场景 = 4 单元格
    expect(gaps.length).toBe(fullGaps.length - 4);
  });

  it('mainProtein=null 的菜品不覆盖任何单元格', () => {
    const dish: CoverageDishView = {
      id: 'd1',
      totalMinutes: 15,
      equipment: ['wok'],
      mainProtein: null,
      scenes: ['WEEKDAY_FAST'],
    };
    expect(computeCoverageGaps([dish]).length).toBe(computeCoverageGaps([]).length);
  });

  it('totalMinutes>60 的菜品不覆盖任何单元格', () => {
    const dish: CoverageDishView = {
      id: 'd1',
      totalMinutes: 90,
      equipment: ['wok'],
      mainProtein: 'chicken',
      scenes: ['WEEKDAY_FAST'],
    };
    expect(computeCoverageGaps([dish]).length).toBe(computeCoverageGaps([]).length);
  });

  it('缺口按维度顺序稳定排列（同输入同输出）', () => {
    const dish: CoverageDishView = {
      id: 'd1',
      totalMinutes: 15,
      equipment: ['wok'],
      mainProtein: 'chicken',
      scenes: ['WEEKDAY_FAST'],
    };
    const a = computeCoverageGaps([dish]);
    const b = computeCoverageGaps([dish]);
    expect(a).toEqual(b);
  });

  it('缺口覆盖所有维度组合', () => {
    const gaps = computeCoverageGaps([]);
    const timeSet = new Set(gaps.map((g) => g.timeBudget));
    const proteinSet = new Set(gaps.map((g) => g.mainProtein));
    const eqSet = new Set(gaps.map((g) => g.equipment));
    const sceneSet = new Set(gaps.map((g) => g.scene));
    expect(timeSet.size).toBe(TIME_BUCKETS.length);
    expect(proteinSet.size).toBe(MAIN_PROTEINS.length);
    expect(eqSet.size).toBe(EQUIPMENTS.length);
    expect(sceneSet.size).toBe(SCENES.length);
  });
});

describe('gapToSlot / parseSlot', () => {
  it('gap -> slot -> parse 往返', () => {
    const gap = {
      timeBudget: 30,
      mainProtein: 'chicken' as const,
      equipment: 'wok',
      scene: 'WEEKDAY_FAST',
    };
    const slot = gapToSlot(gap);
    expect(slot).toBe('weekday_fast,chicken,30min');
    const parsed = parseSlot(slot);
    expect(parsed).toEqual({ scene: 'WEEKDAY_FAST', mainProtein: 'chicken', timeBudget: 30 });
  });

  it('非法 slot 抛错', () => {
    expect(() => parseSlot('invalid')).toThrow();
    expect(() => parseSlot('weekday_fast,chicken')).toThrow(); // 缺字段
    expect(() => parseSlot('weekday_fast,chicken,30')).toThrow(); // 缺 min
    expect(() => parseSlot('invalid_scene,chicken,30min')).toThrow();
    expect(() => parseSlot('weekday_fast,invalid_protein,30min')).toThrow();
    expect(() => parseSlot('weekday_fast,chicken,99min')).toThrow(); // 非法时长档
  });

  it('所有合法 slot 可往返', () => {
    for (const scene of SCENES) {
      for (const protein of MAIN_PROTEINS) {
        for (const tb of TIME_BUCKETS) {
          const slot = `${scene.toLowerCase()},${protein},${tb}min`;
          const parsed = parseSlot(slot);
          expect(parsed.scene).toBe(scene);
          expect(parsed.mainProtein).toBe(protein);
          expect(parsed.timeBudget).toBe(tb);
        }
      }
    }
  });
});
