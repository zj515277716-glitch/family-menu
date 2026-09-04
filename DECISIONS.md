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
