#!/usr/bin/env bash
# deploy.sh - family-menu 生产部署脚本
# 对齐实施方案第646行：部署 = git pull && docker compose up -d --build
# 对齐实施方案第517行：生产部署按钮 = 人工（你敲部署命令）
#
# 用法：在 ECS 上执行 bash deploy.sh
# 前提：已安装 git + docker + docker compose，已克隆仓库，已配置 .env
#       .env 含 DATABASE_URL(RDS内网地址) / ACCESS_TOKEN

set -euo pipefail

echo "=== family-menu 生产部署开始 ==="

# 1. 拉取最新代码
echo "[1/5] git pull..."
git pull --ff-only

# 2. 构建并启动（prod profile：api + caddy，不含 db，连 RDS）
echo "[2/5] docker compose --profile prod up -d --build..."
docker compose --profile prod up -d --build

# 3. 等待 API 健康检查通过（docker healthcheck）
echo "[3/5] 等待 API 健康..."
MAX_RETRIES=30
for i in $(seq 1 $MAX_RETRIES); do
  status=$(docker compose --profile prod inspect --format='{{.State.Health.Status}}' api 2>/dev/null || echo "unknown")
  if [ "$status" = "healthy" ]; then
    echo "  API 健康（第 ${i} 次尝试）"
    break
  fi
  if [ "$i" -eq "$MAX_RETRIES" ]; then
    echo "ERROR: API 健康检查失败（${MAX_RETRIES} 次后仍不健康）"
    docker compose --profile prod logs --tail=50 api
    exit 1
  fi
  sleep 2
done

# 4. 数据库迁移（在 api 容器中运行 prisma migrate deploy）
echo "[4/5] 数据库迁移..."
docker compose --profile prod exec -T api sh -c "cd apps/api && ./node_modules/.bin/prisma migrate deploy"

# 5. 验证服务状态
echo "[5/5] 服务状态："
docker compose --profile prod ps

echo ""
echo "=== 部署完成 ==="
echo "API 健康检查: http://localhost:3000/health"
echo "Web 入口:     http://localhost:80 (通过 Caddy 反向代理)"
echo "回滚方案:     见 docs/deploy.md"
