# 家庭菜谱App 开发状态
> 本文件由主Agent维护。任何时刻只允许一个活动任务卡（DEC-003）。

## 当前状态
- 当前阶段：STEP-04 推荐引擎+清单合并器（WP-03/06）（开发中）
- main HEAD：7ad971c；回滚tag：rollback-before-step-04 -> 7ad971c；契约冻结tag：v0.1
- 阻塞/外部依赖：无
- 下一个人工决策点：STEP-04 交付审核（M2 里程碑：禁忌集100%阻断）

## 当前任务卡：STEP-04 推荐引擎+清单合并器（对应 WP-03/06）
状态: 开发中    回环计数: 0/3
执行者: fm-dev    审查者: fm-reviewer（只读）
需求来源: 实施方案第四章（推荐引擎设计 4.1-4.4）+ 第五章仓库结构（engine/list-merger 目录）+ 7.2 WP-03 任务卡示例 + 7.1 WP-03/WP-06 + 8.1 STEP-04 + DEC-006（零LLM）+ STEP-02 契约 v0.1    基线提交: main@7ad971c    回滚点: rollback-before-step-04

### ① 目标
实现推荐引擎三层管道（safetyFilter/feasibilityFilter/score）+ diversify（packages/engine，纯函数零IO），禁忌集100%阻断；实现采购清单合并器（packages/list-merger，纯函数）；修复 pnpm test:taboo 脚本（STEP-01 遗留）。达成 M2 里程碑。

### ② 验收标准 AC
- [ ] AC1 engine/src/types.ts 定义核心接口（TonightContext/RecommendInput/ScoredMenu/FilterTrace/ScoreDim/recommend 签名 + View 类型），对齐 4.2 第281-312行
- [ ] AC2 engine/src/safety.ts safetyFilter（第一层：HARD禁忌过滤，成分未确认滤除，产出 FilterTrace），对齐 4.1 第269行；安全层永远先于评分，不可被权重覆盖
- [ ] AC3 engine/src/feasibility.ts feasibilityFilter（第二层：时长/器具硬过滤，mustUse无法消耗->标记而非过滤），对齐 4.1 第270行
- [ ] AC4 engine/src/score.ts score（第三层：6维评分，权重 0.35×历史接受度 + 0.20×时长难度匹配 + 0.15×食材复用 + 0.10×偏好覆盖 + 0.10×近期多样性 + 0.10×膳食类别多样性），对齐 4.1 第271-275行，无随机性（固定输入回归一致）
- [ ] AC5 engine/src/diversify.ts diversify（第四层：取Top-N后错开主蛋白/风格，输出3套+每套reasons[]），对齐 4.1 第276行
- [ ] AC6 engine/src/recommend.ts recommend 主函数（串联四层，输出 {candidates: ScoredMenu[], filtered: FilterTrace[]}，不足3套时如实返回并说明），engine/src/index.ts 统一导出
- [ ] AC7 engine/test/{taboo.spec.ts, score.spec.ts, fixtures/} 禁忌测试集（HARD规则×含该成分菜单，变形用例：别名/隐含成分/可选食材含禁忌，断言filtered含且candidates不含）+ 评分回归测试 + fixtures
- [ ] AC8 list-merger/src/{normalize,units,merge}.ts 实现 mergeShoppingList（同食材合并经aliases归一 -> 单位换算 -> 按category分组 -> 去除家庭常备调料），对齐 4.4 第323-329行
- [ ] AC9 list-merger/test/merge.spec.ts 合并测试（含单位换算、别名归一、分组、去常备，错误率<1%门槛）
- [ ] AC10 pnpm test:taboo 修复（vitest.config.ts 添加 test.projects 或改脚本为 pnpm --filter @family-menu/engine test），exit 0，禁忌集100%阻断
- [ ] AC11 pnpm verify exit 0（lint 零 error，build 成功，test 通过），单测覆盖率≥90%（engine + list-merger）
- [ ] AC12 pnpm -r build 成功（不破坏 shared/api/h5 现有构建），千套菜单库单次 recommend 调用<50ms（性能测试）

### ③ 输入资源
- docs/plan/实施方案.md @7ad971c：
  - 第四章 推荐引擎设计（第 262-329 行）：4.1 三层管道+diversify / 4.2 核心接口签名 / 4.3 禁忌测试集 / 4.4 采购清单合并器
  - 第五章仓库结构（第 357-361 行）：engine/src/{types,safety,feasibility,score,diversify,recommend}.ts + test/{taboo.spec.ts,score.spec.ts,fixtures/} / list-merger/src/{normalize,units,merge}.ts + test/merge.spec.ts
  - 7.2 WP-03 任务卡示例（第 577-582 行）：目标/AC/输入/边界/异常
  - 7.1 WP-03（第566行）/ WP-06（第569行）
  - 8.1 STEP-04（第609行）：M2 里程碑 禁忌集100%阻断
- DECISIONS.md @7ad971c（DEC-006 运行时零LLM；DEC-008 YAGNI边界）
- STEP-02 契约 v0.1 @v0.1 tag（packages/shared zod schema + 类型 + 常量，engine/list-merger 依赖）
- AGENTS.md @7ad971c（铁律8：引擎相关改动必跑 pnpm test:taboo；Ownership: packages/engine 归属 WP-03，packages/list-merger 归属 WP-06）
- 现有基线 @7ad971c：
  - packages/engine/src/index.ts（仅 PACKAGE_NAME 导出，骨架占位）
  - packages/engine/test/placeholder.spec.ts（占位测试）
  - packages/engine/package.json（已依赖 @family-menu/shared workspace:* + vitest ^4.1.10）
  - packages/list-merger/src/index.ts（仅 PACKAGE_NAME 导出，骨架占位）
  - packages/list-merger/test/placeholder.spec.ts（占位测试）
  - packages/list-merger/package.json（已依赖 @family-menu/shared workspace:* + vitest ^4.1.10）
  - vitest.config.ts（仅 test.include，无 test.projects -> test:taboo 失效）
  - 根 package.json（test:taboo = "vitest run --project engine"，需修复）

