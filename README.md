# 家庭菜谱 App

> 2 分钟定今晚吃什么，产出采购清单 + 备菜顺序。

个人自用版家庭晚餐规划工具。输入人数、时间预算和必用食材，引擎从库内菜单中推荐三套候选，锁定后生成分组采购清单和备菜时间轴。做完后记录反馈（成功/部分/失败 + 复做意愿），积累家庭口味数据。

## 技术栈

| 层 | 技术 |
|---|---|
| 契约 | packages/shared（Zod schema + 类型 + 常量，v0.2 冻结） |
| 推荐引擎 | packages/engine（纯函数零 IO，安全过滤 > 一切评分） |
| 清单合并器 | packages/list-merger（纯函数，同食材合并 + 单位换算） |
| API | apps/api（Fastify 5 + Prisma 7 + PostgreSQL 18，口令鉴权） |
| H5 前端 | apps/h5（Taro 4 + React 18 + NutUI，编译目标 h5） |
| 内容管线 | tools/content-pipeline（豆包起草 CLI，产物只落 DRAFT） |
| 部署 | Docker Compose + Caddy（prod: ECS + RDS） |
| CI | GitHub Actions（lint + build + test + DB 集成） |

## 快速开始（本地开发）

### 前置条件

- Node.js >= 22.0.0
- pnpm >= 11.0.0
- Docker + Docker Compose（本地 PG18）

### 步骤

```bash
# 1. 安装依赖
pnpm install

# 2. 启动本地 PostgreSQL
docker compose --profile local up -d

# 3. 配置环境变量
cp .env.example .env
# .env 中 DATABASE_URL 默认指向本地 Docker PG，无需修改

# 4. 运行数据库迁移 + 种子数据
pnpm db:migrate
pnpm db:seed

# 5. 启动 API
pnpm dev:api
# API 运行在 http://localhost:3000

# 6. 启动 H5 前端（另开终端）
pnpm dev:h5
# H5 运行在 http://localhost:10086（Taro 默认端口）
```

### 验证

```bash
# API 健康检查
curl http://localhost:3000/health
# 预期: {"status":"ok","timestamp":"..."}

# DB 连接检查
curl http://localhost:3000/health/db
# 预期: {"status":"ok","db":"connected"}
```

## 项目结构

```
family-menu/
├── packages/
│   ├── shared/          # 契约（Zod schema + 类型 + 常量）v0.2 冻结
│   ├── engine/          # 推荐引擎（三层管道 + diversify）
│   └── list-merger/     # 采购清单合并器
├── apps/
│   ├── api/             # Fastify API + Prisma
│   │   ├── prisma/      # schema.prisma + migrations + seed
│   │   ├── src/         # 路由 + services
│   │   └── test/        # 契约测试 + 种子校验
│   ├── h5/              # Taro H5 前端（5 页面）
│   └── admin/           # 管理后台（P1，可推迟）
├── tools/
│   └── content-pipeline/  # 豆包起草 CLI（coverage/draft/import）
├── docker-compose.yml   # local（db）+ prod（api + caddy）profile
├── Caddyfile            # 反向代理（:80 过渡 / 443 备案后）
├── deploy.sh            # 生产部署脚本
└── docs/
    ├── plan/            # 实施方案
    ├── design/          # UI 设计
    └── deploy.md        # 部署运维文档（回滚 + 环境策略）
```

## 常用命令

```bash
pnpm install              # 安装依赖
pnpm dev:api              # 启动 API（开发模式）
pnpm dev:h5               # 启动 H5 前端（开发模式）
pnpm verify               # lint + build + test（CI 同流程）
pnpm test                 # 全部测试
pnpm test:taboo           # 禁忌测试集（阻断率 100%，发布门槛）
pnpm -r build             # 递归构建所有包
pnpm db:migrate           # 数据库迁移
pnpm db:seed              # 种子数据
docker compose --profile local up -d   # 启动本地 PG
```

## 五步冒烟清单（F1-F7）

> 对齐实施方案第638行：前端手动 5 步冒烟清单，F1->F7 每步可达。
> 每次部署后按此清单手测，确认核心流程畅通。

### F1：设置页 - 设置家庭规则

1. 打开 H5，进入设置页
2. 设置人数（如 3 人）、时间预算（如 30 分钟）、器具（如 炒锅+电饭煲）、菜系偏好（如 中式）
3. 设置禁忌规则（如 不吃香菜 - HARD、少辣 - SOFT）
4. 点击保存
5. 预期：保存成功，刷新后规则仍在

### F2：今晚页 - 生成推荐

1. 进入今晚页
2. 选人数（如 3 人）、时间预算（如 30 分钟）、必用食材（如 番茄）
3. 点击生成推荐
4. 预期：跳转候选页，显示三套候选菜单（不足三套时如实返回并说明）

### F3：候选页 - 锁定 / 换菜

1. 在候选页查看三套候选
2. 点击锁定一套
3. 或点击换菜替换某道菜
4. 预期：锁定后跳转清单页

### F4：清单页 - 采购清单

