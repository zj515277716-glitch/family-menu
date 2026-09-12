# DEPLOY-03 独立产品验收报告（fm-verify）

- 日期：2026-09-12
- 角色：fm-verify（产品验收，独立于开发/技术审查；不信任 dev/reviewer 自检数字，全部命令真实执行、独立取证）
- 验收对象：DEPLOY-03（三处同构裸 vitest script 补齐，挂账 C-3 核销）
- **待审版本**：分支 `feat/tp-06-menu-expansion` @ HEAD `71df054` + 工作树恰 3 文件未提交改动（apps/api/package.json、packages/engine/package.json、packages/list-merger/package.json）。本报告 V1~V5 全部针对该版本。
- 验收环境：Windows / PowerShell；本机 PG 127.0.0.1:54329 LISTENING（391/0 skipped 常驻口径）；**:3000 无监听**（netstat 实证，与 DEPLOY-01/02 主控干净环境裁决口径一致）；新增依赖 0；未 commit；业务代码零改动（本报告为本次验收唯一新增文件）。
- **结论速览：PASS**（V1~V5 全 [✓]；reviewer C-1 核销；C-2 口径勘误入档；AC12 豁免口径未触发）

---

## 验收项表（V1~V5）

### V1 改动核验 —— [✓]

- **操作**：`git status`；`git log --oneline -3`；`git branch --show-current`；`git diff --numstat`；`git diff`（全文）；Read 五个 package.json 取行比对。
- **预期**（卡面/改动声明）：git status/diff/numstat 恰 3 文件各 (1,1)、无越界文件；三处 script 现值与先例（packages/shared L16、tools/content-pipeline L23）逐字符一致；HEAD=71df054。
- **实际**：
  - `git status`：modified 恰 3 文件（apps/api/package.json / packages/engine/package.json / packages/list-merger/package.json）；untracked 均为历史遗留 + 本卡 dev 报告（.pai/、docs/design/preview.*、docs/ui-redesign/、tests/engine-perf.mjs、tests/step08-deploy-validate.cjs、tools/append-log.mjs、tools/fm-*.tar.gz、tools/preview-server.mjs、复盘报告.md、evidence/DEPLOY-03-dev-2026-09-12.md），与 DEPLOY-01 报告 §5 清单同源，无业务文件混入。
  - `git diff --numstat` 原样：

    ```text
    warning: in the working copy of 'apps/api/package.json', LF will be replaced by CRLF the next time Git touches it
    warning: in the working copy of 'packages/engine/package.json', LF will be replaced by CRLF the next time Git touches it
    warning: in the working copy of 'packages/list-merger/package.json', LF will be replaced by CRLF the next time Git touches it
    1       1       apps/api/package.json
    1       1       packages/engine/package.json
    1       1       packages/list-merger/package.json
    NUMSTAT_EXIT=0
    ```

  - `git diff` 全文：三文件各恰 1 个 hunk，改动行均为 `-    "test": "vitest run"` → `+    "test": "vitest run --root ../.. --no-file-parallelism"`；行位与改动声明一致（engine L16、list-merger L16、api L9）。
  - 先例逐字符对照（Read 原文）：[packages/shared/package.json L16](file:///d:/codex/family-menu/packages/shared/package.json#L16) 与 [tools/content-pipeline/package.json L23](file:///d:/codex/family-menu/tools/content-pipeline/package.json#L23) 均为 `"test": "vitest run --root ../.. --no-file-parallelism",`，与三处新值完全一致（含 4 空格缩进与尾逗号）。
  - `git log --oneline -3`：HEAD=`71df054`（消息含「DEPLOY-01/02 + AC12 阈值噪声敏感新挂账」），分支 feat/tp-06-menu-expansion，与改动声明「71df054 已收录 shared/content-pipeline 同构修复」一致。
- **覆盖边界**：核验范围 = 工作树相对 HEAD 的 diff；71df054 及之前历史提交内容未逐一复核（以提交消息与既有证据为据）。LF/CRLF warning 为 git 换行提示，非内容差异。

### V2 单包复跑核销（reviewer C-1）—— [✓]

- **操作**（真实执行，串行，无并行跑）：
  1. `pnpm --filter @family-menu/list-merger test; Write-Output "LM_VERIFY_EXIT=$LASTEXITCODE"`
  2. `pnpm --filter @family-menu/engine test; Write-Output "ENGINE_VERIFY_EXIT=$LASTEXITCODE"`
- **预期**（卡面）：均 EXIT=0、Test Files 15 passed、Tests 391 passed 0 skipped。
- **实际**：

  | 跑次 | 退出码 | Test Files | Tests | Duration |
  |---|---|---|---|---|
  | list-merger | LM_VERIFY_EXIT=0 | 15 passed (15) | 391 passed (391) | 6.18s |
  | engine | ENGINE_VERIFY_EXIT=0 | 15 passed (15) | 391 passed (391) | 5.65s |

  - 两跑均 0 skipped（PG 常驻口径，apps/api 用例连真实 DB）；AC12 无 FAIL；Duration 与 T-P13 串行基线（4.99s/4.75s）同量级，串行特征成立。
- **覆盖边界**：按卡面选 2 包各 1 跑（list-merger 为卡点受影响包，engine 为 AC12 用例归属包）；apps/api 单包入口本卡未实跑（其入口语义与 V3 根跑及 dev 六跑同构，script 值已 V1 逐字符核验）；AC12 本次两跑均未复现失败。

### V3 根回归 —— [✓]

- **操作**：`pnpm test; Write-Output "ROOT_VERIFY_EXIT=$LASTEXITCODE"`，1 次。
- **预期**（卡面）：EXIT=0、391 passed 0 skipped。
- **实际**：ROOT_VERIFY_EXIT=0；Test Files 15 passed (15)；Tests 391 passed (391)；Duration 5.28s；0 skipped；AC12 无 FAIL。
- **覆盖边界**：1 次实跑；AC12 概率性失败本次未出现（详见 V5）。

### V4 空跑修复核验（对照基线 + 存档日志一致性）—— [✓]

- **操作**：`Get-Item evidence\DEPLOY-03-run-batch1-full-output.log | Select Name,Length,LastWriteTime`；Grep 抽查卡面指定三处（ENGINE_R1、LM_R1 失败段、API_R2）并全表比对六跑 EXIT/Files/Tests/Duration。
- **预期**：日志存在且 143,273 字节；dev 报告六跑数字与日志一致；LM_R1 的 AC12 失败值为 51.764099999999985ms。
- **实际**：
  - 文件实证：Length=**143273**（与 dev 报告声明逐字节一致），LastWriteTime 2026/9/12 16:34:53。
  - 六跑退出码标记（日志行号）：L135 ENGINE_R1_EXIT=0 / L270 ENGINE_R2_EXIT=0 / **L474 LM_R1_EXIT=1** / L609 LM_R2_EXIT=0 / L744 API_R1_EXIT=0 / **L879 API_R2_EXIT=0**——恰 6 个标记，与 dev 报告 5 绿 1 红一致。
  - Tests 计数（行号）：L131/L266/L605/L740/L875 均 `391 passed (391)`；L467（LM_R1）`1 failed | 390 passed (391)`。
  - Test Files 计数（行号）：L130/L265/L604/L739/L874 均 `15 passed (15)`；L466（LM_R1）`1 failed | 14 passed (15)`。
  - Duration：5.28s / 5.18s / 5.52s / 5.36s / 5.42s / 5.22s，与 dev 报告 §3 AC2 表逐项一致。
  - 卡面抽查三处核销：ENGINE_R1（L135/L130/L131/L133）✓；API_R2（L879/L874/L875/L877）✓；LM_R1 失败段原样摘录（L453-455，仅去 ANSI 码）：

    ```text
    FAIL  packages/engine/test/score.spec.ts > 性能测试（AC12） > 千套菜单 recommend 调用性能 < 50ms（AC12）
    AssertionError: expected 51.764099999999985 to be less than 50
     ❯ packages/engine/test/score.spec.ts:793:24
    ```

    与 dev 报告引文逐字符一致（含 51.764099999999985 与 score.spec.ts:793:24）。
  - 对照基线：按卡面不复现（script 已改不可逆）；基线事实以 DEPLOY-01 dev 报告 §3 + DEPLOY-03 dev 报告 §3 转述为准——但基线三跑原始输出**无存档**（见口径勘误节）。
- **覆盖边界**：日志为 dev 单条串行批命令的终端原样输出；本 verify 仅对文本存档做一致性核验，无法（也不必）重放 dev 当时运行时序。

### V5 LM_R1 裁决复核 —— [✓]

- **操作**：Grep 日志 `FAIL|AssertionError|score\.spec`；核对 CURRENT.md 挂账队列与提交 71df054 消息。
- **预期**：LM_R1 唯一 FAIL = packages/engine/test/score.spec.ts AC12（51.76ms>50ms），与已挂账「AC12 阈值噪声敏感」同族。
- **实际**：
  - 日志 Failed Tests 1（L451）；唯一失败文件 score.spec.ts（L275 `51 tests | 1 failed`；L453-455 见 V4 引文）；该批其余五跑 score.spec.ts 均 ✓（L5/L140/L479/L615/L750）。**唯一 FAIL 成立**。
  - 同族挂账在案：CURRENT.md 挂账队列「AC12 阈值噪声敏感（engine score.spec.ts 千套菜单 recommend <50ms 断言，串行下环境噪声仍可抖至 50.19/57.86ms，阈值/测量方法学重评估）」；71df054 提交消息「AC12 阈值噪声敏感新挂账」。文件、断言、阈值完全一致，同族判定成立。
  - 本次验收 V2/V3 共 3 跑 AC12 均 PASS → **豁免口径未触发**，未动用单文件复跑一次定案条款，未刷绿。
- **覆盖边界**：判定依据为文件/断言/阈值一致性；未做 flaky 率统计采样（超本卡边界，属挂账 AC12 处置评估范围）。

---

## reviewer 移交条件核销

- **C-1（V2/V3 数字复跑核销）**：核销成立。V2 两跑 + V3 一跑共 3 跑全绿（EXIT=0、Test Files 15 passed、Tests 391 passed 0 skipped），数字见验收项表。

## 口径勘误（C-2，本 verify 独立实证，历史材料不改写）

- 主控此前材料称 run-batch1 日志「含基线复现与修复后六跑」。
- 本 verify 独立实证：`evidence/DEPLOY-03-run-batch1-full-output.log` 恰含 6 个跑次标记（ENGINE_R1/R2、LM_R1/R2、API_R1/R2）；全文对 `No test files found`、`BASE_EXIT`、`BASE_RUN`、`RUN  v`、`pnpm --filter` 的 Grep 均为 **0 匹配**。
- 结论：该日志**仅含修复后六跑**；基线三跑（engine/list-merger/api 空跑 exit 1）输出**未落盘**。
- 影响：基线事实目前仅有 DEPLOY-03 dev 报告 §1/§3 文字转述可据，无原始输出存档可对照。此点以本节为勘误依据，dev 报告与其余历史材料按惯例原文保留。

## 移交事项（不改变 PASS 判定）

1. **存档日志不会随卡入库**：.gitignore L10 `*.log` 覆盖 `evidence/DEPLOY-03-run-batch1-full-output.log`（git untracked 清单无此文件，Glob/文件系统实证存在）。如需证据入库，由主控决定改名（如 .txt）或 `git add -f`；属证据持久化口径问题，非本卡代码问题。
2. dev 报告卡外发现 1（AC12 串行下仍可复现，建议处置评估）与既有挂账「AC12 阈值噪声敏感」同项，维持挂账，本卡不动 score.spec.ts。
3. dev 报告卡外发现 2（DEPLOY-02 报告「仓库内已无裸 script」表述被证伪）与本 verify 结论一致：本卡修复后三处已非裸 script；DEPLOY-02 历史报告不改写，勘误以其原卡与 dev 报告 §6 在案。
4. 工作树历史遗留 untracked 文件若干（V1 所列），与本卡无关，维持 DEPLOY-01/02 同项移交主控另行收口。

## Teardown / 残留声明

- 本 verify 未建任何库数据（纯 vitest 跑用例自带清理）；验收完成后只读七表计数：**Dish=48 / Menu=13 / MenuDish=42 / Ingredient=79 / Plan=54 / Event=93 / CookLog=6**，与项目基线（T-P11/T-P14 verify 在案值）逐项一致 → **残留 0**。
- 本 verify 产生的文件仅本报告；DB 核验经 stdin 管道执行、未落盘任何临时脚本；未改任何业务代码/UI 基线；未 commit；新增依赖 0。

## 结论

**DEPLOY-03 验收 PASS**。三处同构裸 vitest script 补齐改动（恰 3 文件各 1 行）与 DEPLOY-01/02 先例逐字符一致；单包与根回归共 3 跑全绿（391 passed 0 skipped）；dev 六跑数字与存档日志逐项一致；LM_R1 唯一失败确属 AC12 已挂账同族噪声且本批豁免口径未触发。待审版本维持工作树状态，是否随卡提交由主控按总授权裁决。
