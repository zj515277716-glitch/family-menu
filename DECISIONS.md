# 家庭菜谱App 开发决策
> 只记录跨步骤有效的决策。普通实现细节留在任务卡、代码和测试中。

- DEC-001 技术基线：实施方案第二章定案。2026-08-06 联网核对各组件当前稳定版本号（来源见各条括号）：
  · Node.js 22.23.2（LTS "Jod"，2026-07-29 安全发布）— nodejs.org/en/blog/release/v22.23.2
  · pnpm 11.20（2026-08-03）— pnpm.io/blog
  · Fastify 5.10.0（2026-07-04）— releasebot.io（Fastify v5.10.0 release notes，引 fastify/fastify GitHub releases）
  · Prisma 7.7.0（v7 系列最新 minor，2026-04-07；@lamhieu/prisma 镜像 2026-06 已达 7.8.0，官方包版本应 ≥7.7.0）— issoh.co.jp 引 Prisma 官方 changelog + npmjs.com/package/@lamhieu/prisma
    注：Prisma 7 为 Rust-free 重写版（2025-11-19 GA），含破坏性变更（datasource URL 迁至 prisma.config.ts、generator 由 prisma-client-js 改为 prisma-client、运行时需 driver adapter）。实施方案 3.2 的 schema 示例为旧版风格，STEP-03 数据层需按 Prisma 7 适配——具体方案由 fm-arch/fm-dev 在 STEP-03 评估，本条只记录核对到的事实，不做技术决策。
  · @prisma/client 同 prisma 版本（7.7.0+）
  · Taro 4.2.0（@tarojs/cli）— npmjs.com/package/@tarojs/cli
  · NutUI @nutui/nutui-react-taro 4.0.0-beta.5（latest tag 仍为 beta，2026-07 发布）— npmjs.com/package/@nutui/nutui-react-taro
    注：React 版 NutUI Taro 当前无 4.0 stable 正式版。是否接受 beta 或回退 3.x stable 属技术决策，STEP-02 契约冻结 / STEP-06 前端启动时抛 fm-arch 评估，本条不预定论。
  · Vitest 4.1.10 — npmjs.com/package/vitest
  · TypeScript（strict）/ PostgreSQL 18（RDS）/ Docker Compose + Caddy：沿用实施方档第二章定案，精确版本随 STEP-01 工程基线锁定。
  核对方式说明：因本机 PowerShell 执行策略为 Restricted，curl/irm 脚本式查询 npm registry 受阻，改用 WebSearch 核对各包 npm 页面与官方博客/发布说明。核对日 2026-08-06。
- DEC-002 角色与制衡：主/开发/测试/审查四角色固定；各角色独立上下文（分Agent）；
  审查角色权限只读；主Agent不写代码、不做技术决策。
- DEC-003 WIP=1：代码任务严格串行，STATUS.md任何时刻只有一个活动任务卡；
  内容轨（起草/试做）与素材轨（生图）为非代码轨道，可并行。
- DEC-004 无上下文恢复协议：每步开始前完整读取实施方案+四件套；仓库文件与
  测试结果优先于聊天上下文；每步结束必须追加开发日志，未记录不得开始下一步。
  简化：以git commit hash替代逐文件SHA256（本项目自STEP-00即有git保证完整性）。
- DEC-005 用户审核门禁：每STEP完成开发/测试/审查/复验后停"待用户审核"；
  批准前不合并、不启动下一STEP；内部审查不得当作用户审核。
- DEC-006 运行时零LLM：产品运行链路不调用任何大模型；内容三态
  DRAFT->TESTED->PUBLISHED，升级仅通过试做记录（CookLog）。
- DEC-007 素材三层策略：功能图标用图标库；装饰插画AI生成（风格基座+一次成套）；
  菜品图一律试做实拍，禁止AI生成菜品实拍感图片。
- DEC-008 YAGNI边界：实施方案1.3清单为范围硬边界；触碰需走新功能闭环（6.7）
  由用户裁决。
- DEC-009 运行底座：全部角色在Trae内以自定义智能体承担（2026-08-06三条件实测
  通过：①禁写保留读②SOLO Coder派发-回收③上下文隔离，记录见trae-base-test）；
  队长=SOLO Coder（项目规则约束"只派发不亲自读写"）；reviewer锁只读；跨模型
  审查仅在M1–M4 gate由Claude Code执行一次；跨工具人工中转不进STEP内流程。
- DEC-010 视觉定稿：主题色方案 A 番茄暖橙（主色 #FF6B35）。
  2026-08-07 用户审核 UI 设计文档时选定。fm-ui 产出 3 套候选（A 番茄暖橙 /
  B 红烧暖红 / C 蜜糖琥珀），用户选 A（食欲感最强、与高频食材色彩呼应）。
  docs/design/theme-tokens.ts 中 themeA 为定稿方案，STEP-06 前端直接引用。
