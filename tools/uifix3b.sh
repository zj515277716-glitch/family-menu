#!/bin/bash
# UIFIX3B：补注入 TARO_APP_ACCESS_TOKEN（与 BASE_URL 一起）重新构建部署
set -e
LOG=/tmp/fm-uifix3b.log
exec >> $LOG 2>&1
echo "=== UIFIX3B START $(date '+%F %T') ==="

echo "--- STEP1 write both env vars in container ---"
TOKEN=$(docker exec family-menu-api sh -c 'echo $ACCESS_TOKEN')
if [ -z "$TOKEN" ]; then echo "ERROR_EMPTY_TOKEN"; exit 1; fi
echo "TOKEN_LEN=${#TOKEN}"
printf 'TARO_APP_API_BASE_URL=https://menu.jijingkongjian.xin\nTARO_APP_ACCESS_TOKEN=%s\n' "$TOKEN" > /tmp/fm-env-production.txt
docker cp /tmp/fm-env-production.txt family-menu-api:/app/apps/h5/.env.production
rm -f /tmp/fm-env-production.txt
docker exec family-menu-api sh -c 'grep -c TARO_APP /app/apps/h5/.env.production'
echo "STEP1_ENV_OK"

echo "--- STEP2 taro build ---"
docker exec family-menu-api sh -c 'cd /app/apps/h5 && TARO_APP_API_BASE_URL=https://menu.jijingkongjian.xin TARO_APP_ACCESS_TOKEN=$ACCESS_TOKEN ./node_modules/.bin/taro build --type h5'
echo "STEP2_TARO_OK"

echo "--- STEP3 gen-index ---"
docker exec family-menu-api sh -c 'cd /app && node gen-index.cjs'
echo "STEP3_GENIDX_OK"

echo "--- STEP4 dist out + backup ---"
rm -rf /tmp/fm-h5dist-uifix3b
docker cp family-menu-api:/app/apps/h5/dist /tmp/fm-h5dist-uifix3b
echo "STEP4_DIST_OUT_OK"
tar czf /tmp/h5-dist.bak-uifix3b.tar.gz -C /opt/family-menu h5-dist
echo "STEP4_OLD_BACKUP_OK"

echo "--- STEP5 swap ---"
rm -rf /opt/family-menu/h5-dist
cp -r /tmp/fm-h5dist-uifix3b /opt/family-menu/h5-dist
echo "STEP5_SWAP_OK"

echo "--- STEP6 verify ---"
echo "BASEURL_HIT_COUNT=$(grep -rl menu.jijingkongjian.xin /opt/family-menu/h5-dist/js/ | wc -l)"
echo "TOKEN_HIT_COUNT=$(grep -rl "$TOKEN" /opt/family-menu/h5-dist/js/ | wc -l)"
echo "PNG_REF_COUNT=$(grep -o [a-z0-9-]*\.png /opt/family-menu/h5-dist/js/*.js | sort -u | wc -l)"

echo "--- STEP7 public ---"
sleep 2
curl -s -o /dev/null -w "HEALTH=%{http_code}\n" https://menu.jijingkongjian.xin/health
echo "=== UIFIX3B END $(date '+%F %T') ==="
