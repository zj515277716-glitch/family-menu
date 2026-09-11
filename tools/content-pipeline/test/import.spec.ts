// tools/content-pipeline/test/import.spec.ts
// AC12 单元测试：import 校验 + 双保险（mock writer）
// T-C03 追加：origin 显式授权（R-4 处置）回归——默认路径不削弱，FETCHED 仅经显式授权放行

import { describe, it, expect, vi } from 'vitest';
import { importDraft, normalizeOriginOption, prepareDraftDish, type DraftWriter } from '../src/import.js';

// 合法草稿 JSON（draft 产出格式）
const validDraft = {
  id: 'draft-1',
  name: '测试菜',
  mealRole: 'MAIN',
  cuisine: '家常',
  flavorTags: ['清淡'],
  spicyLevel: 0,
  splitFlavor: false,
  activeMinutes: 10,
  totalMinutes: 15,
  equipment: ['wok'],
  steps: [{ order: 1, text: 'step1', parallel: false }],
  status: 'DRAFT',
  origin: 'LLM_DRAFT',
  ingredients: [
    { name: '番茄', category: '蔬菜', defaultUnit: 'g', qty: 200, unit: 'g', optional: false },
  ],
};

describe('prepareDraftDish', () => {
  it('合法 JSON 通过校验', () => {
    const input = prepareDraftDish(validDraft);
    expect(input.name).toBe('测试菜');
    expect(input.mealRole).toBe('MAIN');
    expect(input.ingredients.length).toBe(1);
    expect(input.ingredients[0].name).toBe('番茄');
    expect(input.ingredients[0].qty).toBe(200);
  });

  it('强制 status=DRAFT origin=LLM_DRAFT（双保险第一层）', () => {
    const pub = { ...validDraft, status: 'PUBLISHED', origin: 'MANUAL' };
    const input = prepareDraftDish(pub);
    expect(input.status).toBe('DRAFT');
    expect(input.origin).toBe('LLM_DRAFT');
  });

  it('status/origin 为字面量类型（双保险第二层，编译期锁定）', () => {
    const input = prepareDraftDish(validDraft);
    // 编译时类型保证：input.status 只能是 'DRAFT'
    const status: 'DRAFT' = input.status;
    const origin: 'LLM_DRAFT' = input.origin;
    expect(status).toBe('DRAFT');
    expect(origin).toBe('LLM_DRAFT');
  });

  it('非法 JSON 失败', () => {
    expect(() => prepareDraftDish({})).toThrow();
    expect(() => prepareDraftDish('invalid')).toThrow();
    expect(() => prepareDraftDish({ name: 'x' })).toThrow(); // 缺必填字段
  });

  it('mealRole 非法值失败', () => {
    const bad = { ...validDraft, mealRole: 'INVALID' };
    expect(() => prepareDraftDish(bad)).toThrow();
  });

  it('接受 JSON 字符串输入', () => {
    const input = prepareDraftDish(JSON.stringify(validDraft));
    expect(input.name).toBe('测试菜');
  });

  // ───── T-C01：imageUrl/sourceUrl/sourceSite 透传 ─────

  it('T-C01 带三新字段的草稿透传到写入数据', () => {
    const fetched = {
      ...validDraft,
      imageUrl: 'https://i.xiachufang.com/recipe/cover.jpg',
      sourceUrl: 'https://www.xiachufang.com/recipe/106733852/',
      sourceSite: 'xiachufang',
    };
    const input = prepareDraftDish(fetched);
    expect(input.imageUrl).toBe('https://i.xiachufang.com/recipe/cover.jpg');
    expect(input.sourceUrl).toBe('https://www.xiachufang.com/recipe/106733852/');
    expect(input.sourceSite).toBe('xiachufang');
  });

  it('T-C01 旧草稿（无新字段）缺省不落库（undefined）', () => {
    const input = prepareDraftDish(validDraft);
    expect(input.imageUrl).toBeUndefined();
    expect(input.sourceUrl).toBeUndefined();
    expect(input.sourceSite).toBeUndefined();
  });

  it('T-C01 新字段为非法 URL 时校验拒绝', () => {
    expect(() =>
      prepareDraftDish({ ...validDraft, imageUrl: 'not-a-url' }),
    ).toThrow();
    expect(() =>
      prepareDraftDish({ ...validDraft, sourceUrl: 'xiachufang.com/recipe/1' }),
    ).toThrow();
  });

  it('T-C01 新字段为空字符串时校验拒绝（URL 非法）', () => {
    expect(() => prepareDraftDish({ ...validDraft, imageUrl: '' })).toThrow();
  });

  // ───── T-P09：imageUrl 口径放宽（http(s) 绝对 URL 或 /images/ 相对路径二选一，契约 v0.7）─────

  it('T-P09 imageUrl 为 /images/ 相对路径通过（R-10 相对路径入库）', () => {
    const input = prepareDraftDish({
      ...validDraft,
      imageUrl: '/images/dishes/6a55c68e000000001c025017/0.webp',
    });
    expect(input.imageUrl).toBe('/images/dishes/6a55c68e000000001c025017/0.webp');
  });

  it('T-P09 imageUrl http(s) 绝对 URL 仍通过（放宽不收窄）', () => {
    const input = prepareDraftDish({
      ...validDraft,
      imageUrl: 'http://i.xiachufang.com/recipe/cover.jpg',
    });
    expect(input.imageUrl).toBe('http://i.xiachufang.com/recipe/cover.jpg');
  });

  it('T-P09 imageUrl 既非 URL 又非 /images/ 相对路径拒绝', () => {
    expect(() => prepareDraftDish({ ...validDraft, imageUrl: 'foo/bar.jpg' })).toThrow();
    // 缺前导斜杠：两个分支都不匹配
    expect(() =>
      prepareDraftDish({ ...validDraft, imageUrl: 'images/dishes/abc/0.webp' }),
    ).toThrow();
  });

  it('T-P09 imageUrl 空串拒绝（保持既有行为）', () => {
    expect(() => prepareDraftDish({ ...validDraft, imageUrl: '' })).toThrow();
  });
});

