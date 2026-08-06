// apps/api/prisma/seed-data.ts
// 种子数据定义（纯数据，不依赖 PrismaClient）
// 1家庭 + 1规则 + 2禁忌(HARD/SOFT各1) + 17食材(6类) + 10菜品(4角色) + 29菜品食材关联 + 4菜单(4场景) + 13菜单菜品关联
// 数据通过 shared v0.1 zod schema 校验（见 seed.ts validateSeedData / test/seed.spec.ts）

const now = new Date('2026-08-06T00:00:00Z');

// ───── 家庭与规则 ─────

export const family = {
  id: 'seed-family',
  name: '张家四口',
  createdAt: now,
};

export const familyRule = {
  id: 'seed-family-rule',
  familyId: 'seed-family',
  defaultPeople: 4,
  timeBudgets: [30, 60],
  equipment: ['wok', 'rice_cooker', 'steamer', 'air_fryer'],
  cuisines: ['家常', '湘菜'],
  updatedAt: now,
};

// 硬软分离（DEC-006 文件③7.4）：HARD=过敏/绝对禁忌，SOFT=不喜欢
export const exclusionRules = [
  {
    id: 'seed-excl-peanut',
    familyId: 'seed-family',
    scope: 'TAG' as const,
    targetId: undefined,
    targetTag: '花生',
    severity: 'HARD' as const,
    note: '孩子花生过敏',
  },
  {
    id: 'seed-excl-organ',
    familyId: 'seed-family',
    scope: 'TAG' as const,
    targetId: undefined,
    targetTag: '内脏',
    severity: 'SOFT' as const,
    note: '爸爸不吃内脏',
  },
];

// ───── 食材（覆盖6类：蔬菜/肉类/水产/蛋奶/调料/主食）─────

export const ingredients = [
  // 蔬菜
  { id: 'seed-ing-tomato', name: '番茄', aliases: ['西红柿'], category: '蔬菜', defaultUnit: 'g' },
  { id: 'seed-ing-potato', name: '土豆', aliases: ['马铃薯'], category: '蔬菜', defaultUnit: 'g' },
  { id: 'seed-ing-greens', name: '青菜', aliases: ['小白菜'], category: '蔬菜', defaultUnit: 'g' },
  { id: 'seed-ing-broccoli', name: '西兰花', aliases: ['花椰菜'], category: '蔬菜', defaultUnit: 'g' },
  { id: 'seed-ing-seaweed', name: '紫菜', aliases: ['海苔'], category: '蔬菜', defaultUnit: 'g' },
  { id: 'seed-ing-cucumber', name: '黄瓜', aliases: ['青瓜'], category: '蔬菜', defaultUnit: 'g' },
  // 肉类
  { id: 'seed-ing-pork', name: '猪肉', aliases: ['五花肉'], category: '肉类', defaultUnit: 'g' },
  { id: 'seed-ing-ribs', name: '排骨', aliases: [], category: '肉类', defaultUnit: 'g' },
  { id: 'seed-ing-beef', name: '牛腩', aliases: [], category: '肉类', defaultUnit: 'g' },
  // 水产
  { id: 'seed-ing-bass', name: '鲈鱼', aliases: [], category: '水产', defaultUnit: '条' },
  { id: 'seed-ing-shrimp', name: '虾仁', aliases: ['虾米'], category: '水产', defaultUnit: 'g' },
  // 蛋奶
  { id: 'seed-ing-egg', name: '鸡蛋', aliases: ['土鸡蛋'], category: '蛋奶', defaultUnit: '个' },
  // 调料
  { id: 'seed-ing-soysauce', name: '生抽', aliases: ['酱油'], category: '调料', defaultUnit: 'ml' },
  { id: 'seed-ing-salt', name: '盐', aliases: [], category: '调料', defaultUnit: 'g' },
  { id: 'seed-ing-sugar', name: '白糖', aliases: ['冰糖'], category: '调料', defaultUnit: 'g' },
  { id: 'seed-ing-cookingwine', name: '料酒', aliases: ['黄酒'], category: '调料', defaultUnit: 'ml' },
  // 主食
  { id: 'seed-ing-rice', name: '大米', aliases: ['白米'], category: '主食', defaultUnit: 'g' },
];

