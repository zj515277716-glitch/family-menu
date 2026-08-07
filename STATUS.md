# 家庭菜谱App 开发状态
> 本文件由主Agent维护。任何时刻只允许一个活动任务卡（DEC-003）。

## 当前状态
- 当前阶段：STEP-08 部署+集成验收（WP-09/10）（开发中）
- main HEAD：5be260c；回滚tag：rollback-before-step-08 -> 5be260c；契约冻结tag：v0.2
- 阻塞/外部依赖：本机无 Docker/PostgreSQL/ECS（DB集成测试+e2e冒烟需CI/用户补验）
- 下一个人工决策点：STEP-08 交付审核（最终里程碑 M4）

## 当前任务卡：STEP-08 部署+集成验收（对应 WP-09/10）
状态: 开发中    回环计数: 0/3
执行者: fm-dev    审查者: fm-reviewer（只读）
需求来源: 实施方案第612行STEP-08 + 第572行WP-09 + 第573行WP-10 + 第317-321行禁忌测试集 + 第634-641行测试门槛 + 第643-647行环境策略 + 第638行前端手动5步冒烟 + 第646行部署方式 + 第84行Caddy + 第677行Caddyfile + 第517行生产部署按钮    基线提交: main@5be260c    回滚点: rollback-before-step-08

### ① 目标
完成部署配置（docker-compose prod profile + Caddy + 部署脚本）+ 集成验收（禁忌测试集全量 + e2e冒烟清单 + README + CI补验DB集成）。达成 M4 里程碑：全家开始用。本机无 Docker/PG/ECS，DB集成测试+e2e冒烟+真实部署需CI/用户补验。

### ② 验收标准 AC
- [ ] AC1 docker-compose.yml 补充 prod profile（api + caddy，不含 db），对齐第646行+第84行
- [ ] AC2 Caddyfile 配置反向代理（IP:3000过渡期 + 域名HTTPS备案后启用），对齐第84行+第677行
- [ ] AC3 部署脚本（deploy.sh：git pull && docker compose --profile prod up -d --build），对齐第646行
- [ ] AC4 e2e冒烟清单（F1->F7五步流程手测清单，写入README），对齐第638行
- [ ] AC5 禁忌测试集全量验证（pnpm test:taboo exit 0，阻断率100%），对齐第317-321行+第636行
- [ ] AC6 API契约测试全通过（pnpm verify含contract.spec.ts），对齐第637行
- [ ] AC7 pnpm verify exit 0（lint零error，build成功，test通过）
- [ ] AC8 pnpm -r build成功
- [ ] AC9 README.md（项目说明+快速开始+五步冒烟清单+部署指南+常见问题），对齐第573行WP-10
- [ ] AC10 CI补验DB集成测试（.github/workflows/ci.yml 加 PostgreSQL service + migration + seed + contract test），对齐第636行+第641行
- [ ] AC11 回滚方案文档（docker compose切上一镜像tag，演练一次），对齐第452行
- [ ] AC12 环境策略文档（local/prod分离，.env不进git，RDS白名单），对齐第643-647行

### ③ 输入资源
- docs/plan/实施方案.md @5be260c：
  - 第612行：STEP-08 部署+集成验收（WP-09/10）ECS上线（IP过渡）、e2e冒烟、README、全家开始用，M4里程碑
  - 第572行：WP-09 部署 docker-compose+部署脚本+ECS上线
  - 第573行：WP-10 集成验收 禁忌测试集全量+e2e冒烟+README
  - 第317-321行：禁忌测试集（阻断率100%是发布门槛，CI每次跑）
  - 第634-641行：测试与质量门槛（引擎覆盖率≥90%+禁忌100%；API契约全绿；前端手动5步冒烟；性能<500ms；内容<1%；数据备份）
  - 第643-647行：环境策略（local Docker PG18 / prod ECS+RDS / .env不进git / 部署=git pull && docker compose up -d --build）
  - 第84行：Caddy(443, 备案后) / 直连IP:3000(过渡期)
  - 第677行：Caddyfile已备好，备案通过改DNS+起caddy即可
  - 第517行：生产部署按钮=人工（你敲部署命令）
  - 第452行：回滚方案=docker compose切上一镜像tag（演练一次）
  - 第638行：前端手动5步冒烟清单（F1->F7每步可达，写入README）
