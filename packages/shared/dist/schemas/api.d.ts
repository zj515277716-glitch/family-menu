import { z } from 'zod';
/** 计划相关路由的 :id 参数 */
export declare const PlanIdParamsSchema: z.ZodObject<{
    id: z.ZodString;
}, z.core.$strip>;
/**
 * 换菜类型（POST /api/plans/:id/swap）。
 * 全换 = 换一批：三餐整体重推（对应 EventType.SWAP_MENU，当前全天已用菜不回池）；
 * 换一餐 = 某餐整体重推，其他两餐不动（v0.12，PD-020/C-3a）；
 * 单菜换 = 单道菜换（对应 EventType.SWAP_DISH，语义不变）。
 */
export declare const SwapTypeSchema: z.ZodEnum<{
    全换: "全换";
    单菜换: "单菜换";
    换一餐: "换一餐";
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
/**
 * POST /api/recommend 请求体（v0.12：日计划上下文，PD-020）。
 * 旧 PlanContext（people 口径）报文 v0.12 起 400 拒绝——成人/儿童分列是三餐计划
 * 的硬输入（儿童触发少辣/少刺/软烂约束），无可靠默认值可代填（不静默猜测）。
 */
export declare const RecommendRequestSchema: z.ZodObject<{
    adults: z.ZodNumber;
    children: z.ZodNumber;
    timeBudgetMin: z.ZodUnion<readonly [z.ZodLiteral<15>, z.ZodLiteral<30>, z.ZodLiteral<60>]>;
    mustUseIngredients: z.ZodArray<z.ZodString>;
    tempAvoidances: z.ZodOptional<z.ZodArray<z.ZodObject<{
        ingredientId: z.ZodOptional<z.ZodString>;
        ingredientName: z.ZodOptional<z.ZodString>;
        aliases: z.ZodOptional<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>>>;
    desiredDishIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
    meals: z.ZodOptional<z.ZodArray<z.ZodEnum<{
        breakfast: "breakfast";
        lunch: "lunch";
        dinner: "dinner";
    }>>>;
    avoidRecentDays: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
/**
 * POST /api/plans/:id/swap 请求体（v0.4，DEC-013；v0.12 扩「换一餐」）。
 * reason 可选（PD-003：换菜原因可不填，服务端未填存 null）；
 * 单菜换：dishId = 被换下的菜（语义钉死），newDishId = 换入的新菜，两者必填且不得相等；
 * 换一餐：slot = 要整体重推的餐次（必填），忽略 dishId/newDishId；
 * 全换：忽略 slot/dishId/newDishId（三餐整体重推，当前已用菜不回池）。
 */
export declare const SwapPlanRequestSchema: z.ZodObject<{
    reason: z.ZodOptional<z.ZodString>;
    swapType: z.ZodEnum<{
        全换: "全换";
        单菜换: "单菜换";
        换一餐: "换一餐";
    }>;
    dishId: z.ZodOptional<z.ZodString>;
    newDishId: z.ZodOptional<z.ZodString>;
    slot: z.ZodOptional<z.ZodEnum<{
        breakfast: "breakfast";
        lunch: "lunch";
        dinner: "dinner";
    }>>;
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
 * POST /api/plans/:id/shopping-list/rescale 请求体（v0.5 DEC-014 {people}；v0.12 三餐口径替换）。
 * adults/children = 改后的成人/儿童人数；服务端按（成人+儿童）人数重算清单并持久化，
 * 同步更新 plan.dayContext，按 ingredientId 保留勾选状态，写 Event RESCALE。
 * 旧 {people} 报文 v0.12 起 400 拒绝（成人/儿童分列口径，无法从合并人数反推）。
 */
export declare const RescaleShoppingListRequestSchema: z.ZodObject<{
    adults: z.ZodNumber;
    children: z.ZodNumber;
}, z.core.$strip>;
/**
 * POST /api/plans/:id/feedback 请求体（v0.6 三问模型，DEC-015；v0.12 按餐关联，PD-020/C-5）。
 * didCook = 第①问「做了吗」（必填）；
 * taste = 第②问「味道怎么样」（didCook=true 必填、false 禁传，superRefine 校验）；
 * willRepeat = 第③问「下次还做吗」（必填——没做也可答不做了，C-11 灰标签规则）；
 * actualMinutes = 实际耗时选填（PD-006）；
 * mealSlot = 反馈所属餐次（v0.12：三餐计划必填——评价按餐独立；不传视为晚餐，
 * 兼容存量单餐计划与旧客户端）。同日同餐重提覆盖（C-5 失败恢复口径）。
 * 写入映射（裁决 2/3，DEC-015）：didCook=true -> Event COOKED（payload 含三问+耗时）+ CookLog
 * （taste 映射 result：good->success / ok->partial / fail->fail）；didCook=false -> Event
 * NOT_COOKED（payload 无 taste），不写 CookLog。
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
    mealSlot: z.ZodOptional<z.ZodEnum<{
        breakfast: "breakfast";
        lunch: "lunch";
        dinner: "dinner";
    }>>;
}, z.core.$strip>;
/**
 * GET /api/plans/:id/feedback 响应（v0.6，DEC-015 裁决 4；v0.9 空态语义修订，T-P12）。
 * 返回该 plan 事件流最新一条反馈（didCook 由事件类型派生：COOKED/NOT_COOKED）；
 * taste/willRepeat/actualMinutes 取事件 payload；submittedAt = 事件创建时间。
 * mealSlot = 该条反馈所属餐次（v0.12；存量事件无此字段如实缺省）。
 * 查询参数 mealSlot 可选：传了按该餐过滤最新一条，不传=全计划最新一条（旧行为）。
 * v0.9（T-P12，挂账⑤）：本 schema 描述「有反馈」报文形状；plan 存在但无反馈时
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
    mealSlot: z.ZodOptional<z.ZodEnum<{
        breakfast: "breakfast";
        lunch: "lunch";
        dinner: "dinner";
    }>>;
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
 * POST /api/recommend 响应（v0.12：三餐计划本体，生成即落库）。
 * plan.dayPlan 携带三餐菜单/必消落位/想吃的菜标注；空手归因在 plan.dayPlan.failures
 * （PD-017 两型+PD-014 组合口径）。仍会建 Plan 行（含空手归因快照，供当日重进与调整出路）。
 * 旧三候选报文（candidates/unmetMustUse/unmetReasons 顶层字段）v0.12 起移除。
 */
export declare const RecommendResponseSchema: z.ZodObject<{
    id: z.ZodString;
    familyId: z.ZodString;
    planDate: z.ZodDate;
    context: z.ZodOptional<z.ZodObject<{
        people: z.ZodNumber;
        timeBudgetMin: z.ZodNumber;
        mustUse: z.ZodArray<z.ZodString>;
    }, z.core.$strip>>;
    dayContext: z.ZodOptional<z.ZodObject<{
        adults: z.ZodNumber;
        children: z.ZodNumber;
        timeBudgetMin: z.ZodUnion<readonly [z.ZodLiteral<15>, z.ZodLiteral<30>, z.ZodLiteral<60>]>;
        mustUseIngredients: z.ZodArray<z.ZodString>;
        tempAvoidances: z.ZodOptional<z.ZodArray<z.ZodObject<{
            ingredientId: z.ZodOptional<z.ZodString>;
            ingredientName: z.ZodOptional<z.ZodString>;
            aliases: z.ZodOptional<z.ZodArray<z.ZodString>>;
        }, z.core.$strip>>>;
        desiredDishIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
        meals: z.ZodOptional<z.ZodArray<z.ZodEnum<{
            breakfast: "breakfast";
            lunch: "lunch";
            dinner: "dinner";
        }>>>;
        avoidRecentDays: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
    candidates: z.ZodDefault<z.ZodArray<z.ZodObject<{
        menuId: z.ZodString;
        score: z.ZodNumber;
        reasons: z.ZodArray<z.ZodString>;
        breakdown: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        menu: z.ZodOptional<z.ZodUnknown>;
    }, z.core.$strip>>>;
    dayPlan: z.ZodOptional<z.ZodObject<{
        meals: z.ZodArray<z.ZodObject<{
            slot: z.ZodEnum<{
                breakfast: "breakfast";
                lunch: "lunch";
                dinner: "dinner";
            }>;
            menuId: z.ZodString;
            dishes: z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                name: z.ZodString;
                mealRole: z.ZodEnum<{
                    MAIN: "MAIN";
                    SIDE: "SIDE";
                    SOUP: "SOUP";
                    STAPLE: "STAPLE";
                }>;
                mealTypes: z.ZodOptional<z.ZodArray<z.ZodEnum<{
                    breakfast: "breakfast";
                    lunch: "lunch";
                    dinner: "dinner";
                }>>>;
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
                ingredients: z.ZodArray<z.ZodObject<{
                    ingredientId: z.ZodString;
                    ingredientName: z.ZodString;
                    aliases: z.ZodArray<z.ZodString>;
                    category: z.ZodString;
                    defaultUnit: z.ZodString;
                    qty: z.ZodNumber;
                    unit: z.ZodString;
                    optional: z.ZodBoolean;
                }, z.core.$strip>>;
            }, z.core.$strip>>;
            score: z.ZodNumber;
            reasons: z.ZodArray<z.ZodString>;
            filtered: z.ZodArray<z.ZodObject<{
                menuId: z.ZodString;
                stage: z.ZodEnum<{
                    safety: "safety";
                    feasibility: "feasibility";
                }>;
                rule: z.ZodString;
            }, z.core.$strip>>;
            totalActiveMinutes: z.ZodNumber;
        }, z.core.$strip>>;
        mustUseAllocation: z.ZodArray<z.ZodObject<{
            ingredientId: z.ZodString;
            slot: z.ZodEnum<{
                breakfast: "breakfast";
                lunch: "lunch";
                dinner: "dinner";
            }>;
            dishId: z.ZodString;
            dishName: z.ZodString;
        }, z.core.$strip>>;
        desiredNotes: z.ZodArray<z.ZodObject<{
            dishId: z.ZodString;
            dishName: z.ZodString;
            included: z.ZodBoolean;
            slot: z.ZodOptional<z.ZodEnum<{
                breakfast: "breakfast";
                lunch: "lunch";
                dinner: "dinner";
            }>>;
            reason: z.ZodString;
        }, z.core.$strip>>;
        failures: z.ZodArray<z.ZodObject<{
            slot: z.ZodEnum<{
                breakfast: "breakfast";
                lunch: "lunch";
                dinner: "dinner";
            }>;
            kind: z.ZodEnum<{
                NO_DISH: "NO_DISH";
                TIME_BUDGET: "TIME_BUDGET";
                COMBINATION: "COMBINATION";
            }>;
            detail: z.ZodString;
            suggestions: z.ZodArray<z.ZodString>;
        }, z.core.$strip>>;
        crossMealNotes: z.ZodArray<z.ZodString>;
        filtered: z.ZodArray<z.ZodObject<{
            menuId: z.ZodString;
            stage: z.ZodEnum<{
                safety: "safety";
                feasibility: "feasibility";
            }>;
            rule: z.ZodString;
        }, z.core.$strip>>;
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
        prepAdvice: z.ZodOptional<z.ZodObject<{
            tonight: z.ZodArray<z.ZodString>;
            tomorrowMorning: z.ZodArray<z.ZodString>;
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
/** 单个计划响应（lock/swap/feedback/repeat） */
export declare const PlanResponseSchema: z.ZodObject<{
    id: z.ZodString;
    familyId: z.ZodString;
    planDate: z.ZodDate;
    context: z.ZodOptional<z.ZodObject<{
        people: z.ZodNumber;
        timeBudgetMin: z.ZodNumber;
        mustUse: z.ZodArray<z.ZodString>;
    }, z.core.$strip>>;
    dayContext: z.ZodOptional<z.ZodObject<{
        adults: z.ZodNumber;
        children: z.ZodNumber;
        timeBudgetMin: z.ZodUnion<readonly [z.ZodLiteral<15>, z.ZodLiteral<30>, z.ZodLiteral<60>]>;
        mustUseIngredients: z.ZodArray<z.ZodString>;
        tempAvoidances: z.ZodOptional<z.ZodArray<z.ZodObject<{
            ingredientId: z.ZodOptional<z.ZodString>;
            ingredientName: z.ZodOptional<z.ZodString>;
            aliases: z.ZodOptional<z.ZodArray<z.ZodString>>;
        }, z.core.$strip>>>;
        desiredDishIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
        meals: z.ZodOptional<z.ZodArray<z.ZodEnum<{
            breakfast: "breakfast";
            lunch: "lunch";
            dinner: "dinner";
        }>>>;
        avoidRecentDays: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
    candidates: z.ZodDefault<z.ZodArray<z.ZodObject<{
        menuId: z.ZodString;
        score: z.ZodNumber;
        reasons: z.ZodArray<z.ZodString>;
        breakdown: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        menu: z.ZodOptional<z.ZodUnknown>;
    }, z.core.$strip>>>;
    dayPlan: z.ZodOptional<z.ZodObject<{
        meals: z.ZodArray<z.ZodObject<{
            slot: z.ZodEnum<{
                breakfast: "breakfast";
                lunch: "lunch";
                dinner: "dinner";
            }>;
            menuId: z.ZodString;
            dishes: z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                name: z.ZodString;
                mealRole: z.ZodEnum<{
                    MAIN: "MAIN";
                    SIDE: "SIDE";
                    SOUP: "SOUP";
                    STAPLE: "STAPLE";
                }>;
                mealTypes: z.ZodOptional<z.ZodArray<z.ZodEnum<{
                    breakfast: "breakfast";
                    lunch: "lunch";
                    dinner: "dinner";
                }>>>;
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
                ingredients: z.ZodArray<z.ZodObject<{
                    ingredientId: z.ZodString;
                    ingredientName: z.ZodString;
                    aliases: z.ZodArray<z.ZodString>;
                    category: z.ZodString;
                    defaultUnit: z.ZodString;
                    qty: z.ZodNumber;
                    unit: z.ZodString;
                    optional: z.ZodBoolean;
                }, z.core.$strip>>;
            }, z.core.$strip>>;
            score: z.ZodNumber;
            reasons: z.ZodArray<z.ZodString>;
            filtered: z.ZodArray<z.ZodObject<{
                menuId: z.ZodString;
                stage: z.ZodEnum<{
                    safety: "safety";
                    feasibility: "feasibility";
                }>;
                rule: z.ZodString;
            }, z.core.$strip>>;
            totalActiveMinutes: z.ZodNumber;
        }, z.core.$strip>>;
        mustUseAllocation: z.ZodArray<z.ZodObject<{
            ingredientId: z.ZodString;
            slot: z.ZodEnum<{
                breakfast: "breakfast";
                lunch: "lunch";
                dinner: "dinner";
            }>;
            dishId: z.ZodString;
            dishName: z.ZodString;
        }, z.core.$strip>>;
        desiredNotes: z.ZodArray<z.ZodObject<{
            dishId: z.ZodString;
            dishName: z.ZodString;
            included: z.ZodBoolean;
            slot: z.ZodOptional<z.ZodEnum<{
                breakfast: "breakfast";
                lunch: "lunch";
                dinner: "dinner";
            }>>;
            reason: z.ZodString;
        }, z.core.$strip>>;
        failures: z.ZodArray<z.ZodObject<{
            slot: z.ZodEnum<{
                breakfast: "breakfast";
                lunch: "lunch";
                dinner: "dinner";
            }>;
            kind: z.ZodEnum<{
                NO_DISH: "NO_DISH";
                TIME_BUDGET: "TIME_BUDGET";
                COMBINATION: "COMBINATION";
            }>;
            detail: z.ZodString;
            suggestions: z.ZodArray<z.ZodString>;
        }, z.core.$strip>>;
        crossMealNotes: z.ZodArray<z.ZodString>;
        filtered: z.ZodArray<z.ZodObject<{
            menuId: z.ZodString;
            stage: z.ZodEnum<{
                safety: "safety";
                feasibility: "feasibility";
            }>;
            rule: z.ZodString;
        }, z.core.$strip>>;
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
        prepAdvice: z.ZodOptional<z.ZodObject<{
            tonight: z.ZodArray<z.ZodString>;
            tomorrowMorning: z.ZodArray<z.ZodString>;
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
/**
 * GET /api/plans 查询参数（v0.12）：date 可选（YYYY-MM-DD，本地日界）。
 * 缺省 = 全量历史列表（旧行为不变）；传了 = 只返回该日期的计划（同日多行按 createdAt 倒序，
 * 首条即最新——append 模型下重进取最新一份，对齐 C-3「同一天重进看到同一份三餐」）。
 */
export declare const PlanListQuerySchema: z.ZodObject<{
    date: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
/** GET /api/plans 响应（历史列表；date 过滤后仍是数组语义） */
export declare const PlanListResponseSchema: z.ZodArray<z.ZodObject<{
    id: z.ZodString;
    familyId: z.ZodString;
    planDate: z.ZodDate;
    context: z.ZodOptional<z.ZodObject<{
        people: z.ZodNumber;
        timeBudgetMin: z.ZodNumber;
        mustUse: z.ZodArray<z.ZodString>;
    }, z.core.$strip>>;
    dayContext: z.ZodOptional<z.ZodObject<{
        adults: z.ZodNumber;
        children: z.ZodNumber;
        timeBudgetMin: z.ZodUnion<readonly [z.ZodLiteral<15>, z.ZodLiteral<30>, z.ZodLiteral<60>]>;
        mustUseIngredients: z.ZodArray<z.ZodString>;
        tempAvoidances: z.ZodOptional<z.ZodArray<z.ZodObject<{
            ingredientId: z.ZodOptional<z.ZodString>;
            ingredientName: z.ZodOptional<z.ZodString>;
            aliases: z.ZodOptional<z.ZodArray<z.ZodString>>;
        }, z.core.$strip>>>;
        desiredDishIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
        meals: z.ZodOptional<z.ZodArray<z.ZodEnum<{
            breakfast: "breakfast";
            lunch: "lunch";
            dinner: "dinner";
        }>>>;
        avoidRecentDays: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
    candidates: z.ZodDefault<z.ZodArray<z.ZodObject<{
        menuId: z.ZodString;
        score: z.ZodNumber;
        reasons: z.ZodArray<z.ZodString>;
        breakdown: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        menu: z.ZodOptional<z.ZodUnknown>;
    }, z.core.$strip>>>;
    dayPlan: z.ZodOptional<z.ZodObject<{
        meals: z.ZodArray<z.ZodObject<{
            slot: z.ZodEnum<{
                breakfast: "breakfast";
                lunch: "lunch";
                dinner: "dinner";
            }>;
            menuId: z.ZodString;
            dishes: z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                name: z.ZodString;
                mealRole: z.ZodEnum<{
                    MAIN: "MAIN";
                    SIDE: "SIDE";
                    SOUP: "SOUP";
                    STAPLE: "STAPLE";
                }>;
                mealTypes: z.ZodOptional<z.ZodArray<z.ZodEnum<{
                    breakfast: "breakfast";
                    lunch: "lunch";
                    dinner: "dinner";
                }>>>;
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
                ingredients: z.ZodArray<z.ZodObject<{
                    ingredientId: z.ZodString;
                    ingredientName: z.ZodString;
                    aliases: z.ZodArray<z.ZodString>;
                    category: z.ZodString;
                    defaultUnit: z.ZodString;
                    qty: z.ZodNumber;
                    unit: z.ZodString;
                    optional: z.ZodBoolean;
                }, z.core.$strip>>;
            }, z.core.$strip>>;
            score: z.ZodNumber;
            reasons: z.ZodArray<z.ZodString>;
            filtered: z.ZodArray<z.ZodObject<{
                menuId: z.ZodString;
                stage: z.ZodEnum<{
                    safety: "safety";
                    feasibility: "feasibility";
                }>;
                rule: z.ZodString;
            }, z.core.$strip>>;
            totalActiveMinutes: z.ZodNumber;
        }, z.core.$strip>>;
        mustUseAllocation: z.ZodArray<z.ZodObject<{
            ingredientId: z.ZodString;
            slot: z.ZodEnum<{
                breakfast: "breakfast";
                lunch: "lunch";
                dinner: "dinner";
            }>;
            dishId: z.ZodString;
            dishName: z.ZodString;
        }, z.core.$strip>>;
        desiredNotes: z.ZodArray<z.ZodObject<{
            dishId: z.ZodString;
            dishName: z.ZodString;
            included: z.ZodBoolean;
            slot: z.ZodOptional<z.ZodEnum<{
                breakfast: "breakfast";
                lunch: "lunch";
                dinner: "dinner";
            }>>;
            reason: z.ZodString;
        }, z.core.$strip>>;
        failures: z.ZodArray<z.ZodObject<{
            slot: z.ZodEnum<{
                breakfast: "breakfast";
                lunch: "lunch";
                dinner: "dinner";
            }>;
            kind: z.ZodEnum<{
                NO_DISH: "NO_DISH";
                TIME_BUDGET: "TIME_BUDGET";
                COMBINATION: "COMBINATION";
            }>;
            detail: z.ZodString;
            suggestions: z.ZodArray<z.ZodString>;
        }, z.core.$strip>>;
        crossMealNotes: z.ZodArray<z.ZodString>;
        filtered: z.ZodArray<z.ZodObject<{
            menuId: z.ZodString;
            stage: z.ZodEnum<{
                safety: "safety";
                feasibility: "feasibility";
            }>;
            rule: z.ZodString;
        }, z.core.$strip>>;
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
        prepAdvice: z.ZodOptional<z.ZodObject<{
            tonight: z.ZodArray<z.ZodString>;
            tomorrowMorning: z.ZodArray<z.ZodString>;
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
    prepAdvice: z.ZodOptional<z.ZodObject<{
        tonight: z.ZodArray<z.ZodString>;
        tomorrowMorning: z.ZodArray<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
//# sourceMappingURL=api.d.ts.map