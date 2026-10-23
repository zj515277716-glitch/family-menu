# CURRENT.md — 一屏现状（2026-10-22）

> 开工必读：.trae/rules/project_rules.md → 本文件 → 当前任务卡。历史已移入 docs/archive/ 与 git log。
> 整改依据：docs/复盘报告_V2_2026-09-29.md（阶段 A + T-Q04 全部完成）。

## 代码版本
- main：T-Q14 合并 + ④验收文档已推送 origin；CI run 75/76 全绿；ACR 镜像随 main CI 构建推送（未部署）。提交以 git log 为准，不追易失短哈希。
- 分支 `t-q12-ui-main-flow`：`7712df1`；`t-q13-execution-history`：`593055c`（均已合并 main 并推送 origin）。
- 分支 `t-q14-clean-ci-gate`：`d3c8e02`（已合并 main 并推送）。
- 门禁：干净库 migrate+seed 后 test **713 passed / 0 failed**；CI 已含 Typecheck/Secrets/Safety；lint/tsc/test:taboo/check:secrets/check:safety 全绿；本机开发库仅剩既有 migration-backfill 脏库断言，不作验收依据。
- T-Q04（第 2-3 层）：CI 全分支生效；/health 返回 `1.1.0+<短哈希>`；`pnpm deploy:api` 一条命令（ACR 拉镜像），生产机不再构建。
- T-Q05 设计包（进行中）：PD-019 视觉基准 + PD-020 一日三餐**均已批准生效**；旧视觉基准已归档；导航图 v2 已重写待确认。

## 生产版本（https://menu.jijingkongjian.xin）
- API = **ACR 镜像 `family-menu-api:1ef04f3`**（healthy，/health version=1.1.0+1ef04f3）；H5 = `2a2b9c0` 产物。
- 冒烟 7/7（2026-10-08 切镜像后）；check:safety exit 0。流水见 OPS-LOG.md。
- 回滚：compose 备份 .bak-20261008-b2 + 旧镜像 latest、fm-api:rollback-pre-a3/-pre-a1 均在服务器。
- 以后发版：main 合并 → CI 自动构建推 ACR → `pnpm deploy:api`（需 ACR_REGISTRY/ACR_NAMESPACE 环境变量）。

## 任务队列
1. **T-Q05 当前节点**：③UI 全量 ✅（T-Q11/T-Q12/T-Q13）。④验收预演通过；**T-Q15 发布链路补齐（L3）第 2 层完成**：分支 `t-q15-release-chain`，复核 PASS（`evidence/T-Q15/`），生产快照预演 4→6 迁移、PUBLISHED 59/早餐 6/Plan 107 保留。待产品负责人确认合并 main 与发版窗口。
2. T-Q14 终态：干净库 713/0、CI run 73/75 全绿、`test:gate` 删除；证据 evidence/T-Q14/review.md。
3. 证据：T-Q12/T-Q13/T-Q14 review+verify+截图；④验收预演截图 evidence/T-Q05-acceptance/。
4. 候选：spec 数据耐受性加固（a3 B3/B4 + T-Q10 回填，同一根因）、忌口食材分类自由文本落 targetId 致 DANGLING_TARGET（改 TAG 或点选）、`.workflow-verify` 移出项目（C3）、生产死规则 WARN×2 清理（低优先）、deploy:h5 实战校跑、根目录未跟踪杂物清理。
5. T-Q12 建议级未处理：S-06 副标题「今晚 HH:mm 生成」非晚间不准确；想吃的菜 reason 重复且可能带规则串。

## 阻塞
- 本地（便携 PG :54329）与生产 RDS 数据分叉，本地验证结论不代表生产。
- 本机 GitHub：2026-10-22 代理 127.0.0.1:7894 CONNECT 后 TLS handshake 失败，直连推送成功；下次先试代理，失败则直连并记录。
- 生产 check:safety 余 2 条死规则 WARN（花生/内脏 TAG 零命中）：防线走食材级，可考虑清理（不阻断）。

## 共用资源（动服务器前必读）
- 生产服务器与买菜平台共用（阿里云 ECS 8.136.32.223，ssh 别名 fmsrv），可用内存约 1.1GB。
- 买菜平台验收环境占 3002 端口；本项目 API :3000（容器宿主 3001）、H5 dev :10086。
- 登录限速：同 IP 10 次失败/10 分钟（含正确口令），API 重启清零。
- 口令分离：本地/生产口令各自独立，只存各机 .env（`pnpm check:secrets` 拦截）；本机开发口令 2026-10-08 已轮换，历史旧值失效。生产 API 公网不暴露 /health（Caddy 路由给 H5），健康核对走服务器本地。
