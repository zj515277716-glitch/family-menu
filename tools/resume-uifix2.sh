#!/bin/bash
# TP-08-UIFIX 续跑：STEP5 h5 构建（taro 用 h5 本地 .bin）→ STEP6 重启 → STEP7 产物替换 → STEP8 验证
set -e
LOG=/tmp/fm-uifix2-resume.log
exec >> $LOG 2>&1
echo "=== RESUME START $(date '+%F %T') ==="

# STEP5 h5 构建 + gen-index
docker exec family-menu-api sh -c 'cd /app/apps/h5 && ./node_modules/.bin/taro build --type h5'
echo "STEP5_TARO_OK"
docker exec family-menu-api sh -c 'cd /app/apps/h5 && node ../../gen-index.cjs'
echo "STEP5_GENIDX_OK"

# STEP6 重启 api 容器（加载新 shared/api dist）
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

# STEP8 服务器侧验证
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
echo "=== RESUME END $(date '+%F %T') ==="
