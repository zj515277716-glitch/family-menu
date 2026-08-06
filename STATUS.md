# 家庭菜谱App 开发状态
> 本文件由主Agent维护。任何时刻只允许一个活动任务卡（DEC-003）。

## 当前状态
- 当前阶段：STEP-01 已合并，等待用户启动 STEP-02
- main HEAD：9c20a33；回滚tag：rollback-before-step-01 -> 1983795
- 阻塞/外部依赖：无（AC8/AC12 DB 连通接受环境限制，CI 验证）
- 下一个人工决策点：用户指令启动 STEP-02 契约冻结（shared zod schema v0.1）

## 当前任务卡：STEP-01 工程基线（对应 WP-00）
状态: 待用户审核    回环计数: 0/3（fm-tester 独立测试通过 + fm-reviewer 五维度审查通过）
执行者: fm-dev    审查者: fm-reviewer（只读）
需求来源: 实施方案第五章（仓库结构）+ 第八章8.1（STEP-01/M1）+ 第九章9.4（环境策略）+ 附录C（.env.example）+ DEC-001（版本号）    基线提交: main@1983795    回滚点: rollback-before-step-01

### ① 目标
建立 monorepo 工程基线：pnpm workspace 骨架（packages/shared+engine+list-merger / apps/api+h5+admin / tools/content-pipeline）+ 本地 PG18 Docker + 统一 scripts（pnpm verify 跑通）+ CI 脚本，达 M1 门禁（各包可启动、DB 连通）。仅建骨架，不实现业务逻辑。

### ② 验收标准 AC
- [ ] AC1 pnpm-workspace.yaml + 根 package.json（统一 scripts: dev/test/test:taboo/db:migrate/db:seed/verify/lint/build）建立，`pnpm install` 成功（exit 0）
- [ ] AC2 tsconfig.base.json（strict:true）建立，各子包 tsconfig 继承
- [ ] AC3 packages/{shared,engine,list-merger} 各建包骨架（package.json + src/index.ts + tsconfig + vitest 配置），`pnpm -r build` 成功（exit 0）
- [ ] AC4 apps/api 骨架：Fastify 启动入口 server.ts（`pnpm dev:api` 可启动监听端口）；Prisma 依赖与 apps/api/prisma 目录就绪（schema.prisma 内容留 STEP-03，本步只建空文件或最小占位）；db.ts PrismaClient 单例骨架
- [ ] AC5 apps/h5 骨架：Taro 4 + React 配置（config/），`pnpm dev:h5` 可启动（空页面即可），编译目标 h5
- [ ] AC6 apps/admin 占位（P1，最小 Vite+React 骨架或仅 package.json + 空目录）
- [ ] AC7 tools/content-pipeline 骨架（package.json + src/ 目录结构）
- [ ] AC8 docker-compose.yml（local: db=PostgreSQL 18），`docker compose up -d db` 可启动，PG 连通验证（真实命令+退出码）
- [ ] AC9 .env.example（按附录C）建立；.gitignore（node_modules/.env/dist/coverage 等）建立且 .env 不入库；CLAUDE.md -> AGENTS.md 指针
- [ ] AC10 `pnpm verify`（lint + build + test）跑通，lint 零 error，exit 0
- [ ] AC11 CI 脚本（.github/workflows/ci.yml 或等价）建立
- [ ] AC12 M1：apps/api 启动后 Prisma 能连 PG18（DB 连通，真实验证）；apps/h5 启动可访问

### ③ 输入资源
- docs/plan/实施方案.md @1983795（第五章仓库结构、8.1 STEP-01/M1、9.4 环境策略、附录C .env.example）
- DECISIONS.md @1983795（DEC-001 版本号：Node22.23.2/pnpm11.20/Fastify5.10.0/Prisma7.7.0/Taro4.2.0/Vitest4.1.10）
- AGENTS.md @1983795（铁律、Ownership、常用命令）
- STATUS.md @1983795（本任务卡）

