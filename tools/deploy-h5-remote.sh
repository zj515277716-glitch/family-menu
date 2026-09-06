#!/bin/bash
# H5 静态产物部署：备份旧目录 -> 解压新目录 -> 原子切换 -> 验证 index 引用
set -eu
LOG=/tmp/fm-deploy-h5.log
: > "$LOG"
exec >> "$LOG" 2>&1
TS=$(date +%Y%m%d-%H%M%S)
cd /opt/family-menu
echo "=== DEPLOY START $TS ==="
[ -d h5-dist ] && cp -r h5-dist "h5-dist.bak-$TS" && echo "backup done: h5-dist.bak-$TS" || echo "no old dir"
mkdir -p h5-dist-new
tar -xzf /tmp/h5-dist.tar.gz -C h5-dist-new
[ -f h5-dist-new/index.html ] || { echo "FATAL: no index.html in tar"; exit 1; }
rm -rf h5-dist-old
[ -d h5-dist ] && mv h5-dist h5-dist-old || true
mv h5-dist-new h5-dist
rm -rf h5-dist-old
echo "index refs:"
grep -o 'app\.[a-z0-9]*\.js' h5-dist/index.html | head -2
grep -o 'css/app\.[a-z0-9]*\.css' h5-dist/index.html | head -1
ls h5-dist | head -10
echo "=== DEPLOY_OK $TS ==="