- DEC-011 契约变更 v0.1->v0.2（STEP-06 契约缺口修复）：2026-08-07 队长批准。
  背景：STEP-06 H5 前端审查发现 2 个契约缺口--
  ①禁忌规则无 API 路由，前端无法通过 UI 持久化管理 ExclusionRule
  （v0.1 仅 GET/PUT /api/family/rules，未含 exclusions）；
  ②FeedbackRequestSchema 无 cookResult/failPoints 字段，前端收集的烹饪结果与失败原因
  无法回传后端写入 CookLog。
  变更内容（packages/shared/src/schemas/api.ts，仅本包）：
  ①新增 GetExclusionsResponseSchema = z.array(ExclusionRuleSchema)
  （GET /api/family/exclusions 响应）；
  ②新增 PutExclusionsRequestSchema = z.array(ExclusionRuleSchema)
  （PUT /api/family/exclusions 请求，全量替换，与 PUT /api/family/rules 同构）；
  ③新增 CookResultSchema = z.enum(['success','partial','fail'])
  （与 CookLogSchema.result 同值，FeedbackRequest 复用）；
  ④FeedbackRequestSchema 增加 cookResult?: CookResultSchema、failPoints?: z.string()。
  向后兼容性：变更①②③为纯新增 schema（无现有 schema 被修改）；变更④为新增 optional
  字段，v0.1 调用方不传 cookResult/failPoints 仍通过校验。两项均向后兼容，无破坏性变更，
  因此采用就地扩展而非新建 V2 schema（铁律"不得破坏消费者"未被触碰）。
  影响范围（fm-dev 后续执行，本步不改）：
  · apps/api/src/routes/family.ts：新增 GET/PUT /api/family/exclusions 两条路由（10->12 条）；
  · apps/api/src/services/planService.ts：新增 getExclusions/putExclusions；
    addFeedback 扩参 cookResult?/failPoints?，result=cooked 且 cookResult 有值时写 CookLog
    （result/failPoints/actualMinutes/willRepeat）；
  · apps/api/src/routes/plans.ts：feedback 路由透传 parsed.data.cookResult/failPoints；
  · apps/h5：client.ts 新增 getExclusions/putExclusions 方法 + setup 页调 exclusions API
    + history 页反馈表单传 cookResult/failPoints。
  不改 prisma/schema.prisma（CookLog 已有 result/failPoints 字段，STEP-03 建表）。
  实施方案 5.1 路由清单：新增 GET/PUT /api/family/exclusions 两条（原 10 条 -> 12 条），
  契约变更记录在本条，不改实施方案正文。
  冻结 tag：v0.2（代码合并后由队长打 tag；v0.1 保留可回滚）。
- DEC-012 契约变更 v0.2->v0.3（TP-02 必消食材切片，PD-012 自主开发授权）：2026-09-04 架构师（fm-arch）影响评估通过。
  背景：PD-001 将必消食材从推荐加分项改为硬过滤（用不上的方案直接不出现）。engine 层已完成改造
  （feasibilityFilter 返回 {passed, filtered, unsatisfiable}；RecommendResult 新增 unsatisfiableMustUse；
  pnpm vitest run packages/shared/test/schemas.spec.ts packages/engine/test 实测 3 文件 112 用例全绿，
  含禁忌集 taboo.spec）。空手场景按 C-7 需要"如实说明页"数据：无法消耗的必消食材原文
  （渲染文案 + 「去掉『X』再试」按钮），且不生成菜单、不写 Event、不改今晚设置（C-7 保存语义）。
  变更内容（packages/shared/src/schemas/api.ts，仅 RecommendResponseSchema）：
  ①新增 optional 字段 unmetMustUse: z.array(z.string())——非空 = 空手信号（candidates 为空数组、
  不建 Plan、不写 Event），元素为必消食材用户原文；正常推荐时字段缺省或为空数组。
  ②语义钉死：响应层存"用户原文"（C-7 文案可直接渲染）；engine 的 unsatisfiableMustUse 为
  ingredientId，API 层（后续切片）负责经 TP-02 的中文名->ingredientId 映射机制回译为原文。
  向后兼容性：纯新增 optional 字段。zod v4 对象默认 strip 策略，全仓无 .strict()/.passthrough()
  （已 grep 核实），旧调用方解析不受影响；正常场景响应与 v0.2 等价（字段缺省）；空手响应
  （candidates=[]）是 v0.2 从未出现的新形态，无旧断言覆盖。就地扩展而非新建 V2 schema
  （先例同 DEC-011：additive-optional 无破坏性，V2 只会徒增重复代码）。
  影响范围（后续切片执行，本评估不改任何 .ts 代码）：
  · apps/api/src/routes/recommend.ts：透传 unmetMustUse（该字段必须过 RecommendResponseSchema
    parse，否则 strip 策略会将其剥掉——schema 变更是透传的前置条件）；
  · apps/api/src/services/planService.ts：generateRecommendation 空手时不建 Plan/Event、
    返回值需携带 unmetMustUse；边界补充——engine unsatisfiable 为空但候选为空（必消可分别被
    不同菜单消耗、无单一菜单同时消耗全部）时 candidates 亦为空，前端按通用空手文案兜底
    （C-7 的「去掉『X』再试」按钮仅在 unmetMustUse 非空时展示）；
  · apps/h5/src/types/index.ts：RecommendResult 已同步 planId?: string + unmetMustUse?: string[]
    （工作区未提交变更）；连锁点（已实测）：pages/tonight/index.tsx:69
    setCurrentPlanId(result.planId) 在 strict 下报 TS2345（string|undefined 不可赋给
    string|null），h5 typecheck 红——前端切片须改为 result.planId ?? null；
    C-7 空手页按屏⑥落地；client.ts 无需改动（request<T> 直通）；
  · 测试：packages/shared/test/schemas.spec.ts 建议补 unmetMustUse 传值/缺省两用例；
    apps/api/test/contract.spec.ts 建议补空手响应（candidates=[] + unmetMustUse）用例。
  不改 plan.ts（PlanContext.mustUse 本就是用户原文 string[]，请求侧零变更）；不改 prisma/schema.prisma。
  冻结 tag：v0.3（代码合并后由队长打 tag；v0.2 保留可回滚）。
  批准状态：架构师评估=批准（2026-09-04，影响面/兼容性/替代方案均已核）；shared schema 修改
  由主控按本条执行并补测试；合入待用户批准（DEC-005）。
