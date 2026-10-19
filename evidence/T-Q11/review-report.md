# T-Q11 独立审查报告（fm-reviewer，2026-10-19）

结论：通过
版本：0ab2cfa..d25c296（HEAD 已核对 = d25c296）

## 必跑命令（本人执行）
- pnpm lint exit 0；pnpm -r exec tsc --noEmit exit 0
- pnpm test：612/615，3 败 = a3-reputation B3/B4 + T-Q10 migration-backfill 存量回填（任务卡已知挂账；两 spec 本卡未动，无新增失败）
- pnpm test:taboo：161/161 全绿
- pnpm --filter @family-menu/h5 build exit 0（25 警告均为 NutUI beta postcss-calc 解析告警+体积提示，非阻断）；dist grep 无 127.0.0.1/localhost/ACCESS_TOKEN
- 真实库 54329 取证：存量行 defaultPeople=4 → defaultAdults=4、defaultChildren=0、avoidRecentDays=7；information_schema 列默认值 2/0/7 在册；迁移 20261019020917 已应用

## 重点 9 项
1. P3012 红线：通过。提交说明与 down.sql 均如实记录（本地便携库手删 _prisma_migrations 行，T-Q10 同口径）；生产路径 migrate deploy 无此步骤。
2. 迁移与裁决一致：通过。migration.sql 末行 `UPDATE "FamilyRule" SET "defaultAdults" = "defaultPeople"`；family-rule-defaults.spec.ts 含迁移文件守卫（缺 UPDATE 先红）+ 事务内语义实证；真实库回填 4=4。
3. 契约范围：通过。shared/src 仅 family.ts +7 行三字段；dist 增量系构建传导（api.d.ts 同步）；defaultPeople 保留原样往返；T-Q10 契约未回头改。
4. 设计规则 7 条：全过。①无系统编号输入；②空口令「先输入家庭口令再进入」、加忌口空名 Toast，无静默 return；③枚举全中文+formatTimeHM 公共函数；④设置页骨架/错误可重试/内容 + 保存三态；⑤已存值动态并入选项集、刷新真实 API 还原；⑥Taro.request 全仓库仅 client.ts 一处；⑦NutUI 组件+token 变量族，sgroup 等系原型版式移植且全引 var()，无越界手写。
5. 三屏对版：通过。8 张 375×812 与 S-01/S-02/S-12 逐字一致；硬软标注「推荐、清单、做法里都绝不会出现」「有得选就不做，实在避不开会提前告诉你」逐字；窗口 3/5/7 选 7；时长档 15/30/60 按裁决覆盖原型 20/40/60。
6. API 语义：通过。login 服务端校验+HttpOnly cookie、429 限速人话；me 恒 200；rules 404→null 冷启动判定；PUT upsert 修复冷启动首存（P2025 先红后绿，有测试）。
7. 系统不变量：通过。保存按钮完全可见（截图+`.with-tabbar .stickybar` 上移一个 Tabbar 高）；产物无本机地址/口令；seed 规则 targetId 不悬空（seed-ing-peanut 稳定 id）。
8. 旧页删除：通过。pages 仅 5 个新路由，grep 无 candidates/dish/feedback/plan/setup/tonight 残留引用；build 通过佐证。
9. 卡外发现：确认。postcss-calc 告警非阻断；根目录杂物（*.tar.gz 等）仍未跟踪、未顺手处理。

## 总评：通过

风险：加忌口「食材」分类自由文本落 targetId（旧 setup 原样沿用，非本卡新增）——引擎宽匹配（targetId 入名称集）仍保 HARD 过滤有效，但 check-safety DANGLING_TARGET 会判此类行悬空；建议后续卡把名称输入统一落 TAG scope 或改食材点选。

建议级（不开卡）：①同上忌口语义收敛；②shared/dist 入库 diff 噪声随阶段 C 清理；③根目录杂物按周清理节奏入账。
