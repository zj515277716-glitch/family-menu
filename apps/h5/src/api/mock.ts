// apps/h5/src/api/mock.ts
// Mock 数据：对齐 wireframes.md 示例（番茄牛腩套餐等），用于"先 Mock 后真 API"开发模式
// 真 API 模式（TARO_APP_API_BASE_URL 已配置）下不引用本文件数据
import type { ExclusionRule, FamilyRule, Plan } from '@family-menu/shared'
import type {
  CandidateView,
  MenuSnapshot,
  RecommendResult,
  ShoppingListData,
} from '../types'

// ───── 菜单快照（候选展示用，Mock 提供 menu 详情） ─────

const menuTomatoBeef: MenuSnapshot = {
  id: 'menu-tomato-beef',
  name: '番茄牛腩套餐',
  scene: 'WEEKDAY_FAST',
  totalActiveMinutes: 32,
  prepSequence: [
    { minute: 0, action: '洗米煮饭（电饭煲）' },
    { minute: 10, action: '切番茄/土豆/小葱，牛腩焯水' },
    { minute: 20, action: '起锅炒菜（炒锅）：番茄牛腩+清炒时蔬' },
    { minute: 30, action: '紫菜蛋花汤收尾，盛饭上桌' },
  ],
  dishes: [
    { id: 'dish-tomato-beef', name: '番茄牛腩', mealRole: 'MAIN', cuisine: '湘菜', flavorTags: ['微辣', '酸甜'], spicyLevel: 1, activeMinutes: 25, equipment: ['wok'] },
    { id: 'dish-stir-veg', name: '清炒时蔬', mealRole: 'SIDE', cuisine: '家常', flavorTags: ['清淡'], spicyLevel: 0, activeMinutes: 8, equipment: ['wok'] },
    { id: 'dish-egg-soup', name: '紫菜蛋花汤', mealRole: 'SOUP', cuisine: '家常', flavorTags: ['清淡'], spicyLevel: 0, activeMinutes: 5, equipment: ['wok'] },
    { id: 'dish-rice', name: '米饭', mealRole: 'STAPLE', flavorTags: ['清淡'], spicyLevel: 0, activeMinutes: 2, equipment: ['rice_cooker'] },
  ],
}

const menuCurryChicken: MenuSnapshot = {
  id: 'menu-curry-chicken',
  name: '咖喱鸡套餐',
  scene: 'WEEKDAY_FAST',
  totalActiveMinutes: 28,
  prepSequence: [
    { minute: 0, action: '洗米煮饭（电饭煲）' },
    { minute: 8, action: '切鸡块/土豆/胡萝卜' },
    { minute: 15, action: '炒鸡块+炖煮，加咖喱块' },
    { minute: 25, action: '收汁，盛饭上桌' },
  ],
  dishes: [
    { id: 'dish-curry-chicken', name: '咖喱鸡', mealRole: 'MAIN', cuisine: '家常', flavorTags: ['咸鲜', '微甜'], spicyLevel: 1, activeMinutes: 20, equipment: ['wok'] },
    { id: 'dish-cold-tofu', name: '凉拌豆腐', mealRole: 'SIDE', cuisine: '家常', flavorTags: ['清淡'], spicyLevel: 0, activeMinutes: 3, equipment: [] },
    { id: 'dish-rice2', name: '米饭', mealRole: 'STAPLE', flavorTags: ['清淡'], spicyLevel: 0, activeMinutes: 2, equipment: ['rice_cooker'] },
  ],
}

const menuPotatoBeef: MenuSnapshot = {
  id: 'menu-potato-beef',
  name: '土豆烧牛肉套餐',
  scene: 'WEEKEND',
  totalActiveMinutes: 35,
  prepSequence: [
    { minute: 0, action: '洗米煮饭（电饭煲）' },
    { minute: 10, action: '切牛肉/土豆/胡萝卜，牛肉焯水' },
    { minute: 20, action: '炖煮土豆烧牛肉' },
    { minute: 32, action: '炒青菜，盛饭上桌' },
  ],
  dishes: [
    { id: 'dish-potato-beef', name: '土豆烧牛肉', mealRole: 'MAIN', cuisine: '家常', flavorTags: ['咸鲜'], spicyLevel: 0, activeMinutes: 30, equipment: ['wok'] },
    { id: 'dish-greens', name: '蒜蓉青菜', mealRole: 'SIDE', cuisine: '家常', flavorTags: ['清淡'], spicyLevel: 0, activeMinutes: 5, equipment: ['wok'] },
    { id: 'dish-rice3', name: '米饭', mealRole: 'STAPLE', flavorTags: ['清淡'], spicyLevel: 0, activeMinutes: 2, equipment: ['rice_cooker'] },
  ],
}