describe('importDraft', () => {
  it('调用 writer upsert + create', async () => {
    const writer: DraftWriter = {
      upsertIngredient: vi.fn().mockResolvedValue({ id: 'ing-1' }),
      createDishWithIngredients: vi.fn().mockResolvedValue({ id: 'dish-1' }),
    };
    const result = await importDraft(validDraft, writer);
    expect(result.dishId).toBe('dish-1');
    expect(result.ingredientCount).toBe(1);
    expect(writer.upsertIngredient).toHaveBeenCalledTimes(1);
    expect(writer.createDishWithIngredients).toHaveBeenCalledTimes(1);
  });

  it('双保险：写入数据 status/origin 恒为 DRAFT/LLM_DRAFT', async () => {
    const writer: DraftWriter = {
      upsertIngredient: vi.fn().mockResolvedValue({ id: 'ing-1' }),
      createDishWithIngredients: vi.fn().mockImplementation(async (input) => {
        expect(input.dish.status).toBe('DRAFT');
        expect(input.dish.origin).toBe('LLM_DRAFT');
        return { id: 'dish-1' };
      }),
    };
    const pub = { ...validDraft, status: 'PUBLISHED', origin: 'MANUAL' };
    const result = await importDraft(pub, writer);
    expect(result.dishId).toBe('dish-1');
  });

  it('多食材 -> 多次 upsert', async () => {
    const multi = {
      ...validDraft,
      ingredients: [
        { name: '番茄', category: '蔬菜', defaultUnit: 'g', qty: 200, unit: 'g', optional: false },
        { name: '鸡蛋', category: '蛋奶', defaultUnit: '个', qty: 3, unit: '个', optional: false },
      ],
    };
    const writer: DraftWriter = {
      upsertIngredient: vi.fn().mockResolvedValue({ id: 'ing-x' }),
      createDishWithIngredients: vi.fn().mockResolvedValue({ id: 'dish-1' }),
    };
    const result = await importDraft(multi, writer);
    expect(result.ingredientCount).toBe(2);
    expect(writer.upsertIngredient).toHaveBeenCalledTimes(2);
    expect(writer.createDishWithIngredients).toHaveBeenCalledTimes(1);
  });

  it('upsert 传入正确的食材元信息', async () => {
    const writer: DraftWriter = {
      upsertIngredient: vi.fn().mockResolvedValue({ id: 'ing-1' }),
      createDishWithIngredients: vi.fn().mockResolvedValue({ id: 'dish-1' }),
    };
    await importDraft(validDraft, writer);
    expect(writer.upsertIngredient).toHaveBeenCalledWith({
      name: '番茄',
      aliases: [],
      category: '蔬菜',
      defaultUnit: 'g',
    });
  });

  it('createDishWithIngredients 传入正确的菜品+关联', async () => {
    const writer: DraftWriter = {
      upsertIngredient: vi.fn().mockResolvedValue({ id: 'ing-99' }),
      createDishWithIngredients: vi.fn().mockResolvedValue({ id: 'dish-1' }),
    };
    await importDraft(validDraft, writer);
    const call = (writer.createDishWithIngredients as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.dish.name).toBe('测试菜');
    expect(call.dish.status).toBe('DRAFT');
    expect(call.dish.origin).toBe('LLM_DRAFT');
    expect(call.ingredients[0].ingredientId).toBe('ing-99');
    expect(call.ingredients[0].qty).toBe(200);
  });

  it('校验失败时不调用 writer（不写入 DB）', async () => {
    const writer: DraftWriter = {
      upsertIngredient: vi.fn(),
      createDishWithIngredients: vi.fn(),
    };
    await expect(importDraft({}, writer)).rejects.toThrow();
    expect(writer.upsertIngredient).not.toHaveBeenCalled();
    expect(writer.createDishWithIngredients).not.toHaveBeenCalled();
  });
});

