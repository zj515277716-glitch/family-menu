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
echo "[1/6] git pull..."
git pull --ff-only

# 2. 构建前内存预检（2026-09-14 OOM 治理：本机 1.8G RAM，三次 dockerd 构建期被 OOM 杀）
#    这是构建资源限制三层方案的第③层（另两层：Dockerfile ARG NODE_OPTIONS + dockerd GOMEMLIMIT），
#    兜底系统侧可用内存，防止带着濒死内存开工。
#    build 报 exit 137 = 构建容器触发 OOM：重试即可，勿移除限制、勿升配置参数。
echo "[2/6] 构建前内存预检..."
avail_mb=$(free -m | awk '/^Mem:/{print $7}' || echo 0)
if [ "${avail_mb:-0}" -lt 400 ]; then
  echo "ERROR: 可用内存仅 ${avail_mb}M（<400M），构建必然触发 OOM。先清理后重试："
  echo "  docker system prune -f ; sync && sync && echo 3 > /proc/sys/vm/drop_caches"
  exit 1
elif [ "${avail_mb:-0}" -lt 600 ]; then
  echo "WARN: 可用内存 ${avail_mb}M（<600M），构建可能吃紧，若中途离线请检查 dmesg | tail OOM 记录"
  sleep 3
else
  echo "  可用内存 ${avail_mb}M，充足"
fi

# 3. 构建并启动（prod profile：api + caddy，不含 db，连 RDS）
#    构建资源限制（2026-09-14 OOM 治理）三层：
#    ① NODE_OPTIONS 堆限制经 docker-compose.yml build.args 注入 Dockerfile ARG（node 进程 ≤768M 堆）
#    ② dockerd 侧 GOMEMLIMIT 软限（systemd drop-in，服务器已配置）
#    ③ 本脚本 [2/6] 步构建前内存预检（<400M 硬失败）
echo "[3/6] docker compose --profile prod up -d --build..."
docker compose --profile prod up -d --build

# 4. 等待 API 健康检查通过（docker healthcheck）
echo "[4/6] 等待 API 健康..."
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

# 5. 数据库迁移（在 api 容器中运行 prisma migrate deploy）
echo "[5/6] 数据库迁移..."
docker compose --profile prod exec -T api sh -c "cd apps/api && ./node_modules/.bin/prisma migrate deploy"

# 6. 验证服务状态
echo "[6/6] 服务状态："
docker compose --profile prod ps

echo ""
echo "=== 部署完成 ==="
echo "API 健康检查: http://localhost:3000/health"
echo "Web 入口:     http://localhost:80 (通过 Caddy 反向代理)"
echo "回滚方案:     见 docs/deploy.md"