1. 在清单页查看采购清单
2. 清单按分类分组显示（蔬菜/肉类/水产/蛋奶/调料/主食）
3. 勾选已买的食材
4. 预期：勾选状态持久化，刷新后仍在

### F5：备菜页 - 备菜时间轴

1. 进入备菜页
2. 查看备菜顺序时间轴（标注可并行的步骤）
3. 预期：时间轴按步骤顺序显示，标注并行步骤

### F6：历史页 - 烹饪反馈

1. 进入历史页
2. 找到本次计划，点击做了
3. 选择烹饪结果（成功 / 部分 / 失败）
4. 填写失败原因（可选）和复做意愿
5. 预期：反馈保存成功，写入 CookLog

### F7：历史页 - 查看历史 + 复做

1. 在历史页查看历史记录列表
2. 点击某条历史记录查看详情
3. 点击复做
4. 预期：复做生成新计划，跳转今晚页

## 部署指南（生产环境）

### 首次部署

详见 [docs/deploy.md](docs/deploy.md)。

```bash
# 在 ECS 上
git clone <repo-url> /opt/family-menu
cd /opt/family-menu
cp .env.example .env
vi .env  # 填入 RDS 内网地址 + ACCESS_TOKEN
bash deploy.sh
```

### 日常更新

```bash
cd /opt/family-menu
bash deploy.sh
# 自动执行：git pull -> docker compose --profile prod up -d --build -> 健康检查 -> 数据库迁移
```

### 回滚

详见 [docs/deploy.md](docs/deploy.md#三回滚方案ac11)。

```bash
git checkout <上一稳定commit>
docker compose --profile prod up -d --build
```

### 切换 HTTPS（备案后）

详见 [Caddyfile](Caddyfile) 注释。

1. 注释 `:80` 块，取消域名块注释
2. `docker compose --profile prod restart caddy`

## 测试与质量门槛

| 层 | 手段 | 门槛 |
|---|---|---|
| 引擎/合并器 | Vitest 单测 | 覆盖率 >= 90%；禁忌集阻断 100%（一票否决） |
| API | fastify inject 契约测试 | 全路由：合法 200 / 非法 400，响应过 Zod 校验 |
| 前端 | 手动五步冒烟清单 | F1->F7 每步可达 |
| 性能 | 引擎基准测试 | 推荐响应 < 500ms（无 LLM，实际 < 50ms） |
| 数据 | RDS 自动备份 + seed 可重放 | 每日备份保留 7 天 |

```bash
# 验证命令
pnpm verify        # lint + build + test（exit 0）
pnpm test:taboo    # 禁忌集 100% 阻断（exit 0）
pnpm -r build      # 所有包构建成功（exit 0）
```

## 环境策略

| 环境 | 数据库 | 用途 |
|---|---|---|
| local | Docker PG 18 | 开发/测试，杜绝误操作线上 |
| prod | ECS + RDS（内网） | 全家日常使用 |

- .env 不进 git（.gitignore 已排除）
- RDS 白名单只放 ECS 内网 IP，不开公网访问
- 部署 = `git pull && docker compose --profile prod up -d --build`

详见 [docs/deploy.md](docs/deploy.md#一环境策略ac12)。

## 常见问题

### Q: H5 前端如何部署到生产？

H5 前端构建产物为静态文件（`pnpm --filter @family-menu/h5 build:h5`，输出 `apps/h5/dist/`）。生产环境可通过以下方式托管：
1. 将构建产物上传到 OSS + CDN
2. 或在 Caddy 中配置静态文件托管（扩展 Caddyfile）

当前 docker-compose prod profile 仅含 api + caddy 反向代理，H5 静态托管为待补项（个人自用版可先用 OSS）。

### Q: 如何添加新菜品？

1. 用内容管线 CLI 起草：`pnpm --filter @family-menu/content-pipeline draft --slot=weekday_fast,chicken,30min`
2. 人工审核起草结果
3. 导入 DB（DRAFT 状态）：`pnpm exec tsx tools/content-pipeline/src/cli/import.ts <file>`
4. 试做后通过 CookLog 记录反馈，手动升级为 TESTED/PUBLISHED

### Q: 忘了 ACCESS_TOKEN 怎么办？

在 ECS 的 .env 文件中查看或修改 `ACCESS_TOKEN`，然后 `docker compose --profile prod restart api`。

### Q: 数据库迁移失败怎么办？

1. 检查 RDS 连接：`docker compose --profile prod exec api curl http://localhost:3000/health/db`
2. 查看 API 日志：`docker compose --profile prod logs api`
3. 如需回滚，参见 [docs/deploy.md](docs/deploy.md#三回滚方案ac11)

### Q: 禁忌集测试失败怎么办？

禁忌集 100% 阻断是发布门槛（一票否决）。如果 `pnpm test:taboo` 失败：
1. 检查是否修改了 packages/engine 的安全过滤逻辑
2. 检查是否新增了含禁忌成分的菜单但未更新 fixtures
3. 修复后重跑 `pnpm test:taboo`，必须 exit 0 才能部署
