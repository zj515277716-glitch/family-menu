# DEPLOY-04 独立产品验收报告（fm-verify）

- 日期：2026-09-12（实际执行窗口 2026-09-12 23:39 ~ 2026-09-13 00:08 Asia/Shanghai，跨零点如实声明）
- 角色：fm-verify（产品验收，独立于开发/技术审查；不信任 dev/reviewer 自检数字，全部命令真实执行、独立取证，无任何 Mock）
- 验收对象：DEPLOY-04（AC12 门禁噪声处置实施，C2b+C3 组合，用户已拍板）
- **待审版本**：分支 `feat/tp-06-menu-expansion` @ HEAD `cec8143` + 工作树恰 2 文件未提交改动（根 package.json、packages/engine/test/score.spec.ts）。本报告 V1~V7 全部针对该版本。
- 验收依据（权威顺序）：[DEPLOY-04 任务卡归档+主控裁决 6 条](./DEPLOY-04-task-2026-09-12.md) → [DEPLOY-04 dev 报告](./DEPLOY-04-dev-2026-09-12.md) → [AC12-PERF 评估报告](./AC12-PERF-dev-2026-09-12.md)（C2b/C3 权威语义来源）→ [DEPLOY-03 verify 报告](./DEPLOY-03-verify-2026-09-12.md)（V7 方法沿用）。
- 验收环境：Windows + PowerShell 5.1（RunCommand 环境）；本机 PG 17.5 @ 127.0.0.1:54329 运行中（V7 查询实证连通）；vitest 4.1.10；pnpm script-shell 默认（cmd）。
- **结论速览：PASS**（V1~V7 全 [✓]，零失败项；主控裁决第 1/2 条按裁决口径收编；reviewer 移交 S-1/C-2/C-1 三项全部闭环）

---

## ① 环境声明

| 核查项 | 结果 | 依据 |
|---|---|---|
| 待审版本 | `cec8143` + 工作树恰 2 文件未提交改动（未 commit） | V1 `git log -1` / `git status --porcelain` |
| 本机 PG | 127.0.0.1:54329 运行中，trust 认证，family_menu 库 | V7 七表查询成功（EXIT=0） |
| 测试基线 | 全仓 391/391 0 skipped（15 文件）/ taboo 89/89 / engine 单文件 51/51 | V2 / V3 / V5 实测 |
| 红线遵守 | 未删除 `$env:TEMP\fm-rds.env`、未停止本地 PG、未触碰任何 teardown 组合命令 | 本次验收全程零此类操作 |
| 写入范围 | 仅 `.workflow-verify/deploy-04/verify-*` 证据文件（7 件）+ 本报告；业务代码/配置零改动；git 零写操作 | `git status` 复核（V1 输出中 verify 证据均在 gitignored 目录，不入 untracked 清单） |
| 已知现象 | PowerShell 5.1 将 pnpm/git 的 stderr 包装为 NativeCommandError（dev 报告已披露同现象）——**按实际退出码与关键字判定，非失败** | V2/V4 原始输出在案 |

---

## ② 验收项表（V1~V7）

### V1 git 层核验（闭环 review S-1）—— [✓]