// ───── 菜品（10道：MAIN 6 / SIDE 2 / SOUP 1 / STAPLE 1；PUBLISHED 9 / TESTED 1）─────

export const dishes = [
  {
    id: 'seed-dish-tomato-egg',
    name: '番茄炒蛋',
    mealRole: 'MAIN' as const,
    cuisine: '家常',
    flavorTags: ['清淡', '酸甜'],
    spicyLevel: 0,
    splitFlavor: false,
    activeMinutes: 10,
    totalMinutes: 15,
    equipment: ['wok'],
    steps: [
      { order: 1, text: '番茄切块，鸡蛋打散' },
      { order: 2, text: '热锅下油，炒蛋至半凝固盛出' },
      { order: 3, text: '下番茄翻炒出汁' },
      { order: 4, text: '倒回鸡蛋翻炒，加盐调味' },
    ],
    status: 'PUBLISHED' as const,
    origin: 'MANUAL' as const,
    licenseNote: undefined,
  },
  {
    id: 'seed-dish-braised-pork',
    name: '红烧肉',
    mealRole: 'MAIN' as const,
    cuisine: '湘菜',
    flavorTags: ['咸香', '微甜'],
    spicyLevel: 1,
    splitFlavor: false,
    activeMinutes: 15,
    totalMinutes: 60,
    equipment: ['wok'],
    steps: [
      { order: 1, text: '猪肉切块焯水去腥' },
      { order: 2, text: '炒糖色，下肉块翻炒上色' },
      { order: 3, text: '加生抽、料酒、水，大火烧开' },
      { order: 4, text: '转小火炖40分钟', parallel: true },
      { order: 5, text: '大火收汁' },
    ],
    status: 'PUBLISHED' as const,
    origin: 'MANUAL' as const,
    licenseNote: undefined,
  },
  {
    id: 'seed-dish-steamed-bass',
    name: '清蒸鲈鱼',
    mealRole: 'MAIN' as const,
    cuisine: '家常',
    flavorTags: ['清淡', '鲜美'],
    spicyLevel: 0,
    splitFlavor: false,
    activeMinutes: 10,
    totalMinutes: 20,
    equipment: ['steamer'],
    steps: [
      { order: 1, text: '鲈鱼处理干净，划刀' },
      { order: 2, text: '铺姜丝，淋料酒' },
      { order: 3, text: '大火蒸8分钟', parallel: true },
      { order: 4, text: '淋热油激香' },
    ],
    status: 'PUBLISHED' as const,
    origin: 'MANUAL' as const,
    licenseNote: undefined,
  },
  {
    id: 'seed-dish-potato-ribs',
    name: '土豆烧排骨',
    mealRole: 'MAIN' as const,
    cuisine: '家常',
    flavorTags: ['咸香'],
    spicyLevel: 0,
    splitFlavor: false,
    activeMinutes: 15,
    totalMinutes: 50,
    equipment: ['wok'],
    steps: [
      { order: 1, text: '排骨焯水，土豆切块' },
      { order: 2, text: '炒糖色下排骨上色' },
      { order: 3, text: '加生抽、水炖30分钟', parallel: true },
      { order: 4, text: '下土豆继续炖15分钟' },
    ],
    status: 'TESTED' as const,
    origin: 'MANUAL' as const,
    licenseNote: undefined,
  },
  {
    id: 'seed-dish-broccoli-shrimp',
    name: '西兰花炒虾仁',
    mealRole: 'MAIN' as const,
    cuisine: '家常',
    flavorTags: ['清淡'],
    spicyLevel: 0,
    splitFlavor: false,
    activeMinutes: 10,
    totalMinutes: 15,
    equipment: ['wok'],
    steps: [
      { order: 1, text: '西兰花掰小朵焯水，虾仁洗净' },
      { order: 2, text: '热锅下油炒虾仁至变色' },
      { order: 3, text: '下西兰花翻炒，加盐调味' },
    ],
    status: 'PUBLISHED' as const,
    origin: 'MANUAL' as const,
    licenseNote: undefined,
  },
  {
    id: 'seed-dish-garlic-greens',
    name: '蒜蓉青菜',
    mealRole: 'SIDE' as const,
    cuisine: '家常',
    flavorTags: ['清淡'],
    spicyLevel: 0,
    splitFlavor: false,
    activeMinutes: 5,
    totalMinutes: 8,
    equipment: ['wok'],
    steps: [
      { order: 1, text: '青菜洗净，蒜切末' },
      { order: 2, text: '热锅下油爆香蒜末' },
      { order: 3, text: '下青菜大火快炒，加盐调味' },
    ],
    status: 'PUBLISHED' as const,
    origin: 'MANUAL' as const,
    licenseNote: undefined,
  },
  {
    id: 'seed-dish-cucumber-salad',
    name: '凉拌黄瓜',
    mealRole: 'SIDE' as const,
    cuisine: '家常',
    flavorTags: ['清爽'],
    spicyLevel: 0,
    splitFlavor: false,
    activeMinutes: 5,
    totalMinutes: 8,
    equipment: [],
    steps: [
      { order: 1, text: '黄瓜拍碎切段' },
      { order: 2, text: '加盐、生抽、白糖拌匀' },
    ],
    status: 'PUBLISHED' as const,
    origin: 'MANUAL' as const,
    licenseNote: undefined,
  },
  {
    id: 'seed-dish-seaweed-soup',
    name: '紫菜蛋花汤',
    mealRole: 'SOUP' as const,
    cuisine: '家常',
    flavorTags: ['清淡'],
    spicyLevel: 0,
    splitFlavor: false,
    activeMinutes: 5,
    totalMinutes: 10,
    equipment: ['wok'],
    steps: [
      { order: 1, text: '紫菜泡发，鸡蛋打散' },
      { order: 2, text: '水烧开下紫菜' },
      { order: 3, text: '淋蛋液划散，加盐调味' },
    ],
    status: 'PUBLISHED' as const,
    origin: 'MANUAL' as const,
    licenseNote: undefined,
  },
  {
    id: 'seed-dish-beef-stew',
    name: '土豆炖牛腩',
    mealRole: 'MAIN' as const,
    cuisine: '湘菜',
    flavorTags: ['咸香', '微辣'],
    spicyLevel: 2,
    splitFlavor: true,
    activeMinutes: 20,
    totalMinutes: 90,
    equipment: ['wok'],
    steps: [
      { order: 1, text: '牛腩切块焯水，土豆切块' },
      { order: 2, text: '炒糖色下牛腩上色' },
      { order: 3, text: '加生抽、水大火烧开' },
      { order: 4, text: '小火炖1小时', parallel: true },
      { order: 5, text: '下土豆炖20分钟' },
    ],
    status: 'PUBLISHED' as const,
    origin: 'MANUAL' as const,
    licenseNote: undefined,
  },
  {
    id: 'seed-dish-egg-fried-rice',
    name: '蛋炒饭',
    mealRole: 'STAPLE' as const,
    cuisine: '家常',
    flavorTags: ['咸香'],
    spicyLevel: 0,
    splitFlavor: false,
    activeMinutes: 8,
    totalMinutes: 12,
    equipment: ['wok', 'rice_cooker'],
    steps: [
      { order: 1, text: '隔夜米饭打散，鸡蛋打散' },
      { order: 2, text: '热锅下油炒蛋' },
      { order: 3, text: '下米饭翻炒，加盐调味' },
    ],
    status: 'PUBLISHED' as const,
    origin: 'MANUAL' as const,
    licenseNote: undefined,
  },
];

