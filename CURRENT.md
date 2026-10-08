# CURRENT.md — 一屏现状（2026-10-08 晚）

> 开工必读：.trae/rules/project_rules.md → 本文件 → 当前任务卡。历史已移入 docs/archive/ 与 git log。
> 整改依据：docs/复盘报告_V2_2026-09-29.md（阶段 A + T-Q04 全部完成）。

## 代码版本
- main：`1ef04f3`（V2.1 + 止血 A1/A2/A3 + 清理 A4/A5/A6 + T-Q04 CI/版本/部署链路）。
- T-Q04（2026-10-08，a 卡第 2 层 + b1/b2 主控验证）：CI 全分支生效；/health 返回 `1.1.0+<提交短哈希>`；**部署一条命令 `pnpm deploy:api`（ACR 拉镜像），生产机不再构建（红线根治）**。

## 生产版本（https://menu.jijingkongjian.xin）
- API = **ACR 镜像 `family-menu-api:1ef04f3`**（=main `1ef04f3`，healthy，/health version=1.1.0+1ef04f3）；H5 = `2a2b9c0` 产物。
- 冒烟 7/7（2026-10-08 切镜像后）；check:safety exit 0。流水见 OPS-LOG.md。
- 回滚：compose 备份 .bak-20261008-b2（构建模式）+ 旧镜像 family-menu-api:latest、fm-api:rollback-pre-a3/-pre-a1 均在服务器。
- 以后发版：main 合并 → CI 自动构建推 ACR → `pnpm deploy:api`（需 ACR_REGISTRY/ACR_NAMESPACE 环境变量）。

## 任务队列
1. 阶段 A + T-Q04 全部完成（止血/清理第 2-3 层；T-Q04 a 卡第 2 层，b1/b2 主控验证+冒烟）。
2. 候选：候选页返回交互评估（A3 验收发现）、`.workflow-verify` 移出项目（C3）、生产死规则 WARN×2 清理（低优先）、deploy:h5 一条命令实践校跑一次。

## 阻塞
- 本地（便携 PG :54329）与生产 RDS 数据分叉，本地验证结论不代表生产。
- 本机访问 GitHub 必须走系统代理（127.0.0.1:7894），git/CI 查询命令需带代理环境变量。
- 生产 check:safety 余 2 条死规则 WARN（花生/内脏 TAG 零命中）：防线走食材级，可考虑清理（不阻断）。

## 共用资源（动服务器前必读）
- 生产服务器与买菜平台共用（阿里云 ECS 8.136.32.223，ssh 别名 fmsrv），可用内存约 1.1GB。
- 买菜平台验收环境占 3002 端口；本项目 API :3000（容器宿主 3001）、H5 dev :10086。
- 登录限速：同 IP 10 次失败/10 分钟（含正确口令），API 重启清零。
- 口令分离：本地/生产口令各自独立，只存各机 .env（`pnpm check:secrets` 拦截）；本机开发口令 2026-10-08 已轮换，历史旧值失效。生产 API 公网不暴露 /health（Caddy 路由给 H5），健康核对走服务器本地。