### ④ 边界约束（不允许做什么）
- 可修改：packages/engine/* + packages/list-merger/* + vitest.config.ts + 根 package.json（仅 test:taboo 脚本）
- 禁改 packages/shared（契约 v0.1 已冻结，变更须走契约变更流程）
- 禁改 apps/*（WP-04/05 范围）
- 引擎纯函数零IO/零LLM/零数据库依赖（4.2 铁律），输入输出全是内存对象
- 不做 ML/协同过滤/LLM调用/数据库读写
- 评分权重属 HOW，按 4.1 默认权重（0.35/0.20/0.15/0.10/0.10/0.10）实现并在完成报告注明
- 安全层永远先于评分，不可被任何权重覆盖（4.2 铁律）
- 不改 docker-compose.yml / 四件套 / 实施方案 / prisma
- 不引入 DEC-008 禁止项（Redis/消息队列/微服务/K8s）
- 新增依赖在完成报告列出并说明理由（如 @vitest/coverage-v8 用于覆盖率统计）

### ⑤ 异常升级路径
- 契约缺字段（shared v0.1 不满足 engine 需求）-> 停下@队长转 fm-arch（契约变更流程）
- 评分权重争议 -> 属 HOW，按 4.1 默认权重实现并注明假设
- 引擎性能不达标（千套<50ms） -> 完成报告注明，报队长评估
- 禁忌集无法100%阻断 -> 阻塞，报队长诊断（不可放过）
- 第3次被打回 -> 停止修改，等队长诊断

## 最小测试（fm-tester 照跑，真实执行，禁止Mock冒充）
- `pnpm install --frozen-lockfile`（exit 0）
- `pnpm verify`（lint+build+test，exit 0，lint 零 error）
- `pnpm test:taboo`（exit 0，禁忌集100%阻断，**M2 发布门槛**）
- `pnpm -r build`（不破坏其他包构建）
- 覆盖率：engine + list-merger 单测覆盖率≥90%（vitest --coverage）
- 性能：千套菜单库 recommend 单次调用<50ms

## 审查重点
- 三层管道实现与 4.1 逐项一致（safetyFilter/feasibilityFilter/score 权重）
- 接口签名与 4.2 一致（TonightContext/RecommendInput/ScoredMenu/FilterTrace/recommend）
- 禁忌测试集与 4.3 一致（HARD×含成分菜单，别名/隐含/可选变形，断言filtered含且candidates不含）
- 清单合并器与 4.4 一致（归一->换算->分组->去常备）
- 引擎纯函数零IO/零LLM/零数据库依赖
- 安全层永远先于评分
- 与 shared v0.1 契约一致（不修改 shared）
- test:taboo 修复有效（exit 0）
- 覆盖率≥90%，无随机性
- 目录结构与第五章一致（engine/src/{types,safety,feasibility,score,diversify,recommend}.ts + list-merger/src/{normalize,units,merge}.ts）

## 交付门禁
开发（fm-dev）-> 独立测试（fm-tester，真实环境）-> 交叉审查（fm-reviewer，只读）-> 主复验 -> 状态改"待用户审核"并暂停；
用户批准前不合并、不启动下一 STEP（DEC-005）。**M2 里程碑：禁忌集100%阻断**。

## 完成报告（fm-dev 填写）
- AC自检: [ ]AC1...（逐条[✓]/[✗]）
- 交付物: <路径@commit>
- 测试结果: <用例通过数/exit code/覆盖率/性能ms>
- 新增依赖及理由: <列出>
- 遗留与下一步建议:

## 审查报告（fm-reviewer 填写，任何✗=打回，回环+1）
- [ ] 契约一致性（三层管道与4.1一致；接口与4.2一致；禁忌集与4.3一致；合并器与4.4一致；与shared v0.1一致）
- [ ] 越界检查（仅改 packages/engine + packages/list-merger + vitest.config.ts + 根package.json；不改 shared/apps/四件套/实施方案）
- [ ] 安全缺陷（无LLM调用DEC-006；无DEC-008禁止项；安全层先于评分不可覆盖；纯函数零IO）
- [ ] 逻辑正确性（safetyFilter HARD过滤正确；score 权重正确无随机性；diversify 错开逻辑正确；mergeShoppingList 合并正确；禁忌集100%阻断；覆盖率≥90%）
- [ ] 可维护性（命名规范；纯函数可测；目录结构与第五章一致）

## 总任务拆解
| STEP | 对应WP | 内容 | 状态 |
|---|---|---|---|
| STEP-00 | - | 协作框架四件套 | 已合并 |
| STEP-01 | WP-00 | 工程基线（monorepo骨架+本地PG18 Docker+CI） | 已合并 |
| STEP-02 | WP-01 | 契约冻结（shared zod schema，v0.1） | 已合并 |
| STEP-03 | WP-02 | 数据层（schema.prisma+migration+seed） | 已合并 |
| STEP-04 | WP-03/06 | 推荐引擎+清单合并器 | 进行中 |
| STEP-05 | WP-04 | API（Fastify路由+口令鉴权+契约测试） | 未开始 |
| STEP-06 | WP-05 | H5前端（5页面走通） | 未开始 |
| STEP-07 | WP-07 | 内容管线CLI | 未开始 |
| STEP-08 | WP-09/10 | 部署+集成验收 | 未开始 |
