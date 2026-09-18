import { z } from 'zod';
/** 菜品角色 */
export declare const MealRoleSchema: z.ZodEnum<{
    MAIN: "MAIN";
    SIDE: "SIDE";
    SOUP: "SOUP";
    STAPLE: "STAPLE";
}>;
/**
 * 内容状态三态：DRAFT -> TESTED -> PUBLISHED。
 * 只有 PUBLISHED 进入推荐池（安全底线，DEC-006 运行时零LLM）。
 */
export declare const ContentStatusSchema: z.ZodEnum<{
    DRAFT: "DRAFT";
    TESTED: "TESTED";
    PUBLISHED: "PUBLISHED";
}>;
/**
 * 内容来源：LLM_DRAFT（内容管线起草）| MANUAL（人工录入）| FETCHED（外部站点抓取，T-C01）
 */
export declare const ContentOriginSchema: z.ZodEnum<{
    LLM_DRAFT: "LLM_DRAFT";
    MANUAL: "MANUAL";
    FETCHED: "FETCHED";
}>;
/** 菜品步骤：[{order, text, parallel?, image?}]；image 为该步骤做法配图（可选） */
export declare const DishStepSchema: z.ZodObject<{
    order: z.ZodNumber;
    text: z.ZodString;
    parallel: z.ZodOptional<z.ZodBoolean>;
    image: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
/**
 * 菜品（核心壁垒资产）。
 * activeMinutes = 动手时间；totalMinutes = 含炖煮等待的总时长。
 * splitFlavor = 可拆分调味（儿童清淡/成人辣）。
 */
export declare const DishSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    mealRole: z.ZodEnum<{
        MAIN: "MAIN";
        SIDE: "SIDE";
        SOUP: "SOUP";
        STAPLE: "STAPLE";
    }>;
    cuisine: z.ZodOptional<z.ZodString>;
    flavorTags: z.ZodArray<z.ZodString>;
    spicyLevel: z.ZodDefault<z.ZodNumber>;
    splitFlavor: z.ZodDefault<z.ZodBoolean>;
    activeMinutes: z.ZodNumber;
    totalMinutes: z.ZodNumber;
    equipment: z.ZodArray<z.ZodString>;
    steps: z.ZodArray<z.ZodObject<{
        order: z.ZodNumber;
        text: z.ZodString;
        parallel: z.ZodOptional<z.ZodBoolean>;
        image: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    status: z.ZodDefault<z.ZodEnum<{
        DRAFT: "DRAFT";
        TESTED: "TESTED";
        PUBLISHED: "PUBLISHED";
    }>>;
    origin: z.ZodDefault<z.ZodEnum<{
        LLM_DRAFT: "LLM_DRAFT";
        MANUAL: "MANUAL";
        FETCHED: "FETCHED";
    }>>;
    imageUrl: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodString]>>;
    sourceUrl: z.ZodOptional<z.ZodString>;
    sourceSite: z.ZodOptional<z.ZodString>;
    licenseNote: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
/** 菜品-食材关联（qty 为浮点数，如 200.5） */
export declare const DishIngredientSchema: z.ZodObject<{
    id: z.ZodString;
    dishId: z.ZodString;
    ingredientId: z.ZodString;
    qty: z.ZodNumber;
    unit: z.ZodString;
    optional: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strip>;
/** 食材（name 唯一，aliases 归一：西红柿=番茄） */
export declare const IngredientSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    aliases: z.ZodArray<z.ZodString>;
    category: z.ZodString;
    defaultUnit: z.ZodString;
}, z.core.$strip>;
/** 替换关系：ingredientId 可被 substituteId 替换，ratio 默认 1 */
export declare const SubstitutionSchema: z.ZodObject<{
    id: z.ZodString;
    ingredientId: z.ZodString;
    substituteId: z.ZodString;
    ratio: z.ZodDefault<z.ZodNumber>;
    note: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
//# sourceMappingURL=dish.d.ts.map