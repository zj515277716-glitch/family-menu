// tools/content-pipeline/test/import.spec.ts
// AC12 单元测试：import 校验 + 双保险（mock writer）

import { describe, it, expect, vi } from 'vitest';
import { prepareDraftDish, importDraft, type DraftWriter } from '../src/import.js';

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