/** menuId -> 菜单快照（供 candidates/plan 页查询） */
export const mockMenuMap: Record<string, MenuSnapshot> = {
  [menuTomatoBeef.id]: menuTomatoBeef,
  [menuCurryChicken.id]: menuCurryChicken,
  [menuPotatoBeef.id]: menuPotatoBeef,
}

// ───── 家庭规则 ─────

export const mockFamilyRule: FamilyRule = {
  id: 'rule-mock-001',
  familyId: 'seed-family',
  defaultPeople: 4,
  timeBudgets: [30, 60],
  equipment: ['wok', 'rice_cooker'],
  cuisines: ['湘菜', '家常'],
  updatedAt: new Date('2026-08-01T00:00:00Z'),
}

// ───── 禁忌规则（ExclusionRule，v0.2 新增） ─────

export const mockExclusions: ExclusionRule[] = [
  {
    id: 'ex-mock-001',
    familyId: 'seed-family',
    scope: 'INGREDIENT',
    targetId: 'ing-cilantro',
    severity: 'HARD',
    note: '爸爸不吃香菜',
  },
  {
    id: 'ex-mock-002',
    familyId: 'seed-family',
    scope: 'TAG',
    targetTag: '内脏',
    severity: 'SOFT',
    note: '孩子不喜欢',
  },
]

// ───── 候选（CandidateView，含 menu 详情） ─────

export const mockCandidates: CandidateView[] = [
  {
    menuId: menuTomatoBeef.id,
    score: 0.86,
    reasons: ['消耗1种标记食材', '30分钟内可完成', '近期未做过', '匹配家庭偏好菜系'],
    breakdown: { historyAcceptance: 0.7, timeDifficulty: 0.8, ingredientReuse: 1, preferenceCoverage: 0.9, recentDiversity: 0.8, categoryDiversity: 0.7 },
    menu: menuTomatoBeef,
  },
  {
    menuId: menuCurryChicken.id,
    score: 0.79,
    reasons: ['30分钟内轻松完成', '近期未做过', '补充近期未做的菜品类别'],
    breakdown: { historyAcceptance: 0.7, timeDifficulty: 1, ingredientReuse: 0.5, preferenceCoverage: 0.7, recentDiversity: 0.8, categoryDiversity: 0.8 },
    menu: menuCurryChicken,
  },
  {
    menuId: menuPotatoBeef.id,
    score: 0.72,
    reasons: ['历史接受度高', '曾标记愿意再做'],
    breakdown: { historyAcceptance: 0.9, timeDifficulty: 0.6, ingredientReuse: 0.5, preferenceCoverage: 0.6, recentDiversity: 0.2, categoryDiversity: 0.5 },
    menu: menuPotatoBeef,
  },
]

// ───── 推荐结果 ─────

export const mockRecommendResult: RecommendResult = {
  candidates: mockCandidates,
  planId: 'plan-mock-001',
}

// ───── 采购清单（对齐 list-merger 输出结构） ─────

export const mockShoppingList: ShoppingListData = {
  groups: [
    {
      category: '蔬菜',
      items: [
        { ingredientId: 'ing-tomato', name: '番茄', category: '蔬菜', qty: 300, unit: 'g', checked: false },
        { ingredientId: 'ing-potato', name: '土豆', category: '蔬菜', qty: 200, unit: 'g', checked: false },
        { ingredientId: 'ing-green-onion', name: '小葱', category: '蔬菜', qty: 2, unit: '根', checked: false },
      ],
    },
    {
      category: '肉类',
      items: [
        { ingredientId: 'ing-beef', name: '牛腩', category: '肉类', qty: 400, unit: 'g', checked: false },
      ],
    },
    {
      category: '蛋奶',
      items: [
        { ingredientId: 'ing-egg', name: '鸡蛋', category: '蛋奶', qty: 2, unit: '个', checked: false },
      ],
    },
    {
      category: '主食',
      items: [
        { ingredientId: 'ing-rice', name: '大米', category: '主食', qty: 2, unit: '杯', checked: false },
      ],
    },
  ],
}

