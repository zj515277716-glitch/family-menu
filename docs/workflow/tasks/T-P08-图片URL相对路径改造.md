# T-P08 图片 URL 相对路径改造 + onError 降级兜底（R-10，公网部署前置）

> 状态：**已完成并提交**（2026-09-11 用户批准。fm-dev 8/8 AC + fm-verify 真机 PASS 41/41 + fm-reviewer 有条件通过；**阻塞-1 契约口径冲突挂账 T-P09**：shared `imageUrl: z.string().url()` 与相对路径口径冲突，下次有图新菜 fm-import 必拒——契约变更已获用户批准，见 T-P09 卡）

## 背景

T-P07 复审定级：管线入库时 imageUrl 硬编码 `http://127.0.0.1:3000` 前缀（fetch2dish.mjs L36 DEFAULT_BASE_URL），DB 中 29 道 FETCHED 菜均为绝对 URL；前端 dish 页 `<Image>` 无 onError 兜底。本地可用，但公网部署（Docker+RDS）后公网用户加载 127.0.0.1 必挂且呈破图。**本卡为公网部署 API 的前置条件。**

## AC

- **AC1 管线口径改造**：fetch2dish.mjs 的 imageUrl 生成改为**相对路径** `/images/dishes/<noteId>/<index><ext>`（baseUrl 参数保留但仅作可选前缀或废弃，方案自评估后单列理由）；同步修正相关测试断言与文档注释。
- **AC2 存量数据迁移**：一次性迁移脚本（tools/content-pipeline/migrate-imageurl-relative.mjs）：把 DB 中 `http://127.0.0.1:3000/images/...` 前缀剥为相对路径；幂等（相对路径行跳过）；只动 origin=FETCHED 的 29 道，**既有 19 道菜 imageUrl 为空/不受影响**；执行前后对账（29 行改写、URL 可拼接性校验：相对路径+API 静态目录文件存在性逐条核对）。
- **AC3 真实亮图回归**：迁移后本地真机链路（recommend→lock→详情）亮图仍正常（375×500 全出血、natural 尺寸>0），即"DB 相对路径→前端可见图"全链路成立。
- **AC4 onError 降级兜底**：dish 页 hero `<Image>` 补 onError → 切降级色块态（与无图降级同一渲染分支，不留破图）；loading 态图片加载中可显示占位底色。
- **AC5 基址策略**：前端从相对路径拼出可加载 URL 的方案（读 apps/h5 现有 API client 基址配置复用之；生产环境同一机制适配公网域名），方案与理由落报告；**契约零改动**（imageUrl 字段语义：DB 存相对、出口拼接——若 API mapper 出口拼接则前端零改，若前端拼接则说明理由，二选一）。
- **AC6 测试**：fetch2dish 单测更新后全绿；pnpm test 全绿（记录数字）；h5 typecheck 0 + build EXIT=0。
- **AC7 teardown**：迁移数据为真实数据**保留不回滚**；验证期临时数据删净恢复 Plan=54/Event=93/Menu=13/MenuDish=42/Dish=48/Ingredient=79/CookLog=6；三端口=0、PG 停、CDP 存活；报告落盘 evidence/T-P08-dev-2026-09-10.md。
- **AC8 独占 PG，不并行**。

## 边界

- 允许：tools/content-pipeline/**（fetch2dish 口径 + 迁移脚本 + 测试）、apps/api/src/services/mappers.ts（若选出口拼接方案）、apps/h5/src/pages/dish/index.tsx + index.css（onError 兜底）、相关测试文件。
- 禁改：packages/shared、prisma、apps/api 其他文件（如确需动先停下报告）、采集抓取脚本（xhs-fetch/batch-fetch——它们不产 imageUrl，无需动）、两个产品文档、e-final/design-spec。
- 沙箱纪律：>30s Start-Process 脱离+轮询；退出码 $LASTEXITCODE；临时脚本 .cjs；PG 启动带 -l 脱离。

## 异常升级

缺信息或卡外问题 → 停手写进完成报告。
