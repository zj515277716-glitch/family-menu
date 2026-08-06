# 家庭菜谱App 开发状态
> 本文件由主Agent维护。任何时刻只允许一个活动任务卡（DEC-003）。

## 当前状态
- 当前阶段：STEP-02 契约冻结（WP-01）（开发中）
- main HEAD：c9f9f79；回滚tag：rollback-before-step-02 -> c9f9f79
- 阻塞/外部依赖：无
- 下一个人工决策点：STEP-02 交付审核（含契约 v0.1 冻结批准）

## 当前任务卡：STEP-02 契约冻结（对应 WP-01）
状态: 开发中    回环计数: 0/3
执行者: fm-dev    审查者: fm-reviewer（只读）
需求来源: 实施方案第三章3.2（数据模型）+ 第五章仓库结构（shared目录）+ 5.1 API路由清单 + 1.2 F1-F7 + 1.3 YAGNI + DEC-001    基线提交: main@c9f9f79    回滚点: rollback-before-step-02

### ① 目标
packages/shared 全部 zod schema + 类型 + 常量，冻结 v0.1。定义数据模型契约（Family/Dish/Menu/Plan 等 12 个实体 + 8 个枚举）、API 请求/响应契约（对齐 5.1 路由清单 10 条路由）、常量表（品类/器具/时长档）。用户批准后打 tag v0.1 冻结。

### ② 验收标准 AC
- [ ] AC1 zod 依赖添加到 packages/shared/package.json（DEC-001 未记录 zod 版本，fm-dev 需核对最新稳定版本并使用），pnpm install 成功（exit 0）
- [ ] AC2 schemas/family.ts：FamilySchema、FamilyRuleSchema、ExclusionRuleSchema + 枚举（ExclusionScope: INGREDIENT|DISH|TAG, Severity: HARD|SOFT），字段对齐 3.2（Family: id/name/createdAt; FamilyRule: defaultPeople/timeBudgets/equipment/cuisines; ExclusionRule: scope/targetId/targetTag/severity/note）
- [ ] AC3 schemas/dish.ts：DishSchema、DishIngredientSchema、IngredientSchema、SubstitutionSchema + 枚举（MealRole: MAIN|SIDE|SOUP|STAPLE, ContentStatus: DRAFT|TESTED|PUBLISHED, ContentOrigin: LLM_DRAFT|MANUAL），字段对齐 3.2（Dish: name/mealRole/cuisine/flavorTags/spicyLevel/splitFlavor/activeMinutes/totalMinutes/equipment/steps/status/origin; Ingredient: name/aliases/category/defaultUnit; DishIngredient: qty/unit/optional; Substitution: ratio/note）
- [ ] AC4 schemas/menu.ts：MenuSchema、MenuDishSchema、CookLogSchema + 枚举（MenuScene: WEEKDAY_FAST|WEEKEND|CLEARANCE|BUDGET），字段对齐 3.2（Menu: name/scene/serves/totalActiveMinutes/prepSequence/status; CookLog: cookedAt/actualMinutes/result/failPoints/willRepeat）
- [ ] AC5 schemas/plan.ts：PlanSchema、EventSchema + 枚举（PlanStatus: PROPOSED|LOCKED|COOKED|SKIPPED, EventType: GENERATE|VIEW|LOCK|SWAP_MENU|SWAP_DISH|COOKED|NOT_COOKED|REPEAT），字段对齐 3.2（Plan: planDate/context/candidates/lockedMenuId/shoppingList/status; Event: type/payload）
- [ ] AC6 schemas/api.ts：API 请求/响应 schema 对齐 5.1 路由清单全部路由（GET/PUT /api/family/rules, POST /api/recommend, POST /api/plans/:id/lock, POST /api/plans/:id/swap, GET/PATCH /api/plans/:id/shopping-list, POST /api/plans/:id/feedback, GET /api/plans, POST /api/plans/:id/repeat）
- [ ] AC7 types/：从 zod schema 推导类型导出（z.infer），覆盖全部 schema 和枚举
- [ ] AC8 constants/：品类表（CATEGORIES: 蔬菜/肉类/水产/蛋奶/调料/主食）、器具表（EQUIPMENT: wok/rice_cooker/steamer/air_fryer）、时长档（TIME_BUDGETS: [15, 30, 60]）
- [ ] AC9 index.ts：统一导出所有 schema、类型、常量（保留 PACKAGE_NAME 导出以兼容现有 engine/list-merger 依赖）
- [ ] AC10 单元测试覆盖关键 schema（合法输入通过、非法输入拒绝，覆盖枚举校验、必填校验、类型校验，至少覆盖 family/dish/menu/plan/api 各 1 个用例）
- [ ] AC11 pnpm verify 跑通（lint 零 error，build 成功，test 通过，exit 0）
- [ ] AC12 pnpm -r build 成功（shared 变更不破坏 engine/list-merger/api/content-pipeline 的现有构建）

### ③ 输入资源
- docs/plan/实施方案.md @c9f9f79：
  - 第三章 3.2 数据模型（第 92-256 行）：12 个 model + 8 个 enum 的完整定义
  - 第五章仓库结构（第 352-356 行）：shared/src/{schemas/types/constants/} 目录结构
  - 5.1 API 路由清单（第 394-406 行）：10 条路由的方法/路径/功能
  - 1.2 F1-F7 功能清单（第 38-46 行）：功能验收口径
  - 1.3 YAGNI 清单（第 48-51 行）：明确不做
  - 第二章技术栈（第 62 行）：Fastify 5 + zod（fastify-type-provider-zod）
