import { z } from 'zod';
/** 计划相关路由的 :id 参数 */
export declare const PlanIdParamsSchema: z.ZodObject<{
    id: z.ZodString;
}, z.core.$strip>;
/**
 * 换菜类型（POST /api/plans/:id/swap）。
 * 全换 = 整套换（对应 EventType.SWAP_MENU）；
 * 单菜换 = 单道菜换（对应 EventType.SWAP_DISH）。
 * 取值依据任务卡 5.1 路由清单 "swapType: string(全换/单菜换)"。
 */
export declare const SwapTypeSchema: z.ZodEnum<{
    全换: "全换";
    单菜换: "单菜换";
}>;
/**
 * 第②问：味道怎么样（v0.6，DEC-015）。
 * good = 好吃 / ok = 一般 / fail = 翻车。
 * didCook=true 时必填、didCook=false 时禁传（superRefine 校验，见 FeedbackRequestSchema）。
 */
export declare const TasteSchema: z.ZodEnum<{
    fail: "fail";
    good: "good";
    ok: "ok";
}>;
/** PUT /api/family/rules 请求体（即家庭规则全量写入） */
export declare const PutFamilyRulesRequestSchema: z.ZodObject<{
    id: z.ZodString;
    familyId: z.ZodString;
    defaultPeople: z.ZodDefault<z.ZodNumber>;
    timeBudgets: z.ZodArray<z.ZodNumber>;
    equipment: z.ZodArray<z.ZodString>;
    cuisines: z.ZodArray<z.ZodString>;
    updatedAt: z.ZodDate;
}, z.core.$strip>;
/**
 * PUT /api/family/exclusions 请求体（禁忌规则全量替换）。
 * 语义：整体替换该 family 的全部 ExclusionRule（非增量），与 PUT /api/family/rules 同构。
 * v0.2 新增（STEP-06 契约缺口修复：禁忌不持久化）。
 */
