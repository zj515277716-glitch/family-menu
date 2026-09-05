#!/bin/bash
# 临时诊断：经公网 API 查最近记录与计划详情（带口令）
set -e
TOKEN=$(docker exec family-menu-api sh -c 'echo $ACCESS_TOKEN')
echo "TOKEN_LEN=${#TOKEN}"
echo '--- PLANS LIST ---'
curl -s -H "Cookie: access_token=$TOKEN" 'https://menu.jijingkongjian.xin/api/plans?limit=5'
echo
echo '--- END ---'
