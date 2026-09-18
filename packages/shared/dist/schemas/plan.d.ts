import { z } from 'zod';
/** 计划状态 */
export declare const PlanStatusSchema: z.ZodEnum<{
    PROPOSED: "PROPOSED";
    LOCKED: "LOCKED";
    COOKED: "COOKED";
    SKIPPED: "SKIPPED";
}>;
/** 行为事件类型（隐式反馈源+埋点，④推翻清单#4）；RESCALE=改人数重算清单（DEC-014） */
export declare const EventTypeSchema: z.ZodEnum<{
    COOKED: "COOKED";
    GENERATE: "GENERATE";
    VIEW: "VIEW";
    LOCK: "LOCK";
    SWAP_MENU: "SWAP_MENU";
    SWAP_DISH: "SWAP_DISH";
    RESCALE: "RESCALE";
    NOT_COOKED: "NOT_COOKED";
    REPEAT: "REPEAT";
}>;
/** 今晚情境：{people, timeBudgetMin, mustUse: string[]} */
export declare const PlanContextSchema: z.ZodObject<{
    people: z.ZodNumber;
    timeBudgetMin: z.ZodNumber;
    mustUse: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
/**
 * 候选评分明细（breakdown）。
 * 3.2 仅标注为 Json，字段结构由推荐引擎（STEP-04）决定，本步不预先固定。
 * 采用 z.record(z.string(), z.unknown()) 承载，待 STEP-04 精化。
 */
export declare const CandidateBreakdownSchema: z.ZodRecord<z.ZodString, z.ZodUnknown>;
/** 候选菜单：3 套候选快照之一 */
export declare const CandidateSchema: z.ZodObject<{
    menuId: z.ZodString;
    score: z.ZodNumber;
    reasons: z.ZodArray<z.ZodString>;
    breakdown: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    menu: z.ZodOptional<z.ZodUnknown>;
}, z.core.$strip>;
/**
 * 合并后采购清单快照 + 勾选状态（DEC-014 精化，取代 record(unknown) 占位）。
 * 形态与 list-merger 输出一致；alreadyHave=已有·必消（PD-004），pantryStaple=家里常备（C-8）。
 * 两个布尔 optional 缺省=未标（旧存库 JSON 无此字段直接兼容）。
 */
export declare const ShoppingListItemSchema: z.ZodObject<{
    ingredientId: z.ZodString;
    name: z.ZodString;
    category: z.ZodString;
    qty: z.ZodNumber;
    unit: z.ZodString;
    checked: z.ZodBoolean;
    alreadyHave: z.ZodOptional<z.ZodBoolean>;
    pantryStaple: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>;
export declare const ShoppingListGroupSchema: z.ZodObject<{
    category: z.ZodString;
    items: z.ZodArray<z.ZodObject<{
        ingredientId: z.ZodString;
        name: z.ZodString;
        category: z.ZodString;
        qty: z.ZodNumber;
        unit: z.ZodString;
        checked: z.ZodBoolean;
        alreadyHave: z.ZodOptional<z.ZodBoolean>;
        pantryStaple: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const ShoppingListSchema: z.ZodObject<{
    groups: z.ZodArray<z.ZodObject<{
        category: z.ZodString;
        items: z.ZodArray<z.ZodObject<{
            ingredientId: z.ZodString;
            name: z.ZodString;
            category: z.ZodString;
            qty: z.ZodNumber;
            unit: z.ZodString;
            checked: z.ZodBoolean;
            alreadyHave: z.ZodOptional<z.ZodBoolean>;
            pantryStaple: z.ZodOptional<z.ZodBoolean>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
/**
 * 事件 payload（如 swap 时记 {reason: "太麻烦"}）。
 * 不同 EventType 的 payload 结构不同，3.2 仅标注为 Json，
 * 采用 z.record(z.string(), z.unknown()) 承载，按需在业务层细化。
 */
export declare const EventPayloadSchema: z.ZodRecord<z.ZodString, z.ZodUnknown>;
/** 计划：一次"今晚吃什么"的完整快照 */
export declare const PlanSchema: z.ZodObject<{
    id: z.ZodString;
    familyId: z.ZodString;
    planDate: z.ZodDate;
    context: z.ZodObject<{
        people: z.ZodNumber;
        timeBudgetMin: z.ZodNumber;
        mustUse: z.ZodArray<z.ZodString>;
    }, z.core.$strip>;
    candidates: z.ZodArray<z.ZodObject<{
        menuId: z.ZodString;
        score: z.ZodNumber;
        reasons: z.ZodArray<z.ZodString>;
        breakdown: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        menu: z.ZodOptional<z.ZodUnknown>;
    }, z.core.$strip>>;
    lockedMenuId: z.ZodOptional<z.ZodString>;
    dishNames: z.ZodOptional<z.ZodArray<z.ZodString>>;
    shoppingList: z.ZodOptional<z.ZodObject<{
        groups: z.ZodArray<z.ZodObject<{
            category: z.ZodString;
            items: z.ZodArray<z.ZodObject<{
                ingredientId: z.ZodString;
                name: z.ZodString;
                category: z.ZodString;
                qty: z.ZodNumber;
                unit: z.ZodString;
                checked: z.ZodBoolean;
                alreadyHave: z.ZodOptional<z.ZodBoolean>;
                pantryStaple: z.ZodOptional<z.ZodBoolean>;
            }, z.core.$strip>>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
    status: z.ZodDefault<z.ZodEnum<{
        PROPOSED: "PROPOSED";
        LOCKED: "LOCKED";
        COOKED: "COOKED";
        SKIPPED: "SKIPPED";
    }>>;
    createdAt: z.ZodDate;
}, z.core.$strip>;
/** 行为事件（埋点） */
export declare const EventSchema: z.ZodObject<{
    id: z.ZodString;
    familyId: z.ZodString;
    planId: z.ZodOptional<z.ZodString>;
    type: z.ZodEnum<{
        COOKED: "COOKED";
        GENERATE: "GENERATE";
        VIEW: "VIEW";
        LOCK: "LOCK";
        SWAP_MENU: "SWAP_MENU";
        SWAP_DISH: "SWAP_DISH";
        RESCALE: "RESCALE";
        NOT_COOKED: "NOT_COOKED";
        REPEAT: "REPEAT";
    }>;
    payload: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    createdAt: z.ZodDate;
}, z.core.$strip>;
//# sourceMappingURL=plan.d.ts.map