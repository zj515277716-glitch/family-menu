# 家庭菜谱App 开发状态
> 本文件由主Agent维护。任何时刻只允许一个活动任务卡（DEC-003）。

## 当前状态
- 当前阶段：STEP-04 推荐引擎+清单合并器（WP-03/06）（已合并）
- main HEAD：7d2e1a3；回滚tag：rollback-before-step-04 -> 7ad971c；契约冻结tag：v0.1
- 阻塞/外部依赖：无
- 下一个人工决策点：STEP-05 启动指令（或 UI 设计前置对齐）

## 当前任务卡：STEP-04 推荐引擎+清单合并器（对应 WP-03/06）
状态: 已合并    回环计数: 1/3
执行者: fm-dev    审查者: fm-reviewer（只读）
需求来源: 实施方案第四章（推荐引擎设计 4.1-4.4）+ 第五章仓库结构（engine/list-merger 目录）+ 7.2 WP-03 任务卡示例 + 7.1 WP-03/WP-06 + 8.1 STEP-04 + DEC-006（零LLM）+ STEP-02 契约 v0.1    基线提交: main@7ad971c    回滚点: rollback-before-step-04

### ① 目标
实现推荐引擎三层管道（safetyFilter/feasibilityFilter/score）+ diversify（packages/engine，纯函数零IO），禁忌集100%阻断；实现采购清单合并器（packages/list-merger，纯函数）；修复 pnpm test:taboo 脚本（STEP-01 遗留）。达成 M2 里程碑。

### ② 验收标准 AC
- [✓] AC1 engine/src/types.ts 定义核心接口（TonightContext/RecommendInput/ScoredMenu/FilterTrace/ScoreDim/recommend 签名 + View 类型），对齐 4.2 第281-312行
- [✓] AC2 engine/src/safety.ts safetyFilter（第一层：HARD禁忌过滤，成分未确认滤除，产出 FilterTrace），对齐 4.1 第269行；安全层永远先于评分；重构后 6 子函数全部 CC<=15
- [✓] AC3 engine/src/feasibility.ts feasibilityFilter（第二层：时长/器具硬过滤，mustUse无法消耗->标记而非过滤），对齐 4.1 第270行
- [✓] AC4 engine/src/score.ts score（第三层：6维评分 0.35/0.20/0.15/0.10/0.10/0.10），无随机性；重构后 6 子函数全部 CC<=15
- [✓] AC5 engine/src/diversify.ts diversify（第四层：错开主蛋白/风格，输出3套+reasons[]）；不可变性已修复
- [✓] AC6 engine/src/recommend.ts recommend 主函数（串联四层，{candidates,filtered}），index.ts 统一导出
- [✓] AC7 engine/test/{taboo.spec.ts(18), score.spec.ts(48), fixtures/} 禁忌测试集+评分回归+fixtures
- [✓] AC8 list-merger/src/{normalize,units,merge}.ts mergeShoppingList（归一->换算->分组->去常备）
- [✓] AC9 list-merger/test/merge.spec.ts(27) 合并测试
- [✓] AC10 pnpm test:taboo exit 0，禁忌集100%阻断（66 tests）
- [✓] AC11 pnpm verify exit 0（148/148），覆盖率 branches 94.97%>=90%
- [✓] AC12 pnpm -r build 成功，千套 recommend 38.04ms<50ms（动态阈值）

### ③ 输入资源
- docs/plan/实施方案.md @7ad971c：
  - 第四章 推荐引擎设计（第 262-329 行）：4.1 三层管道+diversify / 4.2 核心接口签名 / 4.3 禁忌测试集 / 4.4 采购清单合并器
  - 第五章仓库结构（第 357-361 行）：engine/src/{types,safety,feasibility,score,diversify,recommend}.ts + test/{taboo.spec.ts,score.spec.ts,fixtures/} / list-merger/src/{normalize,units,merge}.ts + test/merge.spec.ts
  - 7.2 WP-03 任务卡示例（第 577-582 行）
  - 8.1 STEP-04（第609行）：M2 里程碑 禁忌集100%阻断
- DECISIONS.md @7ad971c（DEC-006 / DEC-008）
- STEP-02 契约 v0.1 @v0.1 tag
- AGENTS.md @7ad971c（铁律8：引擎相关改动必跑 pnpm test:taboo）

