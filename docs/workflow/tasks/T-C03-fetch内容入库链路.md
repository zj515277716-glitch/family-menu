# T-C03 fetch 内容入库链路（试采 JSON → Dish）

> 状态：**待用户审核**（fm-dev 两轮交付 8/8 AC（第一轮代码中断、第二轮续作补齐并修复 CLI 默认路径缺陷；报告 [evidence/T-C03-dev-2026-09-10.md](../../../evidence/T-C03-dev-2026-09-10.md)）→ fm-reviewer 复审**通过**（无阻断；建议级 B-5 index 未校验/B-6 imageUrl 硬编码 index 0/R-8 管线 test script 怪癖/R-9 DRAFT 无只读口/R-10 绝对 URL vs 契约张力/R-11 static 目录未 gitignore）→ fm-verify 验收**通过**（V1~V7 全 PASS：双保险强制覆盖实证 LLM_DRAFT、授权路径 FETCHED、图片 SHA256×3 一致、97/97+346/346+tsc0、teardown 六表逐项一致；证据 .workflow-verify/tp-c03-verify/）→ 主控收敛完毕；git 提交与否由产品负责人裁决）

## 背景

内容轨道三段式已就绪：①调查（可行性报告）②采集（T-C02 xhs-fetch.mjs，试采产物 `out/xhs/6a55c68e000000001c025017.fetch.json` + 3 图）③契约（T-C01：Dish 三新字段 imageUrl/sourceUrl/sourceSite + origin 枚举 FETCHED，已入库 `4b237d1`）。用户 2026-09-10 裁决④立项本卡：打通「试采 JSON → 正式 Dish」链路。

遗留处置：**R-4**（import 双保险封死 FETCHED 落库口）、**C-2**（下载图 Content-Type 判扩展名）在本卡解决。

## AC（逐条 [✓]/[✗] 自检）

- **AC1 图片方案先行**：读 apps/api 现状（app.ts/路由/是否有静态服务），确定图片托管方案——推荐 `@fastify/static`（或等价）挂静态目录 + Dish.imageUrl 存相对 URL（如 `/images/dishes/<dishId>/0.webp`）；新增依赖须在报告列明理由。H5 端不要求本卡接入展示。
- **AC2 fetch2dish 转换 CLI**：新增 `tools/content-pipeline/fetch2dish.mjs`：读 out/xhs/*.fetch.json → 产出 Dish 形状 JSON（含 shared 契约必填字段：name/dishes 结构按现有 fm-import 输入格式对齐，先读 import.ts 与 draft.json 样例确定形状；steps 从笔记正文/描述合理生成初稿；imageUrl/sourceUrl/sourceSite 填三新字段）。
- **AC3 FETCHED 专用入库路径（R-4 处置）**：扩展 fm-import 或新 CLI 提供**显式授权参数**（如 `--origin FETCHED`）落库 origin=FETCHED + status=DRAFT；**既有默认路径双保险语义不得削弱**（无授权参数时仍强制 LLM_DRAFT，既有 4 个 import 测试不回退）。
- **AC4 图片落盘与 C-2 修正**：下载图片按响应 Content-Type 归一扩展名（webp→.webp）；存入 API 静态目录，文件名/相对 URL 可回填 Dish.imageUrl。
- **AC5 端到端真实 PG**：将试采 6a55c68e000000001c025017 转换入库：PG 直查该 Dish origin=FETCHED、status=DRAFT、三字段有值且与 fetch.json 一致；图片经 HTTP GET（起 apps/api :3000 或直接文件路径核验）可达且字节非空；**人工微调后升 PUBLISHED 不在本卡范围**（既有发布流程不变）。
- **AC6 测试真实执行**：转换 CLI 单测（含缺字段容错）+ import 回归（默认路径不回退）+ 端到端；命令+退出码+数字入报告，禁 Mock。
- **AC7 证据落盘（R-1 纪律）**：完成报告落盘 `evidence/T-C03-dev-2026-09-10.md`。
- **AC8 teardown**：测试入库的 Dish（含 DishIngredient、图片文件）删除/还原，基线 Dish=19（18 PUBLISHED+1 TESTED）逐项一致；3000 端口杀净；PG 用后停（54329=0）；**CDP 浏览器 9222 与用户登录态禁碰**。

## 边界

- 允许：tools/content-pipeline/**（新增/扩展 CLI 与测试）、apps/api/src 仅限静态资源服务的**最小增量**（如注册 @fastify/static 的若干行；不动既有业务路由与 services 逻辑，diff 在报告单列）、apps/api/prisma 不再动（T-C01 已定）、图片静态目录。
- 禁改：apps/h5/**、packages/shared/**、packages/engine/**、packages/list-merger/**、PRODUCT-CONFIRMATION.md、PRODUCT-DECISIONS.md、xhs-fetch.mjs（T-C02 产物）、CDP 浏览器登录态。
- 试采产物 out/xhs/** 为输入（已 gitignore，不入库）；从其中读数据但不修改。
- 沙箱纪律：>30s 命令 Start-Process 脱离+轮询；退出码 $LASTEXITCODE；临时脚本 .cjs/.mjs；PG `pg_ctl start -D d:/codex/family-menu/.pg/data -o "-p 54329"` / stop -m fast。

## 异常升级

缺信息或卡外问题 → 停手写进完成报告，不顺手修改。
