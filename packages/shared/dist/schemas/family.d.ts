import { z } from 'zod';
/**
 * 禁忌严重度（文件③7.4 核心修正：硬软分离）。
 * HARD = 过敏/绝对禁忌（安全过滤，一票否决）；
 * SOFT = 不喜欢（推荐时降权，不阻断）。
 */
export declare const SeveritySchema: z.ZodEnum<{
    HARD: "HARD";
    SOFT: "SOFT";
}>;
/**
 * 禁忌作用域。
 * INGREDIENT = 针对某食材（targetId=ingredientId）；
 * DISH = 针对某菜品（targetId=dishId）；
 * TAG = 针对某标签（targetTag，如 "内脏"）。
 */
export declare const ExclusionScopeSchema: z.ZodEnum<{
    INGREDIENT: "INGREDIENT";
    DISH: "DISH";
    TAG: "TAG";
}>;
/** 家庭（familyId 全链路贯穿，阶段2多家庭零改造） */
export declare const FamilySchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    createdAt: z.ZodDate;
}, z.core.$strip>;
/** 家庭规则：人数/常用时长档/器具/偏好菜系 */
export declare const FamilyRuleSchema: z.ZodObject<{
    id: z.ZodString;
    familyId: z.ZodString;
    defaultPeople: z.ZodDefault<z.ZodNumber>;
    timeBudgets: z.ZodArray<z.ZodNumber>;
    equipment: z.ZodArray<z.ZodString>;
    cuisines: z.ZodArray<z.ZodString>;
    updatedAt: z.ZodDate;
}, z.core.$strip>;
/**
 * 禁忌规则。
 * 语义：scope=INGREDIENT|DISH 时填 targetId；scope=TAG 时填 targetTag。
 * 此处不叠加 superRefine 强约束，保持与 3.2 字段定义一致（均 optional），
 * 语义校验留给业务层（STEP-04 引擎安全过滤）。
 */
export declare const ExclusionRuleSchema: z.ZodObject<{
    id: z.ZodString;
    familyId: z.ZodString;
    scope: z.ZodEnum<{
        INGREDIENT: "INGREDIENT";
        DISH: "DISH";
        TAG: "TAG";
    }>;
    targetId: z.ZodOptional<z.ZodString>;
    targetTag: z.ZodOptional<z.ZodString>;
    targetName: z.ZodOptional<z.ZodString>;
    severity: z.ZodEnum<{
        HARD: "HARD";
        SOFT: "SOFT";
    }>;
    note: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
//# sourceMappingURL=family.d.ts.map