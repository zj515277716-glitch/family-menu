#!/usr/bin/env bash
# UIFIX4 生产部署步骤 [2/6]~[6/6]（跳过 [1/6] git pull：服务器目录非 git 仓库，源码已 tar 同步）
set -euo pipefail
cd /opt/family-menu

echo "[2/6] 构建前内存预检..."
avail_mb=$(free -m | awk '/^Mem:/{print $7}' || echo 0)
echo "AVAIL_MB=${avail_mb:-0}"
if [ "${avail_mb:-0}" -lt 400 ]; then
  echo "ERROR_LOW_MEM（<400M 构建 OOM 风险，先清理再试）"
  exit 1
fi

echo "[3/6] docker compose --profile prod up -d --build..."
docker compose --profile prod up -d --build

echo "[4/6] 等待 API 健康..."
# 健康探测用 docker inspect（容器名直查）；compose inspect 子命令在服务器 compose 版本不可用
# （2026-09-14 实测：`docker compose inspect --format='{{.State.Health.Status}}'` 静默失败，
#  被 || echo unknown 兜底成 unknown，30 次轮询全空跑后误判 ERROR_UNHEALTHY 退出）。
for i in $(seq 1 30); do
  status=$(docker inspect --format='{{.State.Health.Status}}' family-menu-api 2>/dev/null || echo unknown)
  if [ "$status" = "healthy" ]; then
    echo "API_HEALTHY_TRY=$i"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "ERROR_UNHEALTHY"
    docker compose --profile prod logs --tail=30 api
    exit 1
  fi
  sleep 2
done

echo "[5/6] prisma migrate deploy..."
docker compose --profile prod exec -T api sh -c 'cd apps/api && ./node_modules/.bin/prisma migrate deploy'

echo "[6/6] 服务状态:"
docker compose --profile prod ps
echo "REMOTE_DEPLOY_OK"
