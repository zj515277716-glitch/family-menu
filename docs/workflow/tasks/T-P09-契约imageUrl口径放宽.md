# T-P09 契约 imageUrl 口径放宽（T-P08 阻塞-1 收敛 + 复审建议-1 顺手修）

> 状态：**待用户审核**（fm-dev 8/8 AC；fm-verify PASS：契约 parse 8/8 + 端到端双向 + 真机回归 22/22；fm-reviewer 通过：无阻塞，1 建议 regex 口径后续收紧评估 + 5 观察。2026-09-11）

## 背景

T-P08 将管线口径改为相对路径 `/images/dishes/...`（方案 B：DB 与 Plan.candidates 快照只存相对路径，前端读 TARO_APP_API_BASE_URL 拼基址）。但 packages/shared 契约 `DishSchema.imageUrl = z.string().url().optional()`（dish.ts L51），zod 4.4.3 `.url()` 对相对路径必抛错；fm-import 的 `DraftFileSchema`（import.ts L87 组合 / L150 parse）经过该校验——**下一次有图新菜导入必然 ZodError 失败**（T-P08 fm-reviewer 阻塞-1，证据链完整，属延迟引爆型前向回归）。本卡为契约变更卡：**shared 变更已获用户批准（2026-09-11）**。

## AC

- **AC1 契约放宽**：packages/shared `DishSchema.imageUrl` 校验放宽为「http(s) 绝对 URL **或** 以 `/images/` 开头的站内相对路径」二选一（`z.string().url()` 与 `z.string().regex(/^\/images\//)` 的 union 或等效 refine，实现自评估）；`sourceUrl` 保持 `z.string().url()` **不动**（外部原帖必为 URL）；空串仍须拒绝（两个分支都不匹配）。契约若有版本号惯例（如 index.ts 或注释中的 v0.x）按惯例递增并在注释记录本次变更口径（DB 存相对、前端拼基址）。
- **AC2 契约影响面自查**：改前 grep packages/shared 全库确认 imageUrl 的 zod 校验点只有 dish.ts 一处；若发现其他校验点（如 MenuSchema 内嵌 dish 校验）→ **停手写报告报主控**，不得自行扩大改动。
- **AC3 测试盲区消除**：tools/content-pipeline/test/import.spec.ts 补相对路径用例：①`/images/dishes/<id>/0.webp` **通过**；②http(s) 绝对 URL 仍通过；③既非 URL 又非 /images/ 相对路径（如 `foo/bar.jpg`）**拒绝**；④空串**拒绝**（保持既有行为）。
- **AC4 复审建议-1 顺手修**：fetch2dish.mjs 补 `--base-url=` 等号形式拦截（与既有空格形式 `--base-url` 报错同口径：显式报错退出，不得静默吞参）+ fetch2dish.spec.ts 用例覆盖等号形式。
- **AC5 回归全绿**：packages/shared 测试 + 管线 vitest 全绿 + 根 `pnpm test` 全绿（记录数字）+ h5 typecheck 0 错 + build EXIT=0（契约改动影响 h5 类型，须实证）。
- **AC6 端到端实证**：构造一份有图新菜 draft JSON（imageUrl 为相对路径且对应静态文件真实存在于 API static 目录），走 fm-import 真实入库成功（FETCHED/DRAFT），DB 行 imageUrl 为相对路径；随后该测试菜及其 MenuDish/Menu 关联、静态文件（临时新增的）删净。
- **AC7 teardown**：恢复七表基线 Dish=48/Menu=13/MenuDish=42/Ingredient=79/Plan=54/Event=93/CookLog=6；**29 道存量菜迁移数据（REL）不动**；三端口=0、PG 停、CDP 9222 存活；报告落盘 evidence/T-P09-dev-2026-09-11.md。
- **AC8 独占 PG，不并行**。

## 边界

- 允许：packages/shared/src/schemas/dish.ts（仅 imageUrl 校验 + 版本注释）、packages/shared 既有测试文件（如有需补用例）、tools/content-pipeline/test/import.spec.ts、tools/content-pipeline/test/fetch2dish.spec.ts、tools/content-pipeline/fetch2dish.mjs（仅 AC4 等号拦截）、临时验证脚本（.workflow-verify 下）。
- 禁改：prisma/**、apps/api/src、apps/h5/src、xhs-fetch.mjs / batch-fetch.mjs / migrate-imageurl-relative.mjs、两个产品文档（PRODUCT-CONFIRMATION.md / PRODUCT-DECISIONS.md）、e-final.html / design-spec.md、packages/shared 其他文件。
- 沙箱纪律：>30s Start-Process 脱离+轮询；退出码 $LASTEXITCODE；临时脚本 .cjs；**pg_ctl 直跑必挂终端**（Start-Process cmd /c "pg_ctl -D <datadir> -l <logfile> start" 脱离，或挂住后 StopCommand 另开终端）；node 脚本 `require('pg')` 用绝对路径 `require('d:/codex/family-menu/apps/api/node_modules/pg')`；MenuDish 表无 id 列；lockedMenuId=`pipeline-menu-02` 是种子菜单严禁删；cookie 实名 `access_token`（domain 127.0.0.1）；CDP 9222 复用禁杀。
- 便携 PG 端口 54329；测试基线：管线 353/353（T-P08 后）、根 353/353；AC12 性能测试并行偶发 flaky，串行稳定。

## 异常升级

缺信息或卡外问题 → 停手写进完成报告（evidence/T-P09-dev-2026-09-11.md），不顺手修改。