export declare const PutExclusionsRequestSchema: z.ZodArray<z.ZodObject<{
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
}, z.core.$strip>>;
/** POST /api/recommend 请求体（今晚情境） */
export declare const RecommendRequestSchema: z.ZodObject<{
    people: z.ZodNumber;
    timeBudgetMin: z.ZodNumber;
    mustUse: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
/**
 * POST /api/plans/:id/swap 请求体（v0.4，DEC-013）。
 * reason 改为可选（PD-003：换菜原因可不填，服务端未填存 null）；
 * 单菜换：dishId = 被换下的菜（语义钉死），newDishId = 换入的新菜，两者必填且不得相等；
 * 全换：忽略 dishId/newDishId（v0.3 形态保留，「整套换」功能已推迟但契约枚举不动）。
 * 行为收紧：v0.3 可过校验的畸形报文（单菜换缺双 id）v0.4 起 400 拒绝（杜绝假成功，非破坏性变更）。
 */
export declare const SwapPlanRequestSchema: z.ZodObject<{
    reason: z.ZodOptional<z.ZodString>;
    swapType: z.ZodEnum<{
        全换: "全换";
        单菜换: "单菜换";
    }>;
    dishId: z.ZodOptional<z.ZodString>;
    newDishId: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
/**
 * GET /api/plans/:id/swap-options 查询参数（v0.4，DEC-013）：被换下的菜 dishId 必填。
 */
export declare const SwapOptionsQuerySchema: z.ZodObject<{
    dishId: z.ZodString;
}, z.core.$strip>;
/**
 * GET /api/plans/:id/swap-options 响应中的单个候选（v0.4，DEC-013）。
 * 只出事实字段；「不用开火」等派生展示由前端按 equipment 计算（契约不出派生字段）。
 */
export declare const SwapOptionSchema: z.ZodObject<{
    dishId: z.ZodString;
    name: z.ZodString;
    mealRole: z.ZodEnum<{
        MAIN: "MAIN";
        SIDE: "SIDE";
        SOUP: "SOUP";
        STAPLE: "STAPLE";
    }>;
    cuisine: z.ZodOptional<z.ZodString>;
    flavorTags: z.ZodArray<z.ZodString>;
    spicyLevel: z.ZodNumber;
    activeMinutes: z.ZodNumber;
    totalMinutes: z.ZodNumber;
    equipment: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
/**
 * GET /api/plans/:id/swap-options 响应（v0.4，DEC-013）。
 * candidates 为空数组 = 该菜当前没有可换的候选（200 如实态而非错误，对齐确认书 C-6）。
 */
export declare const SwapOptionsResponseSchema: z.ZodObject<{
    dishId: z.ZodString;
    mealRole: z.ZodEnum<{
        MAIN: "MAIN";
        SIDE: "SIDE";
        SOUP: "SOUP";
        STAPLE: "STAPLE";
    }>;
    candidates: z.ZodArray<z.ZodObject<{
        dishId: z.ZodString;
        name: z.ZodString;
        mealRole: z.ZodEnum<{
            MAIN: "MAIN";
            SIDE: "SIDE";
            SOUP: "SOUP";
            STAPLE: "STAPLE";
        }>;
        cuisine: z.ZodOptional<z.ZodString>;
        flavorTags: z.ZodArray<z.ZodString>;
        spicyLevel: z.ZodNumber;
        activeMinutes: z.ZodNumber;
        totalMinutes: z.ZodNumber;
        equipment: z.ZodArray<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
/** PATCH /api/plans/:id/shopping-list 请求体（勾选状态） */
export declare const PatchShoppingListRequestSchema: z.ZodObject<{
    itemId: z.ZodString;
    checked: z.ZodBoolean;
}, z.core.$strip>;
/**
 * POST /api/plans/:id/shopping-list/rescale 请求体（v0.5，DEC-014）。
 * people = 改后的今晚人数（>=1）；服务端按新人数重算清单并持久化，
 * 同步更新 plan.context.people，按 ingredientId 保留勾选状态，写 Event RESCALE。
 */
export declare const RescaleShoppingListRequestSchema: z.ZodObject<{
    people: z.ZodNumber;
}, z.core.$strip>;
/**
 * POST /api/plans/:id/feedback 请求体（v0.6 三问模型，DEC-015，对应 C-10/PD-006）。
 * didCook = 第①问「做了吗」（必填）；
 * taste = 第②问「味道怎么样」（didCook=true 必填、false 禁传，superRefine 校验）；
 * willRepeat = 第③问「下次还做吗」（必填——没做也可答不做了，C-11 灰标签规则）；
 * actualMinutes = 实际耗时选填（PD-006）。
 * 写入映射（裁决 2/3，DEC-015）：didCook=true -> Event COOKED（payload 含三问+耗时）+ CookLog
 * （taste 映射 result：good->success / ok->partial / fail->fail）；didCook=false -> Event
 * NOT_COOKED（payload 无 taste），不写 CookLog。
 * breaking：旧 result/cookResult/failPoints 报文 v0.6 起 400 拒绝（消费面仅自家 h5，同 PR 升级）。
 */
export declare const FeedbackRequestSchema: z.ZodObject<{
    didCook: z.ZodBoolean;
    taste: z.ZodOptional<z.ZodEnum<{
        fail: "fail";
        good: "good";
        ok: "ok";
    }>>;
    willRepeat: z.ZodBoolean;
    actualMinutes: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
/**
 * GET /api/plans/:id/feedback 响应（v0.6，DEC-015 裁决 4；v0.9 空态语义修订，T-P12）。
 * 返回该 plan 事件流最新一条反馈（didCook 由事件类型派生：COOKED/NOT_COOKED）；
 * taste/willRepeat/actualMinutes 取事件 payload；submittedAt = 事件创建时间。
 * 响应侧 taste/willRepeat/actualMinutes optional：v0.5 旧事件 payload 无这些字段，如实缺省不编造。
 * v0.9（T-P12，挂账⑤）：本 schema 描述「有反馈」报文形状（零变化）；plan 存在但无反馈时
 * 路由层直接返回 200 + JSON null（响应体即 null 字面量）；plan 不存在时仍 404。
 */
export declare const FeedbackResponseSchema: z.ZodObject<{
    didCook: z.ZodBoolean;
    taste: z.ZodOptional<z.ZodEnum<{
        fail: "fail";
        good: "good";
        ok: "ok";
    }>>;
    willRepeat: z.ZodOptional<z.ZodBoolean>;
    actualMinutes: z.ZodOptional<z.ZodNumber>;
    submittedAt: z.ZodDate;
}, z.core.$strip>;
/** GET|PUT /api/family/rules 响应 */
export declare const FamilyRulesResponseSchema: z.ZodObject<{
    id: z.ZodString;
    familyId: z.ZodString;
    defaultPeople: z.ZodDefault<z.ZodNumber>;
    timeBudgets: z.ZodArray<z.ZodNumber>;
    equipment: z.ZodArray<z.ZodString>;
    cuisines: z.ZodArray<z.ZodString>;
    updatedAt: z.ZodDate;
}, z.core.$strip>;
/**
 * GET /api/family/exclusions 响应（该 family 的全部禁忌规则）。
 * v0.2 新增（STEP-06 契约缺口修复：禁忌不持久化）。
 */
export declare const GetExclusionsResponseSchema: z.ZodArray<z.ZodObject<{
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
}, z.core.$strip>>;
/**
 * POST /api/recommend 响应（3 套候选+理由）。
 * v0.3（TP-02/PD-012）：新增 optional unmetMustUse —— 必消食材硬过滤空手信号：
 * 非空 = 这些必消食材无法被任何菜单消耗，本次空手（candidates 为空数组、不建 Plan）；
 * 正常推荐时字段缺省或为空数组。向后兼容：optional 缺省不影响 v0.2 调用方（先例同 FeedbackRequestSchema.cookResult）。
 */
export declare const RecommendResponseSchema: z.ZodObject<{
    candidates: z.ZodArray<z.ZodObject<{
        menuId: z.ZodString;
        score: z.ZodNumber;
        reasons: z.ZodArray<z.ZodString>;
        breakdown: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        menu: z.ZodOptional<z.ZodUnknown>;
    }, z.core.$strip>>;
    unmetMustUse: z.ZodOptional<z.ZodArray<z.ZodString>>;
    unmetReasons: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodEnum<{
        TIME_BUDGET: "TIME_BUDGET";
        NO_DISH: "NO_DISH";
    }>>>;
}, z.core.$strip>;
/** 单个计划响应（lock/swap/feedback/repeat） */
export declare const PlanResponseSchema: z.ZodObject<{
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
/** GET /api/plans 响应（历史列表） */
export declare const PlanListResponseSchema: z.ZodArray<z.ZodObject<{
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
}, z.core.$strip>>;
/** GET|PATCH /api/plans/:id/shopping-list 响应 */
export declare const ShoppingListResponseSchema: z.ZodObject<{
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
//# sourceMappingURL=api.d.ts.map