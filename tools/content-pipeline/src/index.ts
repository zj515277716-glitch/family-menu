// tools/content-pipeline - 豆包起草 CLI（内容管线三段：coverage/draft/import）
// 产物永远只落 DRAFT 状态（DEC-006），工具仅本机运行不进服务器
// 运行时零 LLM：管线在 tools/ 非 apps/（DEC-006 合规）

// coverage：覆盖矩阵
export {
  computeCoverageGaps,
  inferMainProtein,
  findTimeBucket,
  gapToSlot,
  parseSlot,
  TIME_BUCKETS,
  EQUIPMENTS,
  SCENES,
  MAIN_PROTEINS,
  type CoverageDishView,
  type CoverageGap,
  type MainProtein,
  type ParsedSlot,
} from './coverage.js';

// draft：起草
export {
  draftDish,
  draftFromSlotString,
  validateDraftDish,
  loadPrompt,
  buildDraftFileName,
  writeDraftFile,
  DraftIngredientSchema,
  MAX_ATTEMPTS,
  type DraftDish,
  type DraftIngredient,
  type DraftOptions,
  type DraftResult,
} from './draft.js';

// import：导入
export {
  importDraft,
  importDraftFile,
  prepareDraftDish,
  DraftFileSchema,
  type DraftWriter,
  type DishDraftCreateInput,
  type DishIngredientLinkInput,
  type ImportResult,
} from './import.js';

// ark：豆包 client
export { createArkClient, type ArkChatClient, type ChatMessage } from './ark.js';

/** 兼容既有包名导出 */
export const PACKAGE_NAME = '@family-menu/content-pipeline';