// ───── T-C03：origin 显式授权（R-4 处置）回归 ─────

describe('normalizeOriginOption（T-C03 授权归一）', () => {
  it('缺省/空串 -> LLM_DRAFT（默认路径与 T-C03 之前完全一致）', () => {
    expect(normalizeOriginOption(undefined)).toBe('LLM_DRAFT');
    expect(normalizeOriginOption('')).toBe('LLM_DRAFT');
  });

  it('显式 FETCHED -> FETCHED（唯一放行的授权值）', () => {
    expect(normalizeOriginOption('FETCHED')).toBe('FETCHED');
  });

  it('其余取值全部拒绝：MANUAL/PUBLISHED/TESTED/大小写变体/带空格', () => {
    for (const bad of ['MANUAL', 'PUBLISHED', 'TESTED', 'fetched', 'Fetched', 'FETCHED ', ' FETCHED', 'LLM_DRAFT']) {
      expect(() => normalizeOriginOption(bad)).toThrow(/origin 授权值非法/);
    }
  });
});

describe('prepareDraftDish origin 授权（T-C03）', () => {
  it('显式授权 {origin:"FETCHED"} -> origin=FETCHED 且 status 仍强制 DRAFT', () => {
    const input = prepareDraftDish(validDraft, { origin: 'FETCHED' });
    expect(input.origin).toBe('FETCHED');
    expect(input.status).toBe('DRAFT');
  });

  it('显式授权时覆盖输入中的任何 origin/status 值（输入 MANUAL/PUBLISHED 不透传）', () => {
    const evil = { ...validDraft, status: 'PUBLISHED', origin: 'MANUAL' };
    const input = prepareDraftDish(evil, { origin: 'FETCHED' });
    expect(input.origin).toBe('FETCHED');
    expect(input.status).toBe('DRAFT');
  });

  it('显式授权非 FETCHED 值 -> 抛错拒绝', () => {
    expect(() => prepareDraftDish(validDraft, { origin: 'MANUAL' as 'FETCHED' })).toThrow();
  });

  it('默认路径（无 options）不回退：非法 origin 输入仍强制 LLM_DRAFT', () => {
    const input = prepareDraftDish({ ...validDraft, origin: 'FETCHED' });
    expect(input.origin).toBe('LLM_DRAFT');
  });
});

describe('importDraft origin 授权透传（T-C03）', () => {
  it('options.origin=FETCHED 透传到 writer 写入数据', async () => {
    const writer: DraftWriter = {
      upsertIngredient: vi.fn().mockResolvedValue({ id: 'ing-1' }),
      createDishWithIngredients: vi.fn().mockResolvedValue({ id: 'dish-1' }),
    };
    await importDraft(validDraft, writer, { origin: 'FETCHED' });
    const call = (writer.createDishWithIngredients as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.dish.origin).toBe('FETCHED');
    expect(call.dish.status).toBe('DRAFT');
  });

  it('默认（无 options）恒 LLM_DRAFT（双保险默认语义不削弱）', async () => {
    const writer: DraftWriter = {
      upsertIngredient: vi.fn().mockResolvedValue({ id: 'ing-1' }),
      createDishWithIngredients: vi.fn().mockResolvedValue({ id: 'dish-1' }),
    };
    await importDraft(validDraft, writer);
    const call = (writer.createDishWithIngredients as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.dish.origin).toBe('LLM_DRAFT');
    expect(call.dish.status).toBe('DRAFT');
  });
});
