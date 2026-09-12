# T-P13 挂账⑥⑦收口：根测试固化串行 + NutUI 警告评估 + S-4 h5 注释同步

> 状态：**已完成**（2026-09-12 fm-dev 实现 7/7 AC 全 [✓]，报告见 [evidence/T-P13-dev-2026-09-12.md](../../../evidence/T-P13-dev-2026-09-12.md)；fm-reviewer 复审**通过**（0 阻塞/2 建议 S-1~S-2，报告见 [evidence/T-P13-review-2026-09-12.md](../../../evidence/T-P13-review-2026-09-12.md)）；fm-verify 验收 **PASS 7/7**（报告见 [evidence/T-P13-verify-2026-09-12.md](../../../evidence/T-P13-verify-2026-09-12.md)）；按用户总授权「卡完成即提交」随卡提交。立项依据：用户 2026-09-11 总授权「按挂账队列依次执行」，挂账⑥⑦ + T-P12 reviewer S-4 顺带）
> 角色链：fm-dev 实现 → fm-reviewer 复审 → fm-verify 验收 → 主控提交（按总授权「卡完成即提交」）

## 2026-09-12 技术审查补登

- **总判定：通过**（0 阻塞/2 建议）：⑥ 标志有效性获 vitest@4.1.10 CLI 源码实证 + 行为级双证；⑦ 根因获 postcss-calc@9.0.1 源码实证（warn 后保留原值）+ 构建产物 23 处计数精确吻合，选项 A 推荐成立、挂账⑦以评估报告收口；S-4 两处注释与契约 v0.9 三态逐项一致、旧语义零残留、措辞维持现状。
- **S 裁量**：S-1（dev 报告警告存档路径少写 `dist\` 一层，实际在 `apps/h5/dist/css/`）→ dev 报告原文不改，勘误记录于 review 证据与本补登节；S-2（数字与 numstat 独立复跑）→ 转 verify 复跑清单。
- **C 项：无。**

## 背景（主控已核实的事实）

- **⑥ AC12 并行 flaky**：[score.spec.ts L771-794](../../../packages/engine/test/score.spec.ts#L771-L794) 千套菜单 recommend <50ms（coverage 模式经 `VITEST_COVERAGE=1` 放宽 200ms，机制既有）。默认并行 vitest 下文件级并行致 CPU 争抢：本机 4/4 次超阈（55.70~61.88ms > 50ms，T-P12 dev 披露）；单文件与显式 `--no-file-parallelism` 串行均稳定绿（390/390）。**T-P12 verify 披露：根 package.json `test` script 实为 `vitest run` 无内建串行参数**——固化落点在此。
- **⑦ NutUI postcss-calc 构建警告**：库既有警告，挂账要求评估处置口径；此前未留警告原文存档。
- **S-4（T-P12 reviewer）**：T-P12 契约 v0.9 落地（无反馈→200+null，plan 不存在→404）后两处 h5 注释仍描述旧 404 语义——[feedback/index.tsx L73](../../../apps/h5/src/pages/feedback/index.tsx#L73)、[history/index.tsx L71](../../../apps/h5/src/pages/history/index.tsx#L71)。

## 目标（方案）

1. **⑥ 固化串行**：根 package.json `test` script 改为 `vitest run --no-file-parallelism`。`test:taboo` 实证一直绿**不动**；`verify` script 经 `pnpm test` 自动继承无需改。
2. **⑦ 评估**：复现 h5 构建警告原文并存档 → 评估处置选项（接受并记录为已知噪音 / 升级 NutUI / 构建侧过滤），给出推荐结论与理由；**除非评估结论明确要求，本卡不做任何依赖变更**（升级 NutUI 须另走批准）。
3. **S-4**：两处注释同步 v0.9 语义（纯注释，零行为）。

## AC（完成报告逐条 [✓]/[✗] 自检）

1. [ ] 根 package.json `test` script 为 `vitest run --no-file-parallelism`；`pnpm test` 实际串行执行且 **390/390** 绿。
2. [ ] 默认 `pnpm test` 连跑 **2 次**全绿（AC12 不再超阈，留存两次数字）。
3. [ ] `pnpm test:taboo` **89/89** 不回归。
4. [ ] ⑦ 警告原文复现存档于 dev 报告；评估结论落盘（推荐选项 + 理由 + 是否需后续卡/批准）。
5. [ ] 两处 h5 注释与契约 v0.9 语义一致；`pnpm --filter @family-menu/h5 typecheck` 0 错。
6. [ ] 代码 diff 恰为 3 文件：package.json（test script 一行）+ 两处 h5 注释；⑦ 若评估为零代码改动则总 diff 不超 3 文件，无任何其他业务改动。
7. [ ] dev 报告落盘 `evidence/T-P13-dev-2026-09-12.md`。

## 边界约束

- 允许改：`package.json`、`apps/h5/src/pages/feedback/index.tsx`、`apps/h5/src/pages/history/index.tsx`（仅注释行）。
- 禁改：packages/shared、packages/engine、apps/api、prisma、vitest.config.ts（除非有充分理由并先报主控）、其他 h5 文件、产品文档。
- ⑦ 不引入新依赖、不升级 NutUI；如评估结论要求变更依赖，停下报主控。
- 测试真实执行（真实命令+退出码+数字），禁止 Mock 冒充；PG 用后即停（本卡理论上无需 PG，如需再启）。

## 环境口径

- 便携 PG（如需）：`.pg/bin/pg_ctl.exe start -D d:/codex/family-menu/.pg/data -o "-p 54329"`；停止 `... stop -D ... -m fast`。
- 串行样例：`pnpm test`（固化后即串行）；单文件复现 flaky 对照可用 `vitest run`（不加参）。

## 异常升级路径

- `--no-file-parallelism` 写入 package.json script 后与 CLI 直跑行为不一致（不生效）→ 停下报主控，勿自行换方案。
- ⑦ 评估若牵连其他构建问题 → 写进完成报告，不扩卡。
