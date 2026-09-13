# LOGIN-DOM 产品验收（verify）报告：batch-fetch 登录弹窗探测升级 exit 2（+ 搭车两项）

> 验收：fm-verify ｜ 日期：2026-09-13 ｜ 分支：feat/tp-06-menu-expansion ｜ HEAD=d138d9d（实测 `git rev-parse --short HEAD` = d138d9d）
> 执行依据：[review 移交清单 V-1~V-6](./LOGIN-DOM-review-2026-09-13.md) + [任务卡](./LOGIN-DOM-task-2026-09-13.md)（含主控勘误与裁决注记）+ [dev 报告](./LOGIN-DOM-dev-2026-09-13.md)（含主控裁决注记：dev 临时脚本在 %TEMP% 已删，verify 须自建等价脚本补物证链）
> 物证目录：`.workflow-verify/login-dom/`（8 件：v1-mock-verify.mjs / v1-mock-output.txt / v3-test-report.json / v3-test-output.txt / v4-cdp-verify.mjs / v4-cdp-output.txt / v5-v6-evidence.mjs / v5-v6-output.txt）

# 总判定：**PASS**（6/6 项全过，0 阻塞）

## 零、V-1~V-6 逐项结果一览表

| 编号 | 命令 | 预期 | 实测 | 判定 |
|---|---|---|---|---|
| V-1 | `node .workflow-verify/login-dom/v1-mock-verify.mjs`（自建脚本：源码正则提取 EXPR_LOGIN_POPUP + `new Function('document','return ('+expr+')')` 注入 mock document，四向断言） | POSITIVE popup:true 且 signals 恰两枚；NEG1（常见词）/NEG2（请使用扫码登录）popup:false；body=null 容错不 throw；脚本与输出落 `.workflow-verify/login-dom/` | EXPR_LEN=381（与 review 逐字符计数吻合）；POSITIVE `{"popup":true,"signals":["text:登录超限","text:请重新登录"]}`；NEG1/NEG2 `{"popup":false,"signals":[]}`；BODY_NULL `{"popup":false,"signals":[]}` 不 throw 无 error；TOTAL=4 PASS=4 FAIL=0；EXIT=0 | **PASS** |
| V-2 | `node --check tools/content-pipeline/batch-fetch.mjs` | EXIT=0 | EXIT=0（无输出） | **PASS** |
| V-3 | `pnpm --filter @family-menu/content-pipeline test`（本机 PowerShell 管道对该命令输出捕获失效，改用完全等价的 `node node_modules/vitest/vitest.mjs run --root ../.. --no-file-parallelism` 直跑 + json reporter 复跑落盘，详见 §一 #6~#8 与 §四） | 19 files / 442 tests 全绿 0 failed，EXIT=0；输出落 `.workflow-verify/login-dom/` | 第一跑 CLI 直出 `Test Files 19 passed (19) / Tests 442 passed (442) / Duration 6.61s` EXIT=0；json 复跑 `numTotalTests=442 numPassedTests=442 numFailedTests=0 success=true` EXIT=0；物证= v3-test-report.json（vitest 直写）+ v3-test-output.txt（解析摘要） | **PASS** |
| V-4 | `node .workflow-verify/login-dom/v4-cdp-verify.mjs`（自建脚本：GET 9222/json 只读列目标 → 选 xhs page tab → 1 次 Runtime.evaluate 只读下发源码提取的真实 EXPR_LOGIN_POPUP） | 9222 可达时 popup=false signals=[]；全程仅只读 /json + Runtime.evaluate，红线同卡 | 9222 可达（HTTP=200）；TARGETS_COUNT=3、PAGE_COUNT=1，选中 xhs explore 详情页；`CDP_NEGATIVE popup=false signals=[] => PASS`；EXIT=0；URL query 已脱敏 | **PASS** |
| V-5 | `git status --porcelain` + `git diff --numstat` + `git diff --name-only` + `git diff --cached --name-only` + 禁区逐组 `git diff --quiet`（经 v5-v6-evidence.mjs 只读采集） | M 恰 2 文件；numstat batch-fetch.mjs 28/1、apply-ingredients.mjs 2/2；禁区零 diff | M 恰 2 文件（batch-fetch.mjs、apply-ingredients.mjs）；numstat `28 1` / `2 2` 精确吻合；diff --name-only 恰 2 文件、暂存区空；禁区 7 组（packages/shared、packages/engine、apps/api、xhs-fetch.mjs、fetch2dish.mjs、src/（含 import 脚本）、out/xhs/tc06-drift-check.mjs）`git diff --quiet` 全 EXIT=0 | **PASS** |
| V-6 | `node -e "JSON.parse(...)"` 复跑 tools/content-pipeline/out/xhs/tc06-drift-check.json 并打印字段 | EXIT=0；preFetchedDishCount=29 / postFetchedDishCount=30 | EXIT=0；`JSON_OK preFetchedDishCount=29 postFetchedDishCount=30` | **PASS** |