- DEC-013 契约变更 v0.3->v0.4（TP-03 换菜切片，PD-012 自主开发授权）：2026-09-04 架构师（fm-arch）
  影响评估通过。
  背景：TP-03 要求单菜换从「只写 SWAP_DISH 事件不改数据」的假动作改为真实替换并持久化
  （TECHNICAL-PLAN 17-20 行），完成标志=换菜后界面、数据库、清单三者一致可复现、杜绝假成功；
  换菜原因改选填（PD-003）；换菜需同类型候选挑选（带耗时/口味，e-final 屏③/④，
  PRODUCT-CONFIRMATION C-5/C-6）。现状三缺口：SwapPlanRequestSchema.reason 必填违反 PD-003；
  缺「换成哪道菜」字段（单菜换只知换出不知换入）；无换菜候选查询契约。
  变更内容（packages/shared/src/schemas/api.ts）：
  ①SwapPlanRequestSchema：reason 改 optional（PD-003）；新增 optional 字段 newDishId（换入菜）；
  dishId 语义钉死为「被换下的菜（换出）」；条件必填用 .superRefine 表达——swapType=单菜换时
  dishId/newDishId 必填且不得相等，全换忽略二者（保持 z.infer 为单一对象类型，不为推迟中的
  全换路径引入 discriminatedUnion 联合类型改造成本）；
  ②新增 SwapOptionsQuerySchema（GET /api/plans/:id/swap-options?dishId= 查询参数）；
  ③新增 SwapOptionSchema（候选卡精简字段：dishId/name/mealRole/cuisine?/flavorTags/
  spicyLevel/activeMinutes/totalMinutes/equipment——不复用 h5 本地 DishSnapshot（非 shared 契约），
  不发「不用开火」布尔值，由前端按 equipment 派生）；
  ④新增 SwapOptionsResponseSchema={dishId 回显, mealRole, candidates: SwapOption[]}；
  空候选=200+空数组（屏④「共 0 个如实展示」），不是错误。候选排序：activeMinutes 升序、
  同分按 name 字典序（证据可复现，同引擎先例）。
  行为收紧声明：单菜换缺 dishId/newDishId 的报文 v0.3 可过校验并写假事件，v0.4 起 400——
  该形态无合法业务（唯一前端恒带 dishId），属「杜绝假成功」的组成部分，非兼容性破坏。
  向后兼容性：reason required->optional 为放松（原合法报文全部仍合法，planService 形参本为
  reason?）；newDishId/新 schema 为纯新增；全换枚举值保留、全换分支代码不动。
  zod v4 对象默认 strip、全仓无 .strict()/.passthrough()（已核实）。均无破坏性变更，
  就地扩展而非新建 V2（先例同 DEC-011/DEC-012）。
  架构裁决（与契约同版本生效）：
  ·持久化：选「计划内快照」方案——快照即既有 plan.candidates[].menu（recommend 时已持久化的
  完整 MenuView），单菜换=服务端复检过滤规则后原地重写锁定候选的 menu 快照（新菜继承被换菜
  槽位）+联动重算 shoppingList+写 SWAP_DISH 事件 {dishId,newDishId,reason,oldDishName,
  newDishName,regenerated:true}。否决 Plan 级 override（多读取点合并=新的假成功源+需迁移）与
  copy-on-write（全局内容资产复制污染推荐池+迁移）。prisma/schema.prisma 零改动，纯 Json 内容演化。
  ·候选过滤：engine 新增纯函数 filterSwapCandidates（safetyFilter 单菜合成复用 -> 器具 ->
  dish 级时长 -> mustUse 联动：换后菜单必须仍覆盖全部必消，orphaned=必消-换后其他菜食材并集，
  候选须接住 orphaned，否则不出现——PD-001 不因换菜被击穿）；feasibilityFilter 不复用
  （mustUse 为菜单级全量覆盖检查，不适用单菜）。服务端对 newDishId 强制复检（400+FilterTrace
  原因文案），UI 只见过滤后候选不构成豁免。
  ·备菜顺序联动：确定性串行展开规则——按换后菜品序展开各菜 steps（每步分摊
  max(1,ceil(activeMinutes/步数)) 分钟，时间线从 0 累加），steps 为空的菜以单条目
  「做『菜名』」如实占位；换后 totalActiveMinutes=Σ 各菜 activeMinutes（串行估算，与原菜单
  并行工时的口径差异在此声明）；不做自由文本工序的菜名匹配删除（不可测）。换菜才重算，
  未换菜旧 Plan 不动。
  ·清单联动：抽 computeShoppingList 内核，getShoppingList 改快照优先（快照缺失降级现 DB 路径）；
  修复现存缺陷：每次 GET 以 checked:false 覆盖清空勾选——重算时按 ingredientId 保留勾选；
  swap 时同步重算并写回 plan.shoppingList，换后 Plan 响应自带新清单（一次请求三一致）。
  ·旧 Plan 兼容：无 menu 快照的计划首次换菜/查候选时从 DB Menu 懒水合一次；未换菜零影响。
  影响范围（主控按本条执行，本评估不改任何代码）：
  ·apps/api：routes/plans.ts（swap 透传 newDishId + 新增 GET swap-options）；planService.ts
  （swapPlan 单菜换分支重写、新增 getSwapOptions、getShoppingList 抽内核快照优先+勾选保留、
  新增 PlanStateError->409）；全换分支与 337 行 mustUse 原文未映射问题不动，记遗留；
  ·apps/h5：client.ts（swapPlan 携 newDishId/reason? + 新增 getSwapOptions）；
  candidates/index.tsx（删 reason 必填拦截、删 mergeCandidates 本地合并、弹窗重构为屏③
  两态——候选卡+可选原因 chips / 共 0 个如实空态、失败文案「没换成」）；
  ·packages/engine：新增 filterSwapCandidates 纯函数+单测（触碰引擎，铁律 8 必跑
  pnpm test:taboo 100%，跑前停 API dev 进程防 CPU 抢占）；
  ·不改 packages/shared/schemas/plan.ts（Candidate.menu 维持 z.unknown().optional()，
  快照=engine MenuView 形状的语义钉死在本条）；不改 prisma/schema.prisma；
  ·测试：schemas.spec.ts 改写反转用例（「缺 reason 通过」）+新增 newDishId 条件必填用例；
  engine swap-candidates.spec.ts；api 真实 PG 集成（swap 三一致断言：candidates 快照/
  shoppingList/Event payload）；e2e 手工清单落 evidence/。
  冻结 tag：v0.4（代码合并后由队长打 tag；v0.3 保留可回滚）。
  批准状态：架构师评估=批准（2026-09-04，持久化三方案对比/mustUse 联动口径/备菜顺序算法
  均已裁决）；shared+engine 修改由主控按本条执行并补测试；合入待用户批准（DEC-005）。
