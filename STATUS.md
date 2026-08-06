# 家庭菜谱App 开发状态
> 本文件由主Agent维护。任何时刻只允许一个活动任务卡（DEC-003）。

## 当前状态
- 当前阶段：STEP-03 数据层（WP-02）（开发中）
- main HEAD：b82fdcc；回滚tag：rollback-before-step-03 -> b82fdcc；契约冻结tag：v0.1
- 阻塞/外部依赖：本机无 Docker/PostgreSQL，migration+seed 真实 PG 验证需 CI 补验
- 下一个人工决策点：STEP-03 交付审核

## 当前任务卡：STEP-03 数据层（对应 WP-02）
状态: 开发中    回环计数: 0/3
执行者: fm-dev    审查者: fm-reviewer（只读）
需求来源: 实施方案第三章3.2（Prisma Schema 12 model+8 enum）+ 第五章仓库结构（apps/api/prisma/{schema.prisma,seed.ts,migrations/}）+ 7.1 WP-02（10菜/4套）+ 8.1 STEP-03 + DEC-001（Prisma 7 适配）+ STEP-02 契约 v0.1    基线提交: main@b82fdcc    回滚点: rollback-before-step-03

### ① 目标
apps/api/prisma/schema.prisma 实现 3.2 全部数据模型（12 model + 8 enum），Prisma 7 适配；生成初始 migration；实现 seed.ts（10菜/4套+家庭+规则+禁忌，可重复 upsert），seed 数据通过 shared v0.1 zod schema 校验。真实 PG 验证受环境限制，CI 补验。

### ② 验收标准 AC
- [ ] AC1 schema.prisma 实现 12 个 model（Family/FamilyRule/ExclusionRule/Ingredient/Substitution/Dish/DishIngredient/Menu/MenuDish/CookLog/Plan/Event），字段对齐 3.2（第 92-256 行），Prisma 7 适配（generator prisma-client，datasource 无 url）
- [ ] AC2 8 个 enum（Severity/ExclusionScope/MealRole/ContentStatus/ContentOrigin/MenuScene/PlanStatus/EventType），枚举值与 3.2 + shared v0.1 一致
- [ ] AC3 model 间关系完整：Family-FamilyRule 1:1(@unique), Family-ExclusionRule 1:N, Ingredient-DishIngredient 1:N, Ingredient-Substitution 双向(from/to), Dish-DishIngredient 1:N, Menu-MenuDish 1:N(@@id复合主键), Menu-CookLog 1:N, Dish-CookLog 1:N, Family-Plan 1:N, Plan-Event 1:N, Family-Event 1:N
- [ ] AC4 Json 字段保留（Dish.steps / Menu.prepSequence / Plan.context / Plan.candidates / Plan.shoppingList / Event.payload 为 Json 类型，与 3.2 一致）
- [ ] AC5 prisma generate 成功（PrismaClient 生成无错误，apps/api build 通过）
- [ ] AC6 初始 migration 生成并落盘 prisma/migrations/（prisma migrate dev --name init 需 DB；无 DB 环境用 prisma migrate diff --from-empty --to-schema-datamodel --script 生成 SQL 落盘）
- [ ] AC7 seed.ts 实现：1家庭+FamilyRule+ExclusionRule(HARD/SOFT各≥1) + 10道Dish(覆盖MAIN/SIDE/SOUP/STAPLE，status含PUBLISHED) + 配套Ingredient(覆盖CATEGORIES 6类) + DishIngredient关联 + 4套Menu(覆盖WEEKDAY_FAST/WEEKEND/CLEARANCE/BUDGET) + MenuDish关联；可重复执行(upsert)
- [ ] AC8 seed 数据通过 shared zod schema v0.1 校验（import @family-menu/shared 校验 seed 对象合法性）
- [ ] AC9 seed 命令配置（Prisma 7 seed 配置方式需核对官方文档：prisma.config.ts seed 字段 或 package.json prisma.seed），pnpm db:seed 可调用
- [ ] AC10 pnpm verify 跑通（lint 零 error，build 成功，test 通过，exit 0）
- [ ] AC11 pnpm -r build 成功（不破坏 shared/engine/list-merger/h5 现有构建）
- [ ] AC12 [环境限制] 真实 PG migration+seed 验证 -> CI 补验（本机无 Docker/PostgreSQL）

### ③ 输入资源
- docs/plan/实施方案.md @b82fdcc：
  - 第三章 3.2 Prisma Schema（第 92-256 行）：12 model + 8 enum 完整定义（含字段/关系/枚举值）
  - 第五章仓库结构（第 365 行）：apps/api/prisma/{schema.prisma,seed.ts,migrations/}
  - 7.1 WP-02（第 565 行）：schema.prisma+migration+seed（10菜/4套）
  - 8.1 STEP-03（第 608 行）：真实PG验证、可重复seed
- DECISIONS.md @b82fdcc（DEC-001 Prisma 7 破坏性变更：generator prisma-client / datasource URL 迁 prisma.config.ts / driver adapter / dotenv 显式加载）
- STEP-02 契约 v0.1 @v0.1 tag（packages/shared zod schema，seed 数据校验依据）
- AGENTS.md @b82fdcc（铁律、Ownership: apps/api/prisma 归属 WP-02）
- 现有基线 @b82fdcc：
  - apps/api/prisma/schema.prisma（占位：仅 generator+datasource，无 model）
  - apps/api/prisma.config.ts（defineConfig + datasource.url + dotenv）
  - apps/api/src/db.ts（PrismaClient 单例 + PrismaPg adapter）
  - apps/api/package.json（prisma ^7.7.0 / @prisma/client / @prisma/adapter-pg / pg）
  - 根 package.json（db:migrate = prisma migrate dev, db:seed = prisma db seed）
  - docker-compose.yml（PG18, profiles ["local"]）
  - .env.example（DATABASE_URL=postgresql://app:app_password@localhost:5432/family_menu）

