# LOGIN-DOM dev 报告：batch-fetch 登录弹窗探测升级 exit 2（+ 内容卡顺手项搭车）

> 结论：**AC1/AC2/AC3/AC4 全部 [✓]；AC5 [✗]（按字面）——代码改动全部完成且验证通过，但任务卡前提「tc06-drift-check.json 已被 git 跟踪」与仓库实际不符（该文件被 .gitignore:29 忽略且从未入库），git 层面 M 恰 2 文件而非 3 文件，已按异常升级路径备案移交主控决策，未自行扩权（未做 git add -f）。**
> 执行：fm-dev ｜ 日期：2026-09-13 ｜ 分支：feat/tp-06-menu-expansion ｜ 任务卡：evidence/LOGIN-DOM-task-2026-09-13.md ｜ git 未提交（等主控统一提交）

## 一、执行时间线（真实命令 + 退出码）

| # | 步骤 | 命令 / 操作 | 退出码 | 关键输出 |
|---|---|---|---|---|
| 1 | 读任务卡+核对行号 | Read 任务卡/batch-fetch.mjs/apply-ingredients.mjs/tc06-drift-check.json | - | 头注释 L11、EXPR_CANDIDATES L269、no_candidates L515-520、apply L3/L6、JSON 尾行 L222，均与卡一致 |
| 2 | git 基线 | `git branch --show-current; git status --porcelain` | 0 | 分支正确；M=0，仅历史遗留 untracked 杂物（不属本卡） |
| 3 | AC1 三处修改 | SearchReplace ×3（头注释 / EXPR_LOGIN_POPUP / no_candidates 分支） | - | 见 §三 hunk 原文 |
| 4 | AC2 修改 | SearchReplace ×2（L3、L6 29→30） | - | 见 §三 hunk 原文 |
| 5 | AC3 修改 | SearchReplace 剥离尾行 | - | 删除 `\nDRIFT CHECK PASSED: 29/29 unchanged, 1 added` |
| 6 | 语法检查 | `node --check tools/content-pipeline/batch-fetch.mjs` | **0** | 无输出（通过） |
| 7 | mock 正反向验证 | `node %TEMP%\login-dom-mock-verify.mjs`（脚本已用后删除，全文见 §四） | **0** | POSITIVE/NEG1/NEG2 全 PASS（见 §四） |
| 8 | CDP 负向探测 | `node %TEMP%\login-dom-cdp-verify.mjs`（脚本已用后删除，全文见 §四） | **0** | popup=false signals=[] PASS（见 §四） |
| 9 | 回归测试 | `pnpm --filter @family-menu/content-pipeline test` | **0** | Test Files 19 passed (19)；Tests 442 passed (442)；Duration 10.72s |
| 10 | JSON 合法性 | `node -e "JSON.parse(...tc06-drift-check.json...)"` | 0 | `JSON_OK preFetchedDishCount=29 postFetchedDishCount=30 unchangedDetail=29` |
| 11 | git 边界核对 | `git status --porcelain; git diff --stat` | 0 | 见 §三 |
| 12 | 跟踪状态核查 | `git ls-files / git check-ignore -v / git log -- <json>` | 0 | **异常发现**（见 §五） |
| 13 | 零改动确认 | `grep includes('/login')` / `grep '29 道\|30 道'` | - | URL 检测 3 处健在（L256/L457/L485）；apply 无「29 道」残留 |

## 二、AC 逐条自检

### AC1 DOM 弹窗探测落地 [✓]
- [✓] `EXPR_LOGIN_POPUP` 新增于 EXPR_CANDIDATES 定义之后（String.raw IIFE 风格一致，返回 JSON.stringify 字符串），**信号仅两枚实锤文本**「登录超限」「请重新登录」，零 DOM 结构 selector。注释写明信号来源（T-C06 截图 no-cand-17-1789248726547.png + dev 报告 §2 原句）与局限（文案彻底改版则漏报、按截图人工介入）。
- [✓] no_candidates 分支（现 L531 起）：先 `JSON.parse(await cdp.evalJson(EXPR_LOGIN_POPUP))`（try/catch，异常按 popup:false 继续 + log 异常原文）→ safeScreenshot 保留 → 命中 popup:true 则 `it.error='login_popup_detected'` + saveManifest + log 带 signals + `stopped={reason:'login_invalid', at:i}` + break → 走既有 `process.exit(stopped.reason === 'login_invalid' ? 2 : 3)` 链出 exit 2（与既有 L518 `nav1` 停止路径同构，未新增任何 process.exit）。未命中路径的 4 行既有行为（failed/no_candidates/saveManifest/continue）逐字保留。
- [✓] 既有 URL 级检测 3 处零改动（grep 证实：L256 `if (url.includes('/login')) return 'login_invalid';`、L457 about:blank 恢复、L485 safeNav，行号因插入偏移 1~16 行，内容未动）；no_qualified_candidate 分支、exit 3 连续失败链、BATCH_CONSEC_FAIL_STOP、MAX_CANDIDATES_PER_KEYWORD=12 全部零改动（diff 仅 3 hunk）。
- [✓] 头部注释 L11 同步：「登录失效（URL 跳 /login 或页面内登录弹窗）立即 exit 2 不重试」+ T-C06 实锤/LOGIN-DOM 注记。
- 证据：§三 hunk 原文 + 时间线 #6/7/8。

