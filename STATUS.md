# 家庭菜谱App 开发状态
> 本文件由主Agent维护。任何时刻只允许一个活动任务卡（DEC-003）。

## 当前状态
- 当前阶段：STEP-05 API层（WP-04）（待用户审核）
- main HEAD：8428bee；回滚tag：rollback-before-step-05 -> 8428bee；契约冻结tag：v0.1
- 阻塞/外部依赖：无
- 下一个人工决策点：STEP-05 交付审核

## 当前任务卡：STEP-05 API层（对应 WP-04）
状态: 待用户审核    回环计数: 0/3
执行者: fm-dev    审查者: fm-reviewer（只读）
需求来源: 实施方案 5.1 API路由清单（第394-406行）+ 第408行鉴权 + 第364-371行目录结构 + 7.1 WP-04（第567行）+ 8.1 STEP-05（第610行）+ 8.2 API测试（第638行）+ DEC-006（零LLM）+ STEP-02 契约 v0.1 + STEP-04 引擎+合并器    基线提交: main@8428bee    回滚点: rollback-before-step-05

### ① 目标
实现 Fastify 5 API 层：10 条路由（family/recommend/plans）+ 口令鉴权 + 契约测试。路由薄、逻辑在 services（planService 调 engine.recommend + list-merger.mergeShoppingList + Prisma 持久化）。

### ② 验收标准 AC
- [ ] AC1 apps/api/src/app.ts 插件装配（fastify-type-provider-zod + auth 口令中间件 + 错误处理），对齐第368行；server.ts 改为引入 app.ts
- [ ] AC2 apps/api/src/routes/family.ts GET/PUT /api/family/rules（读写家庭规则与禁忌，F1），请求/响应过 shared zod 校验
- [ ] AC3 apps/api/src/routes/recommend.ts POST /api/recommend（传情境->建Plan->调engine.recommend->返回3候选+理由，F2/F3），响应过 RecommendResponseSchema 校验
- [ ] AC4 apps/api/src/routes/plans.ts POST /api/plans/:id/lock + POST /api/plans/:id/swap（锁定+换菜+reason，F3），请求过 SwapPlanRequestSchema 校验
- [ ] AC5 apps/api/src/routes/plans.ts GET/PATCH /api/plans/:id/shopping-list（合并清单+备菜顺序/勾选状态，F4/F5），调 list-merger.mergeShoppingList
- [ ] AC6 apps/api/src/routes/plans.ts POST /api/plans/:id/feedback（cooked/not_cooked/repeat，F6），请求过 FeedbackRequestSchema 校验
- [ ] AC7 apps/api/src/routes/plans.ts GET /api/plans + POST /api/plans/:id/repeat（历史列表+复做，F7）
- [ ] AC8 apps/api/src/services/planService.ts 引擎编排（调 engine.recommend + list-merger.mergeShoppingList + Prisma 持久化），路由薄逻辑在 services
- [ ] AC9 口令鉴权（ACCESS_TOKEN cookie，auth 中间件插槽，对齐第408行，预留阶段2微信登录替换）
- [ ] AC10 契约测试（fastify inject，全路由合法200/非法400，响应过 shared zod 校验，对齐第638行）；本机无 PG，Prisma mock 或跳过 DB 操作
- [ ] AC11 pnpm verify exit 0（lint 零 error，build 成功，test 通过）
- [ ] AC12 pnpm -r build 成功（不破坏 shared/engine/list-merger/h5 现有构建）

### ③ 输入资源
- docs/plan/实施方案.md @8428bee：
  - 5.1 API路由清单（第394-406行）：10条路由
  - 第408行鉴权：ACCESS_TOKEN口令（cookie），routes层预留auth中间件插槽
  - 第364-371行目录结构：server.ts/app.ts/routes/{family,recommend,plans,admin}.ts/services/db.ts
  - 7.1 WP-04（第567行）：全部路由+口令鉴权+openapi.json
  - 8.1 STEP-05（第610行）：全部路由+口令鉴权+契约测试
  - 8.2 API测试（第638行）：fastify inject契约测试，全路由合法200/非法400，响应过shared zod校验
  - 第674行：auth中间件插槽已留；口令换session
  - .env.example（第789行）：ACCESS_TOKEN=change-me
- STEP-02 契约 v0.1 @v0.1 tag：packages/shared/src/schemas/api.ts（10条路由请求/响应schema + SwapTypeSchema + FeedbackResultSchema）
- STEP-04 引擎+合并器 @8428bee：
  - packages/engine/src/：recommend(input: RecommendInput): {candidates, filtered} + ScoredMenu/FilterTrace 类型
  - packages/list-merger/src/：mergeShoppingList(menu): ShoppingList