- DEC-014 契约变更 v0.4->v0.5（TP-04 购物清单切片，PD-012 自主开发授权）：2026-09-04 架构师
  （fm-arch）影响评估——草案（待用户批准）。
  背景：TP-04 要求清单支持必消食材标"已有"不删（PD-004）、按今晚人数缩放分量并取整（PD-005）、
  顶部改人数自动缩放、常备调料标"家里常备"（C-8）。现状缺口：ShoppingListSchema 仍为
  z.record(z.string(), z.unknown()) 占位（plan.ts 52 行）；merge.ts 常备调料为删除式 continue、
  无人数缩放、无标记字段；planService.computeShoppingList 仅做合并+勾选保留。
  变更内容（packages/shared/src/schemas/plan.ts + api.ts）：
  ①ShoppingListSchema 精化：record(unknown) -> 结构化 schema——
  ShoppingListItemSchema = {ingredientId, name, category, qty: number, unit, checked: boolean,
  alreadyHave?: boolean（已有·必消，PD-004）, pantryStaple?: boolean（家里常备，C-8）}；
  ShoppingListGroupSchema = {category, items: ShoppingListItem[]}；
  ShoppingListSchema = {groups: ShoppingListGroup[]}。两个新布尔为 optional 缺省=未标
  （前端按 false 渲染）。groups 形态与 list-merger 现行输出一致，不再双重定义。
  ②新增 RescaleShoppingListRequestSchema = {people: z.number().int().min(1)}
  （POST /api/plans/:id/shopping-list/rescale 请求体，见裁决 3）。
  ③EventTypeSchema 新增 'RESCALE'（additive，rescale 留痕；全仓 EventType 无穷举 switch，
  消费面仅 EventPayloadSchema/埋点，纯枚举扩展无破坏）。
  向后兼容性：①③为就地扩展，先例同 DEC-011/012/013（additive-optional 无破坏性，不建 V2）。
  ②为纯新增 schema。zod v4 对象默认 strip、全仓无 .strict()/.passthrough()（DEC-012/013 已两度
  grep 核实，沿用结论）。关键事实核正：数据库已存 shoppingList JSON 的唯一写入方是
  getShoppingList/swapPlan/patchShoppingList（planService），写入内容即 list-merger 输出形态
  （merge.ts ShoppingListItem 六字段 + groups），与新 schema 字段全对齐——"旧形态"只存在于
  zod 契约层（record(unknown) 未定型），不存在存库形态分叉，故无需迁移脚本；极端脏数据由
  getShoppingList 每次 GET 重算自愈。prisma/schema.prisma 零改动（Json 纯内容演化，先例同 DEC-013）。
  架构裁决（五项）：
  ·裁决 2 人数缩放与取整：缩放落在 list-merger 纯函数层——mergeShoppingList 增
  options.people（缺省 = BASE_SERVINGS = 4，即 qty×4/4 原样，既有单测零破坏）；公式
  qty × people / 4；取整规则 = 所有单位一律向上取整到整数、最小 1（ceil，计数单位与 g/ml
  统一口径）。理由：单一规则可解释（"宁多勿少，凑整好买"）、确定性可测试、与 PD-005 示例
  （1.5 个鸡蛋 -> 2 个）及"偶尔少量剩余属预期"一致；g/ml 取整后仍为可购买整数。否决
  "按单位分级取整（10g 步长等）"——引入配置与口径争议，违背可测试性。取整时机 = 单位换算
  合并之后的总量一次性取整（不做逐条目取整，避免误差复合）；新增 roundPurchase 纯函数与
  units.ts 的 round2（防浮点误差）职责分开、分开测。基准人数硬编码 BASE_SERVINGS=4
  （PD-005 定死 4 人份；Menu.serves 字段存在但不动用，见遗留）。
  ·裁决 3 改人数接口：选 b——新增 POST /api/plans/:id/shopping-list/rescale {people}，
  否决 a 扩展 PATCH。理由：rescale 是带副作用的重算动作，与本仓动作类端点先例一致
  （POST /lock、/swap、/repeat 均为 POST 子资源）；扩展 PATCH 会把"条目勾选"与"整单重算"
  两种语义混载一个入口。行为：rescale 同步更新 plan.context.people（今晚人数单一事实源，
  做法页 C-4 未来按人数换算同源；recommend 仅在新建/复做时消费 context，锁定态快照理论安全，
  且"全换"若启用本就应随新人数——语义正确非副作用）+ 用换后 menuView 重算清单 +
  按 ingredientId 保留勾选（复用 computeShoppingList 内核 checkedIds 逻辑）+ 写 Event RESCALE
  {from, to}；响应 = 完整新清单（ShoppingListResponse）。computeShoppingList 签名扩为
  (menuView, people, previous, mustUseIds)；swapPlan/getShoppingList 两处调用点同步改；
  patchShoppingList 维持只改勾选、不触发缩放。
  ·裁决 4 常备调料口径偏离声明：merge.ts 由"删除式 continue"改为"标记显示"
  （命中 DEFAULT_PANTRY_STAPLES 的 canonicalId/name/aliases -> pantryStaple=true 保留在清单）。
  此为对 TECHNICAL-PLAN TP-04"常备调料不出现（回归既有能力）"与确认书 A 部分第 28/36 行的
  明确偏离；依据 = 用户已锁定 C 部分（C-8"常备调料标「家里常备」"，PD-012 定稿效力高于
  A 部分）+ design-spec.md 第 77 行 .tag-pantry（家里常备=灰）。不改 TECHNICAL-PLAN 正文
  （先例同 DEC-011），偏离记录在本条，供用户知情批准。
  ·裁决 5 alreadyHave 判定：item.ingredientId（= list-merger 归一 canonicalId，恒为
  DB ingredientId）∈ resolveMustUseIds(context.mustUse).ids。复用 TP-02 同一映射机制
  （trim -> name 精确 -> aliases 精确 -> 大小写不敏感），与推荐引擎匹配口径同源，不建第二套
  匹配。实现上 planService 先解析出 id 集合，以 MergeOptions.alreadyHaveIds 传入纯函数
  （list-merger 保持零 IO）。可靠性边界：原文在 DB 无 name/alias 命中时 resolveMustUseIds
  回退原文为伪 id，清单项不可能命中——该场景推荐引擎同样匹配不到（PD-001 必然空手、无清单
  可言），故不存在"该标未标"的独立伪阴性面；别名覆盖不足导致的漏标与推荐层风险同源，
  由 TP-02 别名机制兜底。
  ·裁决 1 附（旧数据读取兼容）：无需 write-through 迁移。读取路径 parse 失败即降级重算
  （getShoppingList 现有行为已覆盖）；两个 optional 布尔在旧 JSON 中缺省，zod optional 直接过。
  PlanResponseSchema/PlanListResponseSchema 继承精化后 PlanSchema.shoppingList，旧 Plan 行
  JSON 形态一致，parse 通过；planService.toPlan 第 87 行 cast 需随之调整类型断言（编译面，
  非运行面）。
  影响范围（主控按本条派发执行，本评估不改任何业务代码）：
  ·packages/shared：schemas/plan.ts（①③）、schemas/api.ts（② + 版本头注释 v0.5）；
    types/index.ts 由 z.infer 自动变形，无需手工改；test/schemas.spec.ts 增结构化校验/
    optional 缺省/RESCALE 枚举用例；
  ·packages/list-merger：src/merge.ts（people/BASE_SERVINGS/roundPurchase/pantryStaple 标记/
    alreadyHaveIds，MergeOptions 扩参）、src/index.ts 按需补导出；
    test/merge.spec.ts（原"去常备删除"断言改为"标记保留"断言 + 缩放/取整/标记/缩放后勾选
    保留用例）；不触 engine（铁律 8 不适用，全量 pnpm test 照跑）；
  ·apps/api：services/planService.ts（computeShoppingList 扩签名 + toPlan cast 调整 +
    新增 rescaleShoppingList：requireLockedPlan 校验 -> 更新 context.people -> 重算写回 ->
    Event RESCALE）、routes/plans.ts（新增 POST /plans/:id/shopping-list/rescale）；
    test/contract.spec.ts（rescale 契约/alreadyHave+pantryStaple 字段/旧形态 JSON 兼容用例；
    现有清单断言随口径更新）；不触 prisma/schema.prisma；
  ·apps/h5：types/index.ts（ShoppingListItem 增 alreadyHave?/pantryStaple?；建议顺势改为
    re-export shared 类型，消灭与 shared/list-merger 的三处重复定义，由主控定夺）、
    api/client.ts（rescaleShoppingList）、pages/plan/index.tsx（顶部人数步进器联动 rescale、
    .tag-have/.tag-pantry 两标签、C-8 提示文案、「就按这个买」->「✓ 已按这个买」完成标记）、
    pages/plan/index.css；
  ·不改 prisma/schema.prisma；不改 TECHNICAL-PLAN/实施方案正文（偏离记录于本条）。
  遗留与风险（主控注意）：
  ·「就按这个买」= 会话内完成标记不持久化（PD-012 文本"仅作完成标记，不引入其他功能"）；
    若用户要求刷新后保留，需另立 list 级 bought 契约决策，勿塞入本切片。
  ·BASE_SERVINGS 硬编码 4：未来菜库出现 serves≠4 的菜单时，缩放口径需产品重定（记遗留）。
  ·人数步进器初始值来源 = store 中 plan.context.people；刷新后 store 重建依赖今晚流程，
    如需独立 GET /plans/:id 详情端点另行评估（YAGNI 暂不做）。
  ·h5/shared/list-merger 三处 ShoppingList 结构重复定义，建议本切片内收敛为 shared 单一
    事实源（纯类型收敛，低风险）；STATUS.md 当前任务卡仍停留在 STEP-08（四件套未随 ai-rebuild
    轨道更新），派发前建议队长同步，避免 DEC-004 恢复协议歧义。
  冻结 tag：v0.5（代码合并后由队长打 tag；v0.4 保留可回滚）。
  批准状态：已生效（2026-09-04）——PD-012 自主开发授权覆盖；契约细节均对应已定稿产品决策
  （PD-004/PD-005/C-8），常备调料口径依用户锁定 C-8 执行（A 部分冲突已记录在案）；主控按本条
  派发执行（同 DEC-013 生效惯例）。
