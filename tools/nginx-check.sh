#!/bin/bash
# 查看线上 nginx 对静态资源的缓存配置（只读诊断）
exec > /tmp/fm-nginx-check.log 2>&1
echo "===== nginx -T 中与缓存相关的配置 ====="
nginx -T 2>/dev/null | grep -nE "location|Cache-Control|expires|add_header|root|try_files" | head -60
echo "===== 配置文件清单 ====="
ls -la /etc/nginx/conf.d/ /etc/nginx/sites-enabled/ 2>/dev/null
echo "===== 搜索 no-cache/no-store 出现位置 ====="
grep -rn "no-cache\|no-store" /etc/nginx/ 2>/dev/null | head -20
echo "===== DONE ====="
