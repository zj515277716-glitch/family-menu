#!/bin/bash
# H5 静态产物部署：备份旧目录 -> 原地清空+拷贝新产物（保 bind mount inode）-> 验证 index 引用
# 坑（2026-09-15 实锤）：Caddy 容器 bind mount 绑定目录 inode，mv 换目录后容器仍看旧（已清空）
# inode → 全站 404。故改为 find -delete 原地清空 + cp -a 拷入，目录 inode 不变。
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
mkdir -p h5-dist
find h5-dist -mindepth 1 -delete
cp -a h5-dist-new/. h5-dist/
rm -rf h5-dist-new
echo "index refs:"
grep -o 'app\.[a-z0-9]*\.js' h5-dist/index.html | head -2
grep -o 'css/app\.[a-z0-9]*\.css' h5-dist/index.html | head -1
ls h5-dist | head -10
echo "=== DEPLOY_OK $TS ==="