- DECISIONS.md @1983795（DEC-001 版本号，zod 版本未记录需核对；DEC-006 运行时零LLM；DEC-008 YAGNI边界）
- AGENTS.md @1983795（铁律、Ownership: packages/shared 归属 WP-01）
- STATUS.md @c9f9f79（本任务卡）
- packages/shared/src/index.ts @270a05a（当前骨架：仅导出 PACKAGE_NAME）

### ④ 边界约束（不允许做什么）
- 只改 packages/shared（WP-01 主控）；不改其他包（engine/list-merger/api/h5/admin/content-pipeline）
- 不写 Prisma schema（STEP-03）；本步只定义 zod schema（运行时契约），不涉及数据库
- 不写业务逻辑（engine 算法/api 路由/h5 页面/list-merger 合并/content-pipeline CLI）
- schema 中的 JSON 字段（steps/prepSequence/context/candidates/shoppingList/payload）用 zod schema 精确定义（如 steps = z.array(z.object({order, text, parallel?}))），不用 z.unknown() 或 z.any()
- 不引入 DEC-008 禁止项（Redis/消息队列/微服务/K8s）
- zod 版本需核对（DEC-001 未记录），不擅自锁定不兼容版本；如有兼容性问题报队长
- 不改 docs/plan/实施方案.md（只读）；不修改四件套（队长维护 STATUS.md/开发日志.md 除外）
- 运行时代码禁止调用任何 LLM API（DEC-006）
- 不改 tsconfig.base.json（strict:true 已在 STEP-01 配置）

### ⑤ 异常升级路径
- zod 版本与 fastify-type-provider-zod 兼容性问题 -> 报队长转 fm-arch
- schema 设计与 3.2 数据模型字段冲突 -> 以 3.2 为准，完成报告注明假设
- API 路由契约与 5.1 清单冲突 -> 以 5.1 为准
- 枚举值与 3.2 不一致 -> 以 3.2 为准
- 第3次被打回 -> 停止修改，等队长诊断

## 最小测试（fm-tester 照跑，真实执行，禁止Mock冒充）
- `pnpm install --frozen-lockfile`（exit 0）
- `pnpm verify`（lint+build+test，exit 0，lint 零 error）
- schema 单元测试：合法输入通过、非法输入拒绝（覆盖关键 schema 和枚举）
- `pnpm -r build`（shared 变更不破坏其他包构建）

## 审查重点
- schema 字段与 3.2 数据模型逐项一致（12 个 model + 8 个 enum）
- API 契约与 5.1 路由清单一致（10 条路由的请求/响应 schema）
- JSON 字段精确定义（非 z.unknown()）
- 仅改 packages/shared，不改其他包
- zod 版本合理（DEC-001 未记录，核对来源）
- 类型导出完整（z.infer 覆盖全部 schema）
- 常量表与 3.2/5.1 一致（品类/器具/时长档）
- 保留 PACKAGE_NAME 导出（兼容现有依赖）

## 交付门禁
开发（fm-dev）-> 独立测试（fm-tester，真实环境）-> 交叉审查（fm-reviewer，只读）-> 主复验 -> 状态改"待用户审核"并暂停；
用户批准前不合并、不启动下一 STEP（DEC-005）。**STEP-02 末含契约 v0.1 冻结批准**（人工决策点）。

## 完成报告（fm-dev 填写）
- AC自检: [ ]AC1...（逐条[✓]/[✗]）
- 交付物: <路径@commit>
- 测试结果: <用例通过数/exit code>
- 新增依赖及理由: <列出，含 zod 版本及核对来源>
- 遗留与下一步建议:

## 审查报告（fm-reviewer 填写，任何✗=打回，回环+1）
- [ ] 契约一致性（schema 字段与 3.2 一致；API 契约与 5.1 一致；常量与 3.2/5.1 一致）
- [ ] 越界检查（仅改 packages/shared；无业务逻辑；不改四件套/实施方案/其他包）
- [ ] 安全缺陷（无 LLM 调用；无 DEC-008 禁止项；JSON 字段精确定义非 z.unknown()）
- [ ] 逻辑正确性（zod schema 校验逻辑正确；类型推导完整；pnpm verify 真实通过）
- [ ] 可维护性（命名规范；strict 兼容；导出结构清晰）

## 总任务拆解
| STEP | 对应WP | 内容 | 状态 |
|---|---|---|---|
| STEP-00 | - | 协作框架四件套 | 已合并 |
| STEP-01 | WP-00 | 工程基线（monorepo骨架+本地PG18 Docker+CI） | 已合并 |
| STEP-02 | WP-01 | 契约冻结（shared zod schema，v0.1） | 进行中 |
| STEP-03 | WP-02 | 数据层（schema.prisma+migration+seed） | 未开始 |
| STEP-04 | WP-03/06 | 推荐引擎+清单合并器 | 未开始 |
| STEP-05 | WP-04 | API（Fastify路由+口令鉴权+契约测试） | 未开始 |
| STEP-06 | WP-05 | H5前端（5页面走通） | 未开始 |
| STEP-07 | WP-07 | 内容管线CLI | 未开始 |
| STEP-08 | WP-09/10 | 部署+集成验收 | 未开始 |
