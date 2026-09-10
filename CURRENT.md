# CURRENT.md — 项目现状快照（AI 维护）

> **维护规则**：状态每次实质变化后由 AI 更新本文件。产品负责人无需阅读审核。
> 与 [PRODUCT-CONFIRMATION.md](./PRODUCT-CONFIRMATION.md) 冲突时，以后者为准。
> 快照时间：2026-09-10 ｜ 基线 git HEAD：`f1b0954`（分支 feat/tp-06-menu-expansion；EMPTYFIX 构建产物 39eeb0c6 已部署公网）

## 一句话现状

原型骨架齐全（6 个页面 + 12 条 API + 230 项模拟测试通过），但四条核心链路在代码层断裂，从未在真实数据库环境完整跑通，未部署。

## 已证实的断裂点（代码证据见 [evidence/BASELINE-2026-09-04.md](./evidence/BASELINE-2026-09-04.md)）

1. **必消食材失效**：前端传中文名原文，引擎按 ingredientId 匹配，必不命中，且无任何提示。——**TP-02 已修复**（中文名→ID 稳定映射 + 引擎硬过滤 + 空手原文回传，见 [evidence/TP-02-2026-09-04.md](./evidence/TP-02-2026-09-04.md)）
2. **单菜换是假动作**：API 只记一笔事件并原样返回，前端却弹"已换菜"成功提示。——**TP-03 已修复**（真实替换并持久化：同类型候选挑选+换菜原因选填+清单与备菜顺序联动重算+服务端复检，见 [evidence/TP-03-2026-09-04.md](./evidence/TP-03-2026-09-04.md)）
3. **整套换无菜可换**：种子菜库 4 套菜单、仅 3 套 PUBLISHED；推荐时三套全上，整套换只会打乱旧菜重排。——菜库已扩至 **12 套 PUBLISHED（TP-06）**；「整套换」功能本身仍在推迟清单，实施时须一并处理 swapPlan 全换分支 mustUse 原文映射
4. **反馈学习断链**：Event 表无 menuId 字段，映射层丢弃反馈内容，历史接受度（权重 0.35，最大维度）恒取中性值。——**映射断裂 TP-06 已修复**（toEventView 按 join 规则补齐 menuId/dishId/cookedResult，历史接受度与近期多样性降权在真实 API 恢复生效；TP-05 已修复记录侧三问落库）
5. **Mock 自动兜底**：H5 未配置 API 地址即自动切换假数据演示模式（当前未配置任何 .env，即永远假数据）。
6. **真实环境零验证**：本机无 Docker/PostgreSQL/ECS，DB 集成、e2e 冒烟、部署、回滚均无证据；README 五步冒烟清单从未真实执行。

## 文档 vs 代码 vs 验证 矛盾清单（9 条）

| # | 文档说法 | 实际 |
|---|---|---|
| 1 | README：F1-F7 冒烟清单"每步可达" | 从未真实跑过（STATUS 自认"需 CI/用户补验"） |
| 2 | STATUS：项目停在 5be260c，"待用户审核" | 实际 HEAD=bc8d9ff，其后另有 4 次未记录提交（UI 重设计、菜品页、换菜修补） |
| 3 | 设计文档：换菜"返回新候选替换该卡" | 后端只记事件原样返回，前端弹假成功 |
| 4 | 引擎设计：历史反馈是 0.35 权重最大维度 | 表结构+映射双重断裂，维度恒中性 |
| 5 | 设计文档：必用食材"搜索选择"、候选卡标"未消耗" | 中文名≠ingredientId 必不命中；候选卡无标注 |
| 6 | README：5 个页面 | 实际 6 个（多的菜品做法页来自未记录进 STATUS 的提交） |
| 7 | "230 项测试通过" | 全部模拟环境；H5 独立类型检查曾失败；无真实 DB/e2e/部署证据 |
| 8 | 仓库纪律：一任务一分支、审批合入 | 实际直接在 main 连续提交 |
| 9 | — | 根目录两个以代码片段命名的空残文件；11 项未跟踪内容未整理 |

## 工作区现场（2026-09-04）

- 分支 main，HEAD `bc8d9ff`；11 项未跟踪内容**原样保留**未清理（含空残文件 `console.error(e))` 与 `{console.log('候选数`）。
- 历史四件套（AGENTS.md / STATUS.md / DECISIONS.md / 开发日志.md）与 docs/ 全部原样保留，仅作追溯对照，不再作为需求依据。

## 当前所处阶段

