# T-A3 修复 T-P16 回归：虚拟菜单内容哈希 + 口碑/多样性按菜品聚合 + CookLog 关联

> 立项依据：复盘报告 V2 §P0-3、§5.1 A3。级别 L2。主控决定③（2026-10-02）：**A3 完成前暂停新功能，T-P16/T-P17 不部署**。顺序第三张（A1 之后），WIP=1。

## 背景事实

- 虚拟菜单 ID 按生成顺序编号（[composition.ts:176](../../../packages/engine/src/composition.ts#L176) `virt-001`…每次推荐重新编号）。
- 历史口碑（权重 0.35，[score.ts:116-123](../../../packages/engine/src/score.ts#L116-L123)）与近期多样性（[score.ts:242-255](../../../packages/engine/src/score.ts#L242-L255)）按 `menuId` 字面匹配 → 上周 virt-001（A+B+C）的反馈错压本周 virt-001（D+E+F）。
- [planService.ts:908-915](../../../apps/api/src/services/planService.ts#L908-L915) 写 CookLog 时 virt-* menuId 置 null → 内容升级通道（DEC-006）对新计划失效。
- 已合入 main、**未部署**；修复前不得部署（主控决定③）。

## AC（逐条 [✓]/[✗] 自检）

- AC1 虚拟菜单 ID 改为内容稳定哈希：对排序后的菜品 ID 取稳定哈希，同一组合任何次生成同 ID。
- AC2 历史口碑与近期多样性改为按 dishId 聚合，消除跨组合错配。
- AC3 CookLog 能关联到计划与菜品（virt-* 不再写 null）。
- AC4 真实库集成测试（PG :54329）：做组合 → 反馈好吃 → 下次含同一道菜的组合得分上升；7 天内做过的菜被降权；**该测试修复前失败、修复后通过**（两段结果都写进 dev 报告）。
- AC5 回归：存量 471+ 用例与 test:taboo 全绿，T-P16/T-P17 已有 AC 行为不回退；lint / 全包 tsc 绿。
- AC6 证据 `evidence/T-A3-dev-2026-10-02.md`（≤1 页）+ reviewer 独立跑命令记录。

## 测试先行（fm-dev 先写、先看见红）

先写 AC4 集成测试并实证失败：构造 virt-001（A+B+C） feedback 后，断言 D+E+F 组合得分不受影响（现状受影响，先失败）。

## 边界约束

- 允许改：packages/engine/src/{composition.ts,score.ts,types.ts} 及 engine 测试、apps/api/src/services/{planService.ts,mappers.ts} 与 api 集成测试。
- 禁改：packages/shared/src、prisma schema 与迁移、h5；禁部署（主控决定③）；禁引入新依赖。
- 若哈希方案影响既有 Event/CookLog 历史数据解读 → 停手报主控，给迁移影响说明。

## 环境与分支

分支 `fix/a3-menu-identity`（从 main 切）。PG :54329 启停同 T-A2 卡；集成测试必须连真实库，禁用夹具冒充。

## 终态（主控补登）

待四角色流程完成后补登。
