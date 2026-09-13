# LOGIN-DOM 任务卡：batch-fetch 登录失效检测 DOM 弹窗探测升级 exit 2（+ 内容卡顺手项搭车）

> 派发：主控｜日期：2026-09-13｜执行：fm-dev
> 挂账来源：T-C06 dev 卡外发现 1 + T-C06 review S-2（立项建议原文：「no_candidates 分支增加 DOM 级登录弹窗探测并升级 exit 2」）+ CURRENT.md L84 挂账队列（S-3 核销后的队列下一项）。

## 一、背景与事实（已由主控探查定谳，dev 不必重复探查）

1. **T-C06 实锤缺陷链**（[T-C06-dev §1/§2](./T-C06-dev-2026-09-13.md)）：页面弹出「电脑设备登录超限，请重新登录」登录弹窗，URL 停留 `/search_result` **不跳 `/login`**；batch-fetch.mjs 登录失效检测仅 URL 级（L255/L441/L469 `u.includes('/login')`）全部穿透 → 候选提取 0（state+DOM 双路径空，sources=[]，含 2.5s 二次提取）→ 落 `no_candidates` 分支记 manifest failed 继续 → 最终 **exit 0**（登录失效被误报为「完成」）。截图证据：`.workflow-verify/tp-c04/no-cand-17-1789248726547.png`。
2. **同构缺陷备案（本卡不改）**：xhs-fetch.mjs L335-341/L388-394 同为 URL-only 检测（该脚本退化路径为连续 2 次失败 exit 3，非 exit 0，危害较低且非批量主力）→ 备案挂账，不在本卡边界内。
3. **搭车项 1**（T-C06 review S-1）：apply-ingredients.mjs 头注释 L3「T-C05：29 道 FETCHED 菜用料初稿入库」与 L6「（29 道菜，…」仍写 29 道，与 30 道口径不符（T-C06 已补第 30 道；脚本逻辑值 L69/L119 已在 T-C06 改为 30，仅头注释残留）。纯注释零逻辑。
4. **搭车项 2**（T-C06 verify 移交 + 队列原文）：tools/content-pipeline/out/xhs/tc06-drift-check.json 尾行混入非 JSON 文本 `DRIFT CHECK PASSED: 29/29 unchanged, 1 added`（成因：drift-check.mjs 本体只 console.log 不写文件，系当时 PowerShell stdout 捕获落盘把 JSON 与文本行一起写入；脚本本体无 bug 不动，只修数据文件）。该文件已被 git 跟踪（T-C06 入库）。

   > **主控勘误+裁决（2026-09-13，dev 执行中报备后）**：上句「已被 git 跟踪（T-C06 入库）」**失实**——主控探查失误（误将 `git check-ignore` 输出读作 `git ls-files` 输出）；实测：`git ls-files` 空、`git check-ignore -v` 命中 `.gitignore:29:tools/content-pipeline/out/`、`git log --all` 无历史。**裁决选 dev 移交三选一之 ③**：out/ 产物不入库系既有设计口径，AC3 完成口径=本地工作区 JSON 合法化（不入 git），AC5 提交清单修订为 **M 恰 2 文件**（batch-fetch.mjs + apply-ingredients.mjs），本文件本地修复不入库。详见 dev 报告 §五.1 主控裁决注记。

## 二、AC（逐条自检，[✓]/[✗] + 证据）

### AC1 DOM 弹窗探测落地（核心）
- batch-fetch.mjs 新增页面端探测表达式 `EXPR_LOGIN_POPUP`（String.raw IIFE 风格与既有 EXPR_CANDIDATES 一致），**信号仅用实锤文本**：`body.innerText` 含「登录超限」或「请重新登录」（来源=T-C06 截图+dev 报告 §2 原句「电脑设备登录超限，请重新登录」；substring 匹配覆盖句内变体）。**禁止引入未实锤的结构性信号**（如 QR selector/password input 等 DOM class 猜测）——注释中写明信号来源与「文案彻底改版则漏报、按截图人工介入」的局限声明。
- **唯一探测点 = no_candidates 分支**（现行 `if (!v.ok || !v.cands || v.cands.length === 0)` 块，含 2.5s 二次提取之后）：先探测 → 命中则 `it.error='login_popup_detected'` + `stopped={reason:'login_invalid', at:i}` + log 带 signals → break（走既有 `process.exit(stopped.reason === 'login_invalid' ? 2 : 3)` 链，exit 2）；未命中则保持既有 `no_candidates` 行为逐字不变。截图 safeScreenshot 保留。
- 既有 URL 级检测（L255/L441/L469）、no_qualified_candidate 分支、exit 3 连续失败链、BATCH_CONSEC_FAIL_STOP、MAX_CANDIDATES_PER_KEYWORD=12 全部零改动。
- 头部注释 L11 登录失效口径同步：「登录失效（URL 跳 /login 或页面内登录弹窗）立即 exit 2 不重试」+ 简要注记（T-C06 实锤/LOGIN-DOM）。

