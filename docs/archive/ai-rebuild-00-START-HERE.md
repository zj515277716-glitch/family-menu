# 00-START-HERE.md — 重建阶段入口（所有 AI Agent 开工前必读）

> 本文件规定重建期间的协作规则。与历史文档冲突时，以本文件和权威顺序前 5 项为准。

## 0. 角色分工

- **产品负责人**：非程序员。只读 [PRODUCT-CONFIRMATION.md](../../PRODUCT-CONFIRMATION.md)、回答产品问题。**不判断代码、数据库、架构和测试日志。**
- **AI（各 Agent）**：负责其余一切文档维护与实现，并对每个结论给出可复制的证据。

## 1. 资料权威顺序（冲突时从上往下优先）

| 优先级 | 资料 | 性质 |
|---|---|---|
| 1 | [PRODUCT-CONFIRMATION.md](../../PRODUCT-CONFIRMATION.md) | 需求唯一事实源（用户已确认） |
| 2 | [PRODUCT-DECISIONS.md](./PRODUCT-DECISIONS.md) | 产品决定记录（用户逐项拍板） |
| 3 | [TECHNICAL-PLAN.md](./TECHNICAL-PLAN.md) | 技术计划、切片顺序与验收 |
| 4 | [CURRENT.md](../../CURRENT.md) | 现状快照（AI 维护） |
| 5 | [evidence/](../evidence/) | 验证证据（命令+退出码+数字结果） |
| 6 | 历史资料（**仅参考，不覆盖、不删除**）：AGENTS.md、STATUS.md、DECISIONS.md、开发日志.md、docs/plan/实施方案.md、docs/design/*、PRD | 追溯对照 |

规则：历史资料与 1–5 冲突时一律以 1–5 为准；历史文档不作废，仅作对照。重建产物只进 1–5 与 evidence/，不回写历史文件。

## 2. 四类允许打断产品负责人的情况（其余一律不打断）

1. **产品含义存在两种合理解释**；
2. **UI 或操作体验需要选择**；
3. **需要账号、费用或外部平台操作**；
4. **涉及删除、生产数据、上线或不可逆操作**。

打断方式：**一次只问一个最关键的问题**，等回答后再问下一个。问题必须用普通中文，不带技术术语，选项里说清各自的代价。

## 3. 重建纪律

- 未经产品负责人确认的需求不得实现；需求变更**先改 PRODUCT-CONFIRMATION.md** 再动代码。
- 一次只推进 TECHNICAL-PLAN.md 里的一个切片（WIP=1），完成并留下证据后才进下一个。
- 每个切片完成必须有 evidence 证据：可复制的命令 + 退出码 + 数字结果；**禁止用 Mock/演示数据冒充真实结果**。
- 运行时禁止调用任何 LLM API；不引入 Redis / 消息队列 / 微服务 / K8s。
- 涉及 packages/shared 契约的改动，须在 TECHNICAL-PLAN.md 中明列并说明影响后方可进行。
- AI 维护 CURRENT.md / PRODUCT-DECISIONS.md / TECHNICAL-PLAN.md / evidence/；用户不负责阅读审核这四类文件。
