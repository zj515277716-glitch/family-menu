#!/bin/bash
# TP-08-UIFIX 公网验证：health / index.html / 新色板 / AI 插画引用清零 / dishNames 真实菜名
LOG=/tmp/fm-uifix2-verify.log
exec >> $LOG 2>&1
echo "=== VERIFY START $(date '+%F %T') ==="
echo "--- 1 health ---"
curl -s -o /dev/null -w "HEALTH=%{http_code}\n" https://menu.jijingkongjian.xin/health
echo "--- 2 index.html head ---"
curl -s https://menu.jijingkongjian.xin/ | head -c 400
echo ""
echo "--- 3 css color #c8392e in served files ---"
grep -rl c8392e /opt/family-menu/h5-dist --include=*.css | head -3
echo "--- 4 png refs in served js (expect 0) ---"
grep -o [a-z0-9-]*\.png /opt/family-menu/h5-dist/js/*.js | sort -u | head -10
echo "PNG_REF_COUNT=$(grep -o [a-z0-9-]*\.png /opt/family-menu/h5-dist/js/*.js | sort -u | wc -l)"
echo "--- 5 api plans dishNames ---"
TOKEN=$(docker exec family-menu-api sh -c 'echo $ACCESS_TOKEN')
curl -s --cookie "access_token=$TOKEN" https://menu.jijingkongjian.xin/api/plans | grep -o "dishNames[^]]*]" | head -3
echo "--- 6 old color 2E7D32 residue (expect empty) ---"
grep -rl 2E7D32 /opt/family-menu/h5-dist --include=*.css | head -3
echo "=== VERIFY END $(date '+%F %T') ==="