- **操作**：`git log -1 --oneline`；`git branch --show-current`；`git status --porcelain`；`git diff --stat`；`git diff --name-only -- packages/shared`；`git diff`（全文落盘）；`git diff --numstat`；Read score.spec.ts L771-800 现文比对。
- **预期**（任务卡 + 主控裁决 S-1）：HEAD=cec8143；已跟踪修改恰 2 文件；`git diff --stat` 恰 package.json +1 行、score.spec.ts 2 行改动（4 处增删）；packages/shared 零输出；diff 内容与评估报告 §4 预览逐项比对一致。
- **实际**：
  - `git log -1`：**HEAD=`cec8143`**（DEPLOY-03 提交），分支 **feat/tp-06-menu-expansion** ✓
  - `git status --porcelain`：已跟踪修改**恰 2 文件**（` M package.json`、` M packages/engine/test/score.spec.ts`）；untracked 含与本卡相关的 3 件 evidence **全部在位**：`evidence/AC12-PERF-dev-2026-09-12.md`、`evidence/DEPLOY-04-dev-2026-09-12.md`、`evidence/DEPLOY-04-task-2026-09-12.md`；其余 untracked（.pai/、docs/design/、docs/ui-redesign/、tests/engine-perf.mjs、tests/step08-deploy-validate.cjs、tools/*、复盘报告.md 等）均为历史遗留，与 DEPLOY-01 报告 §5 清单同源，无业务文件混入。
  - `git diff --stat`（原样）：

    ```text
     package.json                       | 1 +
     packages/engine/test/score.spec.ts | 4 ++--
     2 files changed, 3 insertions(+), 2 deletions(-)
    ```

  - `git diff --name-only -- packages/shared`：**零输出** ✓
  - `git diff --numstat`：`1 0  package.json`、`2 2  packages/engine/test/score.spec.ts`（与 dev 报告 §1「3 insertions(+), 2 deletions(-)」一致）
  - **diff 全文与评估报告 §4 预览逐项比对结论**：
    1. **test:gate 行**：`+    "test:gate": "pnpm test || pnpm test || pnpm test",` —— 与任务卡改动 2 定义及评估卡 §4 C2b 预览（L199-206）**逐字符一致**；现有 `"test": "vitest run --no-file-parallelism"` 行一字未动 ✓
    2. **7 次循环**：`-    for (let i = 0; i < 3; i++) {` → `+    for (let i = 0; i < 7; i++) {` —— 与评估卡 §4 C3 预览（L214-222）**逐字符一致** ✓
    3. **注释行 L782**：`// 多次运行取最小值（…）` → `// 多次（7 次）运行取最小值（…）` —— 与**任务卡原文明确定义**一致（主控裁决 S-2 已勘误：任务卡含注释行、评估预览未含，非越界）✓
    4. **threshold 未动**：diff 中无 L790-792 任何改动；Read 现文实证 [score.spec.ts L792](file:///d:/codex/family-menu/packages/engine/test/score.spec.ts#L792) 仍为 `const threshold = process.env.VITEST_COVERAGE === '1' ? 200 : 50;`、L793 `expect(minElapsed).toBeLessThan(threshold);` **一字未动** ✓
  - LF/CRLF warning 与 NativeCommandError 系 PowerShell 5.1 stderr 包装现象，STAT_EXIT=0 / DIFF_EXIT=0 为准。
- **证据**：[.workflow-verify/deploy-04/verify-git-diff-full.txt](file:///d:/codex/family-menu/.workflow-verify/deploy-04/verify-git-diff-full.txt)（diff 全文）
- **覆盖边界**：核验范围 = 工作树相对 HEAD 的 diff；cec8143 及之前历史提交内容未逐一复核（以提交消息与既有证据为据）；untracked 不要求为零（按验收指令），仅核对与本卡相关的 3 件 evidence 在位。

### V2 复跑 `pnpm test:gate` 恰 1 次（闭环 AC3 独立复核）—— [✓]

- **操作**（根目录，恰执行 1 次）：`pnpm test:gate 2>&1 | Tee-Object -FilePath .workflow-verify\deploy-04\verify-testgate.log`，随后对落盘日志 Grep 汇总行计数。
- **判定标准**（按主控裁决第 1 条短路语义）：EXIT=0；恰出现 1 次 vitest 汇总（15 passed / 391 passed / 0 skipped）；不应出现第 2 次 vitest 运行。
- **实际**：
  - **VERIFY_TESTGATE_EXIT=0** ✓
  - 落盘日志中 vitest 汇总**恰 1 次**：L138 `Test Files 15 passed (15)`、L139 `Tests 391 passed (391)`；全文对 `skipped` / `failed` 的 Grep 均 **0 匹配**（0 skipped、无失败）✓
  - **短路成功**：日志中不存在第 2 次 vitest 运行痕迹（「Test Files」汇总行全文仅 1 处）✓
  - 本跑 Duration **5.40s**（transform 447ms / import 2.42s / tests 1.02s）；AC12 用例 355ms 绿。
  - 与 dev 观测（15.20s）的墙钟差异说明：同命令不同时段实测值，属文件系统缓存/背景负载波动，非 AC 判定指标（AC3 判据为 EXIT 与计数，见卡外发现 1）。
- **证据**：[.workflow-verify/deploy-04/verify-testgate.log](file:///d:/codex/family-menu/.workflow-verify/deploy-04/verify-testgate.log)（23,548 字节完整输出）
- **覆盖边界**：按裁决口径「首轮绿即 EXIT=0 停止，恰 1 跑 391/391」为设计内正确行为；「失败场景下 3 跑重试」路径由 V4 四组受控实验独立证明，不在全仓门禁上人为制造失败（不污染证据环境）。

### V3 复跑 `pnpm test:taboo` 1 次 —— [✓]

- **操作**（根目录，1 次）：`pnpm test:taboo 2>&1 | Tee-Object -FilePath .workflow-verify\deploy-04\verify-taboo.log`。
- **预期**（任务卡 AC4）：EXIT=0，89/89。
- **实际**：**VERIFY_TABOO_EXIT=0**；`Test Files 4 passed (4)`；**`Tests 89 passed (89)`**（与 taboo 89/89 基线一致）；Duration 734ms；其中 score.spec.ts 51 用例含 AC12 327ms 绿。
- **证据**：[.workflow-verify/deploy-04/verify-taboo.log](file:///d:/codex/family-menu/.workflow-verify/deploy-04/verify-taboo.log)
- **覆盖边界**：1 次实跑；taboo 集为本卡改动无关集，仅验证不受影响。

### V4 or-check T1-T4 四组实验独立复跑（闭环 review C-2，本次验收最关键项）—— [✓]

- **操作**：确认 dev 留下的 [.workflow-verify/deploy-04/or-check/package.json](file:///d:/codex/family-menu/.workflow-verify/deploy-04/or-check/package.json) 4 个 script 与 dev 报告 §4.2 表格逐字一致（未做任何修改、未安装任何依赖、目录内无 node_modules）；在该目录下**逐个**执行 4 个 `pnpm run <script>`，每组输出 Tee-Object 落盘并记录真实 `$LASTEXITCODE`。
- **预期**（dev 只留了脚本、输出从未落盘——本项为输出首次独立落盘取证）：

| 实验 | script 语义 | 期望 |
|---|---|---|
| T1 chain-fail-then-continue | `node -e "process.exit(1)" \|\| echo FALLBACK_RAN_ON_FAILURE` | 输出含 FALLBACK_RAN_ON_FAILURE 且 EXIT=0 |
| T2 chain-ok-short-circuit | `node -e "process.exit(0)" \|\| echo SHOULD_NOT_PRINT` | 不出现 SHOULD_NOT_PRINT 执行输出且 EXIT=0 |
| T3 chain3-fail-fail-then-ok | 两败 + `echo THIRD_RAN` | 输出含 THIRD_RAN 且 EXIT=0 |
| T4 chain3-all-ok | 首成 + 两败段 | 无 echo 输出且 EXIT=0 |

- **实际**（4/4 全部符合预期）：

| 实验 | 关键观测 | 退出码 | 结论 |
|---|---|---|---|
| T1 | `FALLBACK_RAN_ON_FAILURE` 作为执行输出出现 | VERIFY_T1_EXIT=**0** | 失败→继续 ✓ |
| T2 | SHOULD_NOT_PRINT **未作为执行输出出现**（日志中该字样仅存在于 pnpm 对 script 命令行的 stderr 回显 `$ node -e "process.exit(0)" || echo SHOULD_NOT_PRINT`，echo 分支未执行） | VERIFY_T2_EXIT=**0** | 成功→短路 ✓ |
| T3 | `THIRD_RAN` 作为执行输出出现（前两败第三跑执行且整体绿） | VERIFY_T3_EXIT=**0** | 两败三续 ✓ |
| T4 | 无任何 echo 执行输出（若第 2/3 段被执行会 exit 1 致整体红） | VERIFY_T4_EXIT=**0** | 首成全短路 ✓ |

  - 4 组均出现 NativeCommandError 包装（pnpm 将 script 命令行回显到 stderr，被 PowerShell 5.1 `2>&1` 包装）——按验收指令「判定以 $LASTEXITCODE 与关键字输出为准」，如实记录不判失败。
  - **四组合并结论**：`||` 在本机 pnpm 真实执行链下「**失败才重试、任一通过即通过、成功即短路**」语义完全生效——即主控裁决第 1 条采纳的 C2b 权威语义（best-of-3 OR 链，非多数决）。C-2 闭环。
- **证据**：[verify-t1.log](file:///d:/codex/family-menu/.workflow-verify/deploy-04/verify-t1.log) / [verify-t2.log](file:///d:/codex/family-menu/.workflow-verify/deploy-04/verify-t2.log) / [verify-t3.log](file:///d:/codex/family-menu/.workflow-verify/deploy-04/verify-t3.log) / [verify-t4.log](file:///d:/codex/family-menu/.workflow-verify/deploy-04/verify-t4.log)
- **覆盖边界**：实验证明 `||` 语义本身；「pnpm test 具体失败后重跑全仓」的端到端场景未人为构造（避免污染 DB/证据环境），以 T1/T3 的失败分支继续性 + T2/T4 的成功分支短路性合并推断，与 dev §4.2 方法同构且输出首次双向落盘。

### V5 engine 单文件 spec 采样（闭环 AC12 修复后行为）—— [✓]

- **操作**（仓库根，1 次）：`pnpm exec vitest run packages/engine/test/score.spec.ts --no-file-parallelism 2>&1 | Tee-Object -FilePath .workflow-verify\deploy-04\verify-score-spec.log`。
- **预期**：51/51 EXIT=0；若 AC12 偶发失败（min-of-7 残余假红率预期 1-4%）→ 记录实测耗时后补跑恰 1 次。
- **实际**：**VERIFY_SCORE_EXIT=0**；`Test Files 1 passed (1)`；**`Tests 51 passed (51)`**；AC12 用例 **335ms** 绿（min-of-7 后 it 级耗时，与 dev §3 的 341-405ms 同带）；Duration 662ms。**AC12 未复现失败，补跑条款未触发**（未动用任何静默重试）。
- **证据**：[.workflow-verify/deploy-04/verify-score-spec.log](file:///d:/codex/family-menu/.workflow-verify/deploy-04/verify-score-spec.log)
- **覆盖边界**：本 verify 独立采样 1 次（按验收指令 ≥1 次）；10 次采样轨道为 dev 报告 §3 已完成项（10/10 exit=0 FAIL=0，原始证据 run-01~10.log + summary.tsv 在案），本项不重复 10 次采样，仅独立抽样佐证。

### V6 C-1 披露闭环确认（纯文件核验）—— [✓]

- **操作**：Read [evidence/DEPLOY-04-dev-2026-09-12.md](./DEPLOY-04-dev-2026-09-12.md) §8（L139-145）；Read [evidence/AC12-PERF-dev-2026-09-12.md](./AC12-PERF-dev-2026-09-12.md) L210。
- **预期**（主控裁决第 2 条）：dev 报告 §8 三要素齐全；AC12-PERF L210 附近确有权威记录原文。
- **实际**（三要素逐项核对）：
  1. **漏报风险陈述**（dev 报告 L143）：「**持续但轻微的回归**（如 45→52ms 稳定劣化）会被 OR 链重试「救活」：该类回归三跑全过，门禁不报红，真实回归被掩盖；仅 **>55-60ms（3 跑全超）的重大回归**可被检出」——在位 ✓
  2. **权威记录指向**（dev 报告 L144）：明示指向 `evidence/AC12-PERF-dev-2026-09-12.md L210`；实测 L210 原文：「**漏报**：**危险点**——持续但轻微的回归（如 45→52ms 稳定劣化）会被重试"救活"，真实回归被掩盖；重大回归（>55–60ms，即 3 跑全超）仍能被检出」——**权威原文在位且转述一致** ✓
  3. **使用约定**（dev 报告 L145）：「`test:gate` 为**批跑环境噪声兜底入口**；`pnpm test` 仍是**单跑权威门禁**，不得以 `test:gate` 替代 `test` 作唯一门禁；未来 CI 若引入 `test:gate` 须重估该取舍」——在位 ✓
- **覆盖边界**：纯文本核验；「45→52ms 被救活 / >55-60ms 可检出」的数值边界属评估卡既有实测结论的转述，本卡不重新实验验证（超卡边界）。

### V7 teardown 七表基线核对 —— [✓]

- **操作**（V2/V3/V5 全部完成后执行）：沿用 DEPLOY-03 verify 报告方法——stdin 管道向 node 传入只读查询脚本（cwd=apps/api 以解析 pg 依赖），对本机 PG 54329/family_menu 逐表 `SELECT COUNT(*)`；两次查询均只读、未落盘任何临时脚本（脚本经 stdin 传入，未写入仓库任何位置）。
- **预期**（环境事实 + DEPLOY-03/T-P11 以来基线）：Dish=48 / Menu=13 / MenuDish=42 / Ingredient=79 / Plan=54 / Event=93 / CookLog=6，零残留。
- **实际**（两次独立查询结果逐项一致）：

  ```text
  Dish=48
  Menu=13
  MenuDish=42
  Ingredient=79
  Plan=54
  Event=93
  CookLog=6
  DB_SEVENTABLE_CHECK_DONE
  VERIFY_DB_EXIT=0
  ```

  与基线 **48/13/42/79/54/93/6 逐项一致 → 残留 0** ✓（V2 全仓跑的 apps/api 用例自带清理，DB 未被本批任何跑次污染）
- **证据**：[.workflow-verify/deploy-04/verify-db-seventable.log](file:///d:/codex/family-menu/.workflow-verify/deploy-04/verify-db-seventable.log)
- **覆盖边界**：七表计数核对（与 DEPLOY-03 verify 同口径）；未做行级内容比对（超本卡验收边界，历史各卡口径一致）。

---

## ③ AC1~AC6 逐条自检（口径：任务卡归档）

| AC | 自检 | 本 verify 证据 |
|---|---|---|
| **AC1** 两文件 diff 恰如上述（package.json 净增 1 行、score.spec.ts 改动 2 行，其余零改动） | **[✓]** | V1：`git diff --stat` 恰 2 文件（package.json `1 +`、score.spec.ts `4 ++--` = 2 行改动 4 处增删）；numstat (1,0)+(2,2)；test:gate 行/7 次循环与评估卡 §4 预览逐字符一致、注释行与任务卡定义一致（裁决 S-2 口径）、threshold 一字未动；shared 零输出；untracked 与本卡无关项均为历史遗留 |
| **AC2** C3 效果验证——采样 10 次 ≤1 FAIL（引用 dev 证据 + V5 抽样） | **[✓]** | dev 报告 §3：10 次独立进程串行逐跑 exit 全 0、**FAIL=0**（≤1 达标且优于设计预期 1-4% 残余），逐跑日志 run-01~10.log + summary.tsv 在案（本次验收实测在位）；本 verify V5 独立抽样 1 次全绿（51/51，AC12 335ms），双向佐证 |
| **AC3** test:gate EXIT=0（按主控裁决短路语义：「首轮绿即 EXIT=0 停止，恰 1 跑 391/391」为设计内正确行为） | **[✓]** | V2：恰执行 1 次 EXIT=0，391 passed 0 skipped（15 文件），日志恰 1 次 vitest 汇总、无第 2 跑（短路成功）；V4：`||` 语义四组实验独立复跑全过（失败→继续 / 成功→短路双路径证明），C-2 闭环 |
| **AC4** test:taboo 不受影响（EXIT=0） | **[✓]** | V3：EXIT=0，89/89，4 文件全绿 |
| **AC5** 报告落盘 | **[✓]** | dev 报告 evidence/DEPLOY-04-dev-2026-09-12.md 在案（环境声明/全部命令+退出码+数字/diff 摘要/AC 自检/卡外发现俱全）+ 任务卡归档 + 本 verify 报告，三件 evidence 均在 git status 实名可查 |
| **AC6** 新增依赖 0；不改 shared 契约；不动 CI | **[✓]** | V1：`git diff -- package.json` 仅 scripts 区 +1 行、依赖区零变化；`git diff --name-only -- packages/shared` 零输出；or-check 临时包无 dependencies 字段、无 node_modules（目录实测仅 package.json），全程未安装依赖；仓库无 CI 配置现状未动 |

---

## ④ 总体判定

**PASS。**

- V1~V7 七项全部 [✓]，零失败项，零豁免条款触发（AC12 在 V2/V3/V5 共 3 跑中均绿，残余假红未复现）。
- reviewer 移交三项全部闭环：**S-1**（git 层核验=V1）、**C-2**（or-check 四组实验输出首次独立落盘=V4）、**C-1**（披露三要素确认=V6）。
- 主控裁决第 1 条（AC3 短路语义）与第 2 条（C-1 转述路径）均按裁决口径验证通过。
- 待审版本维持工作树状态（HEAD cec8143 + 2 文件未提交改动），是否随卡提交由主控按总授权裁决；本 verify 未做任何 git 写操作。

## ⑤ 卡外发现（记录并移交主控，未做任何卡外修改）

1. **test:gate 墙钟波动**：本 verify 实测 Duration 5.40s vs dev 实测 15.20s（同命令不同时段）。两者均绿且计数一致；差异属文件系统缓存/背景负载波动（评估卡 §0 已披露本机 Defender 等常驻负载源），非 AC 判定指标，仅作记录。或-check 四组实验与门禁语义判定不受影响。
2. **AC12 it 级耗时同带佐证**：本 verify 三跑（test:gate 355ms / taboo 327ms / 单文件 335ms）与 dev §3 的 341-405ms 同带，min-of-7 后 it 级耗时上升（对照 min-of-3 时代 tests 分项 211ms）已在 dev 卡外发现 2 记录，无实质影响，维持原记录。
3. **PowerShell 5.1 stderr 包装面扩大观察**：本次验收所有经 `2>&1` 的 pnpm/git 命令（含 T1-T4、git diff warning）均触发 NativeCommandError 包装，dev 报告仅披露 testgate.log L1-L6 一处。建议后续涉及 pnpm 的验证脚本统一改用 `cmd /c` 包装或按退出码判定的既有约定（本报告沿用后者，未改任何脚本）。
4. **verify 侧操作瑕疵（如实披露）**：V7 首次落盘因证据文件相对路径笔误（漏 `.workflow-verify` 一级）报 DirectoryNotFoundException 一次，改绝对路径后成功；属验收工具操作问题，非环境/代码问题，DB 查询本身两次均成功。
5. **临时文件清理建议**：`.workflow-verify/deploy-04/` 现存 dev 产物（run-01~10.log、summary.tsv、run-ac12-sample.ps1、testgate.log、taboo.log、or-check/）+ verify 产物（verify-* 共 8 件），均在 gitignored 目录不入库；建议 fm-verify 复核通过后由主控决定整目录删除（与 dev 报告 §9 建议一致）。

## 附：本次验收产生的全部文件清单

| 文件 | 性质 |
|---|---|
| evidence/DEPLOY-04-verify-2026-09-12.md | 本报告（唯一新增 evidence 文件） |
| .workflow-verify/deploy-04/verify-git-diff-full.txt | V1 diff 全文 |
| .workflow-verify/deploy-04/verify-testgate.log | V2 完整输出 |
| .workflow-verify/deploy-04/verify-taboo.log | V3 完整输出 |
| .workflow-verify/deploy-04/verify-t1.log ~ verify-t4.log | V4 四组实验完整输出 |
| .workflow-verify/deploy-04/verify-score-spec.log | V5 完整输出 |
| .workflow-verify/deploy-04/verify-db-seventable.log | V7 七表计数输出 |
