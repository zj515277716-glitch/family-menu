# T-P07 API 菜单快照投影亮图链路 + orderBy 挂账清理（含 R-1/R-2/R-4）

> 状态：**待用户审核**（fm-dev 交付 8/8 AC（4 文件 +38/-5 + 新增 projection-order.spec 175 行，shared/prisma 零改动、零新增依赖）→ fm-reviewer 复审**通过**（R-10 升级中风险挂账：imageUrl 硬编码 127.0.0.1 前缀+前端无 onError 兜底，**公网部署 API 前必须处理**；建议-1 skip 假绿风险/建议-2 types 旧注释漂移；orderBy 四点口径统一、z.unknown 透传存证、R-1 修复无竞态）→ fm-verify 验收**通过**（V1~V9 全 PASS：投影 10/10+真机亮图 natural 1080×1440、降级/注水/orderBy 乱序三面读出/R-1 失败路径回 idle/351/351/teardown 七表逐项一致 CookLog=6）→ 主控收敛完毕。git 提交与否由产品负责人裁决）

## 背景

T-P06 验收实证：API 响应不投影 imageUrl/sourceUrl/sourceSite，dish 详情页大图区永远走降级占位（前端已零改动就绪，types 已含可选字段）。同时清理三个挂账：R-4（mappers.toMenuView dishes 无 orderBy）、R-2（loadMenuViews/hydrateLockedMenu 无 orderBy，T-P04 复审挂账）、R-1（dish 页 useDidShow catch 卡 loading 态）。

**关键设计输入（T-P06 卡外发现）**：前端 candidates 页锁定时用 **recommend 响应快照**注 store（candidates/index.tsx L57），不读 lock 响应——**投影必须覆盖 recommend 生成 candidates 快照的路径**，仅改 lock 水合不会亮图。注意 candidates/lockedMenu 均为 DB Json 快照：旧 Plan 行快照无新字段属预期（用户重新推荐即得新快照），不做迁移回填。

## AC

- **AC1 Dish 视图投影**：apps/api mappers/相关路径为 dish 投影补 imageUrl/sourceUrl/sourceSite 三字段（Prisma select 与映射层同步）；覆盖 recommend 候选快照生成 + lockedMenu（MenuDish join）两条链路，前端锁定后首屏即可亮图（真机验证）。
- **AC2 契约边界**：若需动 packages/shared（zod 追加**可选**字段），仅限非破坏性追加并在报告中单列理由（用户已批准本卡含契约扩展，T-C01 三字段已是既有事实，属投影对齐非语义变更）；**禁止**修改字段语义/必填性/删除。
- **AC3 orderBy 挂账（R-2/R-4）**：loadMenuViews、hydrateLockedMenu、mappers.toMenuView 的 dishes 关联查询补 `orderBy: { sort: 'asc' }`；与 listPlans 既有 orderBy 口径统一；补单测断言乱序写入后读出仍按 sort 序。
- **AC4 R-1 修复**：apps/h5 dish 页 useDidShow 的 catch：当前态为 loading 时回退 idle（不伪造已提交）；最小 diff。
- **AC5 测试**：apps/api 单测/回归全绿（含新增投影断言与 orderBy 断言）；h5 typecheck 0 + build EXIT=0。
- **AC6 真机亮图验证**：起 PG/API/H5，真实浏览器走 recommend→candidates→lock→dish 详情，**不注入不改 DB**，大图区渲染真实 imageUrl（375×340 + 图上叠信息），截图留证；FETCHED DRAFT 菜（有图）与 PUBLISHED 菜（无图字段则降级）双态各验一次。
- **AC7 teardown**：临时 Plan/Event 删净恢复 Plan=54/Event=93/Menu=13/MenuDish=42/Dish=48/Ingredient=79 逐项一致；三端口=0、PG 停（54329=0）、CDP 存活；报告落盘 evidence/T-P07-dev-2026-09-10.md。
- **AC8 完成报告强制落盘 evidence/**（R-1 教训根治条款）。

## 边界

- 允许：apps/api/src/**（mappers/planService/recommend 链路及测试）、packages/shared（仅可选字段追加，单列）、apps/h5/src/pages/dish/index.tsx（仅 R-1 catch 修复）。
- 禁改：apps/h5 其他文件、prisma schema/migrations、采集管线、两个产品文档、e-final/design-spec。
- **单独会话使用 PG，不与其他任务并行**（T-C05 教训）。
- 沙箱纪律：>30s Start-Process 脱离+轮询；退出码 $LASTEXITCODE；临时脚本 .cjs；PG 启动必须带 -l 且不接管道。

## 异常升级

缺信息或卡外问题 → 停手写进完成报告。