### ④ 边界约束（不允许做什么）
- 不实现业务逻辑：shared 不写 zod schema（STEP-02）；engine 不写算法（STEP-04）；list-merger 不写合并（STEP-04）；api routes 不写业务（STEP-05）；h5 不写页面（STEP-06）；content-pipeline 不写 CLI 逻辑（STEP-07）
- 不写 schema.prisma 内容（STEP-03）；本步只建 prisma 目录 + 依赖 + PrismaClient 单例骨架（连空库即可）
- 不修改 docs/plan/实施方案.md（只读）；不修改四件套（队长维护 STATUS.md/开发日志.md 除外）
- 不引入 DEC-008 禁止项（Redis/消息队列/微服务/K8s）
- NutUI：本步不装 NutUI（STEP-06 装）；h5 骨架用 Taro 默认
- Prisma 7：按 Prisma 7 官方方式配置（prisma.config.ts / driver adapter / generator prisma-client）；schema 内容留 STEP-03
- 运行时代码禁止调用任何 LLM API（DEC-006）

### ⑤ 异常升级路径
- Prisma 7 配置与实施方档 3.2 旧版 schema 示例冲突 -> 以 Prisma 7 实际为准，schema 内容留 STEP-03；配置 HOW 按 Prisma 7 官方文档，完成报告注明假设
- Taro 4 / Node 22 兼容问题 -> 报队长转 fm-arch
- Docker PG18 启动/连通失败 -> 真实排查，命令+退出码取证；持续失败报队长
- 依赖版本冲突 -> 报队长，不擅自降级/升级 DEC-001 锁定版本
- 第3次被打回 -> 停止修改，等队长诊断（修AC/拆细/换工具）

## 最小测试（fm-tester 照跑，真实执行，禁止Mock冒充）
- `pnpm install --frozen-lockfile`（exit 0）
- `pnpm verify`（lint+build+test，exit 0，lint 零 error）
- `docker compose up -d db` + PG 连通验证（psql 或等价，exit 0）
- `pnpm dev:api` 启动 + DB 连通（Prisma 连 PG18）
- `pnpm dev:h5` 启动可访问

## 审查重点
- monorepo 结构与实施方档第五章一致（目录/包命名）
- 各包仅骨架无业务逻辑（越界检查：shared 无 zod schema、engine 无算法、api 无 route 业务）
- Prisma 7 配置正确（driver adapter / generator prisma-client，非旧版 prisma-client-js）
- .env 不入库（.gitignore 有效）；.env.example 无真实密钥
- pnpm verify 真实通过（命令+退出码，非 Mock）
- 依赖版本符合 DEC-001

## 交付门禁
开发（fm-dev）-> 独立测试（fm-tester，真实环境）-> 交叉审查（fm-reviewer，只读）-> 主复验 -> 状态改"待用户审核"并暂停；
用户批准前不合并、不启动下一 STEP（DEC-005）。

## 完成报告（fm-dev 填写）
- AC自检:
  - [✓] AC1 pnpm-workspace.yaml + 根 package.json（统一 scripts）建立，pnpm install 成功（exit 0）
  - [✓] AC2 tsconfig.base.json（strict:true）建立，各子包 tsconfig 继承
  - [✓] AC3 packages/{shared,engine,list-merger} 骨架建立，pnpm -r build 成功（exit 0）
  - [✓] AC4 apps/api 骨架：Fastify server.ts 启动监听 3000；prisma 目录+依赖就绪；db.ts PrismaClient 单例（Prisma 7 driver adapter）
  - [✓] AC5 apps/h5 骨架：Taro 4+React 配置，pnpm dev:h5 可启动，编译目标 h5，HTTP 200 可访问
  - [✓] AC6 apps/admin 占位（package.json + 空目录）
  - [✓] AC7 tools/content-pipeline 骨架（package.json + src/ 目录结构）
  - [✗] AC8 docker-compose.yml 建立（PG18 配置正确），但本机无 Docker 无法验证 docker compose up -d db（环境限制，非代码缺陷）
  - [✓] AC9 .env.example 建立；.gitignore 建立且 .env 不入库（git check-ignore 确认）；CLAUDE.md -> AGENTS.md 指针
  - [✓] AC10 pnpm verify（lint+build+test）跑通，lint 零 error，exit 0
  - [✓] AC11 CI 脚本 .github/workflows/ci.yml 建立（PG18 service + pnpm 11.20 + node 22.23.2 + lint+build+test）
  - [△] AC12 部分：apps/api 启动成功，PrismaClient 正确实例化，/health/db 端点正确处理连接失败；DB 连通无法本机验证（无 Docker/PostgreSQL）。apps/h5 启动可访问（HTTP 200）
