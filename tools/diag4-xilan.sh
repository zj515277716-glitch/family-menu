#!/bin/bash
# DIAG4：西蓝花（用户写法 蓝）vs 西兰花（库名 兰）匹配排查
set -u
LOG=/tmp/fm-diag4.log
: > "$LOG"
exec >> "$LOG" 2>&1

echo "===STEP1 curl xilan (user input 蓝)==="
TOKEN=$(docker exec family-menu-api printenv ACCESS_TOKEN)
curl -s -X POST https://menu.jijingkongjian.xin/api/recommend -H "Content-Type: application/json" -H "Cookie: access_token=$TOKEN" -d '{"people":4,"timeBudgetMin":30,"mustUse":["西蓝花"]}' -o /tmp/fm-re-xilan.json
echo xilan bytes=$(wc -c < /tmp/fm-re-xilan.json)
head -c 500 /tmp/fm-re-xilan.json
echo
echo "===STEP2 curl xilanlan (library name 兰)==="
curl -s -X POST https://menu.jijingkongjian.xin/api/recommend -H "Content-Type: application/json" -H "Cookie: access_token=$TOKEN" -d '{"people":4,"timeBudgetMin":30,"mustUse":["西兰花"]}' -o /tmp/fm-re-xilanlan.json
echo xilanlan bytes=$(wc -c < /tmp/fm-re-xilanlan.json)
head -c 500 /tmp/fm-re-xilanlan.json
echo
echo "===STEP3 db query==="
cat > /tmp/fm-diag4.mjs <<'MJS_EOF'
import { PrismaClient } from "/app/apps/api/dist/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
const ings = await prisma.ingredient.findMany();
for (const g of ings) {
  const keys = [g.name, ...(g.aliases || [])];
  if (keys.some(k => k.includes("西蓝") || k.includes("西兰"))) {
    console.log("ING name=" + g.name + " aliases=" + JSON.stringify(g.aliases));
  }
}
const dishes = await prisma.dish.findMany({ where: { status: "PUBLISHED" }, include: { ingredients: { include: { ingredient: true } } } });
for (const d of dishes) {
  const hit = d.ingredients.filter(di => ["西兰花","西蓝花"].includes(di.ingredient.name));
  if (hit.length) console.log("DISH " + d.name + " mins=" + d.totalMinutes + " uses=" + hit.map(h => h.ingredient.name).join(","));
}
await pool.end();
console.log("=== DIAG4 DB DONE ===");
MJS_EOF
docker cp /tmp/fm-diag4.mjs family-menu-api:/app/apps/api/fm-diag4.mjs
docker exec -w /app/apps/api family-menu-api node fm-diag4.mjs
echo "===ALL DONE==="
