# 家庭菜谱App 开发状态
> 本文件由主Agent维护。任何时刻只允许一个活动任务卡（DEC-003）。

## 当前状态
- 当前阶段：STEP-00 协作框架初始化（待用户审核）
- main HEAD：3fda0aa；回滚tag：rollback-before-step-00 -> 2c80703
- 阻塞/外部依赖：无
- 下一个人工决策点：用户审核 STEP-00 交付（批准后方可启动 STEP-01）

## 当前任务卡：STEP-00 协作框架初始化
状态: 待用户审核    回环计数: 0/3
执行者: 队长（SOLO Coder，引导例外--四件套未建立时队长可亲自创建文档）    审查者: fm-reviewer（只读）
需求来源: 用户 STEP-00 启动指令 + 实施方案附录A/B/D    基线提交: main@2c80703    回滚点: rollback-before-step-00

### ① 目标
建立协作框架四件套（AGENTS.md / STATUS.md / DECISIONS.md / 开发日志.md）与 git 基线，并验证四件套可支撑"无上下文恢复"--不写任何业务代码。

### ② 验收标准 AC
- [✓] AC1 git init 完成，首次基线提交 + 回滚 tag rollback-before-step-00 已建立
- [✓] AC2 AGENTS.md 按附录A模板创建（15条铁律 + Ownership表 + 常用命令）
- [✓] AC3 DECISIONS.md 按附录D创建（DEC-001~009；DEC-001 含联网核对的精确版本号 + 核对来源）
- [✓] AC4 STATUS.md 按附录D骨架 + 附录B 创建（当前任务卡 = STEP-00 本卡）
- [✓] AC5 开发日志.md 创建（含记录规则 + STEP-00-START 首条）
- [✓] AC6 fm-dev "空上下文恢复演练"通过：仅凭仓库文件复述当前唯一任务、边界与下一门禁，不修改任何文件
- [✓] AC7 fm-reviewer 只读审查通过：四件套与实施方案附录一致、15条铁律无遗漏
- [✓] AC8 开发日志 STEP-00 五段记录齐全，STATUS.md 状态改为"待用户审核"并停止

### ③ 输入资源
docs/plan/实施方案.md（只读战略副本）@2c80703；.trae/rules/project_rules.md @2c80703；TRAE-SETUP.md @2c80703

### ④ 边界约束（不允许做什么）
- 不创建任何业务代码（packages/* / apps/* / tools/* 全部属于 STEP-01 起）
- 不安装任何依赖（无 package.json / pnpm install）
- 不建 monorepo 结构（pnpm-workspace.yaml / tsconfig.base.json 等属于 STEP-01）
- 不修改 docs/plan/实施方案.md（只读战略副本）

### ⑤ 异常升级路径
- 版本核对无法联网获取某项 -> 如实记录已核对项与缺失项，标注核对方式，不脑补版本号
- 四件套内容与实施方案附录冲突 -> 以附录为准修正
- 技术争议（如 NutUI React 仅 beta、Prisma 7 破坏性变更）-> 仅在 DEC-001 记录事实，不预定技术方案；抛相应 STEP（02/03/06）由 fm-arch 评估

## 最小测试
- STEP-00 不产出代码，无代码测试
- 验证项：`git log --oneline` 含基线提交与四件套提交；四件套文件均存在于仓库根目录；fm-dev 仅凭仓库文件即可复述任务/边界/门禁

## 审查重点
- 四件套与实施方案附录A/B/D 一致性（模板字段无遗漏）
- AGENTS.md 15条铁律与 project_rules.md 全员纪律一致、无遗漏
- DEC-001 版本号均有可追溯来源
- 未越界创建业务代码 / monorepo 结构 / 安装依赖

## 交付门禁
开发（队长亲自，引导例外）-> fm-reviewer 只读审查 -> 主复验 -> 状态改"待用户审核"并暂停；
用户批准前不合并、不启动下一 STEP（DEC-005）。

## 完成报告（执行者=队长填写）
- AC自检: [✓]AC1..AC8 全部通过（详见开发日志 STEP-00-COMPLETE）
- 交付物: AGENTS.md / STATUS.md / DECISIONS.md / 开发日志.md @3fda0aa
- 测试结果: 无代码测试；fm-dev 空上下文恢复演练 AC1-AC5 全 ✓（git status --short 空，未改文件）；fm-reviewer 五维度全 [✓]
- 新增依赖及理由: 无（STEP-00 不安装依赖）
- 遗留与下一步建议:
  1. 附录A模板 gap（全员纪律6"禁止Mock冒充"未显式入铁律）--project_rules.md 已独立生效，建议后续修订附录A补齐，不阻断
  2. Prisma 7 破坏性变更--STEP-03 数据层需按 Prisma 7 适配（抛 fm-arch）
  3. NutUI React Taro 仅 beta--STEP-02/06 前需评估（抛 fm-arch）
  4. 实施方案 8.1 表"DEC-001~008"与附录D.3"DEC-001~009"编号不一致（实施方案内部，非阻断）

## 审查报告（fm-reviewer 填写，任何✗=打回，回环+1）
- [✓] 契约一致性（四件套与实施方案附录A/B/D 一致；15条铁律齐全；DEC-001~009 齐全）
- [✓] 越界检查（diff 仅限文档，无业务代码/monorepo/依赖）
- [✓] 安全缺陷（无敏感信息入库）
- [✓] 逻辑正确性（15条铁律无遗漏；DEC-001~009 齐全；版本来源可追溯）
- [✓] 可维护性（文件命名/结构与附录一致）
- 总体结论：审查通过，无需回环。3项非阻断观察（见完成报告遗留项1/4及开发日志 STEP-00-REVIEW）。

## 总任务拆解
| STEP | 对应WP | 内容 | 状态 |
|---|---|---|---|
| STEP-00 | - | 协作框架四件套 | 待用户审核 |
| STEP-01 | WP-00 | 工程基线（monorepo骨架+本地PG18 Docker+CI） | 未开始 |
| STEP-02 | WP-01 | 契约冻结（shared zod schema，v0.1） | 未开始 |
| STEP-03 | WP-02 | 数据层（schema.prisma+migration+seed） | 未开始 |
| STEP-04 | WP-03/06 | 推荐引擎+清单合并器 | 未开始 |
| STEP-05 | WP-04 | API（Fastify路由+口令鉴权+契约测试） | 未开始 |
| STEP-06 | WP-05 | H5前端（5页面走通） | 未开始 |
| STEP-07 | WP-07 | 内容管线CLI | 未开始 |
| STEP-08 | WP-09/10 | 部署+集成验收 | 未开始 |