// ───── 菜品-食材关联（DishIngredient）─────

export const dishIngredients = [
  // 番茄炒蛋
  { id: 'seed-di-001', dishId: 'seed-dish-tomato-egg', ingredientId: 'seed-ing-tomato', qty: 200, unit: 'g', optional: false },
  { id: 'seed-di-002', dishId: 'seed-dish-tomato-egg', ingredientId: 'seed-ing-egg', qty: 3, unit: '个', optional: false },
  // 红烧肉
  { id: 'seed-di-003', dishId: 'seed-dish-braised-pork', ingredientId: 'seed-ing-pork', qty: 300, unit: 'g', optional: false },
  { id: 'seed-di-004', dishId: 'seed-dish-braised-pork', ingredientId: 'seed-ing-soysauce', qty: 15, unit: 'ml', optional: false },
  { id: 'seed-di-005', dishId: 'seed-dish-braised-pork', ingredientId: 'seed-ing-sugar', qty: 10, unit: 'g', optional: false },
  { id: 'seed-di-006', dishId: 'seed-dish-braised-pork', ingredientId: 'seed-ing-cookingwine', qty: 10, unit: 'ml', optional: false },
  // 清蒸鲈鱼
  { id: 'seed-di-007', dishId: 'seed-dish-steamed-bass', ingredientId: 'seed-ing-bass', qty: 1, unit: '条', optional: false },
  { id: 'seed-di-008', dishId: 'seed-dish-steamed-bass', ingredientId: 'seed-ing-cookingwine', qty: 10, unit: 'ml', optional: false },
  // 土豆烧排骨
  { id: 'seed-di-009', dishId: 'seed-dish-potato-ribs', ingredientId: 'seed-ing-ribs', qty: 400, unit: 'g', optional: false },
  { id: 'seed-di-010', dishId: 'seed-dish-potato-ribs', ingredientId: 'seed-ing-potato', qty: 200, unit: 'g', optional: false },
  { id: 'seed-di-011', dishId: 'seed-dish-potato-ribs', ingredientId: 'seed-ing-soysauce', qty: 15, unit: 'ml', optional: false },
  { id: 'seed-di-012', dishId: 'seed-dish-potato-ribs', ingredientId: 'seed-ing-sugar', qty: 5, unit: 'g', optional: false },
  // 西兰花炒虾仁
  { id: 'seed-di-013', dishId: 'seed-dish-broccoli-shrimp', ingredientId: 'seed-ing-broccoli', qty: 200, unit: 'g', optional: false },
  { id: 'seed-di-014', dishId: 'seed-dish-broccoli-shrimp', ingredientId: 'seed-ing-shrimp', qty: 150, unit: 'g', optional: false },
  // 蒜蓉青菜
  { id: 'seed-di-015', dishId: 'seed-dish-garlic-greens', ingredientId: 'seed-ing-greens', qty: 300, unit: 'g', optional: false },
  // 凉拌黄瓜
  { id: 'seed-di-016', dishId: 'seed-dish-cucumber-salad', ingredientId: 'seed-ing-cucumber', qty: 200, unit: 'g', optional: false },
  { id: 'seed-di-017', dishId: 'seed-dish-cucumber-salad', ingredientId: 'seed-ing-soysauce', qty: 10, unit: 'ml', optional: false },
  { id: 'seed-di-018', dishId: 'seed-dish-cucumber-salad', ingredientId: 'seed-ing-salt', qty: 2, unit: 'g', optional: false },
  { id: 'seed-di-019', dishId: 'seed-dish-cucumber-salad', ingredientId: 'seed-ing-sugar', qty: 3, unit: 'g', optional: false },
  // 紫菜蛋花汤
  { id: 'seed-di-020', dishId: 'seed-dish-seaweed-soup', ingredientId: 'seed-ing-seaweed', qty: 10, unit: 'g', optional: false },
  { id: 'seed-di-021', dishId: 'seed-dish-seaweed-soup', ingredientId: 'seed-ing-egg', qty: 2, unit: '个', optional: false },
  { id: 'seed-di-022', dishId: 'seed-dish-seaweed-soup', ingredientId: 'seed-ing-salt', qty: 2, unit: 'g', optional: false },
  // 土豆炖牛腩
  { id: 'seed-di-023', dishId: 'seed-dish-beef-stew', ingredientId: 'seed-ing-beef', qty: 300, unit: 'g', optional: false },
  { id: 'seed-di-024', dishId: 'seed-dish-beef-stew', ingredientId: 'seed-ing-potato', qty: 200, unit: 'g', optional: false },
  { id: 'seed-di-025', dishId: 'seed-dish-beef-stew', ingredientId: 'seed-ing-soysauce', qty: 15, unit: 'ml', optional: false },
  { id: 'seed-di-026', dishId: 'seed-dish-beef-stew', ingredientId: 'seed-ing-cookingwine', qty: 10, unit: 'ml', optional: false },
  // 蛋炒饭
  { id: 'seed-di-027', dishId: 'seed-dish-egg-fried-rice', ingredientId: 'seed-ing-rice', qty: 200, unit: 'g', optional: false },
  { id: 'seed-di-028', dishId: 'seed-dish-egg-fried-rice', ingredientId: 'seed-ing-egg', qty: 2, unit: '个', optional: false },
  { id: 'seed-di-029', dishId: 'seed-dish-egg-fried-rice', ingredientId: 'seed-ing-salt', qty: 2, unit: 'g', optional: false },
];