- DEC-015 契约变更 v0.5->v0.6（TP-05 反馈三问切片，PD-012 自主开发授权）：2026-09-05 架构师
  （fm-arch）影响评估——已生效。
  背景：C-10/PD-006 将反馈简化为三问（①做了吗 ②味道怎么样 ③下次还做吗）+ 耗时选填，
  「如实记录（本轮不做学习）」；完成标志=三问提交后数据落库证据，旧五项表单移除。C-10 另要求：
  同一天再次进入反馈页显示已提交答案、可修改重提（覆盖当天记录）；提交失败提示「没记上」且
  已选答案不丢。C-11 历史结果标签：绿=做了/好吃/下次还做、灰=没做/不做了、黄=一般、红=翻车，
  记了耗时显示「约 N 分钟」。现状缺口：FeedbackRequestSchema（v0.2 形态，api.ts 140-145 行）
  result('cooked'|'not_cooked'|'repeat')/cookResult/failPoints 为旧五项表单模型，与三问不匹配；
  result='repeat' 是语义 hack（「做了+还做」混写，与 repeatPlan 的 REPEAT 事件两义混用）。
  变更内容（packages/shared，契约 v0.5->v0.6，仅 schemas/api.ts+types/index.ts+测试）：
  ①FeedbackRequestSchema 重写为三问模型：didCook: z.boolean()（必填，第①问）；
  taste: TasteSchema.optional()（第②问，条件必填——didCook=true 必填、didCook=false 不得传，
  用 .superRefine 表达，先例同 DEC-013 单菜换条件必填，保持 z.infer 单一对象类型）；
  willRepeat: z.boolean()（必填，第③问三问全答——C-11「灰=没做/不做了」证明没做也可答
  不做了）；actualMinutes: z.number().int().optional()（选填，PD-006）。
  旧字段 result/cookResult/failPoints 直接移除（裁决 1）。
  ②新增 TasteSchema = z.enum(['good','ok','fail'])（好吃/一般/翻车）。
  ③新增 FeedbackResponseSchema = {didCook: boolean, taste?: Taste, willRepeat?: boolean,
  actualMinutes?: number, submittedAt: Date}（GET /api/plans/:id/feedback 响应，裁决 4）；
  taste/willRepeat 在响应侧 optional 是旧数据宽松解析（v0.5 事件 payload 无此字段，如实缺省
  不编造），与请求侧必填不对称属历史事实使然。
  ④删除 FeedbackResultSchema 与 CookResultSchema 及其类型导出（三问模型下 result/cookResult
  概念消失；CookLogSchema.result 在 menu.ts 为独立 z.enum 定义，不受影响，保持不动）。
  ⑤EventTypeSchema/EventPayloadSchema/prisma/schema.prisma 零改动（裁决 2 复用现有事件类型）。
  向后兼容性：①④为 breaking 变更（旧 result 报文 v0.6 起 400）。裁决依据：v0.5 消费面仅自家
  h5（grep 证实：shared types、apps/api routes+planService、h5 client+history，全部在本切片
  同步改造面内，无第三方/孤儿消费者），调用方与契约同 PR 升级；若保留旧字段则三问字段与
  result 双轨并存+互斥校验，长期污染契约。先例：DEC-013 行为收紧声明（调用方自家、可 breaking）。
  版本号 v0.5->v0.6 明示 breaking。②③为纯新增。zod v4 默认 strip、全仓无
  .strict()/.passthrough()（DEC-012/013/014 三度 grep 核实，结论沿用）。
  架构裁决（六项）：
  ·裁决 1 旧字段处置：result/cookResult/failPoints 直接移除不保留兼容（理由见兼容性段）。
  连带消除 result='repeat' 语义 hack：反馈不再产生 REPEAT 事件，REPEAT 事件回归 repeatPlan
  （复做动作）专属语义，repeatPlan 分支代码不动。
  ·裁决 2 事件映射（零迁移）：didCook=true -> Event type='COOKED'，payload={taste, willRepeat,
  actualMinutes?}；didCook=false -> 'NOT_COOKED'，payload={willRepeat, actualMinutes?}（无
  taste）。payload 形状语义钉死在本条（先例同 DEC-013 快照形状钉死）。否决新增 FEEDBACK
  事件类型（需 DB enum 手动 SQL 迁移）：COOKED/NOT_COOKED 本身就是第①问的答案，再立
  FEEDBACK 会把同一提交拆成动作流/反馈流双轨，历史读取与学习闭环都要合并两种事件；payload
  扩展为 additive（EventPayloadSchema 本为 record(unknown) 按需细化），复用=单一事件流+零迁移。
  ·裁决 3 CookLog 写入口径：didCook=true 继续 append（DEC-006：CookLog 是内容升级唯一通道，
  不可断）——menuId=plan.lockedMenuId ?? null（沿用现状）、result=taste 确定映射
  （good->success、ok->partial、fail->fail）、willRepeat=willRepeat、actualMinutes=
  actualMinutes ?? null、failPoints=null（三问无失败原因输入，字段留给内容管线）、dishId
  不写（沿用现状）。didCook=false 不写 CookLog（没做即无试做，写了即伪造内容管线升级依据，
  「如实记录」）。映射理由：CookLog.result 是内容管线语义（DRAFT->TESTED->PUBLISHED 依据），
  taste 是反馈语义；映射只在写入侧单向发生，Event payload 保留 taste 原值，信息无损，
  TP-06+ 学习闭环从事件流取原值。否决 taste 原值直写 CookLog.result（破坏 CookLogSchema
  枚举契约+管线三值语义被 'good'/'ok' 污染）。重复提交：CookLog 无 planId 字段（DB 边界
  禁改）无法 upsert，didCook=true 的每次提交如实逐条 append，内容管线消费按 cookedAt 最新
  一条为准（口径钉死；TP-06+ 如需按 plan 关联去重另行评估）。
  ·裁决 4 覆盖重提读取：新增 GET /api/plans/:id/feedback——取该 plan 事件流最新一条
  COOKED/NOT_COOKED 解析三问+耗时（didCook 由事件 type 派生，taste/willRepeat/actualMinutes
  取 payload，submittedAt=事件 createdAt）；无反馈 -> 404（NotFoundError 先例，前端 catch
  404 初始化空表单）。评估结论：满足 C-10「覆盖当天记录」——用户感知面（历史标签、反馈
  回显）均取最新一条；事件流 append-only 不删旧事件（审计完整）；一个 plan 即一天一顿
  （planDate），plan 级最新=当天最新，无需日期过滤；改提翻转 didCook 时 Plan.status 同步按
  最新更新（COOKED/SKIPPED），无脏状态。重复提交=append 新事件+status 按最新，不引入第二个
  存储位。状态校验注意：feedback 写/读均不得复用 requireLockedPlan（其仅放行 LOCKED，
  184-195 行）——「可修改重提」发生在 COOKED/SKIPPED 态，LOCKED-only 会击穿 C-10 重提语义；
  维持现状 findUnique+NotFoundError，不做状态强校验。
  ·裁决 5 Plan.status 语义：didCook=true->COOKED、false->SKIPPED（沿用现状）；willRepeat
  不影响 status（仅记录于 Event payload 与 CookLog.willRepeat）。C-11 结果标签由反馈数据
  派生而非 status 单独决定，派生规则钉死（可测试）：taste=fail->红；taste=ok->黄；
  didCook=false 或 willRepeat=false->灰；其余->绿（味道事实优先于意愿，符合 C-11 字面；
  旧数据 willRepeat 缺失不触发灰规则，按缺省如实降级）。「约 N 分钟」= actualMinutes 有值
  才显示。
  ·裁决 6 「本轮不做学习」边界：契约与存储只保证如实记录（三问+耗时落 Event payload 与
  CookLog）；packages/engine 零改动（评分不读反馈）；「反馈学习闭环本轮只积累记录」在以后
  再做清单（PD-006）；页面保留「反馈只用于以后推荐，不评判谁做饭」文案（e-final s9/s10
  原文）。
  影响范围（主控按本条派发执行，本评估不改任何业务代码）：
  ·packages/shared：schemas/api.ts（①②③④ + 版本头注释 v0.6）、types/index.ts（删
  FeedbackResult/CookResult 导出，增 Taste/FeedbackResponse，FeedbackRequest 由 z.infer
  自动变形）；test/schemas.spec.ts（449-472 行旧用例改写 + 新增：taste 条件必填/禁传、
  didCook/willRepeat 必填、actualMinutes 选填、FeedbackResponse 旧 payload 宽松解析）；
  ·apps/api：services/planService.ts（addFeedback 重写：签名改 (planId, data: FeedbackRequest)、
  事件映射/CookLog 映射/status 按裁决 2/3/5；新增 getFeedback 按裁决 4）、routes/plans.ts
  （feedback 路由透传改造 + 新增 GET /plans/:id/feedback）；test/contract.spec.ts（666-691 行
  旧用例重写 + GET feedback 404/200 用例 + 真实 PG 落库证据断言：Event type/payload 三问
  字段、CookLog result 映射/willRepeat/actualMinutes、Plan.status、覆盖重提 append 第二条+
  GET 返回最新+status 翻转）；不改 prisma/schema.prisma；
  ·apps/h5：app.config.ts（注册 pages/feedback/index）、api/client.ts（addFeedback 新签名 +
  新增 getFeedback）、types/index.ts（re-export 同步：删 FeedbackResult、增 Taste/
  FeedbackResponse）、新增 pages/feedback/index.tsx+index.css（三问芯片：做了/没做、好吃/
  一般/翻车、还做/不做了 + 耗时选填「如：30 分钟」+ 成功页复述答案（屏⑨->⑩，如「N月N日
  这顿已记下：做了 · 好吃 · 下次还做」）+ 失败「没记上」保答案可再提 + 404 空表单/已提交
  回显可改重提）、pages/history/index.tsx（移除旧五项表单，重写为 C-11 历史列表：日期/菜名/
  结果标签（裁决 5 派生色）+「约 N 分钟」；对 status∈{COOKED,SKIPPED} 的 plan 并发 GET
  feedback，404=未反馈态）+index.css、pages/plan/index.tsx 363 行与 pages/dish/index.tsx
  88 行入口改跳 feedback 页；
  ·不改 packages/engine、packages/list-merger；不改 prisma/schema.prisma；e-final.html 仅作
  视觉基准对照不改。
  测试要求：pnpm vitest run packages/shared/test/schemas.spec.ts；pnpm vitest run
  apps/api/test/contract.spec.ts + 真实 PG 集成断言（先例同 DEC-013 三一致断言）；全量
  pnpm test（不触 engine，铁律 8 不适用，照跑防回归，先例同 DEC-014）；e2e 手工清单落
  evidence/：三问提交->落库证据（Event/CookLog/status）->历史页立即可见（C-10 刷新/重进）
  ->重进反馈页回显->修改重提->历史标签与耗时更新->提交失败保答案可再提交。
  遗留与风险（主控注意）：历史页逐 plan 并发 GET feedback 属 N+1 读（个人自用量级可接受；
  如未来需要列表聚合端点另行评估，勿塞本切片）；v0.5 旧事件 payload 无 taste/willRepeat、
  旧 REPEAT 反馈事件不再解析，历史标签按缺省规则如实降级；CookLog 逐次 append 口径见裁决 3
  （TP-06+ 消费时按 cookedAt 最新为准）。
  冻结 tag：v0.6（代码合并后由队长打 tag；v0.5 保留可回滚）。
  批准状态：已生效（2026-09-05）——PD-012 自主开发授权覆盖（同 DEC-012/013/014 生效惯例）；
  架构师评估=批准（六项裁决与 breaking 依据均已核）；shared/api/h5 修改由主控按本条派发执行
  并补测试。
