#!/bin/bash
# DIAG3：牛肉 60min 补测（牛腩类菜 55/90min，30min 被时间过滤是正确行为）
set -u
LOG=/tmp/fm-diag3.log
: > "$LOG"
exec >> "$LOG" 2>&1
TOKEN=$(docker exec family-menu-api printenv ACCESS_TOKEN)
curl -s -X POST https://menu.jijingkongjian.xin/api/recommend -H "Content-Type: application/json" -H "Cookie: access_token=$TOKEN" -d '{"people":2,"timeBudgetMin":60,"mustUse":["牛肉"]}' -o /tmp/fm-re-beef60.json
echo beef60 saved
wc -c /tmp/fm-re-beef60.json
head -c 300 /tmp/fm-re-beef60.json
echo
echo ===DONE===
