# T-P15 imageUrl regex 收紧（挂账⑧）

> 立项依据：挂账⑧「DishSchema.imageUrl 站内相对路径分支过宽」；证据链 T-P09（契约 v0.7 放宽为 `/^\/images\//`）→ T-P08 迁移后 DB origin='FETCHED' 29 行全部形如 `/images/dishes/<noteId>/<i><ext>` → normalizeImageExt 产出扩展名白名单恒定（webp/jpg/png/gif）。2026-09-12 与 T-P14 同批经用户批准定稿（含差异拍板：只留 jpg 不留 jpeg、保留 gif）。

## 目标

把 DishSchema.imageUrl 站内相对路径分支从「`/images/` 开头即可」收紧为「必须指向内容管线真实落盘结构」，杜绝误入路径：`/images/dishes/<noteId>/<i>.<ext>`，其中 noteId=`[A-Za-z0-9]+`、i=非负整数、ext∈{webp,jpg,png,gif}（硬编码小写）。

## 定稿口径（用户批准，不得改动）

- 新 regex（逐字符）：`/^\/images\/dishes\/[A-Za-z0-9]+\/\d+\.(webp|jpg|png|gif)$/`
- 与 T-P09 建议差异拍板：
  1. **不含 jpeg**：normalizeImageExt 把 image/jpeg Content-Type 与 `.jpeg` URL 后缀均归一为 `.jpg`（fetch2dish.spec.ts L69/L91 在案），落盘文件名与 DB 29 行均无 `.jpeg` 实例；
  2. **保留 gif**：normalizeImageExt 支持 GIF8 魔数落 `.gif`（L83 在案），收掉会中断管线兜底路径。

## 影响面（主控 2026-09-12 核查）

- **唯一校验点** [dish.ts](../../../packages/shared/src/schemas/dish.ts) L54；消费面：
  - tools/content-pipeline：[import.ts](../../../tools/content-pipeline/src/import.ts) `DraftFileSchema=DishSchema.extend`、[draft.ts](../../../tools/content-pipeline/src/draft.ts) `DishSchema.parse`——收紧后不合规路径在入库/起草时被拒（正是本卡目的；draft.ts 已有重试机制）
  - [schemas.spec.ts](../../../packages/shared/test/schemas.spec.ts) L243-264 存量用例值 `/images/dishes/6a55c68e000000001c025017/0.webp` 恰好仍合规
  - [import.spec.ts](../../../tools/content-pipeline/test/import.spec.ts) L105-133、[fetch2dish.spec.ts](../../../tools/content-pipeline/test/fetch2dish.spec.ts) L171-195 产出/用例值均形如 `/images/dishes/<hex24>/<i>.<ext>` 合规
- **零影响面**：apps/api（[mappers.ts](../../../apps/api/src/services/mappers.ts) L171 仅透传 `row.imageUrl ?? undefined`；projection-order.spec.ts 用绝对 URL 走 union URL 分支）、apps/h5（仅渲染 toAbsoluteImageUrl）、schema.prisma（`String?` 无 zod）
- **DB 实证**：origin='FETCHED' 且 imageUrl 非空 29 行 100% 符合新 regex（挂账⑧在案记录，AC5 复核）

## AC（验收线，逐条 [✓]/[✗] 自检）

- **AC1** [dish.ts](../../../packages/shared/src/schemas/dish.ts) L54 regex 替换为定稿值（逐字符一致）+ L52 注释区追加 v0.10 行；union 结构（url 分支不动）与 optional 不变；shared typecheck/tsc 0 错
- **AC2** [api.ts](../../../packages/shared/src/schemas/api.ts) 头部账本追加 v0.10 行（2026-09-12，T-P15，挂账⑧；含拍板差异一句备注）；既有 v0.2~v0.9 行零改动
- **AC3** shared 测试新增收紧用例至少覆盖：`/images/` 泛前缀（如 `/images/abc.jpg`）拒绝、`.jpeg` 扩展名拒绝、`.svg`/无扩展名拒绝、webp/jpg/png/gif 四合法扩展名各通过、目录结构不符（`/images/dishes/`、`/images/dishes/abc/` 无文件名）拒绝、大写扩展名（`.WEBP`）拒绝；存量 T-P09 用例值逐一核对：仍合规的不动，若发现语义冲突的用例值**停下报主控**（不得私自改值）
- **AC4** 全量回归：根 `pnpm test` 数字自洽（T-P14 基线 390/390 0 skipped，新增用例须算术自洽）+ `pnpm test:taboo` 89/89 + content-pipeline 测试全绿 + h5 `typecheck` 0 错 + api `tsc` 0 错
- **AC5** DB 只读复核：便携 PG 启动（命令见输入资源），SQL 验证 29 行全部匹配新 regex（逐行输出 + 计数 29/29），用后 `-m fast stop`
- **AC6** 完成报告落盘 `evidence/T-P15-dev-2026-09-12.md`：影响面核对结果、AC3 用例清单与结果、AC5 复核真实输出、全部测试命令+退出码+数字

## 输入资源

