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
/** 今晚情境：{people, timeBudgetMin, mustUse: string[]}（v0.12 起仅存量单餐计划使用） */
export declare const PlanContextSchema: z.ZodObject<{
    people: z.ZodNumber;
    timeBudgetMin: z.ZodNumber;
    mustUse: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
/** 临时忌口（当日生效，如生病不吃牛肉；与长期 HARD 分层，过滤效力同 HARD） */
export declare const TempAvoidanceSchema: z.ZodObject<{
    ingredientId: z.ZodOptional<z.ZodString>;
    ingredientName: z.ZodOptional<z.ZodString>;
    aliases: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
/**
 * 日计划上下文（PD-020）：PlanContext 的三餐扩展，存 Plan.dayContext。
 * 新三餐计划一律用本结构；旧 people 语境不再沿用（成人/儿童分列，儿童触发餐约束）。
 */
export declare const DayPlanContextSchema: z.ZodObject<{
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
/** 备菜建议（C-4）：今晚预处理 / 明早先做 */
export declare const PrepAdviceSchema: z.ZodObject<{
    tonight: z.ZodArray<z.ZodString>;
    tomorrowMorning: z.ZodArray<z.ZodString>;
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
    prepAdvice: z.ZodOptional<z.ZodObject<{
        tonight: z.ZodArray<z.ZodString>;
        tomorrowMorning: z.ZodArray<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
/** 过滤轨迹（可解释性，与 engine FilterTrace 同构） */
export declare const FilterTraceSchema: z.ZodObject<{
    menuId: z.ZodString;
    stage: z.ZodEnum<{
        safety: "safety";
        feasibility: "feasibility";
    }>;
    rule: z.ZodString;
}, z.core.$strip>;
/** 快照菜品用料行（与 engine DishIngredientView 同构；换一餐时恢复引擎输入需完整用料） */
export declare const DayPlanDishIngredientSchema: z.ZodObject<{
    ingredientId: z.ZodString;
    ingredientName: z.ZodString;
    aliases: z.ZodArray<z.ZodString>;
    category: z.ZodString;
    defaultUnit: z.ZodString;
    qty: z.ZodNumber;
    unit: z.ZodString;
    optional: z.ZodBoolean;
}, z.core.$strip>;
/**
 * 快照菜品 = Dish 全字段 + mealTypes + 用料。快照即历史事实：存生成当时投影
 * （含 ingredients），换一餐时据此恢复引擎 current 输入，不因菜品后续下架/编辑而失真。
 */
export declare const DayPlanDishSchema: z.ZodObject<{
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
}, z.core.$strip>;
/** 单餐计划（所选餐次各一套；道数随人数伸缩，缺槽如实标注） */
export declare const DayPlanMealSchema: z.ZodObject<{
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
}, z.core.$strip>;
/** 必消跨餐分配落位（哪个必消分到了哪餐哪道菜） */
export declare const MustUseAllocationSchema: z.ZodObject<{
    ingredientId: z.ZodString;
    slot: z.ZodEnum<{
        breakfast: "breakfast";
        lunch: "lunch";
        dinner: "dinner";
    }>;
    dishId: z.ZodString;
    dishName: z.ZodString;
}, z.core.$strip>;
/** 想吃的菜排入情况（与忌口/必消冲突时如实标注，不硬凑） */
export declare const DesiredDishNoteSchema: z.ZodObject<{
    dishId: z.ZodString;
    dishName: z.ZodString;
    included: z.ZodBoolean;
    slot: z.ZodOptional<z.ZodEnum<{
        breakfast: "breakfast";
        lunch: "lunch";
        dinner: "dinner";
    }>>;
    reason: z.ZodString;
}, z.core.$strip>;
/** 单餐空手归因类型（PD-017 两型 + PD-014 组合口径扩展） */
export declare const MealFailureKindSchema: z.ZodEnum<{
    NO_DISH: "NO_DISH";
    TIME_BUDGET: "TIME_BUDGET";
    COMBINATION: "COMBINATION";
}>;
/** 单餐空手归因：哪一餐、因为什么出不了、调整出路 */
export declare const MealFailureSchema: z.ZodObject<{
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
}, z.core.$strip>;
/**
 * 日计划快照（三餐×菜单 + 必消落位 + 想吃的菜标注 + 空手归因 + 跨餐说明）。
 * 结构与 engine DayPlanResult 同构（v0.12 对齐基准 = t-q09-engine-dayplan 67bccb1）。
 */
export declare const DayPlanSchema: z.ZodObject<{
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
}, z.core.$strip>;
/**
 * 事件 payload（如 swap 时记 {reason: "太麻烦"}）。
 * 不同 EventType 的 payload 结构不同，3.2 仅标注为 Json，
 * 采用 z.record(z.string(), z.unknown()) 承载，按需在业务层细化。
 */
export declare const EventPayloadSchema: z.ZodRecord<z.ZodString, z.ZodUnknown>;
/**
 * 计划：一次"今晚吃什么"（存量单餐）/ "明天吃什么"（v0.12 起三餐）的完整快照。
 * 单餐计划：context + candidates + lockedMenuId；三餐计划：dayContext + dayPlan
 * （生成即落库，无三选一，故 status 直接 LOCKED）。读取方按字段有无分流。
 */
export declare const PlanSchema: z.ZodObject<{
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
/** 行为事件（埋点）；mealSlot = 反馈所属餐次（v0.12 按餐关联，存量事件缺省=晚餐） */
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
    mealSlot: z.ZodOptional<z.ZodEnum<{
        breakfast: "breakfast";
        lunch: "lunch";
        dinner: "dinner";
    }>>;
    createdAt: z.ZodDate;
}, z.core.$strip>;
//# sourceMappingURL=plan.d.ts.map