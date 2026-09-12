# T-P12 GET feedback 无反馈 404→200+null（挂账⑤，V5 豁免根因收敛）

> 状态：**已完成**（2026-09-12 fm-dev 实现 7/7 AC 全 [✓]，报告见 [evidence/T-P12-dev-2026-09-12.md](../../../evidence/T-P12-dev-2026-09-12.md)；fm-reviewer 复审**通过**（0 阻塞/0 条件/4 建议 S-1~S-4，报告见 [evidence/T-P12-review-2026-09-12.md](../../../evidence/T-P12-review-2026-09-12.md)）；fm-verify 验收 **PASS 7/7**（报告见 [evidence/T-P12-verify-2026-09-12.md](../../../evidence/T-P12-verify-2026-09-12.md)）；按用户总授权「卡完成即提交」随卡提交。立项依据：用户 2026-09-11 总授权「按挂账队列依次执行」，挂账队列⑤）
> 角色链：fm-dev 实现 → fm-reviewer 复审 → fm-verify 验收 → 主控提交（按总授权「卡完成即提交」）

## 2026-09-12 技术审查补登

- **总判定：通过**（7 审查点全过：契约 v0.9 语义/账本单一入口、API 三态与错误映射链、contract.spec 三层断言、H5 仅注释、tp12 脚本真实 HTTP+PG 直查+绝对基线断言、边界合规、数字连续性核对）。
- **S 裁量**：S-1（diff/数字复跑）→ verify 复跑补证；S-2（清理脚本日志留存）→ verify 复跑留存；S-3（**挂账编号勘误**：dev 报告称 AC12 flaky 为「⑧」，权威口径以 CURRENT.md 为准——**⑥=AC12 flaky、⑧=imageUrl regex 收紧**，历史报告不改）→ 主控裁量记录在案；S-4（feedback/history 两页 h5 注释过时）→ 挂账随 ⑥⑦ 卡顺带，不单开卡。
- **C 项：无。** 授权链完整，无需回溯批准。

## 背景

T-P04 验收第 7 轮唯一 FAIL **V5**：GET /api/plans/:id/feedback 在「plan 存在但无反馈」时返回 404，浏览器对 404 响应有**原生网络错误 console 打印**（应用代码无法抑制），污染验收 consoleErrors 断言；当轮主控裁定豁免并挂账⑤「404→200+null」。

现状代码事实（主控 2026-09-12 逐处核实）：

- **API** [planService.ts](../../../apps/api/src/services/planService.ts) `getFeedback`（L864-876）：plan 不存在 → `NotFoundError`；plan 存在但无 COOKED/NOT_COOKED 事件 → `NotFoundError('has no feedback')` → routes 映射 404。JSDoc L862「无反馈 -> 404」需同步。
- **路由** [plans.ts](../../../apps/api/src/routes/plans.ts) L142-150：`FeedbackResponseSchema.parse(feedback)` 直接解析 service 返回值（null 会 ZodError→500，需显式处理）。
- **契约** [api.ts](../../../packages/shared/src/schemas/api.ts) L166-179 `FeedbackResponseSchema`（v0.6）：JSDoc 记「无反馈时返回 404」需同步；头部账本现至 v0.8。
- **H5** [client.ts](../../../apps/h5/src/api/client.ts) L151-153：`getFeedback` 已用 `notFoundAsNull=true` 把 404 转 null（返回 `FeedbackResponse | null`）——**H5 逻辑可零行为改动**，仅 L151 注释同步；feedback 页/history 页/dish 页消费 null 的分支均已存在。
- **测试** [contract.spec.ts](../../../apps/api/test/contract.spec.ts) L749-786+：GET feedback 三用例（有反馈 200 / 旧事件 optional 缺省 / **无反馈 404——第三个需改写**）；[schemas.spec.ts](../../../packages/shared/test/schemas.spec.ts)（T-P09 后 63 用例）。

## 目标（方案）

契约 **v0.9**：GET /api/plans/:id/feedback 语义修订——

- 「plan 存在但无反馈」→ **200 + JSON null**（响应体就是 `null` 字面量，非空对象/空串）；
- 「plan 不存在」→ **404 不变**（404 语义收敛为「资源不存在」）；
- 「有反馈」→ 200 报文形状零变化。