### AC2 搭车项 1：apply-ingredients.mjs 头注释 29→30
- L3「T-C05：29 道 FETCHED 菜用料初稿入库」→ 30 道口径；L6「（29 道菜，dishId+…」→ 30 道。仅头注释两处，其余任何行零改动（脚本逻辑/校验值不动）。

### AC3 搭车项 2：tc06-drift-check.json 尾行剥离
- 剥离 JSON 结束 `}` 之后的文本行 `DRIFT CHECK PASSED: 29/29 unchanged, 1 added`，文件成为可 `JSON.parse` 的合法 JSON；JSON 内容区（除尾行外）逐字节不变。

### AC4 验证
- `node --check tools/content-pipeline/batch-fetch.mjs` EXIT=0。
- 探测表达式**正反两向验证**（node 内联 `new Function('document', expr)` 注入 mock document，不下发真实浏览器、不碰 9222）：
  - 正向：mock `document.body.innerText='电脑设备登录超限，请重新登录'` → 返回 JSON `popup:true` 且 signals 含两文本信号；
  - 反向：mock 正常态 innerText（含「登录」「登录」入口按钮等常见词但**不含**两信号子串）→ `popup:false`；再单测反向含「请使用扫码登录」等相近但不命中文案 → `popup:false`（substring 边界确认：信号是「请重新登录」不是「扫码登录」）。
- 真实 CDP 负向探测（9222 在线且登录态正常时）：对当前 explore/search_result tab 下发 `EXPR_LOGIN_POPUP` → `popup:false`（负向实跑佐证）；**若 9222 不可达则降级为 mock 验证 + 报告备案，不得为验证而触碰浏览器登录态/cookie/页面**。
- 回归：`pnpm --filter @family-menu/content-pipeline test` 全绿 0 failed（报实际 files/tests 数并说明与基线衔接；本卡预期不新增/不改动任何测试文件）。

### AC5 git 边界
- 工作区 M 恰 3 文件：`tools/content-pipeline/batch-fetch.mjs`、`tools/content-pipeline/apply-ingredients.mjs`、`tools/content-pipeline/out/xhs/tc06-drift-check.json`；禁区（packages/shared、packages/engine、apps/api/**、xhs-fetch.mjs、fetch2dish.mjs、import）零 diff；历史遗留 untracked 杂物不属本卡。新增依赖 0。测试文件 0 改动。

## 三、边界约束
1. 红线：不碰 9222 浏览器登录态/cookie、不登出、不重启浏览器、不增删页面；探测验证只允许 CDP 只读 evaluate（负向）。
2. 不改 xhs-fetch.mjs（同构缺陷已备案挂账）；不改 fetch2dish/import；不改 drift-check.mjs 本体。
3. 探测信号仅实锤文本两枚；不猜 DOM class/selector。
4. manifest 字段形状不变（error 值新增枚举 `login_popup_detected` 属设计内）；manifest 既有 29 条 items 数据零触碰。
5. 涉 packages/shared 或超出上述 3 文件 → 立即停手报主控。

## 四、异常升级路径
- CDP 不可达 → 降级 mock 验证并备案（AC4 已预留）。
- 探测表达式在真实页面 evaluate 抛异常 → 记录异常原文，停手报主控（不得自行改信号集）。
- 回归测试失败 → 按失败点定位，涉及非本卡文件即停手报主控。

## 五、交付物
- 代码 3 文件 + dev 报告落盘 `evidence/LOGIN-DOM-dev-2026-09-13.md`（时间线含真实命令+退出码、AC 逐条 [✓]/[✗] 自检、git diff --stat 原样粘贴）。git 不提交（主控统一提交）。
