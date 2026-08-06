# AGENTS.md - 所有AI Agent开工前必读

## 项目一句话
家庭晚餐规划工具（个人自用版）：2分钟定今晚吃什么，产出采购清单+备菜顺序。

## 架构地图
- packages/shared: 契约（zod+类型+常量）--唯一事实源，改动需主控批准
- packages/engine: 推荐引擎，纯函数零IO，安全过滤>一切评分
- packages/list-merger: 采购清单合并，纯函数
- apps/api: Fastify5+Prisma，路由薄、逻辑在services
- apps/h5: Taro4+React+NutUI，编译目标h5（勿引入weapp专属API）
- tools/content-pipeline: 豆包起草CLI，产物只能落DRAFT状态

## 铁律（对齐《OPC项目 AI Agent 应用开发团队框架》2.5速查清单）
1. 队长是唯一入口，成员间不直接互派任务；队长不写代码、不做技术决策
2. 只做 STATUS.md「当前任务卡」里的事，卡外发现问题->写进完成报告报队长（越界即拒收）
3. 开工顺序：读契约->写骨架->逐AC实现+单测->自测（契约/边界/越界git diff三查）->提交
4. 完成报告必须逐条 [✓]/[✗] 对照AC自检，不接受"基本完成"类定性描述
5. 不改 packages/shared--契约变更须停下报队长->架构师影响评估->人工批准
6. 运行时代码禁止调用任何LLM API；管线产物只落DRAFT状态
7. 新增依赖在完成报告列出并说明理由；禁止引入：Redis/消息队列/微服务/K8s
8. 测试不绿不提合并；引擎相关改动必跑 pnpm test:taboo（禁忌集100%=一票否决）
9. 一任务一分支 feature/wp-xx-*，squash合入main；提交信息 [WP-xx] 动词开头
10. 单任务返工上限3次；跨Agent ping-pong上限1次--被打回第3次等队长重新定义问题
11. 缺信息->停下来问队长，不自行脑补（"不知道就问，别猜"）
12. 需求变更不塞入在途任务--记入完成报告，由队长独立评估排期
13. 无上下文恢复协议（DEC-004）：每步开工前完整读取实施方案+AGENTS.md+STATUS.md+DECISIONS.md+开发日志末尾；仓库文件与测试结果优先于聊天上下文
14. WIP=1（DEC-003）：代码任务串行，STATUS.md任何时刻只有一个活动任务卡；内容/素材非代码轨道除外
15. 每步结束必须追加开发日志（五段式）；未记录不得开始下一步；每STEP完成后停"待用户审核"，用户批准前不合并、不启动下一STEP（DEC-005）

## Ownership
| 路径 | 归属WP |
|---|---|
| packages/shared | WP-01（主控） |
| apps/api/prisma | WP-02 |
| packages/engine | WP-03 |
| apps/api/src | WP-04 |
| apps/h5 | WP-05 |
| packages/list-merger | WP-06 |
| tools/content-pipeline | WP-07 |

## 常用命令
pnpm i / pnpm dev / pnpm test / pnpm test:taboo / pnpm db:migrate / pnpm db:seed

## 提交规范
分支 feat/wp-xx-描述；提交信息 [WP-xx] 动词开头；PR描述含：做了/没做/测试结果/遗留
