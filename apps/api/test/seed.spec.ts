// apps/api/test/seed.spec.ts
// 种子数据 zod 校验测试（AC8）+ 覆盖性检查（AC7）
// 验证 seed-data.ts 中所有数据通过 shared v0.1 zod schema 校验
import { describe, it, expect } from 'vitest';
import {
  FamilySchema,
  FamilyRuleSchema,
  ExclusionRuleSchema,
  IngredientSchema,
  DishSchema,
  DishIngredientSchema,
  MenuSchema,
  MenuDishSchema,
} from '@family-menu/shared';
import {
  family,
  familyRule,
  exclusionRules,
  ingredients,
  dishes,
  dishIngredients,
  menus,
  menuDishes,
} from '../prisma/seed-data.js';

describe('seed data: family', () => {
  it('family passes FamilySchema', () => {
    expect(() => FamilySchema.parse(family)).not.toThrow();
  });

  it('familyRule passes FamilyRuleSchema', () => {
    expect(() => FamilyRuleSchema.parse(familyRule)).not.toThrow();
  });
});

describe('seed data: exclusion rules', () => {
  it('all exclusionRules pass ExclusionRuleSchema', () => {
    for (const rule of exclusionRules) {
      expect(() => ExclusionRuleSchema.parse(rule)).not.toThrow();
    }
  });

  it('has at least 1 HARD exclusion', () => {
    const hardCount = exclusionRules.filter((r) => r.severity === 'HARD').length;
    expect(hardCount).toBeGreaterThanOrEqual(1);
  });

  it('has at least 1 SOFT exclusion', () => {
    const softCount = exclusionRules.filter((r) => r.severity === 'SOFT').length;
    expect(softCount).toBeGreaterThanOrEqual(1);
  });
});

describe('seed data: ingredients', () => {
  it('all ingredients pass IngredientSchema', () => {
    for (const ing of ingredients) {
      expect(() => IngredientSchema.parse(ing)).not.toThrow();
    }
  });

  it('covers all 6 categories', () => {
    const categories = new Set(ingredients.map((i) => i.category));
    expect(categories.has('蔬菜')).toBe(true);
    expect(categories.has('肉类')).toBe(true);
    expect(categories.has('水产')).toBe(true);
    expect(categories.has('蛋奶')).toBe(true);
    expect(categories.has('调料')).toBe(true);
    expect(categories.has('主食')).toBe(true);
  });
});

describe('seed data: dishes', () => {
  it('all dishes pass DishSchema', () => {
    for (const dish of dishes) {
      expect(() => DishSchema.parse(dish)).not.toThrow();
    }
  });

  it('has exactly 10 dishes', () => {
    expect(dishes).toHaveLength(10);
  });

  it('covers all 4 meal roles', () => {
    const roles = new Set(dishes.map((d) => d.mealRole));
    expect(roles.has('MAIN')).toBe(true);
    expect(roles.has('SIDE')).toBe(true);
    expect(roles.has('SOUP')).toBe(true);
    expect(roles.has('STAPLE')).toBe(true);
  });

  it('has at least 1 PUBLISHED dish', () => {
    const published = dishes.filter((d) => d.status === 'PUBLISHED');
    expect(published.length).toBeGreaterThanOrEqual(1);
  });
});

describe('seed data: dish ingredients', () => {
  it('all dishIngredients pass DishIngredientSchema', () => {
    for (const di of dishIngredients) {
      expect(() => DishIngredientSchema.parse(di)).not.toThrow();
    }
  });
});

describe('seed data: menus', () => {
  it('all menus pass MenuSchema', () => {
    for (const menu of menus) {
      expect(() => MenuSchema.parse(menu)).not.toThrow();
    }
  });

  it('has exactly 4 menus', () => {
    expect(menus).toHaveLength(4);
  });

  it('covers all 4 scenes', () => {
    const scenes = new Set(menus.map((m) => m.scene));
    expect(scenes.has('WEEKDAY_FAST')).toBe(true);
    expect(scenes.has('WEEKEND')).toBe(true);
    expect(scenes.has('CLEARANCE')).toBe(true);
    expect(scenes.has('BUDGET')).toBe(true);
  });
});

describe('seed data: menu dishes', () => {
  it('all menuDishes pass MenuDishSchema', () => {
    for (const md of menuDishes) {
      expect(() => MenuDishSchema.parse(md)).not.toThrow();
    }
  });
});