- 现有基线 @5be260c：
  - docker-compose.yml（STEP-01：db profile=local + api）
  - Caddyfile（STEP-01：基础配置）
  - .github/workflows/ci.yml（STEP-01：lint+build+test，无DB service）
  - .env.example（STEP-01：DATABASE_URL/ARK_API_KEY/AUTH_TOKEN等）
  - README.md（STEP-01：基础骨架）
  - pnpm verify / pnpm test:taboo / pnpm -r build（已验证通过）

### ④ 边界约束（不允许做什么）
- 可修改：docker-compose.yml / Caddyfile / .github/workflows/ci.yml / README.md / deploy.sh（新建）/ docs/（如需）
- 禁改 packages/shared（v0.2 冻结）
- 禁改 packages/engine / packages/list-merger（代码已稳定，仅跑测试验证）
- 禁改 apps/api/src / apps/h5/src（代码已稳定，仅跑测试验证）
- 禁改 prisma/schema.prisma
- 禁改 四件套 / 实施方案
- 不引入 DEC-008 禁止项
- 新增依赖在完成报告列出（预计无新增依赖，仅配置+文档）
- git 提交信息 [WP-09/10] 动词开头
- 本机无 Docker/PG/ECS：DB集成测试+e2e冒烟+真实部署需CI/用户补验，代码交付为配置+文档+脚本

### ⑤ 异常升级路径
- CI DB service 配置问题 -> 报队长
- Caddy 配置问题 -> 报队长
- 第3次被打回 -> 停止修改

## 最小测试（fm-tester 照跑，真实执行，禁止Mock冒充）
- `pnpm install --frozen-lockfile`（exit 0）
- `pnpm verify`（lint+build+test，exit 0，lint零error）
- `pnpm test:taboo`（禁忌集100%阻断，exit 0）
- `pnpm -r build`（不破坏其他包构建）
- CI yml 语法验证（如有 yamllint 或 node -e YAML.parse）

## 审查重点
- docker-compose prod profile（api+caddy，不含db）
- Caddyfile 反向代理（IP:3000过渡 + 域名HTTPS备案后）
- deploy.sh 部署脚本（git pull && docker compose --profile prod up -d --build）
- README 五步冒烟清单（F1->F7）
- CI 补验 DB 集成测试（PostgreSQL service + migration + seed + contract test）
- 回滚方案文档
- 环境策略文档（local/prod分离）
- 禁忌集100%阻断保持

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
- [ ] 契约一致性（不改契约；测试门槛对齐第634-641行）
- [ ] 越界检查（不改shared/engine/list-merger/api/h5/prisma）
- [ ] 安全缺陷（.env不进git；RDS白名单；DEC-006/008合规）
- [ ] 逻辑正确性（docker-compose prod profile正确；CI DB service配置正确；deploy.sh可执行）
- [ ] 可维护性（README清晰；脚本可维护；CC<=15）

## 总任务拆解
| STEP | 对应WP | 内容 | 状态 |
|---|---|---|---|
| STEP-00 | - | 协作框架四件套 | 已合并 |
| STEP-01 | WP-00 | 工程基线 | 已合并 |
| STEP-02 | WP-01 | 契约冻结 v0.1 | 已合并 |
| STEP-03 | WP-02 | 数据层 | 已合并 |
| STEP-04 | WP-03/06 | 推荐引擎+清单合并器 | 已合并 |
| UI设计 | - | 前置UI设计 | 已完成 |
| STEP-05 | WP-04 | API（Fastify路由+口令鉴权+契约测试） | 已合并 |
| STEP-06 | WP-05 | H5前端（5页面走通+契约v0.2遗留修复） | 已合并 |
| STEP-07 | WP-07 | 内容管线CLI（coverage/draft/import三段） | 已合并 |
| STEP-08 | WP-09/10 | 部署+集成验收 | 进行中 |
