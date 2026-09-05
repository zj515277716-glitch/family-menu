#!/bin/bash
# DIAG-MUSTUSE：必消匹配链路线上诊断（只读，不改任何数据）
set -u
LOG=/tmp/fm-diag-mustuse.log
: > "$LOG"
exec >> "$LOG" 2>&1

echo "=== DIAG START $(date '+%F %T') ==="

echo "--- STEP1: token ---"
TOKEN=$(docker exec family-menu-api sh -c 'echo $ACCESS_TOKEN')
echo "TOKEN_LEN=${#TOKEN}"

echo "--- STEP2: db overview (prisma readonly) ---"
docker exec -w /app/apps/api family-menu-api node -e '
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
(async () => {
  const pubCount = await p.dish.count({ where: { status: "PUBLISHED" } });
  const draftCount = await p.dish.count({ where: { status: "DRAFT" } });
  const ingCount = await p.ingredient.count();
  console.log("PUBLISHED_DISHES=" + pubCount);
  console.log("DRAFT_DISHES=" + draftCount);
  console.log("INGREDIENT_TOTAL=" + ingCount);
  const dishes = await p.dish.findMany({
    where: { status: "PUBLISHED" },
    include: { ingredients: { include: { ingredient: true } } },
    orderBy: { mealRole: "asc" },
  });
  for (const d of dishes.slice(0, 80)) {
    const ings = d.ingredients.map((x) => x.ingredient.name).join(",");
    console.log("DISH|" + d.mealRole + "|t" + d.totalMinutes + "|" + d.name + "|ings=" + ings);
  }
  const ingsAll = await p.ingredient.findMany({ orderBy: { name: "asc" } });
  console.log("ING_NAMES=" + ingsAll.map((i) => i.name + "[" + i.aliases.join("/") + "]").join(", "));
  await p.$disconnect();
})().catch((e) => { console.error("DB_ERR " + e.message); process.exit(1); });
'
echo "STEP2_EXIT=$?"

echo "--- STEP3: api recommend live tests ---"
for MU in "鲈鱼" "鸡蛋" "番茄"; do
  echo ">>> mustUse=[$MU]"
  curl -sS -X POST https://menu.jijingkongjian.xin/api/recommend \
    -H "Content-Type: application/json" \
    -b "access_token=$TOKEN" \
    -d "{\"people\":2,\"timeBudgetMin\":30,\"mustUse\":[\"$MU\"]}"
  echo ""
done

echo "=== DIAG END $(date '+%F %T') ==="