实现要点：

- `planService.getFeedback` 返回类型改 `Promise<FeedbackResponse | null>`：无反馈事件 `return null`（不再 throw）；plan 不存在仍 throw NotFoundError。
- routes 层：null 原样透传（Fastify 200 + body null）；有反馈仍走 `FeedbackResponseSchema.parse`。
- 契约同步：api.ts 头部账本加 **v0.9** 行 + `FeedbackResponseSchema` JSDoc 更新（2026-09-12 T-P11 刚收敛的账本口径，勿再分裂）。
- H5：`client.ts` `getFeedback` 行为零变化（`notFoundAsNull` 兜底保留——plan 不存在时仍转 null 防崩溃），仅注释更新；**其余 h5 文件禁改**。
- 真实环境回归：新增 `tests/tp12-feedback-null.cjs`（真实 HTTP + PG 直查三态，参照 tests/tp01-mustuse-regression.cjs / tp03-cors-regression.cjs 风格）：无反馈 200+null / 有反馈 200+shape / 坏 id 404；自建测试数据脚本内自清。

## AC（完成报告逐条 [✓]/[✗] 自检）

- **AC1 契约**：api.ts 头部账本 v0.9 行 + `FeedbackResponseSchema` JSDoc 与实际行为一致；`pnpm --filter @family-menu/shared build` EXIT=0（改 src 后必须先重建 dist 再跑一切回归）；schemas.spec 受影响用例同步（不受影响则报告说明）。
- **AC2 API 三态**：无反馈 → 200+null；plan 不存在 → 404；有反馈 → 200 报文形状不变——真实环境证据（非 Mock）。
- **AC3 contract.spec**：原「无反馈 404」用例改写为 200+null；新增「plan 不存在 404」用例；apps/api 测试全绿。
- **AC4 H5 零行为变更**：仅 client.ts 注释级改动；h5 typecheck 0 错。
- **AC5 回归**：根 vitest 全绿（基线 389，允许净增新增用例数）+ taboo 89/89 + tp01 54 PASS/0 FAIL + 新增 tp12 脚本全 PASS。
- **AC6 teardown**：tp12 自建 Plan/Event 自清，七表回基线 Dish=48/Menu=13/MenuDish=42/Ingredient=79/Plan=54/Event=93/CookLog=6，REL=29 不动；PG 用完 stop（54329 端口=0）。
- **AC7 报告落盘**：evidence/T-P12-dev-2026-09-12.md（R-1 纪律，含逐 AC 自检 + 测试命令/退出码/数字结果）。

## 边界

- **允许改动**：packages/shared/src/schemas/api.ts、packages/shared/test/schemas.spec.ts（如需）、apps/api/src/services/planService.ts、apps/api/src/routes/plans.ts、apps/api/test/contract.spec.ts、apps/h5/src/api/client.ts（仅注释）、tests/tp12-feedback-null.cjs（新增）、本卡状态、evidence/T-P12-dev-*.md（新增）。
- **禁改**：packages/engine/**、apps/h5 其余文件、prisma（schema/seed/migrations）、packages/shared 其余文件、PRODUCT-CONFIRMATION.md 与 e-final.html/design-spec.md、CDP 浏览器。
- 运行时禁 LLM API（DEC-006）；禁引入 Redis/MQ/微服务/K8s（DEC-008）；新增依赖预期 0，如有须报告理由。
- 契约方向（404→200+null）已经用户挂账队列授权；实现中遇**方案级分歧**（如响应包裹结构争议、null 语义争议）→ 停手写完成报告报主控，不自行变通。

## 异常升级

缺信息或卡外问题 → 停手写进完成报告（含现场证据路径），交主控收敛，不脑补。

## 环境口径

- PG：`.pg/bin/pg_ctl.exe start -D d:/codex/family-menu/.pg/data -o "-p 54329"`，用完 `stop -m fast`。
- cookie 实名 `access_token`（小写下划线）；`ACCESS_TOKEN` 是环境变量名。
- API dev server 启动/鉴权方式参照 tests/tp01-mustuse-regression.cjs 头部与既有 dev 报告。