// ───── 菜单（4套：WEEKDAY_FAST / WEEKEND / CLEARANCE / BUDGET）─────

export const menus = [
  {
    id: 'seed-menu-weekday',
    name: '工作日快手套餐',
    scene: 'WEEKDAY_FAST' as const,
    serves: 4,
    totalActiveMinutes: 25,
    prepSequence: [
      { minute: 0, action: '烧水' },
      { minute: 3, action: '切番茄打散鸡蛋' },
      { minute: 8, action: '炒番茄炒蛋' },
      { minute: 18, action: '炒青菜' },
      { minute: 22, action: '做紫菜蛋花汤' },
    ],
    status: 'PUBLISHED' as const,
  },
  {
    id: 'seed-menu-weekend',
    name: '周末丰盛套餐',
    scene: 'WEEKEND' as const,
    serves: 4,
    totalActiveMinutes: 50,
    prepSequence: [
      { minute: 0, action: '红烧肉焯水炒糖色' },
      { minute: 10, action: '炖红烧肉' },
      { minute: 20, action: '蒸鲈鱼' },
      { minute: 30, action: '炒青菜' },
      { minute: 35, action: '炒蛋炒饭' },
    ],
    status: 'PUBLISHED' as const,
  },
  {
    id: 'seed-menu-clearance',
    name: '清库存套餐',
    scene: 'CLEARANCE' as const,
    serves: 4,
    totalActiveMinutes: 35,
    prepSequence: [
      { minute: 0, action: '排骨焯水切土豆' },
      { minute: 10, action: '炖排骨' },
      { minute: 30, action: '拌黄瓜' },
      { minute: 32, action: '做紫菜蛋花汤' },
    ],
    status: 'DRAFT' as const,
  },
  {
    id: 'seed-menu-budget',
    name: '预算套餐',
    scene: 'BUDGET' as const,
    serves: 4,
    totalActiveMinutes: 20,
    prepSequence: [
      { minute: 0, action: '煮饭' },
      { minute: 5, action: '切番茄打散鸡蛋' },
      { minute: 10, action: '炒番茄炒蛋' },
      { minute: 15, action: '炒饭加做汤' },
    ],
    status: 'PUBLISHED' as const,
  },
];

