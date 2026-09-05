#!/bin/bash
# UIFIX3：修复"服务未连接"——构建时注入 TARO_APP_API_BASE_URL（容器内 .env.production + shell env 双保险）
set -e
LOG=/tmp/fm-uifix3.log
exec >> $LOG 2>&1
echo "=== UIFIX3 START $(date '+%F %T') ==="

echo "--- STEP0 container env files before ---"
docker exec family-menu-api sh -c 'ls -la /app/apps/h5/ | grep -i env || echo NO_ENV_FILE'

echo "--- STEP1 write .env.production in container ---"
docker exec family-menu-api sh -c 'echo TARO_APP_API_BASE_URL=https://menu.jijingkongjian.xin > /app/apps/h5/.env.production'
docker exec family-menu-api sh -c 'cat /app/apps/h5/.env.production'
echo "STEP1_ENV_OK"

echo "--- STEP2 taro build with env prefix ---"
docker exec family-menu-api sh -c 'cd /app/apps/h5 && TARO_APP_API_BASE_URL=https://menu.jijingkongjian.xin ./node_modules/.bin/taro build --type h5'
echo "STEP2_TARO_OK"

echo "--- STEP3 gen-index (cwd=/app) ---"
docker exec family-menu-api sh -c 'cd /app && node gen-index.cjs'
echo "STEP3_GENIDX_OK"

echo "--- STEP4 dist out + backup old ---"
rm -rf /tmp/fm-h5dist-uifix3
docker cp family-menu-api:/app/apps/h5/dist /tmp/fm-h5dist-uifix3
echo "STEP4_DIST_OUT_OK"
tar czf /tmp/h5-dist.bak-uifix3.tar.gz -C /opt/family-menu h5-dist
echo "STEP4_OLD_BACKUP_OK"

echo "--- STEP5 swap ---"
rm -rf /opt/family-menu/h5-dist
cp -r /tmp/fm-h5dist-uifix3 /opt/family-menu/h5-dist
echo "STEP5_SWAP_OK"

echo "--- STEP6 product verify: BASE_URL injected (expect hits) ---"
echo "BASEURL_HIT_COUNT=$(grep -rl menu.jijingkongjian.xin /opt/family-menu/h5-dist/js/ | wc -l)"
grep -rl menu.jijingkongjian.xin /opt/family-menu/h5-dist/js/ | head -5
echo "PNG_REF_COUNT=$(grep -o [a-z0-9-]*\.png /opt/family-menu/h5-dist/js/*.js | sort -u | wc -l)"

echo "--- STEP7 public check ---"
sleep 2
curl -s -o /dev/null -w "HEALTH=%{http_code}\n" https://menu.jijingkongjian.xin/health
curl -s https://menu.jijingkongjian.xin/ | head -c 300
echo ""
echo "=== UIFIX3 END $(date '+%F %T') ==="
