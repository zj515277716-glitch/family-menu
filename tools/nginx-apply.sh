#!/bin/bash
# 应用新 nginx 配置：备份 -> 替换 -> 测试 -> reload（失败自动回滚）
exec > /tmp/fm-nginx-apply.log 2>&1
TS=$(date +%Y%m%d%H%M%S)
cp /etc/nginx/conf.d/menu.conf /etc/nginx/conf.d/menu.conf.bak-$TS
cp /tmp/menu.conf.new /etc/nginx/conf.d/menu.conf
if nginx -t; then
  nginx -s reload
  echo RELOAD_OK
else
  echo NGINX_TEST_FAILED_ROLLBACK
  cp /etc/nginx/conf.d/menu.conf.bak-$TS /etc/nginx/conf.d/menu.conf
  nginx -t
  nginx -s reload
  echo ROLLED_BACK
fi
echo ===== VERIFY_INDEX_HEADERS =====
sleep 1
curl -s -o /dev/null -D - https://menu.jijingkongjian.xin/index.html | head -20
echo ===== VERIFY_ROOT_HEADERS =====
curl -s -o /dev/null -D - https://menu.jijingkongjian.xin/ | head -20
echo ===== DONE =====
