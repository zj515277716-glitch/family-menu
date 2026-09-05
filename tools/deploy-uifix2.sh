#!/bin/bash
# TP-08-UIFIX 部署脚本：UI 全量修复 19 文件（7 页面 + app.css + 2 组件 + 契约 + 后端菜名）
# 链路：备份 → 代码进容器 → 构建 shared/api/h5 → 重启 api → h5 产物替换 → 服务器侧验证
set -e
LOG=/tmp/fm-uifix2-deploy.log
exec >> $LOG 2>&1
echo "=== DEPLOY START $(date '+%F %T') ==="

# STEP0 前置检查
[ -f /tmp/fm-uifix2.tar.gz ] || { echo "FATAL: tar 包不存在"; exit 1; }
docker ps --format '{{.Names}} {{.Status}}' | grep family-menu-api
echo "STEP0_OK"

# STEP1 容器内备份现役 api/shared dist（回滚资产）
docker exec family-menu-api sh -c 'cd /app && tar czf /tmp/api-dist.bak-uifix2.tar.gz apps/api/dist packages/shared/dist && echo BACKUP_IN_CONTAINER_OK'
docker cp family-menu-api:/tmp/api-dist.bak-uifix2.tar.gz /tmp/api-dist.bak-uifix2.tar.gz
echo "STEP1_OK"

# STEP2 新代码解包进容器 /app
docker cp /tmp/fm-uifix2.tar.gz family-menu-api:/tmp/fm-uifix2.tar.gz
docker exec family-menu-api sh -c 'cd /app && tar xzf /tmp/fm-uifix2.tar.gz && echo UNPACK_OK'
echo "STEP2_OK"

# STEP3 容器内构建 shared
docker exec family-menu-api sh -c 'cd /app && ./node_modules/.bin/tsc -p packages/shared/tsconfig.json'
echo "STEP3_SHARED_TSC_OK"

# STEP4 容器内构建 api
docker exec family-menu-api sh -c 'cd /app && ./node_modules/.bin/tsc -p apps/api/tsconfig.json'
echo "STEP4_API_TSC_OK"

# STEP5 容器内构建 h5 + gen-index（postcss-calc 警告为 NutUI 自带，警告级不阻断）
docker exec family-menu-api sh -c 'cd /app/apps/h5 && /app/node_modules/.bin/taro build --type h5'
echo "STEP5_TARO_OK"
docker exec family-menu-api sh -c 'cd /app/apps/h5 && node ../../gen-index.cjs'
echo "STEP5_GENIDX_OK"

# STEP6 重启 api 容器（加载新 dist + 新契约）
docker restart family-menu-api
echo "STEP6_RESTART_OK"

# STEP7 h5 产物拷出宿主机 + 备份旧产物 + 替换
rm -rf /tmp/fm-h5dist-uifix2
docker cp family-menu-api:/app/apps/h5/dist /tmp/fm-h5dist-uifix2
echo "STEP7_DIST_OUT_OK"
tar czf /tmp/h5-dist.bak-uifix2.tar.gz -C /opt/family-menu h5-dist
echo "STEP7_OLD_BACKUP_OK"
rm -rf /opt/family-menu/h5-dist
cp -r /tmp/fm-h5dist-uifix2 /opt/family-menu/h5-dist
echo "STEP7_SWAP_OK"

# STEP8 服务器侧验证（health 循环重试 + plans 菜名抽查）
sleep 8
for i in 1 2 3 4 5 6; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" https://menu.jijingkongjian.xin/health)
  echo "HEALTH_TRY${i}=${CODE}"
  [ "$CODE" = "200" ] && break
  sleep 5
done
TOKEN=$(docker exec family-menu-api sh -c 'echo $ACCESS_TOKEN')
curl -s --cookie "access_token=$TOKEN" https://menu.jijingkongjian.xin/api/plans | head -c 600
echo ""
echo "=== DEPLOY END $(date '+%F %T') ==="