### ④ 边界约束（不允许做什么）
- 只改 apps/api/prisma（schema.prisma/seed.ts/migrations/）+ apps/api/prisma.config.ts（如需 seed 配置）+ apps/api/package.json（如需 prisma.seed）+ apps/api/src/db.ts（如需调整）；不改其他包
- 不改 packages/shared（契约 v0.1 已冻结，变更须走契约变更流程）
- 不写业务逻辑（engine 算法/api 路由/h5 页面/list-merger）
- schema.prisma 字段/枚举与 3.2 一致，与 shared v0.1 一致（不擅自增减字段或改枚举值）
- 不改 docker-compose.yml（STEP-01 已建）
- 不改 docs/plan/实施方案.md（只读）；不修改四件套（队长维护 STATUS.md/开发日志.md 除外）
- 运行时代码禁止调用任何 LLM API（DEC-006）
- 不引入 DEC-008 禁止项（Redis/消息队列/微服务/K8s）
- Prisma 7 适配方案属 HOW，fm-dev 按官方文档实现；与 DEC-001 记录冲突时报队长

### ⑤ 异常升级路径
- Prisma 7 migrate/seed 配置与官方文档冲突 -> 报队长转 fm-arch
- schema 字段与 3.2 或 v0.1 契约冲突 -> 以 3.2/v0.1 为准，完成报告注明
- 本机无 DB 无法执行 migrate dev/seed -> 报队长，CI 补验（不伪造结果）
- Prisma 7 generator/datasource 配置报错 -> 以 DEC-001 + prisma.config.ts 现有配置为准
- 第3次被打回 -> 停止修改，等队长诊断

## 最小测试（fm-tester 照跑，真实执行，禁止Mock冒充）
- `pnpm install --frozen-lockfile`（exit 0）
- `pnpm verify`（lint+build+test，exit 0，lint 零 error）
- `prisma generate`（exit 0，PrismaClient 生成成功）
- seed 数据 zod 校验：seed 对象通过 shared v0.1 schema parse（合法通过）
- `pnpm -r build`（不破坏其他包构建）
- [环境限制] `prisma migrate dev` + `pnpm db:seed` 需 PG，本机无 Docker -> CI 补验

## 审查重点
- schema.prisma 字段/关系/枚举与 3.2 逐项一致（12 model + 8 enum）
- 与 shared v0.1 契约一致（枚举值/字段名/Json 字段）
- Prisma 7 适配正确（generator prisma-client / datasource 无 url / driver adapter）
- migration SQL 落盘且可重复（migrations/ 目录）
- seed 数据合理（10菜/4套+家庭+规则+禁忌，覆盖枚举值，可重复 upsert）
- seed 数据通过 zod 校验（不伪造）
- 仅改 apps/api/prisma + 相关配置，不改 packages/shared
- 无 LLM 调用、无 DEC-008 禁止项

## 交付门禁
开发（fm-dev）-> 独立测试（fm-tester，真实环境）-> 交叉审查（fm-reviewer，只读）-> 主复验 -> 状态改"待用户审核"并暂停；
用户批准前不合并、不启动下一 STEP（DEC-005）。

## 完成报告（fm-dev 填写）
- AC自检: [ ]AC1...（逐条[✓]/[✗]）
- 交付物: <路径@commit>
- 测试结果: <用例通过数/exit code>
- 新增依赖及理由: <列出>
- 遗留与下一步建议:

## 审查报告（fm-reviewer 填写，任何✗=打回，回环+1）
- [ ] 契约一致性（schema 字段与 3.2 一致；枚举与 v0.1 一致；关系完整）
- [ ] 越界检查（仅改 apps/api/prisma；无业务逻辑；不改 shared/四件套/实施方案/其他包）
- [ ] 安全缺陷（无 LLM 调用；无 DEC-008 禁止项；seed 数据可重复不产生脏数据）
- [ ] 逻辑正确性（prisma generate 成功；migration SQL 合理；seed upsert 逻辑正确；zod 校验通过）
- [ ] 可维护性（命名规范；Prisma 7 配置一致；seed 可读可扩展）

## 总任务拆解
| STEP | 对应WP | 内容 | 状态 |
|---|---|---|---|
| STEP-00 | - | 协作框架四件套 | 已合并 |
| STEP-01 | WP-00 | 工程基线（monorepo骨架+本地PG18 Docker+CI） | 已合并 |
| STEP-02 | WP-01 | 契约冻结（shared zod schema，v0.1） | 已合并 |
| STEP-03 | WP-02 | 数据层（schema.prisma+migration+seed） | 进行中 |
| STEP-04 | WP-03/06 | 推荐引擎+清单合并器 | 未开始 |
| STEP-05 | WP-04 | API（Fastify路由+口令鉴权+契约测试） | 未开始 |
| STEP-06 | WP-05 | H5前端（5页面走通） | 未开始 |
| STEP-07 | WP-07 | 内容管线CLI | 未开始 |
| STEP-08 | WP-09/10 | 部署+集成验收 | 未开始 |
