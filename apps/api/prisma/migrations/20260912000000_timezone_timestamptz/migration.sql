-- T-P14 时区口径统一：6 处 DateTime 列 timestamp(3) without time zone → timestamptz(3)（方案 A，用户 2026-09-12 批准）
-- 目的：钉死「绝对时刻」语义，根治 Plan/Event 读回偏 −8h 与深夜（本地 0:00–8:00）formatDate 日期提前一天两类问题。
-- 关键：ALTER TYPE 必须带 USING 显式声明旧钟面的解释时区；若缺省，PG 按会话时区（Asia/Shanghai）解释旧钟面，
--       UTC 钟面列读回将整体偏移 8 小时（旧值 09:04:09 会被解释为本地 09:04 → UTC 01:04）。
--
-- 每列钟面归属依据（双重确认，2026-09-12：seed/API 写入路径读码 + 基线库实际钟面直查）：
--
-- 【UTC 钟面列 → USING col AT TIME ZONE 'UTC'】
--   1) Plan.planDate / Plan.createdAt / Event.createdAt
--      写入路径：Prisma client 显式传 JS Date（如 planService.ts 的 planDate: new Date()；seed.ts upsert create 分支显式传值），
--      node-pg 将 JS Date 序列化为 UTC 钟面写入。
--      基线库实锤：max(Plan.createdAt)=2026-09-06 09:04:09.747、max(Event.createdAt)=…09.754（UTC 渲染口径）。
--   2) Family.createdAt / FamilyRule.updatedAt
--      写入路径：seed-data.ts L6 now=new Date('2026-08-06T00:00:00Z')，seed.ts L13/L23 显式传入两列，同为驱动 UTC 序列化。
--      基线库实锤：两列钟面均=2026-08-06 00:00:00；若为本地钟面应渲染为 08:00:00 → UTC 判定成立。
--
-- 【本地钟面列 → USING col AT TIME ZONE 'Asia/Shanghai'】
--   3) CookLog.cookedAt
--      写入路径：INSERT 不带该列，由 DB DEFAULT CURRENT_TIMESTAMP 填充（服务器时区=Asia/Shanghai 的本地钟面）。
--      基线库实锤：6 行钟面 2026-09-05 01:03~2026-09-10 17:55，与业务「当日做饭记录」时刻吻合
--      （若为 UTC 渲染，换算本地为 09:03~次日 01:55，与同日 Plan/Event UTC 07:25~09:55 活动时段错位）→ 本地判定成立。
--
-- 预期迁移后（+00 渲染对照卡 AC3）：Plan.max(createdAt)=2026-09-06 09:04:09.747+00；
-- Event.max=2026-09-06 09:04:09.754+00；Plan.max(planDate)=2026-09-06 09:04:09.745+00；
-- CookLog.max=2026-09-10 09:55:58.267+00（本地 17:55 − 8h）。
--
-- 可移植性：本文件无本机路径/端口硬编码，公网 RDS 可直接 prisma migrate deploy。

-- Family.createdAt：UTC 钟面（seed 显式传 2026-08-06T00:00:00Z；基线库钟面 2026-08-06 00:00:00 = UTC 渲染）
ALTER TABLE "Family" ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC';

-- FamilyRule.updatedAt：UTC 钟面（seed 显式传 2026-08-06T00:00:00Z；基线库钟面 2026-08-06 00:00:00 = UTC 渲染）
ALTER TABLE "FamilyRule" ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(3) USING "updatedAt" AT TIME ZONE 'UTC';

-- CookLog.cookedAt：本地钟面（DB CURRENT_TIMESTAMP 填充；基线库 6 行 01:03~17:55 为本地做饭时刻）
ALTER TABLE "CookLog" ALTER COLUMN "cookedAt" TYPE TIMESTAMPTZ(3) USING "cookedAt" AT TIME ZONE 'Asia/Shanghai';

-- Plan.planDate：UTC 钟面（Prisma 显式传 JS Date；基线库 max=2026-09-06 09:04:09.745 UTC 渲染）
ALTER TABLE "Plan" ALTER COLUMN "planDate" TYPE TIMESTAMPTZ(3) USING "planDate" AT TIME ZONE 'UTC';

-- Plan.createdAt：UTC 钟面（Prisma 显式传 JS Date；基线库 max=2026-09-06 09:04:09.747 UTC 渲染）
ALTER TABLE "Plan" ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC';

-- Event.createdAt：UTC 钟面（Prisma 显式传 JS Date；基线库 max=2026-09-06 09:04:09.754 UTC 渲染）
ALTER TABLE "Event" ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC';
