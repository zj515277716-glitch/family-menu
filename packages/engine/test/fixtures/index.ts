// packages/engine/test/fixtures/index.ts
// 禁忌测试集 fixtures：HARD 规则 × 含成分菜单 + 变形用例（别名/隐含/可选）
// 对齐 4.3：每条 HARD 规则 × 库内每套含该成分的菜单 = 一条必须被过滤的用例
import type {
  DishIngredientView,
  DishView,
  EventView,
  ExclusionView,
  FamilyRuleView,
  MenuView,
  TonightContext,
} from '../../src/index.js';

// ───── 食材（含别名：番茄/西红柿，两个不同 id 但别名重叠） ─────

export const ING_TOMATO = {
  ingredientId: 'ing-tomato',
  ingredientName: '番茄',
  aliases: ['西红柿'],
  category: '蔬菜',
  defaultUnit: 'g',
};

export const ING_XIHONGSHI = {
  ingredientId: 'ing-xihongshi',
  ingredientName: '西红柿',
  aliases: ['番茄'],
  category: '蔬菜',
  defaultUnit: 'g',
};

export const ING_PORK_BELLY = {
  ingredientId: 'ing-pork-belly',
  ingredientName: '腊肉',
  aliases: [],
  category: '肉类',
  defaultUnit: 'g',
};

export const ING_BEEF = {
  ingredientId: 'ing-beef',
  ingredientName: '牛肉',
  aliases: [],
  category: '肉类',
  defaultUnit: 'g',
};

export const ING_FISH = {
  ingredientId: 'ing-fish',
  ingredientName: '鱼',
  aliases: ['草鱼'],
  category: '水产',
  defaultUnit: 'g',
};

export const ING_EGG = {
  ingredientId: 'ing-egg',
  ingredientName: '鸡蛋',
  aliases: [],
  category: '蛋奶',
  defaultUnit: '个',
};

export const ING_TOFU = {
  ingredientId: 'ing-tofu',
  ingredientName: '豆腐',
  aliases: [],
  category: '蔬菜',
  defaultUnit: 'g',
};

export const ING_RICE = {
  ingredientId: 'ing-rice',
  ingredientName: '大米',
  aliases: [],
  category: '主食',
  defaultUnit: 'g',
};

export const ING_CHILI = {
  ingredientId: 'ing-chili',
  ingredientName: '辣椒',
  aliases: [],
  category: '蔬菜',
  defaultUnit: 'g',
};

export const ING_OFFAL = {
  ingredientId: 'ing-offal',
  ingredientName: '猪肝',
  aliases: [],
  category: '肉类',
  defaultUnit: 'g',
};

export const ING_SALT = {
  ingredientId: 'ing-salt',
  ingredientName: '盐',
  aliases: [],
  category: '调料',
  defaultUnit: 'g',
};

// ───── 菜品食材构造 ─────

function di(
  ing: typeof ING_TOMATO,
  qty: number,
  unit: string,
  optional = false,
): DishIngredientView {
  return { ...ing, qty, unit, optional };
}

// ───── 菜品 ─────

// 番茄炒蛋：含番茄
export const DISH_TOMATO_EGG: DishView = {
  id: 'dish-tomato-egg',
  name: '番茄炒蛋',
  mealRole: 'MAIN',
  cuisine: '家常',
  flavorTags: ['清淡'],
  spicyLevel: 0,
  splitFlavor: false,
  activeMinutes: 15,
  totalMinutes: 15,
  equipment: ['wok'],
  steps: [{ order: 1, text: '翻炒' }],
  status: 'PUBLISHED',
  ingredients: [di(ING_TOMATO, 200, 'g'), di(ING_EGG, 2, '个')],
};

// 西红柿炒蛋：使用别名食材 ing-xihongshi（别名变形用例）
export const DISH_XIHONGSHI_EGG: DishView = {
  id: 'dish-xihongshi-egg',
  name: '西红柿炒蛋',
  mealRole: 'MAIN',
  cuisine: '家常',
  flavorTags: ['清淡'],
  spicyLevel: 0,
  splitFlavor: false,
  activeMinutes: 15,
  totalMinutes: 15,
  equipment: ['wok'],
  steps: [{ order: 1, text: '翻炒' }],
  status: 'PUBLISHED',
  ingredients: [di(ING_XIHONGSHI, 200, 'g'), di(ING_EGG, 2, '个')],
};

// 腊味合蒸：菜名不含"腊肉"但食材含腊肉（隐含成分变形用例）
export const DISH_LAWEI_HEZHENG: DishView = {
  id: 'dish-lawei-hezheng',
  name: '腊味合蒸',
  mealRole: 'MAIN',
  cuisine: '湘菜',
  flavorTags: ['咸香'],
  spicyLevel: 1,
  splitFlavor: false,
  activeMinutes: 20,
  totalMinutes: 40,
  equipment: ['steamer'],
  steps: [{ order: 1, text: '蒸制' }],
  status: 'PUBLISHED',
  ingredients: [di(ING_PORK_BELLY, 100, 'g'), di(ING_RICE, 50, 'g')],
};

