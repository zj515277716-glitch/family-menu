#!/bin/bash
# 验证「西蓝花」别名线上生效：应返回 candidates 非空
set -u
LOG=/tmp/fm-verify-xilan.log
: > "$LOG"
exec >> "$LOG" 2>&1
TOKEN=$(docker exec family-menu-api printenv ACCESS_TOKEN)
curl -s -X POST https://menu.jijingkongjian.xin/api/recommend -H "Content-Type: application/json" -H "Cookie: access_token=$TOKEN" -d '{"people":4,"timeBudgetMin":30,"mustUse":["西蓝花"]}' -o /tmp/fm-re-xilan2.json
echo bytes=$(wc -c < /tmp/fm-re-xilan2.json)
head -c 300 /tmp/fm-re-xilan2.json
echo
echo "=== VERIFY XILAN DONE ==="
