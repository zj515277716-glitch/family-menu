#!/bin/bash
# UIFIX3C：基线核对修复（换一批按钮位置 + C-2 跨天必消清空/长期默认带出 + TabBar 高度变量）H5 重建部署
set -e
LOG=/tmp/fm-uifix3c.log
exec >> $LOG 2>&1
echo "=== UIFIX3C START $(date '+%F %T') ==="

echo "--- STEP0 precheck ---"
[ -f /tmp/fm-uifix3c.tar.gz ] || { echo "FATAL: tar missing"; exit 1; }
docker ps --format '{{.Names}} {{.Status}}' | grep family-menu-api
echo "STEP0_OK"

echo "--- STEP1 env double-insurance ---"
TOKEN=$(docker exec family-menu-api sh -c 'echo $ACCESS_TOKEN')
if [ -z "$TOKEN" ]; then echo "ERROR_EMPTY_TOKEN"; exit 1; fi
echo "TOKEN_LEN=${#TOKEN}"
printf 'TARO_APP_API_BASE_URL=https://menu.jijingkongjian.xin\nTARO_APP_ACCESS_TOKEN=%s\n' "$TOKEN" > /tmp/fm-env-production.txt
docker cp /tmp/fm-env-production.txt family-menu-api:/app/apps/h5/.env.production
rm -f /tmp/fm-env-production.txt
echo "STEP1_ENV_OK"

echo "--- STEP2 unpack new code ---"
docker cp /tmp/fm-uifix3c.tar.gz family-menu-api:/tmp/fm-uifix3c.tar.gz
docker exec family-menu-api sh -c 'cd /app && tar xzf /tmp/fm-uifix3c.tar.gz && echo UNPACK_OK'
echo "STEP2_OK"

echo "--- STEP3 taro build ---"
docker exec family-menu-api sh -c 'cd /app/apps/h5 && TARO_APP_API_BASE_URL=https://menu.jijingkongjian.xin TARO_APP_ACCESS_TOKEN=$ACCESS_TOKEN ./node_modules/.bin/taro build --type h5'
echo "STEP3_TARO_OK"

echo "--- STEP4 gen-index ---"
docker exec family-menu-api sh -c 'cd /app && node gen-index.cjs'
echo "STEP4_GENIDX_OK"

echo "--- STEP5 dist out + backup ---"
rm -rf /tmp/fm-h5dist-uifix3c
docker cp family-menu-api:/app/apps/h5/dist /tmp/fm-h5dist-uifix3c
tar czf /tmp/h5-dist.bak-uifix3c.tar.gz -C /opt/family-menu h5-dist
echo "STEP5_OK"

echo "--- STEP6 swap ---"
rm -rf /opt/family-menu/h5-dist
cp -r /tmp/fm-h5dist-uifix3c /opt/family-menu/h5-dist
echo "STEP6_SWAP_OK"

echo "--- STEP7 verify ---"
echo "BASEURL_HIT_COUNT=$(grep -rl menu.jijingkongjian.xin /opt/family-menu/h5-dist/js/ | wc -l)"
echo "TOKEN_HIT_COUNT=$(grep -rl "$TOKEN" /opt/family-menu/h5-dist/js/ | wc -l)"
echo "JS_COUNT=$(ls /opt/family-menu/h5-dist/js/*.js | wc -l)"

echo "--- STEP8 public ---"
sleep 2
curl -s -o /dev/null -w "HEALTH=%{http_code}\n" https://menu.jijingkongjian.xin/health
curl -s https://menu.jijingkongjian.xin/ | head -c 300
echo ""
echo "=== UIFIX3C END $(date '+%F %T') ==="