- [dish.ts](../../../packages/shared/src/schemas/dish.ts)（L52-55 改动点）/ [api.ts](../../../packages/shared/src/schemas/api.ts)（头部账本 L3-21）
- [schemas.spec.ts](../../../packages/shared/test/schemas.spec.ts) L208-264 / [import.spec.ts](../../../tools/content-pipeline/test/import.spec.ts) L105-133 / [fetch2dish.spec.ts](../../../tools/content-pipeline/test/fetch2dish.spec.ts) L61-195
- [fetch2dish.mjs](../../../tools/content-pipeline/fetch2dish.mjs) L80 normalizeImageExt（拍板依据；禁改）
- CURRENT.md 挂账⑧条目（定稿 regex + 拍板差异）
- 环境：便携 PG 未启动，dev 自行 `& "d:\codex\family-menu\.pg\bin\pg_ctl.exe" -D "d:\codex\family-menu\.pg\data" -o "-p 54329" -l "d:\codex\family-menu\.pg\pg-tp15dev.log" start`——**必须带 `-o "-p 54329"`**（缺省走 conf 端口 5432 会连接拒绝）；连接串 `.env` postgresql://postgres@127.0.0.1:54329/family_menu；用完 `-m fast stop` 还原

## 边界约束

- 允许改：packages/shared/src/schemas/dish.ts、api.ts（仅头部账本追加 v0.10 行）、packages/shared/test/schemas.spec.ts（新增用例）
- 禁改：schema.prisma、apps/api/**、apps/h5/**、packages/engine/**、fetch2dish.mjs 及 content-pipeline src/**；content-pipeline test/** 仅当存量用例值与新 regex 冲突时最小修并在报告说明，否则不动
- 禁升级依赖及任何依赖新增；卡外发现写报告不顺手改；WIP=1（本卡独占会话）

## 异常升级路径

存量用例/DB 行与新 regex 冲突 / api 或 h5 出现意料外校验点 / content-pipeline 测试非预期失败 → 停手报主控，不得自行放宽 regex 或删用例。

## 终态（2026-09-12 主控补登）

**判定：已完成，随卡提交**——fm-dev AC1~AC6 全 [✓] → fm-reviewer **PASS-有条件**（9 审查点全 [✓]；条件=verify 复跑移交清单 1~6，已全部命中，见 [T-P15-review](../../../evidence/T-P15-review-2026-09-12.md)）→ fm-verify **PASS（8 项主复跑全命中 + 3 项静态确认 + 2 项可选佐证，与 dev/review 零数字差异）**。证据三件套：[T-P15-dev](../../../evidence/T-P15-dev-2026-09-12.md) / [T-P15-review](../../../evidence/T-P15-review-2026-09-12.md) / [T-P15-verify](../../../evidence/T-P15-verify-2026-09-12.md)。

- **实现交付**：[dish.ts](../../../packages/shared/src/schemas/dish.ts) L55 regex 收紧为定稿值（union URL 分支与 optional 未动）+ L53 v0.10 注释行；[api.ts](../../../packages/shared/src/schemas/api.ts) 头部账本 v0.10 行（+4/−0）；[schemas.spec.ts](../../../packages/shared/test/schemas.spec.ts) 新增 1 it/11 组断言（+27/−0）。恰 3 文件 +33/−1，禁区零越界，新增依赖 0。
- **AC3 测试覆盖**：webp/jpg/png/gif 四合法扩展名各通过；泛前缀 `/images/abc.jpg`、`.jpeg`、`.svg`、无扩展名、目录结构不符（`/images/dishes/`、`/images/dishes/abc/`）、大写 `.WEBP` 全拒绝；存量 T-P09 用例零改动零冲突。
- **回归与 AC5**：根 pnpm test **391/391 0 skipped**（T-P14 基线 390+1 新用例算术衔接）+ taboo 89/89 + content-pipeline 等效命令 15 files/391 全绿 + shared build/h5 typecheck/api tsc 全 0 错；AC5 DB 只读复核 **29/29 全 MATCH**（PG `\d` 与 `[0-9]` 双形式 + dish.ts 同款 JS regex 三重验证，逐行输出与 dev 一致）。
- **review 定案**：S-1 行号勘误成立（regex 实际 L55、注释 L53，本卡原文 L54/L52 偏 1 行，归档以实际行号为准）；S-2 定案 +27/−0 准确（review 估算 26 系漏计一空行）；S-3/S-4 记录级观察挂账（sanitizePathSegment 允许 `-_` 与定稿字符类的理论边缘不一致、`\d+` 前导零余量——均为定稿口径既定设计，当前 DB 29 行 hex24 零影响）。
- **卡外发现（挂账）**：content-pipeline test script 未继承 T-P13 串行修复（package.json L23 无 `--no-file-parallelism`，文件并行下 AC12 性能用例 flaky——dev 3 连败 + verify 4 跑 2 败 2 过共同佐证 CPU 竞争根因）；shared 单包 test 空跑（include 相对子包 cwd 无匹配）记录在案。均未越界处理，挂账见 CURRENT.md。
- **verify 环境披露**：会话起点存在一处先前遗留的 api dev 挂起包装（未监听端口、非本卡引入、未处置）；PG/端口还原干净（54329 CLOSED、3000 未监听）；临时产物仅落 `.workflow-verify/tp15/`。
- **未覆盖移交**：公网 RDS 等价复核属挂账①部署清单范围。