// 清蒸鱼：含辣椒但 optional=true（可选食材含禁忌变形用例）
export const DISH_STEAMED_FISH: DishView = {
  id: 'dish-steamed-fish',
  name: '清蒸鱼',
  mealRole: 'MAIN',
  cuisine: '粤菜',
  flavorTags: ['清淡'],
  spicyLevel: 0,
  splitFlavor: false,
  activeMinutes: 10,
  totalMinutes: 20,
  equipment: ['steamer'],
  steps: [{ order: 1, text: '蒸鱼' }],
  status: 'PUBLISHED',
  ingredients: [di(ING_FISH, 300, 'g'), di(ING_CHILI, 10, 'g', true)],
};

// 麻婆豆腐：含牛肉和辣椒（辣椒非 optional，SOFT 禁忌降权）
export const DISH_MAPOTOFU: DishView = {
  id: 'dish-mapotofu',
  name: '麻婆豆腐',
  mealRole: 'MAIN',
  cuisine: '川菜',
  flavorTags: ['麻辣'],
  spicyLevel: 3,
  splitFlavor: false,
  activeMinutes: 20,
  totalMinutes: 25,
  equipment: ['wok'],
  steps: [{ order: 1, text: '烧制' }],
  status: 'PUBLISHED',
  ingredients: [
    di(ING_BEEF, 100, 'g'),
    di(ING_TOFU, 200, 'g'),
    di(ING_CHILI, 5, 'g'),
  ],
};

// 白米饭：纯主食，安全
export const DISH_PLAIN_RICE: DishView = {
  id: 'dish-plain-rice',
  name: '白米饭',
  mealRole: 'STAPLE',
  cuisine: '家常',
  flavorTags: ['清淡'],
  spicyLevel: 0,
  splitFlavor: false,
  activeMinutes: 5,
  totalMinutes: 30,
  equipment: ['rice_cooker'],
  steps: [{ order: 1, text: '煮饭' }],
  status: 'PUBLISHED',
  ingredients: [di(ING_RICE, 200, 'g')],
};

// 爆炒猪肝：flavorTags 含"内脏"标签（TAG 变形用例）
export const DISH_OFFAL: DishView = {
  id: 'dish-offal',
  name: '爆炒猪肝',
  mealRole: 'MAIN',
  cuisine: '湘菜',
  flavorTags: ['内脏', '咸香'],
  spicyLevel: 2,
  splitFlavor: false,
  activeMinutes: 15,
  totalMinutes: 15,
  equipment: ['wok'],
  steps: [{ order: 1, text: '爆炒' }],
  status: 'PUBLISHED',
  ingredients: [di(ING_OFFAL, 200, 'g')],
};

// 未知菜品：ingredients 为空（成分未确认变形用例）
export const DISH_UNKNOWN: DishView = {
  id: 'dish-unknown',
  name: '神秘菜品',
  mealRole: 'SIDE',
  cuisine: '家常',
  flavorTags: [],
  spicyLevel: 0,
  splitFlavor: false,
  activeMinutes: 10,
  totalMinutes: 10,
  equipment: ['wok'],
  steps: [{ order: 1, text: '未知' }],
  status: 'PUBLISHED',
  ingredients: [],
};

// ───── 菜单 ─────

function makeMenu(
  id: string,
  name: string,
  scene: MenuView['scene'],
  totalActiveMinutes: number,
  dishes: DishView[],
): MenuView {
  return {
    id,
    name,
    scene,
    serves: 4,
    totalActiveMinutes,
    prepSequence: [{ minute: 0, action: '开始' }],
    status: 'PUBLISHED',
    dishes,
  };
}

