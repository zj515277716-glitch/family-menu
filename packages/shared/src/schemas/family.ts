// packages/shared/src/schemas/family.ts
// 家庭与规则契约，对齐实施方案 3.2 数据模型（Family / FamilyRule / ExclusionRule）
import { z } from 'zod';

// ───── 枚举 ─────

/**
 * 禁忌严重度（文件③7.4 核心修正：硬软分离）。
 * HARD = 过敏/绝对禁忌（安全过滤，一票否决）；
 * SOFT = 不喜欢（推荐时降权，不阻断）。
 */
export const SeveritySchema = z.enum(['HARD', 'SOFT']);

/**
 * 禁忌作用域。
 * INGREDIENT = 针对某食材（targetId=ingredientId）；
 * DISH = 针对某菜品（targetId=dishId）；
 * TAG = 针对某标签（targetTag，如 "内脏"）。
 */
export const ExclusionScopeSchema = z.enum(['INGREDIENT', 'DISH', 'TAG']);

// ───── 模型 ─────

/** 家庭（familyId 全链路贯穿，阶段2多家庭零改造） */
export const FamilySchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.date(),
});

/** 家庭规则：人数/常用时长档/器具/偏好菜系 */
export const FamilyRuleSchema = z.object({
  id: z.string(),
  familyId: z.string(),
  defaultPeople: z.number().int().default(4),
  timeBudgets: z.array(z.number().int()), // 常用时长档，如 [30, 60]
  equipment: z.array(z.string()), // wok/rice_cooker/steamer/air_fryer
  cuisines: z.array(z.string()), // 如 湘菜/家常
  updatedAt: z.date(),
});

/**
 * 禁忌规则。
 * 语义：scope=INGREDIENT|DISH 时填 targetId；scope=TAG 时填 targetTag。
 * 此处不叠加 superRefine 强约束，保持与 3.2 字段定义一致（均 optional），
 * 语义校验留给业务层（STEP-04 引擎安全过滤）。
 */
export const ExclusionRuleSchema = z.object({
  id: z.string(),
  familyId: z.string(),
  scope: ExclusionScopeSchema,
  targetId: z.string().optional(), // ingredientId 或 dishId
  targetTag: z.string().optional(), // scope=TAG 时用，如 "内脏"
  severity: SeveritySchema,
  note: z.string().optional(), // "爸爸不吃腊肉"
});
