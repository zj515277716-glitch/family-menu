import { z } from 'zod';
/** 菜单场景 */
export declare const MenuSceneSchema: z.ZodEnum<{
    WEEKDAY_FAST: "WEEKDAY_FAST";
    WEEKEND: "WEEKEND";
    CLEARANCE: "CLEARANCE";
    BUDGET: "BUDGET";
}>;
/** 备菜顺序节点：[{minute, action}] 菜单级并行工序 */
export declare const PrepSequenceItemSchema: z.ZodObject<{
    minute: z.ZodNumber;
    action: z.ZodString;
}, z.core.$strip>;
/**
 * 菜单（一套饭）。
 * totalActiveMinutes = 并行工序后的真实总工时（≠单菜相加）。
 */
export declare const MenuSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    scene: z.ZodEnum<{
        WEEKDAY_FAST: "WEEKDAY_FAST";
        WEEKEND: "WEEKEND";
        CLEARANCE: "CLEARANCE";
        BUDGET: "BUDGET";
    }>;
    serves: z.ZodDefault<z.ZodNumber>;
    totalActiveMinutes: z.ZodNumber;
    prepSequence: z.ZodArray<z.ZodObject<{
        minute: z.ZodNumber;
        action: z.ZodString;
    }, z.core.$strip>>;
    status: z.ZodDefault<z.ZodEnum<{
        DRAFT: "DRAFT";
        TESTED: "TESTED";
        PUBLISHED: "PUBLISHED";
    }>>;
}, z.core.$strip>;
/** 菜单-菜品关联（复合主键 menuId+dishId，sort 为排序序号） */
export declare const MenuDishSchema: z.ZodObject<{
    menuId: z.ZodString;
    dishId: z.ZodString;
    sort: z.ZodNumber;
}, z.core.$strip>;
/**
 * 试做记录：菜单从 DRAFT 升级 TESTED/PUBLISHED 的唯一通道（DEC-006 内容管线）。
 * result = success | partial | fail。
 */
export declare const CookLogSchema: z.ZodObject<{
    id: z.ZodString;
    menuId: z.ZodOptional<z.ZodString>;
    dishId: z.ZodOptional<z.ZodString>;
    cookedAt: z.ZodDate;
    actualMinutes: z.ZodOptional<z.ZodNumber>;
    result: z.ZodEnum<{
        success: "success";
        partial: "partial";
        fail: "fail";
    }>;
    failPoints: z.ZodOptional<z.ZodString>;
    willRepeat: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>;
//# sourceMappingURL=menu.d.ts.map