export const MENU_TOMATO_EGG = makeMenu('menu-tomato-egg', '番茄炒蛋套餐', 'WEEKDAY_FAST', 15, [DISH_TOMATO_EGG, DISH_PLAIN_RICE]);
export const MENU_XIHONGSHI = makeMenu('menu-xihongshi', '西红柿炒蛋套餐', 'WEEKDAY_FAST', 15, [DISH_XIHONGSHI_EGG, DISH_PLAIN_RICE]);
export const MENU_LAWEI = makeMenu('menu-lawei', '腊味合蒸套餐', 'WEEKEND', 40, [DISH_LAWEI_HEZHENG, DISH_PLAIN_RICE]);
export const MENU_FISH = makeMenu('menu-fish', '清蒸鱼套餐', 'WEEKDAY_FAST', 20, [DISH_STEAMED_FISH, DISH_PLAIN_RICE]);
export const MENU_MAPOTOFU = makeMenu('menu-mapotofu', '麻婆豆腐套餐', 'WEEKDAY_FAST', 25, [DISH_MAPOTOFU, DISH_PLAIN_RICE]);
export const MENU_PLAIN_RICE = makeMenu('menu-plain-rice', '白米饭套餐', 'BUDGET', 30, [DISH_PLAIN_RICE]);
export const MENU_OFFAL = makeMenu('menu-offal', '爆炒猪肝套餐', 'WEEKEND', 15, [DISH_OFFAL, DISH_PLAIN_RICE]);
export const MENU_UNKNOWN = makeMenu('menu-unknown', '神秘套餐', 'WEEKDAY_FAST', 10, [DISH_UNKNOWN, DISH_PLAIN_RICE]);

// ───── 禁忌规则 ─────

export const EXCLUSION_HARD_TOMATO: ExclusionView = {
  id: 'ex-hard-tomato',
  scope: 'INGREDIENT',
  targetId: 'ing-tomato',
  targetName: '番茄',
  targetAliases: ['西红柿'],
  severity: 'HARD',
  note: '爸爸不吃番茄',
};

export const EXCLUSION_HARD_PORK_BELLY: ExclusionView = {
  id: 'ex-hard-pork-belly',
  scope: 'INGREDIENT',
  targetId: 'ing-pork-belly',
  targetName: '腊肉',
  targetAliases: [],
  severity: 'HARD',
  note: '孩子不吃腊肉',
};

export const EXCLUSION_HARD_CHILI: ExclusionView = {
  id: 'ex-hard-chili',
  scope: 'INGREDIENT',
  targetId: 'ing-chili',
  targetName: '辣椒',
  targetAliases: [],
  severity: 'HARD',
};

export const EXCLUSION_HARD_OFFAL_TAG: ExclusionView = {
  id: 'ex-hard-offal-tag',
  scope: 'TAG',
  targetTag: '内脏',
  severity: 'HARD',
};

export const EXCLUSION_HARD_DISH: ExclusionView = {
  id: 'ex-hard-dish-mapotofu',
  scope: 'DISH',
  targetId: 'dish-mapotofu',
  severity: 'HARD',
};

export const EXCLUSION_SOFT_CHILI: ExclusionView = {
  id: 'ex-soft-chili',
  scope: 'INGREDIENT',
  targetId: 'ing-chili',
  targetName: '辣椒',
  targetAliases: [],
  severity: 'SOFT',
  note: '不喜欢太辣',
};

// ───── 家庭规则 ─────

export const FAMILY_RULE: FamilyRuleView = {
  familyId: 'fam-1',
  defaultPeople: 4,
  timeBudgets: [30, 60],
  equipment: ['wok', 'rice_cooker', 'steamer'],
  cuisines: ['家常', '湘菜'],
};

// ───── 今晚情境 ─────

export const CONTEXT_30MIN: TonightContext = {
  people: 4,
  timeBudgetMin: 30,
  mustUseIngredients: [],
};

export const CONTEXT_60MIN: TonightContext = {
  people: 4,
  timeBudgetMin: 60,
  mustUseIngredients: [],
};

export const CONTEXT_MUSTUSE: TonightContext = {
  people: 4,
  timeBudgetMin: 60,
  mustUseIngredients: ['ing-tomato', 'ing-egg'],
};

// ───── 事件历史 ─────

export function makeEvent(
  id: string,
  type: EventView['type'],
  daysAgo: number,
  menuId?: string,
  cookedResult?: 'success' | 'partial' | 'fail',
  willRepeat?: boolean,
): EventView {
  const createdAt = new Date(2026, 0, 1 + 30 - daysAgo); // ref=1/31, daysAgo 天前
  return { id, type, menuId, createdAt, cookedResult, willRepeat };
}

// 参考时间锚点：2026-01-31（makeEvent 中 ref=1/31）
export const HISTORY_REF_DATE = new Date(2026, 0, 31);

// ───── 完整库（用于禁忌测试集） ─────

export const FULL_LIBRARY: MenuView[] = [
  MENU_TOMATO_EGG,
  MENU_XIHONGSHI,
  MENU_LAWEI,
  MENU_FISH,
  MENU_MAPOTOFU,
  MENU_PLAIN_RICE,
  MENU_OFFAL,
  MENU_UNKNOWN,
];

export const ALL_HARD_EXCLUSIONS: ExclusionView[] = [
  EXCLUSION_HARD_TOMATO,
  EXCLUSION_HARD_PORK_BELLY,
  EXCLUSION_HARD_CHILI,
  EXCLUSION_HARD_OFFAL_TAG,
  EXCLUSION_HARD_DISH,
];