// ───── 菜单-菜品关联（MenuDish）─────

export const menuDishes = [
  // 工作日快手套餐
  { menuId: 'seed-menu-weekday', dishId: 'seed-dish-tomato-egg', sort: 1 },
  { menuId: 'seed-menu-weekday', dishId: 'seed-dish-garlic-greens', sort: 2 },
  { menuId: 'seed-menu-weekday', dishId: 'seed-dish-seaweed-soup', sort: 3 },
  // 周末丰盛套餐
  { menuId: 'seed-menu-weekend', dishId: 'seed-dish-braised-pork', sort: 1 },
  { menuId: 'seed-menu-weekend', dishId: 'seed-dish-steamed-bass', sort: 2 },
  { menuId: 'seed-menu-weekend', dishId: 'seed-dish-garlic-greens', sort: 3 },
  { menuId: 'seed-menu-weekend', dishId: 'seed-dish-egg-fried-rice', sort: 4 },
  // 清库存套餐
  { menuId: 'seed-menu-clearance', dishId: 'seed-dish-potato-ribs', sort: 1 },
  { menuId: 'seed-menu-clearance', dishId: 'seed-dish-cucumber-salad', sort: 2 },
  { menuId: 'seed-menu-clearance', dishId: 'seed-dish-seaweed-soup', sort: 3 },
  // 预算套餐
  { menuId: 'seed-menu-budget', dishId: 'seed-dish-tomato-egg', sort: 1 },
  { menuId: 'seed-menu-budget', dishId: 'seed-dish-egg-fried-rice', sort: 2 },
  { menuId: 'seed-menu-budget', dishId: 'seed-dish-seaweed-soup', sort: 3 },
];
