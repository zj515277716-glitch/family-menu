// tools/content-pipeline/test/draft.spec.ts
// AC12 单元测试：draft 起草重试逻辑（mock arkClient）

import { describe, it, expect, vi } from 'vitest';
import {
  draftDish,
  validateDraftDish,
  MAX_ATTEMPTS,
  buildDraftFileName,
} from '../src/draft.js';
import type { ArkChatClient } from '../src/ark.js';
import { parseSlot } from '../src/coverage.js';

// 合法 dish JSON（draft 产出格式：扁平 dish + ingredients）
const validDishJson = JSON.stringify({
  name: '测试番茄炒蛋',
  mealRole: 'MAIN',
  cuisine: '家常',
  flavorTags: ['清淡'],
  spicyLevel: 0,
  splitFlavor: false,
  activeMinutes: 10,
  totalMinutes: 15,
  equipment: ['wok'],
  steps: [
    { order: 1, text: '番茄切块，鸡蛋打散', parallel: false },
    { order: 2, text: '热锅下油炒蛋', parallel: false },
  ],
  ingredients: [
    { name: '番茄', category: '蔬菜', defaultUnit: 'g', qty: 200, unit: 'g', optional: false },
    { name: '鸡蛋', category: '蛋奶', defaultUnit: '个', qty: 3, unit: '个', optional: false },
  ],
});

describe('validateDraftDish', () => {
  const slot = parseSlot('weekday_fast,chicken,15min');

  it('合法 JSON 通过校验', () => {
    const dish = validateDraftDish(validDishJson, slot);
    expect(dish.name).toBe('测试番茄炒蛋');
    expect(dish.mealRole).toBe('MAIN');
    expect(dish.ingredients.length).toBe(2);
    expect(dish.ingredients[0].name).toBe('番茄');
    expect(dish.ingredients[0].qty).toBe(200);
  });

  it('强制 status=DRAFT origin=LLM_DRAFT（双保险）', () => {
    const input = JSON.parse(validDishJson) as Record<string, unknown>;
    input.status = 'PUBLISHED';
    input.origin = 'MANUAL';
    const dish = validateDraftDish(JSON.stringify(input), slot);
    expect(dish.status).toBe('DRAFT');
    expect(dish.origin).toBe('LLM_DRAFT');
  });

  it('totalMinutes 超过 slot 时长档失败', () => {
    const input = JSON.parse(validDishJson) as Record<string, unknown>;
    input.totalMinutes = 30; // slot 是 15min
    expect(() => validateDraftDish(JSON.stringify(input), slot)).toThrow();
  });

  it('食材缺用量失败（AC4 约束）', () => {
    const input = JSON.parse(validDishJson) as Record<string, unknown>;
    input.ingredients = [{ name: '番茄', category: '蔬菜', defaultUnit: 'g' }]; // 缺 qty/unit
    expect(() => validateDraftDish(JSON.stringify(input), slot)).toThrow();
  });

  it('非法 JSON 失败', () => {
    expect(() => validateDraftDish('not json', slot)).toThrow();
    expect(() => validateDraftDish('{}', slot)).toThrow();
  });

  it('mealRole 非法值失败', () => {
    const input = JSON.parse(validDishJson) as Record<string, unknown>;
    input.mealRole = 'INVALID';
    expect(() => validateDraftDish(JSON.stringify(input), slot)).toThrow();
  });
});

describe('draftDish 重试逻辑', () => {
  const slot = parseSlot('weekday_fast,chicken,15min');
  const prompt = 'test prompt';

  it('首次成功 -> attempts=1', async () => {
    const client: ArkChatClient = { complete: vi.fn().mockResolvedValue(validDishJson) };
    const result = await draftDish({ slot, arkClient: client, prompt });
    expect(result.attempts).toBe(1);
    expect(result.dish.name).toBe('测试番茄炒蛋');
    expect(client.complete).toHaveBeenCalledTimes(1);
  });

  it('前2次失败第3次成功 -> attempts=3', async () => {
    const client: ArkChatClient = {
      complete: vi
        .fn()
        .mockResolvedValueOnce('invalid json')
        .mockResolvedValueOnce('{}')
        .mockResolvedValueOnce(validDishJson),
    };
    const result = await draftDish({ slot, arkClient: client, prompt });
    expect(result.attempts).toBe(3);
    expect(client.complete).toHaveBeenCalledTimes(3);
  });

  it('3次都失败 -> 抛错（AC3 重试3次）', async () => {
    const client: ArkChatClient = { complete: vi.fn().mockResolvedValue('invalid') };
    await expect(draftDish({ slot, arkClient: client, prompt })).rejects.toThrow();
    expect(client.complete).toHaveBeenCalledTimes(MAX_ATTEMPTS);
  });

  it('API 抛错 -> 重试', async () => {
    const client: ArkChatClient = {
      complete: vi
        .fn()
        .mockRejectedValueOnce(new Error('api error'))
        .mockResolvedValueOnce(validDishJson),
    };
    const result = await draftDish({ slot, arkClient: client, prompt });
    expect(result.attempts).toBe(2);
  });

  it('3次 API 抛错 -> 最终抛错', async () => {
    const client: ArkChatClient = { complete: vi.fn().mockRejectedValue(new Error('api error')) };
    await expect(draftDish({ slot, arkClient: client, prompt })).rejects.toThrow();
    expect(client.complete).toHaveBeenCalledTimes(MAX_ATTEMPTS);
  });

  it('错误信息含重试次数', async () => {
    const client: ArkChatClient = { complete: vi.fn().mockResolvedValue('invalid') };
    await expect(draftDish({ slot, arkClient: client, prompt })).rejects.toThrow(
      new RegExp(String(MAX_ATTEMPTS)),
    );
  });
});

describe('buildDraftFileName', () => {
  it('文件名格式：scene_protein_time_timestamp.draft.json', () => {
    const slot = parseSlot('weekday_fast,chicken,30min');
    const name = buildDraftFileName(slot, 1700000000000);
    expect(name).toBe('weekday_fast_chicken_30min_1700000000000.draft.json');
  });

  it('不同 slot 生成不同文件名', () => {
    const slot1 = parseSlot('weekday_fast,chicken,30min');
    const slot2 = parseSlot('weekend,beef,60min');
    const name1 = buildDraftFileName(slot1, 1);
    const name2 = buildDraftFileName(slot2, 1);
    expect(name1).not.toBe(name2);
  });
});