- 已完成：[产品确认书](./PRODUCT-CONFIRMATION.md) **A/B/C 全文定稿**（PD-001~012）；UI 基准锁定（PD-011）；功能行为与验收 13 条确认通过，含 3 处默认行为拍板（PD-012）。
- 已完成：**TP-01 运行与生产安全基线**（2026-09-04，证据见 [evidence/TP-01-2026-09-04.md](./evidence/TP-01-2026-09-04.md)）——本机真实 PostgreSQL（PG 17.5 @ 127.0.0.1:54329）建立，H5 移除 Mock 兜底与令牌硬编码，类型检查修复，并修复了脚手架缺失 `src/index.html` 导致页面打不开的问题。基线 6 个切片任务全部完成。
- **TP-01 完成标志已达成**：本机前端（:10086）→ API（:3000）→ 真实数据库（:54329）整条链打通，验证 6/6 + 7/7 全绿，禁忌集 66/66。
- 已完成：**TP-02 必消食材切片**（2026-09-04，证据见 [evidence/TP-02-2026-09-04.md](./evidence/TP-02-2026-09-04.md)）——中文名→ingredientId 稳定映射（name/aliases 归一）；引擎必消从加分项改**硬过滤**（feasibilityFilter 两轮过滤，PD-001：用不上的方案直接不出现）；契约 v0.3 新增 optional `unmetMustUse`（DEC-012）；空手场景全链路（API 空手不建 Plan/不写 Event + 前端空手卡片屏⑥文案 + C-3 必消已用上横幅）。
- **TP-02 完成标志已达成**：输入「番茄」→ 推荐/不推荐判定可证据复现（e2e 7/7 含空手用例）；输入「苦瓜」→ 200+`{candidates:[], unmetMustUse:["苦瓜"]}`+不建 Plan；单测 166/166 + 禁忌 69/69 + h5 类型检查全绿。
- 已完成：**TP-03 换菜切片（真实替换）**（2026-09-04，证据见 [evidence/TP-03-2026-09-04.md](./evidence/TP-03-2026-09-04.md)）——契约 v0.4（DEC-013：reason 选填+newDishId+SwapOptions 三 schema）；engine `filterSwapCandidates` 五层过滤（安全>一切，PD-001 不因换菜被击穿）；API `GET /swap-options`（空候选=200+空数组）+ `swap` 服务端复检（400+中文原因）+ 锁定候选 menu 快照重写 + 清单/备菜顺序联动重算（勾选保留）；h5 删假合并+换菜弹窗两态（候选带耗时/口味+「共 N 个」如实展示+原因选填）。
- **TP-03 完成标志已达成**：换菜后界面、数据库、清单三者一致——e2e 28 PASS / 0 FAIL 含 PG 直查三一致（库=界面、库=清单）+SWAP_DISH 事件落库；全量 258/258 + 禁忌 82/82 + h5 类型检查全绿。
- 已完成：**TP-04 购物清单切片**（2026-09-04，证据见 [evidence/TP-04-2026-09-04.md](./evidence/TP-04-2026-09-04.md)）——契约 v0.5（DEC-014：ShoppingListItemSchema 结构化+alreadyHave/pantryStaple 标记+Rescale schema+RESCALE 事件）；必消食材标「已有」不删（PD-004）；常备调料标「家里常备」保留不删（C-8/DEC-014 裁决 4）；按人数缩放分量取整（PD-005：qty×people/4，保底 1）+ 新路由 `POST /shopping-list/rescale`（按 ingredientId 保留勾选与标记重算+同步情境人数）；h5 采购清单人数步进器+绿/灰标签+提示+「就按这个买」按钮。
- **TP-04 完成标志已达成**：人数缩放与「已有」标记数值证据可复现——e2e 19 PASS / 0 FAIL（番茄 200g→100g→50g→200g 往返一致、alreadyHave 全程保留、勾选跨 rescale 保留、PG 直查 RESCALE 事件 payload from/to）；全量 274/275（1 项性能抖动单跑即过）+ 禁忌 82/82 + h5 类型检查全绿。**e2e 抓住一处产品级遗漏**（数据库枚举未迁移）并已修复，过程记录见证据 §2.3/§5。
- 已完成：**TP-05 反馈三问切片**（2026-09-05，证据见 [evidence/TP-05-2026-09-05.md](./evidence/TP-05-2026-09-05.md)）——契约 v0.6（DEC-015：三问模型 didCook/taste/willRepeat + 耗时选填，旧 result/cookResult/failPoints 移除）；复用 Event COOKED/NOT_COOKED 零迁移 + CookLog taste 单向映射（good→success/ok→partial/fail→fail，没做不写 CookLog）；覆盖重提 = append-only 事件流 + GET 取最新一条（didCook 由事件类型派生，feedback 写/读不走 requireLockedPlan）；Plan.status：做了→COOKED / 没做→SKIPPED；h5 三问页（回显可改重提+失败保答案）+ 历史页 C-11 结果标签（红>黄>灰>绿派生）+「约 N 分钟」+ 旧五项表单移除。
- **TP-05 完成标志已达成**：三问提交后数据落库证据可复现——e2e 16 PASS / 0 FAIL（PG 直查：Event payload 三问字段、CookLog result 映射、Plan.status 翻转、append-only 累计 2 条、GET 最新、没做不写 CookLog）；旧五项表单已移除；全量 285/286（AC12 抖动单跑 51/51）+ 禁忌 82/82 + 三层类型检查全绿。反馈评分消费侧（学习闭环）按 PD-006 推迟。
- 已完成：**TP-06 菜库扩充切片**（2026-09-05，证据见 [evidence/TP-06-2026-09-05.md](./evidence/TP-06-2026-09-05.md)）——内容管线闭环：fm-import 导入 9 道家常菜品 DRAFT → menu-assemble 纯规则组装（零 LLM，单测 10/10）→ fm-menu 写 9 套菜单 DRAFT → 产品负责人确认 → 幂等发布；**PUBLISHED 菜单 3→12 套**（7 套工作日快手 15-22 分钟 + 2 套周末炖菜 38/40 分钟）、**PUBLISHED 菜品 9→18 道**，零草稿泄漏。
- **TP-06 完成标志已达成**：发布菜单数量证据（publish-result.json：publishedMenuTotal=12，9 套管线明细）+ 推荐多样性可复现（diversity-result.json 6/6 PASS：5 轮「推荐→锁定」循环首选 5 套不同菜单、周末菜单浮出）。**卡外修复**：toEventView 事件映射丢弃 payload 的集成缺陷（基线断裂点第 4 条消费侧），历史接受度与多样性降权在真实 API 恢复生效；回归 296/296 + 禁忌 82/82 + 双 build 0 错。
- 已完成：**TP-07 公网部署切片**（2026-09-05，证据见 [evidence/TP-07-2026-09-05.md](./evidence/TP-07-2026-09-05.md)）——阿里云 ECS 8.136.32.223 Docker 化部署 + 阿里云 RDS 独立新库 family_menu_v2（迁移+种子+数据导入）+ 子域名 menu.jijingkongjian.xin（已备案域名）+ certbot HTTPS（80 强制 301 跳 443）+ 口令保护（无令牌 401）+ 旧部署全量备份 /opt/family-menu.bak-TP07（回滚资产，旧 caddy 未动）。**卡外修复**：planService.getExclusions Prisma null 与契约 zod optional 不兼容致公网 400——服务层 null→undefined 归一化（契约零改动），公网 200 生效。
- **TP-07 完成标志已达成**：公网 URL 可用证据（https://menu.jijingkongjian.xin 首页 200）+ 冒烟清单 9 项全绿（鉴权 401/计划 45 条/禁忌 2 条/推荐 3 候选真实建 Plan 等）+ 回滚预案成文；本地 apps/api 回归 68/68。
- 已完成：**TP-08 UAT 交付切片**（2026-09-05）——通俗中文交付消息发给产品负责人：固定地址 https://menu.jijingkongjian.xin（打开即用，口令已内置）+ 测试家庭张家四口 + 6 个真实任务（打开网站/设置页看禁忌/必消食材推荐 3 候选/选定锁定看清单备菜/人数缩放分量/反馈三问+历史四色标签）+ 每步预期；交付前逐页核实真实按钮文案与口令内置事实。
- 已完成：**TP-08 EMPTYFIX 上线修复**（2026-09-06，开发日志 TP-08-EMPTYFIX-COMPLETE）——必消输入未确认被静默丢弃：点推荐自动收进输入框文字（39eeb0c6 上线）；手机端服务未连接（生产构建 .env.production 注入线上地址）、TabBar 图标尺寸改走 pxtransform（与 e-final 口径一致）、食材库补「西蓝花」等日常写法别名（seed upsert update 分支补 aliases 同步治本，线上 6 词实测全部出套餐）、入口页 no-store 三连防旧版缓存；新增 H5 部署脚本（备份+原子切换）与线上必消验证脚本。
- 进行中：产品负责人 6 任务 UAT 持续收集反馈；发现问题→后台修复循环。
- 已完成：**T-P01 试点闭环**（2026-09-06，证据见 [evidence/T-P01-2026-09-06.md](./evidence/T-P01-2026-09-06.md)）——四角色闭环首次完整跑通：fm-dev 交付必消回归测试（17 断言真实 HTTP+PG 直查，零业务改动）→ fm-reviewer 静态复审**通过**（对抗性审查无阻断，6 条建议级问题记录在案）→ fm-verify 本地独立验收**通过**（17 PASS/0 FAIL/EXIT=0 + 独立抽样 8 PASS + 停服端口复测）→ 主控清理验收残留测试数据（Plan 56→51、Event 95→90）。2026-09-06 用户裁决后 git 提交 `be4f9a3`（10 文件，分支 feat/tp-06-menu-expansion）；两项挂账已收敛：teardown 列入 T-P02 验收强制项，组合必消空手定案 PD-014。
- 工作流切换：2026-09-06 起四角色工作流（主控 PM / fm-dev / fm-reviewer / fm-verify）生效，能力验证五项通过（派发/独立返回/失败拦截/权限隔离/新会话恢复，见 [evidence/WF-VERIFY-2026-09-06.md](./evidence/WF-VERIFY-2026-09-06.md)）。Playwright 已获授权（2026-09-06），浏览器级页面验收纳入 T-P02 验收环节执行，**挂账已核销**（T-P02 四场景真实浏览器验收完成）。
- 已完成：**T-P02 组合必消凑不进一桌提示**（2026-09-06，证据见 [evidence/T-P02-2026-09-06.md](./evidence/T-P02-2026-09-06.md)）——四角色闭环第二次跑通：fm-dev 交付屏⑥ C-7a 组合空手变体（composeEmptyTitle 动态量词「这一样/这两样/这三样」+ 空手卡三分支，+20/-3 行）+ UI 基准先行（e-final 屏⑥变体 B + design-spec）+ PD-014 文档三件套 → fm-reviewer 复审**通过**（无阻断，5 条建议级）→ fm-verify 真实浏览器 Playwright 四场景验收**通过**（S2 C-7a / S3 C-7 逐字断言命中、consoleErrors=[]、tp01 回归 17 PASS、build EXIT=0、teardown Plan 61→54 RESIDUAL=0、基线 54/93 精确还原）。契约/引擎/API 零改动（diff 7 文件 +58/-12，禁区零越界）。**卡外发现 E1**：dev API 无 CORS 处理（OPTIONS 预检 401 零 CORS 头），浏览器直调 :3000 被阻断——生产同源部署不受影响，挂账待独立新卡（验收以 Playwright route 挂具代答预检完成，方法学已披露）。**环境异常**：会话中途工作区回滚（未提交编辑与未跟踪文件消失），主控按 HEAD 锚点全量重放恢复，零丢失，根因未定位待观察。2026-09-06 用户裁决后 git 提交 `3656d65`（10 文件）。
- 已完成：**T-P03 dev API 跨域(CORS)处理**（2026-09-06 开卡当日闭环，证据见 [evidence/T-P03-2026-09-06.md](./evidence/T-P03-2026-09-06.md)）——E1 修复四角色闭环第三次跑通：fm-dev 交付 `@fastify/cors` ^11.3.0 白名单方案（origin 仅 `['http://127.0.0.1:10086','http://localhost:10086']`、credentials:true、注册于 cookie 之后 preHandler authHook 之前，onRequest 短路预检，附插件源码行号自证；app.ts +19/-1）+ 18 断言真实 HTTP 回归（tests/tp03-cors-regression.cjs，无 Mock）→ fm-reviewer 复审**通过**（无阻断，4 条建议级 B-1~B-4；B-1 证据链由 fm-verify 独立复跑补齐）→ fm-verify 验收**通过**（AC1 预检 204+四头回显 18 PASS/0 FAIL、AC2 鉴权语义不变 8 条（无令牌仍 401/带令牌 200/同源不变）、AC3 无挂具真实浏览器两场景直调（西红柿→候选页、苦瓜→空手卡）5 PASS + consoleErrors=[]、tp01 回归 17 PASS、teardown Plan 60→54 / Event 99→93 精确还原 RESIDUAL=0、端口监听杀净=0）。禁改区零越界。生产同源部署零行为变更；裸 OPTIONS 401→400 行为变化已披露（B-3）。2026-09-06 用户裁决后 git 提交 `f1b0954`（7 文件 +356/-8，含新增依赖 @fastify/cors ^11.3.0）。
- 已完成：**T-P04 采购页「开始做菜」入口**（2026-09-10 闭环，证据见 [evidence/T-P04-2026-09-10.md](./evidence/T-P04-2026-09-10.md)）——UAT 反馈 2 四角色闭环第四次跑通：确认书 C-8 先行修订 + PD-015 登记 → fm-dev 交付 plan/index.tsx（+18/-3：goFirstDish 取 lockedMenu.dishes[0] 复用 goDish + 底栏两态按钮「就按这个买→开始做菜」，「✓ 已按这个买」代码正文删除）+ e-final s7 两态注释（+3）→ **AC2 顺序核实链：dishes 数组顺序=prepSequence**（seed 手写/content-pipeline 同源/换菜继承重算，fm-reviewer 五处独立核实无反例）→ fm-reviewer 复审**通过**（3 建议级无阻断）→ fm-verify 验收**通过**（第 7 轮正式 22 PASS/1 FAIL，唯一 FAIL V5=GET feedback 设计内 404 的原生 console 打印，主控裁定**豁免**并挂账优化为 200+null；无挂具真实 Edge 8 截图 s0~s6；teardown 两轮删 Plan 8 行/Event 16 行 → 54/93 含构成逐项一致；三端口=0、PG 已停）。**R-1 流程缺口**（fm-dev 完成报告未落盘 evidence/）由 fm-verify 独立补齐证据（34 文件）+ 主控撰写归档；根治挂入 T-P05 派发纪律（fm-dev 完成报告强制落盘 evidence/T-Pxx-dev-*.md）。2026-09-10 用户裁决（提交/追认 V5 豁免/内容轨道 3 决策：下厨房浏览器自动化、契约扩展批准、小红书尝试 CDP 采集）后 git 提交 `0e5db8e`（8 文件 +159/-9，新增任务卡与 evidence）。
- 边界：UI 基准 = [e-final.html](./docs/ai-rebuild/ui/e-final.html) + [design-spec.md](./docs/ai-rebuild/ui/design-spec.md)，UI 改动须先改确认书 B 节再动代码；预览 http://localhost:8888/docs/ai-rebuild/ui/e-final.html。
- 进行中（内容轨道，与代码轨道并行，WIP=1 不适用）：**T-C03 fetch 内容入库链路**（2026-09-10 闭环，证据见 [evidence/T-C03-2026-09-10.md](./evidence/T-C03-2026-09-10.md)）——用户四项裁决（T-C01/T-C02 提交 out/ 不入库、out/ 入 .gitignore、migrate resolve 授权、T-C03 立项）后执行：T-C01/T-C02 提交 `4b237d1`（15 文件 +1026/-5）；R-5 checksum 修复完成（resolve 报 P3008 已应用 → 改走 prisma db execute 直更 _prisma_migrations.checksum=文件 sha384，migrate status 恢复全绿，migrate dev 阻塞解除）；T-C03 双轮 fm-dev 交付（fetch2dish.mjs 转换 CLI + import --origin FETCHED 显式授权路径（R-4 处置，默认双保险不削弱）+ @fastify/static 静态图片服务（新依赖，app.ts +11）+ C-2 魔数归一扩展名；第一轮代码中断由第二轮续作补齐并修复 CLI 默认路径缺陷）→ fm-reviewer 复审**通过**（B-5/B-6/R-8~R-11 六建议级）→ fm-verify V1~V7 全 PASS（双保险强制覆盖实证、图片 SHA256×3 一致、97/97+346/346、teardown 六表逐项一致）。**内容轨道三段式全部就绪：CDP 采集→fetch2dish→import --origin FETCHED（DRAFT）→人工微调→升 PUBLISHED**。T-C03 停「待用户审核」。

下一步：**T-C03 待用户裁决（提交/R-8 管线 test script/R-11 static gitignore/B-5 B-6 修补时机）**；代码轨道队列——①T-P05 必消模糊/别名匹配（先技术方案：别名表 vs 包含匹配 vs 输入联想）②T-P06 做法详情页图文改版（2-3 套方向稿；含 R-3 防抖与上一道/下一道导航）③R-2 挂账：loadMenuViews/hydrateLockedMenu 补 orderBy:{sort:'asc'}（独立小卡）④V5 根因挂账：GET feedback 404→200+null；内容轨道队列——下厨房抓取卡（用户已授权浏览器自动化，复用 CDP 9222 会话）、批量填充菜谱池实操（T-C03 链路已就绪）、R-9 DRAFT 只读口挂账。fm-reviewer 建议级遗留 B-2/B-3/B-4（T-P03）后续排期。
