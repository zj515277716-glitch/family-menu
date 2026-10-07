# T-A4 口令入库清理：12 个跟踪文件去口令 + git 历史评估 + 防复发检查

> 立项依据：T-A2 独立审查发现（evidence/T-A2-review-2026-10-02.md 待裁决项 2）+ 红线「口令不入库」。2026-10-03 已核查：入库值（本机开发口令，明文已脱敏，原值见 git 历史）= 本机现有开发口令，与生产 ACCESS_TOKEN **不同**（生产已轮换），家人站点未因此被直接攻破；但口令入库事实成立。级别：文件清理 L1；**git 历史重写属 L3，未授权不执行**。

## 涉及文件（12 个，全部已跟踪，2026-10-03 git ls-files 实证）

- tests/tp01-mustuse-regression.cjs、tests/tp03-cors-regression.cjs、tests/tp12-feedback-null.cjs（用该值打本地 API）
- tools/.h5-verify.mjs、tools/.e2e-smoke.mjs
- evidence/TP-01-2026-09-04.md、evidence/T-P05/T-P08/T-P09/T-P10-verify-2026-09-11.md（5 份）
- docs/workflow/tasks/T-P03-devAPI-CORS处理.md
- 开发日志.md

## AC（逐条 [✓]/[✗] 自检）

- AC1 上述文件中口令值清零：代码类改为从环境变量读（测试未设变量时明确 skip 并打印原因，不静默失败）；记录类改为脱敏表述（如「口令见本机 .env」）。
- AC2 全仓 grep 旧口令值 0 命中；`pnpm test`、`pnpm test:taboo`、lint、全包 tsc 全绿（tests/*.cjs 改动后回归不塌）。
- AC3 git 历史清理评估报告（≤1 页）：重写（filter-repo/BFG）影响面=全部提交哈希+证据引用链，成本/风险/收益三列对比，给建议方案，报主控转产品负责人裁决；**未裁决前只清理 HEAD，不动历史**。
- AC4 防复发：新增轻量检查（如 `pnpm check:secrets`：grep 已知口令模式/高熵串入跟踪文件），接入与 `check:safety` 同级的门禁思路（A1 卡落定后合并口径）。
- AC5 证据 evidence/T-A4-dev-2026-10-0x.md（≤1 页）。

## 边界约束

- 允许改：上述 12 文件、tests/ 与 tools/ 的读取方式、root package.json（加 check:secrets script，不加依赖）。
- 禁改：引擎/契约/业务逻辑；禁重写 git 历史（L3 待批）；禁把新口令写入任何文件。
- 本地开发口令与生产口令必须分离的策略写进 CURRENT.md 或流程文档（一行足够）。

## 终态（主控补登）

待派发执行后补登。