### AC2 搭车项 1：apply-ingredients.mjs 头注释 29→30 [✓]
- [✓] 仅 L3、L6 两处改动，逻辑零改动。grep 证实全文件无「29 道」残留（L8「既有 19 道菜」为另一合法口径，未触碰）。

### AC3 搭车项 2：tc06-drift-check.json 尾行剥离 [✓]
- [✓] JSON 结束 `}` 之后的文本行 `DRIFT CHECK PASSED: 29/29 unchanged, 1 added` 已剥离；`JSON.parse` 成功（时间线 #10：`JSON_OK preFetchedDishCount=29 postFetchedDishCount=30 unchangedDetail=29`，内容区数值与剥前 Read 结果一致，除尾行外逐字节未动）。
- **git 呈现受限**：见 §五异常备案（文件未被跟踪，diff 无法在 git 中体现）。

### AC4 验证 [✓]
- [✓] `node --check` EXIT=0。
- [✓] mock 正反向三向 PASS（EXIT=0，细节见 §四）：正向 popup:true + 双信号；反向 1 正常态（含「登录」「扫码登录」等常见词）popup:false；反向 2「请使用扫码登录」popup:false。
- [✓] 真实 CDP 负向探测 EXIT=0（9222 在线）：xhs explore 详情页 tab 只读 evaluate → `popup=false signals=[]`。红线遵守：仅 GET /json + Runtime.evaluate 只读，未导航、未碰 cookie/登录态、未增删页面。
- [✓] 回归：`pnpm --filter @family-menu/content-pipeline test` 全绿 **Test Files 19 passed (19) / Tests 442 passed (442) / 0 failed**，EXIT=0。说明：该 filter 的 test script 为 `vitest run --root ../..`，实际跑全仓 19 个 spec 文件（含 content-pipeline 自身 8 个：fetch2dish/coverage/import/draft/allergen/menu-assemble 等），与本卡改动前基线衔接（未新增/未改动任何测试文件）。

