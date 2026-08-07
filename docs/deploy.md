# 部署运维文档

> 对齐实施方案第643-647行（环境策略）、第452行（回滚方案）、第646行（部署方式）。

## 一、环境策略（AC12）

### local（本地开发）

| 项 | 值 |
|---|---|
| 数据库 | Docker PostgreSQL 18（与 RDS 同大版本） |
| 启动命令 | `docker compose --profile local up -d` |
| DATABASE_URL | `postgresql://app:app_password@localhost:5432/family_menu` |
| 用途 | 开发/测试全在本地库，杜绝误操作线上 |

### prod（生产环境）

| 项 | 值 |
|---|---|
| 服务器 | 阿里云 ECS（内网连 RDS） |
| 数据库 | 阿里云 RDS PostgreSQL（内网地址） |
| 部署命令 | `bash deploy.sh`（= git pull && docker compose --profile prod up -d --build） |
| 反向代理 | Caddy（:80 过渡期 / 443 备案后自动 HTTPS） |
| 用途 | 全家日常使用 |

### 安全规则

1. **.env 不进 git**：.gitignore 已排除 `.env`、`.env.local`、`.env.*.local`。ECS 上手动创建 .env 文件，含 `DATABASE_URL`（RDS 内网地址）和 `ACCESS_TOKEN`。
2. **RDS 白名单**：RDS 白名单只放 ECS 内网 IP，不开公网访问（对齐实施方案 9.4）。
3. **口令鉴权**：API 通过 `ACCESS_TOKEN` 环境变量做口令鉴权（cookie），`/health` 端点豁免。
4. **运行时零 LLM**：DEC-006 合规，运行时代码不调用任何 LLM API；内容管线 CLI 仅本机运行。

### 环境变量清单（.env）

```bash
# apps/api
DATABASE_URL=postgresql://<user>:<password>@<rds内网地址>:5432/family_menu
ACCESS_TOKEN=<你的口令>
PORT=3000

# tools/content-pipeline（仅本机运行，不进服务器）
ARK_API_KEY=your-ark-api-key
ARK_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
ARK_MODEL=doubao-your-model-id
```

## 二、部署流程

### 首次部署（ECS 初始化）

```bash
# 1. 克隆仓库
git clone <repo-url> /opt/family-menu
cd /opt/family-menu

# 2. 创建 .env（填入 RDS 内网地址 + 口令）
cp .env.example .env
vi .env

# 3. 部署
bash deploy.sh
```

### 日常更新

```bash
cd /opt/family-menu
bash deploy.sh
# 脚本自动执行：git pull -> docker compose --profile prod up -d --build -> 健康检查 -> 数据库迁移
```

## 三、回滚方案（AC11）

> 对齐实施方案第452行：回滚方案 = docker compose 切上一镜像 tag（演练一次）。

### 回滚步骤

```bash
cd /opt/family-menu

# 1. 查看可用镜像（按构建时间排序）
docker images --format "{{.Repository}}:{{.Tag}}  {{.CreatedAt}}" | grep family-menu

# 2. 回滚到上一版本（用 git tag 或 commit hash）
# 方式A：回退代码 + 重新构建
git log --oneline -5          # 找到上一稳定 commit
git checkout <上一稳定commit>
docker compose --profile prod up -d --build

# 方式B：用已有镜像 tag（推荐，更快）
# docker tag family-menu-api:<旧tag> family-menu-api:rollback
# docker compose --profile prod up -d  # 用旧镜像启动
```

### 回滚验证

```bash
# 验证 API 健康
curl http://localhost:3000/health
# 预期: {"status":"ok","timestamp":"..."}

# 验证 DB 连接
curl http://localhost:3000/health/db
# 预期: {"status":"ok","db":"connected"}

# 验证服务状态
docker compose --profile prod ps
```

### 回滚演练

首次上线后应演练一次回滚流程，确认：
1. 回滚到上一版本后 API 可正常启动
2. 数据库迁移兼容（prisma migrate deploy 可向前兼容旧代码）
3. 健康检查通过
4. 前端五步流程可走通

### 注意事项

- **数据库迁移不可逆**：如果新版本包含破坏性迁移（如删列），回滚后旧代码可能不兼容。建议迁移只做加法（加列/加表），不做减法。
- **回滚后通知**：回滚后通知家庭成员，可能需要清除浏览器缓存。
- **数据备份**：RDS 已开启自动备份（每日备份保留7天，对齐实施方案第642行）。回滚前可手动创建快照。

## 四、Caddy 切换（IP -> 域名 HTTPS）

详见 [Caddyfile](../Caddyfile) 注释。备案通过后：

1. 注释 `:80` 块
2. 取消域名块注释，替换为实际域名
3. `docker compose --profile prod restart caddy`
4. Caddy 自动申请 Let's Encrypt 证书
