# 家庭菜谱App 开发状态
> 本文件由主Agent维护。任何时刻只允许一个活动任务卡（DEC-003）。

## 当前状态
- 当前阶段：STEP-07 内容管线CLI（WP-07）（待用户审核）
- main HEAD：7cdea44；回滚tag：rollback-before-step-07 -> 7cdea44；契约冻结tag：v0.2
- 阻塞/外部依赖：无
- 下一个人工决策点：STEP-07 交付审核

## 当前任务卡：STEP-07 内容管线CLI（对应 WP-07）
状态: 待用户审核    回环计数: 0/3
执行者: fm-dev    审查者: fm-reviewer（只读）
需求来源: 实施方案第386-391行目录结构 + 第570行WP-07 + 第584-589行WP-07详细定义 + 第612行STEP-07 + 第70行豆包SDK + 第661行安全双保险 + 第695行产物只落DRAFT + 第703行铁律6 + DEC-006运行时零LLM + STEP-02契约v0.2(DishSchema) + STEP-03数据层(prisma)    基线提交: main@7cdea44    回滚点: rollback-before-step-07

### ① 目标
实现内容管线三段CLI：coverage（覆盖矩阵缺口）+ draft（豆包批量起草->JSON）+ import（审核通过->DB DRAFT）。产物永远只落DRAFT状态。工具仅本机运行，不进服务器。