### AC5 git 边界 [✗]（按字面；代码层面全部达成，git 前提失实）
- [✗] 「工作区 M 恰 3 文件」不成立：实际 `git status` M 恰 **2** 文件（batch-fetch.mjs、apply-ingredients.mjs）；第 3 文件 tc06-drift-check.json 的修改已完成并验证，但该文件**未被 git 跟踪**且被 `.gitignore:29 tools/content-pipeline/out/` 忽略，git 不显示 M。根因=任务卡前提「该文件已被 git 跟踪（T-C06 入库）」与仓库实际不符（`git ls-files` 为空、`git log -- <file>` 无记录）。按纪律未做 `git add -f` 等扩权操作，移交主控决策（强制入库 / 修订 .gitignore / 修订 AC 口径三选一）。
- [✓] 禁区零 diff：packages/shared、packages/engine、apps/api/**、xhs-fetch.mjs、fetch2dish.mjs、import 均 0 改动（git status 全量核对）。
- [✓] 新增依赖 0；测试文件改动 0。
- [✓] 历史遗留 untracked 杂物（.pai/、docs/design/preview.* 等 13 项）未触碰。

## 三、改动统计与 diff 证据

`git diff --stat` 原样：

```
 tools/content-pipeline/apply-ingredients.mjs |  4 ++--
 tools/content-pipeline/batch-fetch.mjs       | 29 +++++++++++++++++++++++++++-
 2 files changed, 30 insertions(+), 3 deletions(-)
```

batch-fetch.mjs 关键 hunk（原样，节选自 `git diff`）：

```diff
- *   - 登录失效（/login）立即 exit 2 不重试；整体连续 4 次失败 exit 3（风控/结构变化保护）
+ *   - 登录失效（URL 跳 /login 或页面内登录弹窗）立即 exit 2 不重试；整体连续 4 次失败 exit 3（风控/结构变化保护）
+ *     （页面内登录弹窗探测=LOGIN-DOM 2026-09-13，依据 T-C06 实锤：弹窗「电脑设备登录超限，请重新登录」时 URL 不跳 /login）
```

```diff
+// 页面端登录弹窗探测（LOGIN-DOM 2026-09-13）：唯一信号=实锤文本两枚。
+// 信号来源：T-C06 截图 .workflow-verify/tp-c04/no-cand-17-1789248726547.png + T-C06-dev 报告 §2 原句
+// 「电脑设备登录超限，请重新登录」（substring 匹配覆盖句内变体）。
+// 局限：仅匹配 body.innerText 文本，未用任何 DOM 结构 selector（未实锤不猜 class/selector）；
+//       若平台文案彻底改版则漏报（届时按 no-cand 截图人工介入）。
+const EXPR_LOGIN_POPUP = String.raw`(function(){
+  var out = { popup: false, signals: [] };
+  try {
+    var t = String((document.body && document.body.innerText) || '');
+    if (t.indexOf('登录超限') >= 0) { out.popup = true; out.signals.push('text:登录超限'); }
+    if (t.indexOf('请重新登录') >= 0) { out.popup = true; out.signals.push('text:请重新登录'); }
+  } catch (e) { out.error = String(e); }
+  return JSON.stringify(out);
+})()`;
```

```diff
       if (!v.ok || !v.cands || v.cands.length === 0) {
+        // LOGIN-DOM：候选 0 先做页面端登录弹窗探测（T-C06 实锤：登录失效弹窗不跳 URL → 候选 0 曾被误判 no_candidates 且 exit 0）
+        let popup = { popup: false, signals: [] };
+        try { popup = JSON.parse(await cdp.evalJson(EXPR_LOGIN_POPUP)); }
+        catch (e) { log(`[${i}] 登录弹窗探测异常（按未命中继续）:`, e.message); popup = { popup: false, signals: [] }; }
         await cdp.safeScreenshot(path.join(SHOT_DIR, `no-cand-${i}-` + Date.now() + '.png'));
+        if (popup && popup.popup === true) {
+          it.status = 'failed'; it.error = 'login_popup_detected'; it.at = new Date().toISOString();
+          saveManifest(m);
+          log(`[${i}] ${it.keyword} 页面内登录弹窗命中 signals=${JSON.stringify(popup.signals || [])} → login_invalid exit 2`);
+          stopped = { reason: 'login_invalid', at: i };
+          break;
+        }
         it.status = 'failed'; it.error = 'no_candidates'; it.at = new Date().toISOString();
         saveManifest(m);
         continue;
```

apply-ingredients.mjs（原样，仅 2 行）：

```diff
- * apply-ingredients.mjs — T-C05：29 道 FETCHED 菜用料初稿入库（PG）
+ * apply-ingredients.mjs — T-C05：30 道 FETCHED 菜用料初稿入库（PG）
- *   1. 读知识库 out/xhs/ingredients-draft.json（29 道菜，dishId+pgName+commonName+uncertain+ingredients）
+ *   1. 读知识库 out/xhs/ingredients-draft.json（30 道菜，dishId+pgName+commonName+uncertain+ingredients）
```

tc06-drift-check.json：删除尾部 1 行（`DRIFT CHECK PASSED: 29/29 unchanged, 1 added`），其余 221 行逐字节未动（无 git diff 可示，验证见时间线 #10）。

## 四、验证细节

### 4.1 mock 注入方式（探测表达式正反双向，不下发浏览器）
脚本从 batch-fetch.mjs 源码用正则 `/const EXPR_LOGIN_POPUP = String\.raw`([\s\S]*?)`;/` 提取**文件内真实表达式**（EXPR_LEN=381，IIFE 整体含 `(function(){...})()` 包裹），再 `new Function('document', 'return (' + expr + ')')` 构造函数并以 mock document 作为参数调用（document.body.innerText 可控），对返回的 JSON 字符串 JSON.parse 后断言。运行输出原样：

```
EXPR_LEN=381
POSITIVE popup=true signals=["text:登录超限","text:请重新登录"] => PASS
NEG1 popup=false signals=[] => PASS
NEG2 popup=false signals=[] => PASS
EXIT=0
```
- 正向：innerText=`电脑设备登录超限，请重新登录`（T-C06 实锤原句）→ popup:true 且 signals 恰含两枚文本信号。
- 反向 1：innerText=`登录后即可查看更多内容\n扫码登录\n手机号登录\n登录`（含「登录」等常见词、不含两信号子串）→ popup:false。
- 反向 2：innerText=`请使用扫码登录`（相近文案，substring 边界：信号是「请重新登录」非「扫码登录」）→ popup:false。
- 临时脚本置于 %TEMP%，验证后已删除，未污染仓库。

### 4.2 真实 CDP 负向探测（9222 在线，未降级）
脚本经 `GET http://127.0.0.1:9222/json`（只读）筛选 xiaohongshu page tab（取 explore tab），Node 原生 WebSocket 连接其 webSocketDebuggerUrl，下发一次 `Runtime.evaluate`（expression=文件内提取的 EXPR_LOGIN_POPUP，returnByValue:true）。运行输出原样：

```
TARGET url=https://www.xiaohongshu.com/explore/6a4a209d000000002101b02a?xsec_token=ABpHLr3PNq2YNqjzO3k9g2Rc-_b2
CDP_NEGATIVE popup=false signals=[] => PASS
EXIT=0
```
红线遵守：全程仅 1 次只读 evaluate + 1 次只读 /json；未导航、未触碰 cookie/登录态、未增删页面、未重启浏览器。表达式在真实页面未抛异常。

## 五、异常备案（移交主控）

1. **tc06-drift-check.json git 跟踪状态与任务卡前提不符**：
   - 任务卡 §一.4：「该文件已被 git 跟踪（T-C06 入库）」。
   - 实测（2026-09-13）：`git ls-files tools/content-pipeline/out/xhs/tc06-drift-check.json` → 空（未跟踪）；`git check-ignore -v` → `.gitignore:29:tools/content-pipeline/out/`（整目录被忽略）；`git log -- <file>` → 无历史提交。
   - 影响：该文件的 AC3 修复已在工作区生效且验证通过，但不会出现在 `git diff`/常规 `git commit` 中；AC5「M 恰 3 文件」按字面不成立。
   - 已执行部分：文件修改本身属任务卡授权路径内，已完成，未回滚；未做任何 git 扩权操作（未 add -f、未改 .gitignore）。
   - 待主控决策（三选一）：① `git add -f` 强制入库该文件；② 修订 .gitignore 对该文件开白名单后入库；③ 认定 out/ 数据文件不入库、修订 AC3/AC5 口径为「本地工作区修复」。

   > **主控裁决（2026-09-13，选 ③）**：tc06-drift-check.json 认定 out/ 产物不入库——`.gitignore:29 tools/content-pipeline/out/` 系管线产物不入库的既有设计口径，拒绝为一次性验证 JSON 开白名单、拒 add -f 扩权（对齐 DEPLOY-03 先例的适用边界：该先例对象是 evidence/ 下被报告引用的 .log，与本件不同类）。AC3 完成口径=本地工作区 JSON 合法化（已达成），AC5 提交清单修订为 M 恰 2 文件（batch-fetch.mjs + apply-ingredients.mjs）+ 1 本地修复不入库。任务卡 §一.4「已被 git 跟踪」系主控探查失误（误将 `git check-ignore` 输出的路径读作 `git ls-files` 输出），勘误备案于任务卡与本注记，AC5 判定以本裁决口径为准。另：dev 报告 §六 mock/CDP 验证脚本位于 %TEMP%（MIGRATE-CHK-FIX 教训口径：临时物证不可追溯）——verify 验收时须以自建等价脚本独立复跑补齐物证链，物证落 .workflow-verify/login-dom/。
2. **未验证项**：
   - 真实登录弹窗场景的正向 CDP 实跑未做（需登录超限实况，红线禁止人为登出/触碰登录态制造）；正向仅有 mock 注入证据（任务卡 AC4 本就只要求真实 CDP 负向）。
   - exit 2 全链路端到端未实跑（需真实弹窗复现）；实现走既有 `stopped → process.exit(reason==='login_invalid' ? 2 : 3)` 链，与既有 nav1 停止路径（L518）同构，风险低。
3. 其余步骤（行号、回归、CDP）均与任务卡预期一致，无其他异常。

## 六、退出码清单

| 命令 | 退出码 |
|---|---|
| `node --check tools/content-pipeline/batch-fetch.mjs` | 0 |
| mock 正反向验证（node %TEMP%\login-dom-mock-verify.mjs） | 0 |
| CDP 负向探测（node %TEMP%\login-dom-cdp-verify.mjs） | 0 |
| `pnpm --filter @family-menu/content-pipeline test` | 0 |
| tc06-drift-check.json JSON.parse 校验（node -e） | 0 |

git 未提交（等主控统一提交）；临时验证脚本已清理。
