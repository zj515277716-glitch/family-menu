// packages/shared/src/types/index.ts
// 从 zod schema 推导的 TypeScript 类型（z.infer），覆盖全部 schema 和枚举
import type { z } from 'zod';
import {
  FamilySchema,
  FamilyRuleSchema,
  ExclusionRuleSchema,
  SeveritySchema,
  ExclusionScopeSchema,
} from '../schemas/family.js';
import {
  DishSchema,
  DishIngredientSchema,
  IngredientSchema,
  SubstitutionSchema,
  DishStepSchema,
  MealRoleSchema,
  ContentStatusSchema,
  ContentOriginSchema,
} from '../schemas/dish.js';
import {
  MenuSchema,
  MenuDishSchema,
  CookLogSchema,
  MenuSceneSchema,
  PrepSequenceItemSchema,
} from '../schemas/menu.js';
import {
  PlanSchema,
  EventSchema,
  PlanStatusSchema,
  EventTypeSchema,
  PlanContextSchema,
  CandidateSchema,
  CandidateBreakdownSchema,
  ShoppingListSchema,
  EventPayloadSchema,
} from '../schemas/plan.js';
import {
  PlanIdParamsSchema,
  SwapTypeSchema,
  FeedbackResultSchema,
  CookResultSchema,
  PutFamilyRulesRequestSchema,
  PutExclusionsRequestSchema,
  RecommendRequestSchema,
  SwapPlanRequestSchema,
  PatchShoppingListRequestSchema,
  FeedbackRequestSchema,
  FamilyRulesResponseSchema,
  GetExclusionsResponseSchema,
  RecommendResponseSchema,
  PlanResponseSchema,
  PlanListResponseSchema,
  ShoppingListResponseSchema,
} from '../schemas/api.js';

// ───── family ─────
export type Family = z.infer<typeof FamilySchema>;
export type FamilyRule = z.infer<typeof FamilyRuleSchema>;
export type ExclusionRule = z.infer<typeof ExclusionRuleSchema>;
export type Severity = z.infer<typeof SeveritySchema>;
export type ExclusionScope = z.infer<typeof ExclusionScopeSchema>;

// ───── dish ─────
export type Dish = z.infer<typeof DishSchema>;
export type DishIngredient = z.infer<typeof DishIngredientSchema>;
export type Ingredient = z.infer<typeof IngredientSchema>;
export type Substitution = z.infer<typeof SubstitutionSchema>;
export type DishStep = z.infer<typeof DishStepSchema>;
export type MealRole = z.infer<typeof MealRoleSchema>;
export type ContentStatus = z.infer<typeof ContentStatusSchema>;
export type ContentOrigin = z.infer<typeof ContentOriginSchema>;

// ───── menu ─────
export type Menu = z.infer<typeof MenuSchema>;
export type MenuDish = z.infer<typeof MenuDishSchema>;
export type CookLog = z.infer<typeof CookLogSchema>;
export type MenuScene = z.infer<typeof MenuSceneSchema>;
export type PrepSequenceItem = z.infer<typeof PrepSequenceItemSchema>;

// ───── plan ─────
export type Plan = z.infer<typeof PlanSchema>;
export type Event = z.infer<typeof EventSchema>;
export type PlanStatus = z.infer<typeof PlanStatusSchema>;
export type EventType = z.infer<typeof EventTypeSchema>;
export type PlanContext = z.infer<typeof PlanContextSchema>;
export type Candidate = z.infer<typeof CandidateSchema>;
export type CandidateBreakdown = z.infer<typeof CandidateBreakdownSchema>;
export type ShoppingList = z.infer<typeof ShoppingListSchema>;
export type EventPayload = z.infer<typeof EventPayloadSchema>;

// ───── api ─────
export type PlanIdParams = z.infer<typeof PlanIdParamsSchema>;
export type SwapType = z.infer<typeof SwapTypeSchema>;
export type FeedbackResult = z.infer<typeof FeedbackResultSchema>;
export type CookResult = z.infer<typeof CookResultSchema>;
export type PutFamilyRulesRequest = z.infer<typeof PutFamilyRulesRequestSchema>;
export type PutExclusionsRequest = z.infer<typeof PutExclusionsRequestSchema>;
export type RecommendRequest = z.infer<typeof RecommendRequestSchema>;
export type SwapPlanRequest = z.infer<typeof SwapPlanRequestSchema>;
export type PatchShoppingListRequest = z.infer<typeof PatchShoppingListRequestSchema>;
export type FeedbackRequest = z.infer<typeof FeedbackRequestSchema>;
export type FamilyRulesResponse = z.infer<typeof FamilyRulesResponseSchema>;
export type GetExclusionsResponse = z.infer<typeof GetExclusionsResponseSchema>;
export type RecommendResponse = z.infer<typeof RecommendResponseSchema>;
export type PlanResponse = z.infer<typeof PlanResponseSchema>;
export type PlanListResponse = z.infer<typeof PlanListResponseSchema>;
export type ShoppingListResponse = z.infer<typeof ShoppingListResponseSchema>;