- STEP-03 数据层 @8428bee：apps/api/prisma/schema.prisma（12 model + 8 enum）+ seed.ts + migrations/
- AGENTS.md @8428bee（第693行：apps/api Fastify5+Prisma，路由薄、逻辑在 services；铁律6：运行时零LLM）
- UI 设计文档 @8428bee：docs/design/wireframes.md（数据展示需求参考）+ interaction-flow.md（异常路径参考）
- 现有基线 @8428bee：
  - apps/api/src/server.ts（/health + /health/db 端点，需重构为 app.ts + server.ts 分离）
  - apps/api/src/db.ts（PrismaClient 单例，Prisma 7 driver adapter，已就绪）
  - apps/api/package.json（已有 fastify ^5.10.0 + @family-menu/{shared,engine,list-merger} workspace:* + Prisma 7 + pg + dotenv）
  - apps/api/test/seed.spec.ts（STEP-03 的 seed 校验测试，16 用例）
  - .env.example（ACCESS_TOKEN=change-me, DATABASE_URL, PORT=3000）

### ④ 边界约束（不允许做什么）
- 可修改：apps/api/src/* + apps/api/test/* + apps/api/package.json + apps/api/tsconfig.json（如需）
- 禁改 packages/shared（v0.1 冻结）
- 禁改 packages/engine / packages/list-merger（STEP-04 已合并）
- 禁改 apps/h5（WP-05 范围）
- 禁改 apps/api/prisma/schema.prisma（STEP-03 已合并，如需改报队长）
- 禁改 docker-compose.yml / 四件套 / 实施方案
- 运行时零 LLM（DEC-006）
- 路由薄、逻辑在 services（AGENTS.md 第693行）
- auth 中间件预留插槽（阶段2替换微信登录）
- 不引入 DEC-008 禁止项（Redis/消息队列/微服务/K8s）
- 新增依赖在完成报告列出（预计：fastify-type-provider-zod >=5.x + @fastify/cookie）
- git 提交信息 [WP-04] 动词开头

### ⑤ 异常升级路径
- 契约缺字段（shared v0.1 不满足 API 需求）-> 停下@队长转 fm-arch（契约变更流程）
- Prisma 7 适配问题 -> 报队长
- engine/list-merger 接口不匹配 -> 停下@队长
- fastify-type-provider-zod v5 与 zod v4 兼容性问题 -> 报队长
- 第3次被打回 -> 停止修改

## 最小测试（fm-tester 照跑，真实执行，禁止Mock冒充）
- `pnpm install --frozen-lockfile`（exit 0）
- `pnpm verify`（lint+build+test，exit 0，lint 零 error）
- `pnpm -r build`（不破坏其他包构建）
- 契约测试：fastify inject 全路由合法200/非法400，响应过 shared zod 校验

## 审查重点
- 10 条路由与 5.1 路由清单逐项一致
- 请求/响应 schema 与 shared v0.1 api.ts 一致
- 口令鉴权（ACCESS_TOKEN cookie，auth 中间件插槽）
- 路由薄、逻辑在 services（planService 调 engine + list-merger + Prisma）
- 契约测试覆盖全路由（合法200/非法400）
- 引擎纯函数零IO（API 层调 engine，不在 engine 中加 IO）
- 运行时零 LLM（DEC-006）
- 目录结构与第364-371行一致（app.ts/routes/services/db.ts）

## 交付门禁
开发（fm-dev）-> 独立测试（fm-tester）-> 交叉审查（fm-reviewer）-> 主复验 -> 状态改"待用户审核"并暂停；
用户批准前不合并、不启动下一 STEP（DEC-005）。

## 完成报告（fm-dev 填写）
- AC自检: [ ]AC1...（逐条[✓]/[✗]）
- 交付物: <路径@commit>
- 测试结果: <用例通过数/exit code>
- 新增依赖及理由: <列出>
- 遗留与下一步建议:

## 审查报告（fm-reviewer 填写，任何✗=打回，回环+1）
- [ ] 契约一致性（10条路由与5.1一致；请求/响应与shared v0.1 api.ts一致；目录结构与第364-371行一致）
- [ ] 越界检查（仅改 apps/api/src + apps/api/test + apps/api/package.json；不改 shared/engine/list-merger/h5/prisma）
- [ ] 安全缺陷（无LLM调用DEC-006；无DEC-008禁止项；口令鉴权正确；auth中间件插槽预留）
- [ ] 逻辑正确性（路由逻辑正确；planService 引擎编排正确；契约测试覆盖全路由）
- [ ] 可维护性（路由薄逻辑在services；命名规范；函数CC<=15）

## 总任务拆解
| STEP | 对应WP | 内容 | 状态 |
|---|---|---|---|
| STEP-00 | - | 协作框架四件套 | 已合并 |
| STEP-01 | WP-00 | 工程基线 | 已合并 |
| STEP-02 | WP-01 | 契约冻结 v0.1 | 已合并 |
| STEP-03 | WP-02 | 数据层 | 已合并 |
| STEP-04 | WP-03/06 | 推荐引擎+清单合并器 | 已合并 |
| UI设计 | - | 前置UI设计（线框+流程+主题+插画） | 已完成 |
| STEP-05 | WP-04 | API（Fastify路由+口令鉴权+契约测试） | 进行中 |
| STEP-06 | WP-05 | H5前端（5页面走通） | 未开始 |
| STEP-07 | WP-07 | 内容管线CLI | 未开始 |
| STEP-08 | WP-09/10 | 部署+集成验收 | 未开始 |
