# T-Q09 引擎三餐联合规划（L2）独立审查报告

审查人：fm-reviewer（全部命令实跑取证）｜基线 main@28adb64 → 待审 t-q09-engine-dayplan@0df406b（本地分支，推送因代理故障未上 origin）

## 逐项结论

1. **范围合规 PASS**：`git diff --stat 28adb64..0df406b` 共 15 文件（+2417/-14），仅 packages/engine（9 文件）+ evidence/T-Q09（6 份门禁证据）；apps/、packages/shared、DB schema、部署零改动；无构建产物入库（engine dist 已 gitignore）。
2. **门禁 PASS**（退出码均为实跑）：`pnpm lint`=0；`pnpm -r exec tsc --noEmit`=0；`pnpm test:taboo`（=vitest run packages/engine/test/）=0，10 文件 161 全通过（taboo 21=18+3 新增、day-plan 28）；`pnpm test`=1：554 例中 2 失败，均在 apps/api/test/a3-reputation.spec.ts B3/B4。
3. **a3 同败复核 PASS**：切 main@28adb64 同库同环境重跑该 spec，B3/B4 同样 2 failed/4，「main 同败」主张实证成立，与本卡 diff 无关（该 spec 与 apps/api 在本卡零改动）。复核后已切回分支并重建 dist。
4. **功能核验 PASS**：自建临时脚本（跑完即删、未入库）对 dist 实跑 18 断言全过——①同输入两次 planDay 逐字节一致；②长期 HARD（鸡蛋）+ 临时忌口（牛肉）三餐零出现，且 trace 独立标注「临时忌口」；③必消小米/牛肉全部用上，mustUseAllocation 含餐次+菜名落位；④儿童>0 时辣/刺多/过硬全天零出现；⑤replanMeal 换晚餐后早/午餐不变、必消仍全用上、跨餐主蛋白不重复（不可满足时如实放宽标注）；⑥空手按餐归因：无菜型 breakfast→NO_DISH、时间型→TIME_BUDGET，出路均非空、午/晚照常出餐。
5. **红线 PASS**：`pnpm check:secrets` 0 命中（563 个跟踪文件）；引擎零 IO/零 LLM（src 无 fetch/openai/process.env/网络地址新增）；taboo.spec 全 diff 仅 1 行删除（import 扩展），无 skip/only/todo，测试只增不改弱；无运行时 AI。
6. **设计规则 7 条**：本卡无 UI——1 手输编号 / 2 静默按钮 / 4 三态 / 5 表单丢值 / 7 手写样式均不适用；3 英文直出 PASS（MEAL_SLOT_LABELS 早餐/中餐/晚餐，归因与出路文案全中文）；6 裸请求 PASS（引擎零请求）。
7. **安全不变量 PASS**：HARD 禁忌先于评分（day-plan.ts prepareSafetyStage→filterSafeDishes 在 score 调用之前，且 taboo 测试对产出做 dish 级安全复核）；无 DB 改动，targetId 悬空不涉及；产物无本机地址/口令（check:secrets 0 命中）。
8. **L2 影响清单 6 问 PASS（分散覆盖）**：数据含义不变（TonightContext 保留兼容、契约下卡对齐）；历史/学习链路沿用 A3（避开窗口参数化、默认 7 天逐位一致）；安全不变量保持（taboo 全绿）；环境差异已取证（a3 main 同败）；前端/缓存无需同步（apps 零改动）；回滚兼容性见第 9 项。未见独立成文清单，记建议。
9. **回退 PASS**：临时 worktree 中 `git revert` 两提交（0df406b+c8188e6）后树与 28adb64 零 diff；engine tsc=0；引擎测试 9 文件 130 全绿（161-28-3 精确吻合基线）。worktree 元数据已 prune。
10. **页面一致性**：本卡无 UI 改动、无设计稿截图——页面未验证（不适用）。

## 结论：**通过**

未验证/遗留：回退验证残留的 worktree 目录 `D:\codex\fm-revert-check` 因沙箱白名单无法删除（git 元数据已 prune，仅磁盘文件），请产品负责人手动执行 `Remove-Item -Recurse -Force D:\codex\fm-revert-check`；a3-reputation B3/B4 为预存在环境问题（main 同败，与本卡无关）。

## 建议级意见（不入账）

1. L2 卡的影响清单 6 问建议交付说明独立成文（本次散落在两提交说明+任务卡，可追认但不利审查）。
2. 根 package.json 预存在的 `test:gate = pnpm test || pnpm test || pnpm test` 与红线「失败重跑直到通过=门禁作废」冲突（非本卡引入），建议移除或改名。
3. a3-reputation spec 的中性前提对本地真实库数据敏感，建议后续开卡加固 fixture 隔离（本次已实证与本卡无关）。
