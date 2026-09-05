#!/bin/bash
C=family-menu-api
echo "--- root .bin ---"
docker exec $C sh -c "ls /app/node_modules/.bin/ | head -30"
echo "--- h5 .bin ---"
docker exec $C sh -c "ls /app/apps/h5/node_modules/.bin/ | head -30"
echo "--- tsc check ---"
docker exec $C sh -c "ls -la /app/node_modules/.bin/tsc"
echo "--- taro pkg ---"
docker exec $C sh -c "ls /app/node_modules/.pnpm/ 2>/dev/null | grep -i taro | head -8"
docker exec $C sh -c "find /app/node_modules -maxdepth 4 -name taro -type f 2>/dev/null | head -5"
echo "--- h5 nm ---"
docker exec $C sh -c "ls /app/apps/h5/node_modules/ 2>/dev/null | head -10"