### ② 验收标准 AC
- [ ] AC1 tools/content-pipeline/src/coverage.ts 覆盖矩阵（时长×主蛋白×器具×场景 -> 缺口清单），对齐第388行+第586行
- [ ] AC2 tools/content-pipeline/src/draft.ts 起草CLI（--slot=weekday_fast,chicken,30min 调豆包批量起草 -> out/*.draft.json），对齐第389行+第586行
- [ ] AC3 draft产出JSON过shared zod校验（DishSchema/MenuSchema），失败自动重试3次，对齐第586行
- [ ] AC4 tools/content-pipeline/src/prompts/menu-draft.md 起草提示词（含"食材带用量与单位、步骤标注可并行"约束），对齐第390行+第586行
- [ ] AC5 tools/content-pipeline/src/import.ts 导入CLI（审核通过的JSON -> DB status=DRAFT），对齐第391行+第586行+第661行
- [ ] AC6 import仅写入DRAFT（双保险：DB status三态+import只写DRAFT），对齐第661行+第695行+第703行
- [ ] AC7 豆包API调用用火山方舟OpenAI兼容SDK（已有订阅），对齐第70行；工具仅本机运行不进服务器，对齐第792行
- [ ] AC8 运行时零LLM（DEC-006）：管线在tools/非apps/，运行时代码（apps/）不调用LLM
- [ ] AC9 CLI可执行（pnpm --filter content-pipeline coverage/draft/import 命令可跑，--help可显示）
- [ ] AC10 pnpm verify exit 0（lint零error，build成功，test通过）
- [ ] AC11 pnpm -r build成功（不破坏其他包构建）
- [ ] AC12 单元测试（coverage矩阵计算+import校验+draft重试逻辑mock）

### ③ 输入资源
- docs/plan/实施方案.md @7cdea44：
  - 第386-391行：tools/content-pipeline/目录结构（coverage.ts/draft.ts/prompts/menu-draft.md/import.ts）
  - 第570行：WP-07内容管线 - coverage/draft/import三个CLI+提示词，1天
  - 第584-589行：WP-07详细定义
    - ①目标：豆包批量起草->人工审核->导入DB三段CLI，产物永远只落DRAFT
    - ②AC：coverage列出覆盖矩阵缺口 / draft --slot=weekday_fast,chicken,30min产出过shared zod校验的JSON（失败自动重试3次）/ import仅写入DRAFT / 提示词含"食材带用量与单位、步骤标注可并行"约束
    - ⑤异常升级路径：豆包输出持续过不了校验->报队长转架构师会话修提示词（回环+1）；API配额不足->抛人工决策
  - 第612行：STEP-07内容管线CLI，1-2天
  - 第70行：内容管线用火山方舟OpenAI兼容SDK（豆包，已有订阅），只在生产时起草，运行时零调用
  - 第661行：安全越线 - LLM产物未审入推荐池 - DB层status三态+import只写DRAFT（双保险）
  - 第695行：tools/content-pipeline 豆包起草CLI，产物只能落DRAFT状态
  - 第703行：运行时代码禁止调用任何LLM API；管线产物只落DRAFT状态
  - 第792行：tools/content-pipeline（仅本机运行，不进服务器）
  - 第853行：DRAFT->TESTED->PUBLISHED，升级仅通过试做记录（CookLog）
- STEP-02 契约 v0.2 @v0.2 tag：packages/shared/src/schemas/dish.ts（DishSchema/DishIngredientSchema/IngredientSchema + MealRole/ContentStatus/ContentOrigin + DishStep）
- STEP-03 数据层 @7cdea44：apps/api/prisma/schema.prisma（Dish model: status=DRAFT, origin=LLM_DRAFT；DishIngredient/Ingredient/Substitution model）
- AGENTS.md @7cdea44（第695行：tools/content-pipeline产物只落DRAFT；第703行铁律6：运行时零LLM，管线产物只落DRAFT）
- DECISIONS.md @7cdea44（DEC-006：运行时代码禁止调用LLM API）
- 现有基线 @7cdea44：
  - tools/content-pipeline/src/index.ts（临时骨架）
  - tools/content-pipeline/package.json（已有 @family-menu/shared workspace:*）
  - tools/content-pipeline/tsconfig.json
  - .env.example（第792行：# tools/content-pipeline，ARK_API_KEY=...）

### ④ 边界约束（不允许做什么）
- 可修改：tools/content-pipeline/*
- 禁改 packages/shared（v0.2 冻结）
- 禁改 packages/engine / packages/list-merger
- 禁改 apps/api / apps/h5
- 禁改 prisma/schema.prisma
- 禁改 docker-compose.yml / 四件套 / 实施方案
- 管线在 tools/ 非 apps/（DEC-006：运行时代码 apps/ 禁止调用LLM API，管线 tools/ 允许调用豆包API）
- 产物只能落 DRAFT 状态（双保险：import 只写 status=DRAFT）
- 不引入 DEC-008 禁止项
- 新增依赖在完成报告列出（预计：openai 或 @ark-ai-sdk/openai 或类似豆包SDK）
- git 提交信息 [WP-07] 动词开头

### ⑤ 异常升级路径
- 豆包输出持续过不了shared zod校验 -> 报队长转fm-arch修提示词（回环+1）
- API配额不足 -> 抛人工决策
- 豆包SDK兼容性问题 -> 报队长
- 第3次被打回 -> 停止修改

## 最小测试（fm-tester 照跑，真实执行，禁止Mock冒充）
- `pnpm install --frozen-lockfile`（exit 0）
- `pnpm verify`（lint+build+test，exit 0，lint零error）
- `pnpm -r build`（不破坏其他包构建）
- CLI可执行验证：pnpm --filter content-pipeline coverage --help / draft --help / import --help

## 审查重点
- 三段CLI（coverage/draft/import）与第386-391行目录结构一致
- coverage覆盖矩阵（时长×主蛋白×器具×场景 -> 缺口清单）
- draft产出JSON过shared zod校验（DishSchema/MenuSchema），失败重试3次
- import仅写入DRAFT（双保险）
- 提示词含"食材带用量与单位、步骤标注可并行"约束
- 豆包API在tools/非apps/（DEC-006合规）
- 产物只落DRAFT状态
- 工具仅本机运行不进服务器

## 交付门禁
开发（fm-dev）-> 独立测试（fm-tester）-> 交叉审查（fm-reviewer）-> 主复验 -> 状态改"待用户审核"并暂停；
用户批准前不合并、不启动下一 STEP（DEC-005）。

## 完成报告（fm-dev 填写）
- AC自检: [ ]AC1...（逐条[✓]/[✗]）
- 交付物: <路径@commit>
- 测试结果: <用例通过数/exit code>
- 新增依赖及理由: <列出>
- 遗留与下一步建议:

## 审查报告（fm-reviewer 填写，任何✗=打回，回环+1）
- [ ] 契约一致性（三段CLI与第386-391行一致；draft产出过shared zod校验；import只写DRAFT）
- [ ] 越界检查（仅改 tools/content-pipeline/*；不改 shared/engine/list-merger/api/h5/prisma）
- [ ] 安全缺陷（DEC-006合规：LLM在tools/非apps/；产物只落DRAFT；双保险；不进服务器）
- [ ] 逻辑正确性（coverage矩阵正确；draft重试3次；import只写DRAFT；提示词约束完整）
- [ ] 可维护性（CLI命名规范；提示词可维护；代码CC<=15）

## 总任务拆解
| STEP | 对应WP | 内容 | 状态 |
|---|---|---|---|
| STEP-00 | - | 协作框架四件套 | 已合并 |
| STEP-01 | WP-00 | 工程基线 | 已合并 |
| STEP-02 | WP-01 | 契约冻结 v0.1 | 已合并 |
| STEP-03 | WP-02 | 数据层 | 已合并 |
| STEP-04 | WP-03/06 | 推荐引擎+清单合并器 | 已合并 |
| UI设计 | - | 前置UI设计 | 已完成 |
| STEP-05 | WP-04 | API（Fastify路由+口令鉴权+契约测试） | 已合并 |
| STEP-06 | WP-05 | H5前端（5页面走通+契约v0.2遗留修复） | 已合并 |
| STEP-07 | WP-07 | 内容管线CLI（coverage/draft/import三段） | 进行中 |
| STEP-08 | WP-09/10 | 部署+集成验收 | 未开始 |
