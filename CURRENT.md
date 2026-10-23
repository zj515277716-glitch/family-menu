# CURRENT.md — 一屏现状（2026-10-22）

> 开工必读：.trae/rules/project_rules.md → 本文件 → 当前任务卡。历史已移入 docs/archive/ 与 git log。
> 整改依据：docs/复盘报告_V2_2026-09-29.md（阶段 A + T-Q04 全部完成）。

## 代码版本
- main：`1f7d20f`（**T-Q13 合并**；已推送 origin，远端以 `git ls-remote` 为准，不在本文件追短哈希）。
- 分支 `t-q12-ui-main-flow`：`7712df1`（保留；已合并 main 并推送 origin）。
- 分支 `t-q13-execution-history`：`593055c`（已合并 main `1f7d20f`；已推送 origin）。
- 分支 `t-q14-clean-ci-gate`：干净库 713/0、CI 加固，待审查合并（提交以 git log 为准）。
- 门禁：干净库 migrate+seed 后 test **713 passed / 0 failed**；lint/tsc/test:taboo/check:secrets/check:safety 全绿；本机开发库仅剩既有 migration-backfill 脏库断言，不作验收依据。
- T-Q04（第 2-3 层）：CI 全分支生效；/health 返回 `1.1.0+<短哈希>`；`pnpm deploy:api` 一条命令（ACR 拉镜像），生产机不再构建。
- T-Q05 设计包（进行中）：PD-019 视觉基准 + PD-020 一日三餐**均已批准生效**；旧视觉基准已归档；导航图 v2 已重写待确认。

## 生产版本（https://menu.jijingkongjian.xin）
- API = **ACR 镜像 `family-menu-api:1ef04f3`**（healthy，/health version=1.1.0+1ef04f3）；H5 = `2a2b9c0` 产物。
- 冒烟 7/7（2026-10-08 切镜像后）；check:safety exit 0。流水见 OPS-LOG.md。
- 回滚：compose 备份 .bak-20261008-b2 + 旧镜像 latest、fm-api:rollback-pre-a3/-pre-a1 均在服务器。
- 以后发版：main 合并 → CI 自动构建推 ACR → `pnpm deploy:api`（需 ACR_REGISTRY/ACR_NAMESPACE 环境变量）。

## 任务队列
1. **T-Q05 当前节点**：确认书 v2 生效。实施：①引擎 T-Q09 ✅ →②契约+DB T-Q10 ✅ →③UI 全量（T-Q11 ✅ →T-Q12 ✅ 第 2 层，main `311c905` →T-Q13 ✅ 第 2 层，main `1f7d20f`（审查+验收 77/77））→**④验收【进行中：干净库预演发现 2 测试失败/CI 红，T-Q14 修复后出报告+体验卡】**。
2. T-Q12 审查/验收证据：evidence/T-Q12/review.md、verify.md；截图 40 张（S-03~S-08、S-13）。
3. T-Q13 证据：evidence/T-Q13/{review,verify}.md；截图 40 张（S-09/S-10/S-11 + 回归专项）。
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
