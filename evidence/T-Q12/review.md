结论：通过（最终审查 c039033，含 0d54572/d709846/c039033）：3 提交仅读取侧投影/失败语义/H5 文案，未改 shared/engine/prisma 契约；无新增阻断，达完成五层第 2 层
版本：c039033（93cecfc..c039033，7 文件 +130/-5）   我执行了：pnpm lint exit 0；pnpm -r exec tsc --noEmit exit 0；pnpm test 675 passed/3 failed（exit 1，失败仅 a3 B3/B4 + migration-backfill「存量 CookLog 回填」既有挂账，涉及文件未改，无新增）；pnpm test:taboo 161 passed；pnpm check:secrets 0 命中；专项复跑 plan-projection 3 + dayplan-integration 5 全绿
API 投影：normalizePlanContext 仅 people/timeBudgetMin 为 number 且 mustUse 为数组才保留，三餐 context={}→undefined；只改 toPlan 读取侧，swap 仍读原始行；存量完整单餐原样（plan-projection 3 例）；残缺行降级 undefined，不伪造
全换守卫：仅 next.meals 全空（空数组亦算）抛 SwapRecheckError，部分失败不拦；抛前不落库/不写 Event；真实库用例断言原 dayPlan 不变+SWAP_MENU=0，createdPlanIds 精确清理
H5 文案：home/day-menu/shopping 三屏改「⚠ {error}」；断网显示「网络不稳定，连不上服务…」+重试且无假菜单（S-13/S-08 截图证实）；day-menu 加载错误态仅代码核对；非网络错误如实显示服务端文案
证据：verify.md 66/66，run-log 一致；40 张 750×1624（375×812@2x）覆盖 S-03 正常/空/加载、S-04 重进不丢+吸底、S-05、S-06 换一道(0/候选)/换一餐/全换失败保持+刷新同份、S-07、S-08 两段备菜+勾选刷新、S-13
未覆盖：全换成功替换路径（池耗尽仅验失败）、S-04/S-06 加载错误态截图、真机字号/弱网、生产只读冒烟与生产 build
建议：S-06 副标题「今晚 13:19 生成」非晚间语义不准（改为「生成于 HH:mm」或按日期）；想吃的 reason 重复且带规则串；verify.md「未改业务代码」宜改为「验收过程未改代码」