// ───── 计划 ─────

export const mockPlan: Plan = {
  id: 'plan-mock-001',
  familyId: 'seed-family',
  planDate: new Date('2026-08-07T00:00:00Z'),
  context: { people: 4, timeBudgetMin: 30, mustUse: ['番茄'] },
  candidates: mockCandidates.map((c) => ({ menuId: c.menuId, score: c.score, reasons: c.reasons, breakdown: c.breakdown })),
  lockedMenuId: 'menu-tomato-beef',
  shoppingList: { groups: mockShoppingList.groups },
  status: 'LOCKED',
  createdAt: new Date('2026-08-07T10:00:00Z'),
}

export const mockPlanList: Plan[] = [
  {
    id: 'plan-mock-001',
    familyId: 'seed-family',
    planDate: new Date('2026-08-07T00:00:00Z'),
    context: { people: 4, timeBudgetMin: 30, mustUse: ['番茄'] },
    candidates: mockCandidates.map((c) => ({ menuId: c.menuId, score: c.score, reasons: c.reasons })),
    lockedMenuId: 'menu-tomato-beef',
    status: 'COOKED',
    createdAt: new Date('2026-08-07T10:00:00Z'),
  },
  {
    id: 'plan-mock-002',
    familyId: 'seed-family',
    planDate: new Date('2026-08-06T00:00:00Z'),
    context: { people: 3, timeBudgetMin: 60, mustUse: [] },
    candidates: [{ menuId: 'menu-curry-chicken', score: 0.81, reasons: ['60分钟内轻松完成'] }],
    lockedMenuId: 'menu-curry-chicken',
    status: 'COOKED',
    createdAt: new Date('2026-08-06T18:00:00Z'),
  },
  {
    id: 'plan-mock-003',
    familyId: 'seed-family',
    planDate: new Date('2026-08-05T00:00:00Z'),
    context: { people: 4, timeBudgetMin: 30, mustUse: [] },
    candidates: [{ menuId: 'menu-potato-beef', score: 0.74, reasons: ['近期未做过'] }],
    lockedMenuId: 'menu-potato-beef',
    status: 'SKIPPED',
    createdAt: new Date('2026-08-05T18:00:00Z'),
  },
]

// ───── Mock 异步方法（模拟 API 延迟） ─────

function delay<T>(data: T, ms = 100): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(data), ms))
}

export const mockApi = {
  getFamilyRules: (): Promise<FamilyRule | null> => delay(mockFamilyRule),
  putFamilyRules: (rule: FamilyRule): Promise<FamilyRule> => delay({ ...rule, updatedAt: new Date() }),
  getExclusions: (): Promise<ExclusionRule[]> => delay(mockExclusions),
  putExclusions: (rules: ExclusionRule[]): Promise<ExclusionRule[]> => delay(rules),
  recommend: (): Promise<RecommendResult> => delay(mockRecommendResult),
  lockPlan: (planId: string, menuId: string): Promise<Plan> =>
    delay({ ...mockPlan, id: planId, lockedMenuId: menuId, status: 'LOCKED' }),
  swapPlan: (planId: string): Promise<Plan> =>
    delay({ ...mockPlan, id: planId, status: 'PROPOSED' }),
  getShoppingList: (): Promise<ShoppingListData> => delay(mockShoppingList),
  patchShoppingList: (list: ShoppingListData): Promise<ShoppingListData> => delay(list),
  addFeedback: (
    planId: string,
    result: string,
    actualMinutes?: number,
    cookResult?: string,
    failPoints?: string,
  ): Promise<Plan> => {
    // Mock 不写 CookLog，仅占位保持签名与真 API 一致
    void actualMinutes
    void cookResult
    void failPoints
    return delay({ ...mockPlan, id: planId, status: result === 'not_cooked' ? 'SKIPPED' : 'COOKED' })
  },
  listPlans: (): Promise<Plan[]> => delay(mockPlanList),
  repeatPlan: (): Promise<Plan> => delay({ ...mockPlan, id: 'plan-mock-new', status: 'PROPOSED' }),
}
