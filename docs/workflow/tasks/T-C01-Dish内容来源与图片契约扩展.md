# T-C01 Dish 内容来源与图片契约扩展（用户已批准）

> 状态：**待用户审核**（fm-dev 交付 7/7 AC（单测 shared 61/61 + content-pipeline 57/57、迁移 deploy EXIT=0、Dish 基线 19 精确还原，报告 [evidence/T-C01-dev-2026-09-10.md](../../../evidence/T-C01-dev-2026-09-10.md)）→ fm-reviewer 复审**通过**（无阻断；建议级 R-4 FETCHED 落库口/R-5 checksum drift 取证/R-6 基线口径/R-7 环境备案）→ fm-verify 验收**通过**（V1~V8 全 PASS，证据 .workflow-verify/tp-c01-verify/ 22 文件）→ 主控收敛完毕；2026-09-10 用户四项裁决（提交/C-1 gitignore/R-5 checksum 修复/T-C03 立项）后 git 提交（哈希见 CURRENT.md）→ **已完结**）

## 背景

内容轨道调查（[tools/content-pipeline/docs/recipe-fetch-feasibility-2026-09-06.md](../../../tools/content-pipeline/docs/recipe-fetch-feasibility-2026-09-06.md)）结论：下厨房走浏览器自动化抓取（用户已选 A 授权）、小红书走 CDP+人工登录采集（用户方案）。抓取内容入库需要 Dish 支持图片与来源追溯。**契约变更（packages/shared）已经产品负责人 2026-09-10 裁决批准（原话"3b批准"），本卡记录在案，无需再次请示。**

## AC（逐条 [✓]/[✗] 自检）

- **AC1 shared 契约扩展**：packages/shared 中 Dish 相关 zod schema 新增三个 optional 字段——`imageUrl`（合法 URL，z.string().url()）、`sourceUrl`（合法 URL）、`sourceSite`（字符串，约定值 xiachufang/xiaohongshu，先宽松后收紧）；`origin` 枚举扩展 `FETCHED`（现仅 LLM_DRAFT/MANUAL，见 schema.prisma L122-125 与 shared 对应位置）。fm-dev 先读现有代码再改，命名与现有风格一致。
- **AC2 prisma 同步与真实迁移**：apps/api/prisma/schema.prisma Dish 表（L89-107）新增同名字段（String? 可空）+ origin 枚举加 FETCHED；本地 PG（17.5 @ 127.0.0.1:54329，`pg_ctl start -D d:/codex/family-menu/.pg/data -o "-p 54329"`）真实执行迁移；**迁移只加列/扩展枚举，不得破坏既有 18 道 PUBLISHED 菜品与 12 套菜单数据**（迁移前后 Dish COUNT 对照入报告）；完成后 pg_ctl stop。
- **AC3 管线透传**：tools/content-pipeline 的 DraftDish schema 同步扩展三字段；fm-import（import.ts L89-131）导入时透传新字段（缺省不传=不落库）；以 out/weekday_fast_fish_30min_1786252204698.draft.json 为样例验证旧导入兼容。
- **AC4 测试真实执行**：shared schema 单测（新字段校验/缺省兼容）+ fm-import 回归（旧 draft.json 导入成功且落 DRAFT + 新字段透传用例）；全部命令+退出码+数字结果入报告，禁 Mock 冒充。
- **AC5 范围纪律**：仅 packages/shared、apps/api/prisma（schema+migration）、tools/content-pipeline（schema 与 import 相关文件）；**禁改** apps/api/src/**、apps/h5/**、packages/engine/**、packages/list-merger/**、PRODUCT-CONFIRMATION.md、PRODUCT-DECISIONS.md；无新增 npm 依赖（URL 校验用 zod 内置）。
- **AC6 证据落盘（T-P04 R-1 根治）**：完成报告必须落盘 `evidence/T-C01-dev-2026-09-10.md`（含 AC 自检、命令退出码原文、迁移前后 COUNT 对照），对话返回只作摘要。
- **AC7 teardown**：PG 用后停止（终态 54329 监听=0）；fm-import 回归产生的测试 Dish 数据事后删除，恢复 Dish=18（PG 直查 COUNT 入报告）；无其他残留。

## 边界

- 允许：packages/shared/**、apps/api/prisma/**（schema + migration 目录）、tools/content-pipeline/**（仅 schema/import 相关）。
- 禁改：apps/api/src/**、apps/h5/**、packages/engine/**、packages/list-merger/**、两个产品文档。
- >30s 命令用 Start-Process 脱离+轮询日志；退出码 $LASTEXITCODE；prisma migrate 需 PG 在线，先起后停。

## 异常升级

缺信息或卡外问题 → 停手写进完成报告，不顺手修改。