### ④ 边界约束（不允许做什么）
- 可修改：packages/engine/* + packages/list-merger/* + vitest.config.ts + 根 package.json（仅 test:taboo 脚本）
- 禁改 packages/shared（v0.1 冻结）与 apps/*
- 引擎纯函数零IO/零LLM/零数据库依赖
- 安全层永远先于评分，不可被任何权重覆盖
- 不引入 DEC-008 禁止项

### ⑤ 异常升级路径
- 契约缺字段 -> 停下@队长转 fm-arch
- 评分权重争议 -> 属 HOW，按 4.1 默认权重
- 禁忌集无法100%阻断 -> 阻塞，报队长
- 第3次被打回 -> 停止修改

## 最小测试（fm-tester 照跑，真实执行，禁止Mock冒充）
- `pnpm install --frozen-lockfile`（exit 0）
- `pnpm verify`（lint+build+test，exit 0，lint 零 error）
- `pnpm test:taboo`（exit 0，禁忌集100%阻断，**M2 发布门槛**）
- `pnpm -r build`（不破坏其他包构建）
- 覆盖率：engine + list-merger 单测覆盖率>=90%
- 性能：千套菜单库 recommend 单次调用<50ms

## 审查重点
- 三层管道与 4.1 逐项一致（safetyFilter/feasibilityFilter/score 权重）
- 接口签名与 4.2 一致
- 禁忌测试集与 4.3 一致（HARD×含成分菜单，别名/隐含/可选变形）
- 清单合并器与 4.4 一致
- 引擎纯函数零IO/零LLM/零数据库依赖
- 安全层永远先于评分
- test:taboo 修复有效
- 覆盖率>=90%，无随机性
- 目录结构与第五章一致

## 交付门禁
开发（fm-dev）-> 独立测试（fm-tester）-> 交叉审查（fm-reviewer）-> 主复验 -> 状态改"待用户审核"并暂停；
用户批准前不合并、不启动下一 STEP（DEC-005）。**M2 里程碑：禁忌集100%阻断**。

## 完成报告（fm-dev 填写）
- AC自检: [✓]AC1-AC12 全部通过（12/12），含回环修改
- 交付物: packages/engine/src/{types,safety,feasibility,score,diversify,recommend,index}.ts + test/{taboo.spec,score.spec,fixtures/} + packages/list-merger/src/{normalize,units,merge,index}.ts + test/merge.spec.ts + vitest.config.ts + 根package.json @9e781bf+28053c8
- 测试结果: 148/148 passed，pnpm verify exit 0，pnpm test:taboo exit 0（66 tests），覆盖率 branches 94.97%，性能 38.04ms
- 新增依赖: @vitest/coverage-v8 ^4.1.10（根 devDependencies，覆盖率统计）
- 遗留: recommend.ts push 修改 ScoredMenu（非阻断）；safety.ts branches 86.95%（全局达标）；diversify 第一轮非最优；list-merger ShoppingList 与 shared 同名异构

## 审查报告（fm-reviewer 填写，任何✗=打回，回环+1）
- [✓] 契约一致性（三层管道与4.1一致；接口与4.2一致；禁忌集与4.3一致；合并器与4.4一致；与shared v0.1一致）
- [✓] 越界检查（仅改 packages/engine + packages/list-merger + vitest.config.ts + 根package.json；不改 shared/apps/四件套/实施方案）
- [✓] 安全缺陷（无LLM调用DEC-006；无DEC-008禁止项；安全层先于评分不可覆盖；纯函数零IO）
- [✓] 逻辑正确性（safetyFilter HARD过滤正确；score 权重正确无随机性；diversify 错开逻辑正确；mergeShoppingList 合并正确；禁忌集100%阻断；覆盖率>=90%）
- [✓] 可维护性（全部函数 CC<=15 最高13；命名规范；纯函数可测；目录结构与第五章一致）
- 回环记录：1/3 不通过（圈复杂度超标+性能阈值偏离）-> fm-dev 重构 -> 2/3 通过
- 7 项设计假设 6项[合理] 1项[不合理->已修复变为合理]；1 项非阻断观察项

## 总任务拆解
| STEP | 对应WP | 内容 | 状态 |
|---|---|---|---|
| STEP-00 | - | 协作框架四件套 | 已合并 |
| STEP-01 | WP-00 | 工程基线（monorepo骨架+本地PG18 Docker+CI） | 已合并 |
| STEP-02 | WP-01 | 契约冻结（shared zod schema，v0.1） | 已合并 |
| STEP-03 | WP-02 | 数据层（schema.prisma+migration+seed） | 已合并 |
| STEP-04 | WP-03/06 | 推荐引擎+清单合并器 | 已合并 |
| STEP-05 | WP-04 | API（Fastify路由+口令鉴权+契约测试） | 未开始 |
| STEP-06 | WP-05 | H5前端（5页面走通） | 未开始 |
| STEP-07 | WP-07 | 内容管线CLI | 未开始 |
| STEP-08 | WP-09/10 | 部署+集成验收 | 未开始 |
