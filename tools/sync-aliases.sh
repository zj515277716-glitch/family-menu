#!/bin/bash
# SYNC-ALIASES：生产库食材别名补齐（修复必消匹配"西红柿/虾"匹配不到的问题）
# 原理：planService.resolveMustUseIds 按 ingredient.name + aliases 精确匹配必消输入，
#       线上库别名全空导致"西红柿/虾"等日常说法匹配不到 -> 补别名即修复，无需改代码
# 安全性：纯增量合并 + 冲突自检（新别名若撞其他食材的 name/别名则跳过），只读食材表、只写 aliases 字段
set -u
LOG=/tmp/fm-sync-aliases.log
: > "$LOG"
exec >> "$LOG" 2>&1

echo "===STEP1 write mjs==="
cat > /tmp/fm-sync-aliases.mjs <<'MJS_EOF'
import { PrismaClient } from "/app/apps/api/dist/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

// 要补的别名（合并进现有 aliases，纯增量）
const addAliases = [
  { name: "番茄", aliases: ["西红柿", "洋柿子"] },
  { name: "土豆", aliases: ["马铃薯", "洋芋"] },
  { name: "青菜", aliases: ["小白菜", "油菜", "上海青"] },
  { name: "西兰花", aliases: ["花椰菜", "绿菜花", "西蓝花"] },
  { name: "紫菜", aliases: ["海苔"] },
  { name: "黄瓜", aliases: ["青瓜"] },
  { name: "猪肉", aliases: ["五花肉", "瘦肉"] },
  { name: "排骨", aliases: ["肋排", "猪排骨"] },
  { name: "牛腩", aliases: ["牛肉"] },
  { name: "鲈鱼", aliases: ["海鲈鱼"] },
  { name: "虾仁", aliases: ["虾米", "虾", "鲜虾", "基围虾"] },
  { name: "鸡蛋", aliases: ["土鸡蛋", "蛋"] },
  { name: "生抽", aliases: ["酱油"] },
  { name: "盐", aliases: ["食盐"] },
  { name: "白糖", aliases: ["冰糖", "砂糖"] },
  { name: "料酒", aliases: ["黄酒"] },
  { name: "大米", aliases: ["白米", "米"] },
  { name: "鸡胸肉", aliases: ["鸡胸", "鸡胸脯肉"] },
  { name: "鸡腿肉", aliases: ["鸡腿"] },
  { name: "嫩豆腐", aliases: ["豆腐"] },
  { name: "牛里脊", aliases: ["牛柳", "牛里脊肉"] },
];

// 冲突索引：所有食材的 name + 现有 aliases -> 归属食材名
const all = await prisma.ingredient.findMany();
const owner = new Map();
for (const g of all) {
  for (const k of [g.name, ...(g.aliases || [])]) {
    if (owner.has(k)) console.log("WARN pre-existing dup key " + k + " : " + owner.get(k) + " vs " + g.name);
    else owner.set(k, g.name);
  }
}

let ok = 0;
for (const item of addAliases) {
  const ing = all.find((g) => g.name === item.name);
  if (!ing) { console.log("SKIP not-found " + item.name); continue; }
  const merged = [...(ing.aliases || [])];
  for (const a of item.aliases) {
    if (merged.includes(a)) continue;
    const o = owner.get(a);
    if (o && o !== item.name) { console.log("CONFLICT alias " + a + " belongs to " + o + " skip for " + item.name); continue; }
    merged.push(a);
    owner.set(a, item.name);
  }
  await prisma.ingredient.update({ where: { name: item.name }, data: { aliases: merged } });
  ok++;
  console.log("OK " + item.name + " -> " + JSON.stringify(merged));
}
console.log("updated=" + ok + "/" + addAliases.length);
await pool.end();
console.log("=== SYNC DONE ===");
MJS_EOF
docker cp /tmp/fm-sync-aliases.mjs family-menu-api:/app/apps/api/fm-sync-aliases.mjs
echo mjs written

echo "===STEP2 run sync==="
docker exec -w /app/apps/api family-menu-api node fm-sync-aliases.mjs
echo "===STEP2 exit=$?==="

echo "===STEP3 retest mustuse==="
TOKEN=$(docker exec family-menu-api printenv ACCESS_TOKEN)
curl -s -X POST https://menu.jijingkongjian.xin/api/recommend -H "Content-Type: application/json" -H "Cookie: access_token=$TOKEN" -d '{"people":2,"timeBudgetMin":30,"mustUse":["西红柿"]}' -o /tmp/fm-re-tomato.json
echo tomato saved
curl -s -X POST https://menu.jijingkongjian.xin/api/recommend -H "Content-Type: application/json" -H "Cookie: access_token=$TOKEN" -d '{"people":2,"timeBudgetMin":30,"mustUse":["虾"]}' -o /tmp/fm-re-shrimp.json
echo shrimp saved
curl -s -X POST https://menu.jijingkongjian.xin/api/recommend -H "Content-Type: application/json" -H "Cookie: access_token=$TOKEN" -d '{"people":2,"timeBudgetMin":30,"mustUse":["鸡胸肉"]}' -o /tmp/fm-re-chicken.json
echo chicken saved
curl -s -X POST https://menu.jijingkongjian.xin/api/recommend -H "Content-Type: application/json" -H "Cookie: access_token=$TOKEN" -d '{"people":2,"timeBudgetMin":30,"mustUse":["豆腐"]}' -o /tmp/fm-re-tofu.json
echo tofu saved
curl -s -X POST https://menu.jijingkongjian.xin/api/recommend -H "Content-Type: application/json" -H "Cookie: access_token=$TOKEN" -d '{"people":2,"timeBudgetMin":60,"mustUse":["土豆"]}' -o /tmp/fm-re-potato60.json
echo potato60 saved
curl -s -X POST https://menu.jijingkongjian.xin/api/recommend -H "Content-Type: application/json" -H "Cookie: access_token=$TOKEN" -d '{"people":2,"timeBudgetMin":30,"mustUse":["牛肉"]}' -o /tmp/fm-re-beef.json
echo beef saved

for F in /tmp/fm-re-tomato.json /tmp/fm-re-shrimp.json /tmp/fm-re-chicken.json /tmp/fm-re-tofu.json /tmp/fm-re-potato60.json /tmp/fm-re-beef.json; do
  echo "--- $F bytes=$(wc -c < $F)"
  head -c 300 "$F"
  echo
done
echo "===ALL DONE==="