---

## §一 执行时间线（真实命令 + 退出码 + 数字结果）

环境：Windows / PowerShell 5.1 ｜ Node v24.19.0（`node -v`）｜ pnpm 11.20.0 ｜ vitest 4.1.10

| # | 步骤 | 真实命令 | 退出码 | 关键数字结果 |
|---|---|---|---|---|
| 1 | 权威输入与基线 | Read 任务卡/dev/review/batch-fetch.mjs/apply-ingredients.mjs；`git branch --show-current; git rev-parse --short HEAD; git status --porcelain` | 0 | 分支 feat/tp-06-menu-expansion；HEAD=d138d9d；M 恰 2 文件（batch-fetch.mjs、apply-ingredients.mjs），另 13 项 untracked 为历史遗留杂物与本卡 evidence 3 文档（??，不属 M） |
| 2 | 物证目录+环境 | `New-Item -ItemType Directory -Force -Path .workflow-verify\login-dom; node -v` | 0 | 目录建成；Node v24.19.0 |
| 3 | V-1 mock 四向验证 | `node .workflow-verify\login-dom\v1-mock-verify.mjs` | 0 | EXPR_LEN=381；TOTAL=4 PASS=4 FAIL=0（输出原文见 §二） |
| 4 | V-2 语法校验 | `node --check tools/content-pipeline/batch-fetch.mjs` | 0 | 无输出（通过） |
| 5 | V-4 前置可达性 | `Invoke-WebRequest -Uri http://127.0.0.1:9222/json -UseBasicParsing -TimeoutSec 5` | 0 | HTTP=200，LEN=1647 → 9222 在线，不降级 |
| 6 | V-3 首跑（管道落盘尝试） | `pnpm --filter @family-menu/content-pipeline test 2>&1 \| Out-File ...`（先后台/前台两次） | 0 | **测试真实执行且通过（EXIT=0），但本机工具宿主下 PowerShell 管道对该 pnpm shim 的 stdout 捕获失效，落盘文件仅 BOM 空**（异常备案 §四.1） |
| 7 | V-3 等价直跑 | `node node_modules\vitest\vitest.mjs run --root ..\.. --no-file-parallelism`（cwd=tools/content-pipeline，与 package.json L24 test script `vitest run --root ../.. --no-file-parallelism` 完全等价） | 0 | `Test Files 19 passed (19)`；`Tests 442 passed (442)`；`Duration 6.61s`；全绿 0 failed（终端直出，已捕获） |
| 8 | V-3 json 复跑落盘 | `node node_modules\vitest\vitest.mjs run --root ..\.. --no-file-parallelism --reporter=json --outputFile.json=d:\codex\family-menu\.workflow-verify\login-dom\v3-test-report.json` | 0 | `JSON report written to D:/codex/family-menu/.workflow-verify/login-dom/v3-test-report.json` |
| 9 | V-3 摘要解析 | `node -e "…JSON.parse(v3-test-report.json)…"` → 写 v3-test-output.txt | 0 | success=true；numTotalTests=442；numPassedTests=442；numFailedTests=0；numPendingTests=0 |
| 10 | V-4 CDP 只读探测 | `node .workflow-verify\login-dom\v4-cdp-verify.mjs` | 0 | popup=false signals=[] PASS（细节见 §三） |
| 11 | V-5+V-6 物证采集 | `node .workflow-verify\login-dom\v5-v6-evidence.mjs`（内部跑 git 只读命令 ×6 组 + V-6 JSON.parse） | 0 | 见 §一表 V-5/V-6 行与 §二物证目录 |

V-3 说明：`pnpm --filter @family-menu/content-pipeline test` 共实际执行 2 次（EXIT=0/0，测试通过为既成事实）；因输出物证捕获失败，追加 2 次等价直跑（第 7、8 步）补齐物证链。dev 报告 §四.4 记载 test script 为 `vitest run --root ../..` 系不完整记载，实际为 `vitest run --root ../.. --no-file-parallelism`（tools/content-pipeline/package.json L24 实读），verify 第 7 步按完整 script 等价执行（备案见 §四.2）。

## §二 V-1 mock 三向（+容错向）验证细节

