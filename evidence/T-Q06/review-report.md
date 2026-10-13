# T-Q06 独立审查报告（fm-reviewer，2026-10-13）

结论：**通过**
版本：基线 main@a23d979 ← 待审 t-q06-tdesign-probe@ac4febb（本地与 origin 一致）
阻断问题：无
风险：探针页 91 行手写样式属任务卡授权范围（见表 6 注），记录备查
未验证：dev:h5 人工实机点开未复跑（采纳开发 Playwright 截图+日志，3 处抽查均吻合）；DB 集成测试因本机无 PG 跳过（main 基线同样跳过，非本分支弱化）

## 我执行了（干净 worktree @ ac4febb 实跑，非开发自述）
- `git diff --stat a23d979..ac4febb`：24 文件 +780/-0
- `pnpm install --frozen-lockfile`：exit 0（锁文件与 package.json 同步）
- `pnpm lint`：exit 0，零告警
- `pnpm -r exec tsc --noEmit`：exit 0（干净检出需先做预存引导：构建 engine/list-merger + prisma generate，dummy DATABASE_URL 仅进程环境变量、未碰 .env；引导后全包通过）
- `pnpm test`：exit 0，28/28 文件通过，503 通过 / 20 跳过
- `pnpm check:secrets`：exit 0，0 命中（521 个 git 跟踪文本文件）

## 逐项核对
| # | 检查项 | 结论 | 命令与证据 |
|---|---|---|---|
| 1 | 范围合规 | PASS | diff 仅含 apps/h5/package.json(+1)、app.config.ts(+2)、新增 pages/probe/tdesign/、evidence/T-Q06/、pnpm-lock.yaml；`git diff --name-only` 过滤 .env/dist/packages/shared/apps/api/test 零命中；无现有页面/组件/契约改动、无构建产物入库 |
| 2 | 门禁实跑 | PASS | 上述命令 exit 全 0；引擎未改动故 test:taboo 非必跑，且 taboo.spec.ts 18 用例在 pnpm test 内通过 |
| 3 | 证据核验 | PASS | probe-report.md 27 行≤1页，6 验证点逐项结论+定案建议齐全；抽查：01b（「探针页，非产品界面」banner、实测 --td-brand-color=#c8541f、TD 按钮 40px vs NutUI 32px）、07 vs 10（Stepper 受控 value=2 显示 0、点 + 变 1，怪癖属实）、runtime-log.txt（实测值与报告一致）、bundle-size.txt（+332KB raw / +77KB gzip，隔离于探针页异步 chunk 345，既有 chunk 零影响） |
| 4 | 红线 | PASS | secrets 0 命中；grep apps/h5/src 无现有页面引用探针路由（login 的 probe() 经 `git show a23d979` 证实为基线已有登录态探测）；app.config.ts 无原生 tabBar、CustomTabBar 未改；探针页零网络请求 → 无运行时 LLM 调用；测试文件零改动（无删除/跳过/弱化） |
| 5 | 可复核性 | PASS | app.config.ts:20 注册 pages/probe/tdesign/index（附隔离注释）；package.json tdesign-mobile-react ^0.23.3，pnpm-lock.yaml 锁定 0.23.3 |
| 6 | 设计规则 7 条 | PASS | 手输编号✅（无）／静默按钮✅（全按钮 setLastAction 反馈）／英文直出✅（全中文，截图佐证）／三态✅（List/Loading/Empty 实测演示）／表单丢值✅（受控 useState）／裸请求✅（零请求）／手写样式✅* |
| 7 | L2 影响清单 | N/A | 任务卡定级 L1 |

*探针页 index.css 91 行手写样式：任务卡明确授权「新增探针页文件」，类名 .probe- 前缀隔离、非产品界面、定案后分支不合并，不计违规。

## 总结论
开发自述属实：门禁全绿、证据链完整可追溯、范围零越界；「有条件可用，建议沿用 NutUI，分支留档不合并」的定案建议有实测证据支撑。审查**通过**，可交产品负责人定案。

## 建议级意见（不入账）
1. app.config.ts 第 2 行注释「6 页面路由」与实际 9 条不符，下次顺手修正。
2. 留档分支建议把 tdesign-mobile-react 钉为精确 0.23.3（去掉 ^），归档后复现更稳。
3. 干净检出的门禁引导步骤（构建 engine/list-merger + prisma generate）目前靠口口相传，建议在项目规则「常用命令」补一行。
