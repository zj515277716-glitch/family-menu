# T-A1 过敏防线：花生规则稳定 ID + 食材名宽匹配 + `pnpm check:safety`

> 立项依据：复盘报告 V2 §P0-1、§5.1 A1（花生规则绑本机库 ID，换库悬空；TAG 规则对全库 0 拦截）。级别 L2（对生产库只读检查/生产发布属 L3，单独报批）。主控决定②（2026-10-02）：**名称含花生都拦**（按食材名/别名宽匹配，接受可能误伤「花生油」）。顺序第二张（A2 之后），WIP=1。

## 背景事实

- [seed-data.ts:53-60](../../../apps/api/prisma/seed-data.ts#L53-L60) HARD 规则写死本机库 cuid；花生米由内容管线导入，各环境 ID 不同 → 新库必悬空。
- TAG 规则（targetTag=花生）引擎不看食材名，对 49 道菜拦截为 0（T-C07 定案）；09-14 生产曾因此失效 8–9 小时。
- 整改验收口径（§5.1 A1）：空库 seed + 导入内容后 `check:safety` = 0；故意放含花生米菜进 PUBLISHED，检查必须失败。

## AC（逐条 [✓]/[✗] 自检）

- AC1 seed 纳入花生米等含花生食材，用稳定 ID（如 `seed-ing-peanut`），删除写死 cuid。
- AC2 引擎 HARD 宽匹配：食材名或别名含「花生」即 HARD 拦截（主控决定②口径）；一并解决花生/内脏 TAG 死规则（零命中即告警，不静默）。
- AC3 新增 `pnpm check:safety`（对指定库**只读**）：① HARD 且 scope=INGREDIENT 的 targetId 真实存在；② 全库 PUBLISHED 菜逐条过全部 HARD 规则，违规数 = 0；③ TAG 规则对全库零命中给出告警。
- AC4 发布单入口：菜品状态改 PUBLISHED 只允许一个命令完成（内部先跑 check:safety，失败拒绝）；在文档/脚本注释中明令禁止裸 SQL 改 status。
- AC5 验收场景实证：全新空库 seed + 导入内容后 check:safety 退出码 0；人为把含花生米菜设 PUBLISHED → 非 0 失败。
- AC6 门禁：lint / 全包 tsc / pnpm test / pnpm test:taboo 全绿；证据 `evidence/T-A1-dev-2026-10-02.md`（≤1 页）+ reviewer 独立跑命令记录。

## 测试先行（fm-dev 先写、先看见红）

1. 含花生米（及含花生素材）的菜进入候选/推荐被拦（现状悬空 targetId，0 拦截，先失败）。
2. check:safety 在悬空 targetId 的库上失败退出（现状无此命令，先失败）。

## 边界约束

- 允许改：apps/api/prisma/seed-data.ts 与 seed 脚本、packages/engine/src 禁忌过滤链路、新增 check:safety 命令（脚本位置自定，root package.json 加 script）、对应测试。
- 禁改：packages/shared/src（若判断必须动契约 → 停下报主控，按 L2 走影响清单）、现有迁移文件不手改、既有菜品数据不动、禁引入新依赖。
- **L3 步骤 dev 不执行**：对生产库跑 check:safety（只读）与任何生产发布——命令与回滚先报主控审批，执行后 OPS-LOG.md 记一行。

## 环境与分支

分支 `fix/a1-allergy-defense`（从 main 切）。PG 启停同 T-A2 卡（:54329，用完 `-m fast stop`）。

## 异常升级

宽匹配口径误伤面超预期（如花生油产品形态争议）/ 需要动 shared 契约 / check:safety 与现有 fm-publish-check 关系需裁决 → 停手报主控。

## 终态（主控补登）

待四角色流程完成后补登。