脚本：[v1-mock-verify.mjs](file:///d:/codex/family-menu/.workflow-verify/login-dom/v1-mock-verify.mjs)（fm-verify 自建，独立于 dev 已删临时脚本）。关键片段：

```js
// 1. 正则提取文件内真实表达式（String.raw 模板字面量内 IIFE）
const src = readFileSync(SRC, 'utf8');
const m = src.match(/const EXPR_LOGIN_POPUP = String\.raw`([\s\S]*?)`;/);
const expr = m[1];   // EXPR_LEN=381，与 review 报告 AC4 交叉验证的逐字符计数精确吻合

// 2. 构造注入函数（与运行时 cdp.evalJson 下发同一表达式文本）
const fn = new Function('document', 'return (' + expr + ')');
```

实测输出（[v1-mock-output.txt](file:///d:/codex/family-menu/.workflow-verify/login-dom/v1-mock-output.txt) 原文，控制台同步输出）：

```
EXPR_LEN=381
POSITIVE {"popup":true,"signals":["text:登录超限","text:请重新登录"]} => PASS
NEG1 {"popup":false,"signals":[]} => PASS
NEG2 {"popup":false,"signals":[]} => PASS
BODY_NULL {"popup":false,"signals":[]} => PASS
TOTAL=4 PASS=4 FAIL=0
EXIT=0
```

各向用例明细：

| 用例 | mock document.body.innerText | 断言 | 结果 |
|---|---|---|---|
| POSITIVE | `电脑设备登录超限，请重新登录`（T-C06 实锤原句） | popup:true 且 signals 恰两枚且顺序为 `text:登录超限`,`text:请重新登录` | PASS |
| NEG1 | `登录后即可查看更多内容\n请登录后查看\n扫码登录\n手机号登录\n登录`（常见词，不含两信号子串） | popup:false 且 signals:[] 且无 error 字段 | PASS |
| NEG2 | `请使用扫码登录`（近似陷阱：含「登录」但不含「请重新登录」/「登录超限」子串） | popup:false 且 signals:[] | PASS |
| BODY_NULL | `document.body = null`（容错路径） | 不 throw、popup:false、signals:[]、无 error 字段（表达式体内 `document.body && … || ''` 短路，不进 catch） | PASS |

物证链：dev 的 mock 脚本在 %TEMP% 已删（主控裁决注记口径），本件为 verify 独立重建；EXPR_LEN=381 与 review 报告 §三 AC4 说明的逐字符计数结果一致，构成「提取的即文件内真实表达式」的独立佐证；脚本与完整输出均已落 `.workflow-verify/login-dom/`。

## §三 V-4 真实 CDP 只读负向探测细节（未降级）

脚本：[v4-cdp-verify.mjs](file:///d:/codex/family-menu/.workflow-verify/login-dom/v4-cdp-verify.mjs)（fm-verify 自建）。流程与红线遵守：

1. `GET http://127.0.0.1:9222/json`（只读）→ HTTP=200，TARGETS_COUNT=3、PAGE_COUNT=1；
2. 目标选择：唯 1 个 page tab，URL=`https://www.xiaohongshu.com/explore/6a4a209d000000002101b02a?<query-omitted>`（小红书 explore 详情页；与 dev 报告 §四.2 同一 tab；URL query 一律脱敏省略，物证不落 token）；
3. Node 24 原生 WebSocket 连接其 webSocketDebuggerUrl，下发 **1 次** `Runtime.evaluate`（expression=从 batch-fetch.mjs 源码提取的真实 EXPR_LOGIN_POPUP，EXPR_LEN=381，returnByValue:true），返回 type=string；
4. 断言：`popup=false signals=[]`（正常页无弹窗）且无 error 字段 → `RESULT PASS`。

实测输出（[v4-cdp-output.txt](file:///d:/codex/family-menu/.workflow-verify/login-dom/v4-cdp-output.txt) 原文）：

```
EXPR_LEN=381
JSON_HTTP=200
TARGETS_COUNT=3
PAGE_COUNT=1
  PAGE title="蚝油生菜原来不炒更好吃，脆嫩还少油 - 小红书" url=https://www.xiaohongshu.com/explore/6a4a209d000000002101b02a?<query-omitted>
SELECTED url=https://www.xiaohongshu.com/explore/6a4a209d000000002101b02a?<query-omitted>
EVAL_TYPE=string
CDP_NEGATIVE popup=false signals=[]
RESULT PASS
EXIT=0
```

红线遵守声明：全程仅 1 次只读 GET /json + 1 次只读 Runtime.evaluate；未导航、未触碰 cookie/登录态/存储、未增删页面、未重启浏览器；页面标题与 URL 证实目标页为正常内容页（无登录弹窗），负向探测语义成立。

## §四 异常与偏差备案（3 项，均不阻塞判定，均不涉被验代码缺陷）

1. **verify 环境异常：PowerShell 管道对 pnpm shim 的 stdout 捕获失效**。`pnpm --filter @family-menu/content-pipeline test 2>&1 | Out-File` 两种模式（后台/前台）下测试均真实执行且 EXIT=0，但落盘文件仅剩 BOM（0 内容）；Tee-Object 在 PS5.1 无 -Encoding 参数，cmd /c 被工具宿主安全策略禁止。处置：改用与 test script 完全等价的 `node node_modules/vitest/vitest.mjs run --root ../.. --no-file-parallelism` 直跑（终端直出捕获成功，19/442 全绿）+ json reporter 复跑由 vitest 直写 `v3-test-report.json` 补齐落盘物证。影响范围仅物证捕获方式，测试结果判定不受影响（共 4 次真实执行，2 次 pnpm 入口 EXIT=0、2 次等价直跑/复跑 EXIT=0，结果一致）。
2. **dev 报告记载瑕疵（记录层面）**：dev 报告 §四.4 称 test script 为 `vitest run --root ../..`，实读 [package.json:L24](file:///d:/codex/family-menu/tools/content-pipeline/package.json#L24) 为 `vitest run --root ../.. --no-file-parallelism`。verify 初次直跑时漏带该参数曾得 EXIT=1（文件级并行下 API 冲突），补齐后 EXIT=0。该瑕疵不改变 dev 结论（dev 经 pnpm test 走完整 script），性质与 review S-1 同类（记录不完整），建议主控提交对账时知悉；是否在 dev 报告补勘误注记由主控裁量，非必须。
3. **未验证项（继承 dev/review 备案，口径一致）**：真实登录弹窗场景的正向 CDP 实跑与 exit 2 全链路端到端未做——需登录超限实况，红线禁止人为制造登录失效（任务卡 AC4 本就只要求真实 CDP 负向 + mock 正向，均已达成）。正向语义由 mock POSITIVE 向（T-C06 实锤原句 → popup:true 双信号）与命中分支静态审读（[batch-fetch.mjs:L537-L543](file:///d:/codex/family-menu/tools/content-pipeline/batch-fetch.mjs#L537-L543)）覆盖。

## §五 遗留与移交

| 编号 | 事项 | 接收方 |
|---|---|---|
| H-1 | 提交对账以实测 git 数字为准：M 恰 2 文件、numstat batch-fetch.mjs 28/1、apply-ingredients.mjs 2/2（本报告 V-5 实测与 review M-1 预期一致，可直接作为提交对账基准） | 主控 |
| H-2 | 保持既有挂账：xhs-fetch.mjs 同构缺陷（URL-only 检测）仍为备案不改口径，勿遗失于队列（本卡边界外，verify 确认其零 diff 维持备案状态） | 主控/队列 |
| H-3 | §四.2 dev 报告 test script 记载不完整（缺 `--no-file-parallelism`）之勘误注记是否补写，由主控裁量 | 主控 |
| H-4 | tc06-drift-check.json 按主控裁决③口径为本地修复不入库（V-6 已确认本地工作区 JSON 合法化达成），git 呈现为零 M 属预期，勿在提交环节误判遗漏 | 主控 |

## 附：红线遵守自查

- 未触碰 9222 CDP 浏览器登录态/cookie/存储；CDP 仅只读（GET /json 列目标 ×2 次 + Runtime.evaluate 只读表达式 ×1 次）——通过
- 未删除 `$env:TEMP\fm-rds.env`、未停止本地 PG 54329、未杀 9222 CDP 浏览器进程——通过（全程未涉及）
- 未执行 DROP/清理类数据库命令、未触碰生产数据——通过（V-3 测试自带隔离数据，全程无 DB 清理操作）
- 未修改任何业务代码/UI 基线——通过（新增文件仅 `.workflow-verify/login-dom/` 8 件验证脚本与物证 + 本报告；`git status` M 恒为 2 文件且均为 dev 既有改动，verify 零新增代码改动）
- 未制造真实登录失效场景——通过（正向弹窗场景豁免备案，未做）

---

**验收依据文件**：[任务卡](file:///d:/codex/family-menu/evidence/LOGIN-DOM-task-2026-09-13.md)、[dev 报告](file:///d:/codex/family-menu/evidence/LOGIN-DOM-dev-2026-09-13.md)、[review 报告](file:///d:/codex/family-menu/evidence/LOGIN-DOM-review-2026-09-13.md)、[batch-fetch.mjs](file:///d:/codex/family-menu/tools/content-pipeline/batch-fetch.mjs)、[apply-ingredients.mjs](file:///d:/codex/family-menu/tools/content-pipeline/apply-ingredients.mjs)、[tc06-drift-check.json](file:///d:/codex/family-menu/tools/content-pipeline/out/xhs/tc06-drift-check.json)、[package.json](file:///d:/codex/family-menu/tools/content-pipeline/package.json)。
