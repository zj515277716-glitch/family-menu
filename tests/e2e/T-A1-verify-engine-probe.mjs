// T-A1 运行时探针：在 apps/api 运行时同源环境（dist 产物）实证引擎宽匹配。
// 用法：node tests/e2e/T-A1-verify-engine-probe.mjs
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const req = createRequire(path.resolve('apps/api/package.json'))
// 包只有 exports.import（纯 ESM），CJS require 解析不到；按 tsx 运行时同款路径直接动态 import dist
const engineEntry = path.resolve('apps/api/node_modules/@family-menu/engine/dist/index.js')
const { filterSafeDishes } = await import(pathToFileURL(engineEntry).href)
void req

// 最小 DishView：花生米（名称≠品类词，T-C07/09-14 零拦截形态）
const dish = {
  id: 'probe-gongbao',
  name: '探针：宫保鸡丁',
  mealRole: 'MAIN',
  cuisine: '川菜',
  flavorTags: ['香辣'],
  spicyLevel: 2,
  splitFlavor: false,
  activeMinutes: 15,
  totalMinutes: 25,
  equipment: ['wok'],
  steps: [],
  status: 'PUBLISHED',
  origin: 'FETCHED',
  ingredients: [
    {
      ingredientId: 'probe-ing-peanut',
      ingredientName: '花生米',
      aliases: ['熟花生米', '油炸花生米'],
      category: '调料',
      qty: 50,
      unit: 'g',
      optional: false,
    },
    {
      ingredientId: 'probe-ing-chicken',
      ingredientName: '鸡胸肉',
      aliases: [],
      category: '肉类',
      qty: 200,
      unit: 'g',
      optional: false,
    },
  ],
}

// 仅 TAG 规则（花生，HARD）——复刻「INGREDIENT 规则悬空、只剩 TAG 规则」的 P0-1 失效形态
const exclusions = [
  { id: 'seed-excl-peanut', scope: 'TAG', targetTag: '花生', severity: 'HARD' },
]

const { passed, excluded } = filterSafeDishes([dish], exclusions)
const lines = [
  'engine runtime probe（@family-menu/engine dist，apps/api 同源解析）',
  `excluded=${excluded.length} passed=${passed.length}`,
  ...excluded.map((e) => `reason: ${e.reason}`),
]
console.log(lines.join('\n'))
const ok = excluded.length === 1 && passed.length === 0 && excluded[0].reason.includes('名称含「花生」')
console.log(ok ? 'PROBE PASS：仅 TAG 规则下花生米宽匹配仍拦截' : 'PROBE FAIL')
process.exit(ok ? 0 : 1)