- 交付物: 全部 monorepo 骨架文件（52 files changed, 15665 insertions）commit hash 见 git log
- 测试结果: pnpm verify exit 0（lint 零 error；apps/api build: prisma generate + tsc 成功；apps/h5 build: webpack 编译成功；test 2/2 通过 duration 235ms）；dev:api HTTP 200 /health；dev:h5 HTTP 200 可访问
- 新增依赖及理由:
  - @types/node ^22.0.0（apps/api devDep）: tsconfig.json 指定 types:["node"]，需此类型定义
  - dotenv ^16.4.0（apps/api dep）: Prisma 7 不自动加载 .env，需 dotenv 显式加载 DATABASE_URL
  - @pmmmwh/react-refresh-webpack-plugin ^0.5.15（apps/h5 devDep）: Taro 4 plugin-framework-react 在 --watch 模式下 require 此插件，缺失则 dev:h5 崩溃
- 遗留与下一步建议:
  1. AC8 [✗] Docker PG18 验证: 本机无 Docker，需在 CI 或有 Docker 的环境中验证。docker-compose.yml 和 CI 脚本配置正确（PG18 + 健康检查）
  2. AC12 DB 连通 [△]: Prisma 7 配置正确（prisma generate 成功，PrismaClient 正确实例化），需在 DB 可用环境中完成连通验证
  3. Node.js v24.19.0 vs DEC-001 要求 22.23.2: 向后兼容不阻塞，建议 CI 严格使用 22.23.2（CI 脚本已配置）
  4. PowerShell 执行策略 Restricted: 复合命令被阻止，CI 在 Ubuntu 上运行无此问题

## 审查报告（fm-reviewer 填写，任何✗=打回，回环+1）
- [ ] 契约一致性（结构符合第五章；依赖版本符合 DEC-001）
- [ ] 越界检查（仅骨架，无业务逻辑；不改四件套/实施方案）
- [ ] 安全缺陷（.env 不入库；无敏感信息；无 LLM 运行时调用）
- [ ] 逻辑正确性（pnpm verify 真实通过；DB 连通真实验证；M1 达成）
- [ ] 可维护性（命名/strict/CI 可重复）

## 总任务拆解
| STEP | 对应WP | 内容 | 状态 |
|---|---|---|---|
| STEP-00 | - | 协作框架四件套 | 已合并 |
| STEP-01 | WP-00 | 工程基线（monorepo骨架+本地PG18 Docker+CI） | 已合并 |
| STEP-02 | WP-01 | 契约冻结（shared zod schema，v0.1） | 未开始 |
| STEP-03 | WP-02 | 数据层（schema.prisma+migration+seed） | 未开始 |
| STEP-04 | WP-03/06 | 推荐引擎+清单合并器 | 未开始 |
| STEP-05 | WP-04 | API（Fastify路由+口令鉴权+契约测试） | 未开始 |
| STEP-06 | WP-05 | H5前端（5页面走通） | 未开始 |
| STEP-07 | WP-07 | 内容管线CLI | 未开始 |
| STEP-08 | WP-09/10 | 部署+集成验收 | 未开始 |
