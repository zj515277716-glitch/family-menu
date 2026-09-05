#!/bin/bash
# DIAG2：线上库内容只读诊断（不写任何业务数据）+ 易错必消食材实测
# 目的：拿到"菜谱库现在到底支持哪些必消食材词"的准确清单
set -u
LOG=/tmp/fm-diag2.log
: > "$LOG"
exec >> "$LOG" 2>&1

echo "===STEP0 env check==="
docker exec family-menu-api node -v
docker exec family-menu-api ls /app/apps/api/dist/generated/prisma/client.js
docker exec family-menu-api ls /app/apps/api/node_modules/@prisma/adapter-pg/package.json

echo "===STEP1 write mjs==="
cat > /tmp/fm-diag2.mjs <<'MJS_EOF'
import { PrismaClient } from "/app/apps/api/dist/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

console.log("=== INGREDIENTS (name | aliases) ===");
const ings = await prisma.ingredient.findMany({ orderBy: [{ category: "asc" }, { name: "asc" }] });
for (const g of ings) {
  console.log(g.category + " | " + g.name + " | " + JSON.stringify(g.aliases));
}

console.log("=== PUBLISHED DISHES ===");
const dishes = await prisma.dish.findMany({
  where: { status: "PUBLISHED" },
  include: { ingredients: { include: { ingredient: true } } },
  orderBy: { mealRole: "asc" },
});
console.log("published dish total=" + dishes.length);
for (const d of dishes) {
  const names = d.ingredients
    .slice()
    .sort((a, b) => Number(a.optional) - Number(b.optional))
    .map((i) => i.ingredient.name + (i.optional ? "(可选)" : ""))
    .join(",");
  console.log(d.mealRole + " | " + d.name + " | " + d.totalMinutes + "min | " + names);
}

console.log("=== PUBLISHED MENUS ===");
const menus = await prisma.menu.findMany({
  where: { status: "PUBLISHED" },
  include: { dishes: { include: { dish: true } } },
  orderBy: { name: "asc" },
});
console.log("published menu total=" + menus.length);
for (const m of menus) {
  console.log(m.scene + " | " + m.name + " | " + m.dishes.map((x) => x.dish.name).join("+"));
}

console.log("=== STATUS COUNTS ===");
const dD = await prisma.dish.count({ where: { status: "DRAFT" } });
const dT = await prisma.dish.count({ where: { status: "TESTED" } });
const dP = await prisma.dish.count({ where: { status: "PUBLISHED" } });
console.log("dish DRAFT=" + dD + " TESTED=" + dT + " PUBLISHED=" + dP);
const mD = await prisma.menu.count({ where: { status: "DRAFT" } });
const mP = await prisma.menu.count({ where: { status: "PUBLISHED" } });
console.log("menu DRAFT=" + mD + " PUBLISHED=" + mP);

await pool.end();
console.log("=== QUERY DONE ===");
MJS_EOF
docker cp /tmp/fm-diag2.mjs family-menu-api:/app/apps/api/fm-diag2.mjs
echo mjs written

echo "===STEP2 run query==="
docker exec -w /app/apps/api family-menu-api node fm-diag2.mjs
echo "===STEP2 exit=$?==="

echo "===STEP3 mustuse tests==="
TOKEN=$(docker exec family-menu-api printenv ACCESS_TOKEN)
echo "token length ${#TOKEN}"
curl -s -X POST https://menu.jijingkongjian.xin/api/recommend -H "Content-Type: application/json" -H "Cookie: access_token=$TOKEN" -d '{"people":2,"timeBudgetMin":30,"mustUse":["西红柿"]}' -o /tmp/fm-diag2-r-tomato.json
echo tomato saved
curl -s -X POST https://menu.jijingkongjian.xin/api/recommend -H "Content-Type: application/json" -H "Cookie: access_token=$TOKEN" -d '{"people":2,"timeBudgetMin":30,"mustUse":["虾"]}' -o /tmp/fm-diag2-r-shrimp.json
echo shrimp saved
curl -s -X POST https://menu.jijingkongjian.xin/api/recommend -H "Content-Type: application/json" -H "Cookie: access_token=$TOKEN" -d '{"people":2,"timeBudgetMin":30,"mustUse":["鸡蛋"]}' -o /tmp/fm-diag2-r-egg.json
echo egg saved
curl -s -X POST https://menu.jijingkongjian.xin/api/recommend -H "Content-Type: application/json" -H "Cookie: access_token=$TOKEN" -d '{"people":2,"timeBudgetMin":30,"mustUse":["土豆"]}' -o /tmp/fm-diag2-r-potato.json
echo potato saved

for F in /tmp/fm-diag2-r-tomato.json /tmp/fm-diag2-r-shrimp.json /tmp/fm-diag2-r-egg.json /tmp/fm-diag2-r-potato.json; do
  echo "--- $F bytes=$(wc -c < $F)"
  head -c 400 "$F"
  echo
done
echo "===ALL DONE==="
