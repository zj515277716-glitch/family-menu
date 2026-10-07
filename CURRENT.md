# CURRENT.md — 一屏现状（2026-10-07）

> 开工必读：.trae/rules/project_rules.md → 本文件 → 当前任务卡。历史已移入 docs/archive/ 与 git log。
> 整改依据：docs/复盘报告_V2_2026-09-29.md（阶段 A 止血三卡 A1/A2/A3 已全部上线，解禁新功能）。

## 代码版本
- main：`9caa1d8`（V2.1 + T-A1/A2/A3 止血 + T-P16/T-P17/RIBS 全量）；生产 API 与 main **首次完全同步**（同一提交构建）。
- 部署用混合分支（deploy/a2-api-on-86b1263、deploy/a1-on-prodbase）已完成使命，仅留档。

## 生产版本（https://menu.jijingkongjian.xin）
- API = main `9caa1d8` 构建容器（healthy，2026-10-07 上线）；H5 = `2a2b9c0` 产物（与 main 零增量）。
- 2026-10-07：A3 口碑修复上线 + 蚝油生菜去花生（改配方，行级备份在服务器）→ check:safety **exit 0**（生产发布门禁转绿）；冒烟 7/7（候选 virt-<hash>、无花生菜）。
- 回滚：API 镜像 tag `fm-api:rollback-pre-a3`（及 -pre-a1）；目录备份 .bak-2026100*。流水见 OPS-LOG.md。

## 任务队列
1. 阶段 A 止血全部完成（A1 过敏防线 / A2 访问控制 / A3 口碑聚合，均第 3 层）。
2. 清理三卡进行中：T-A4 口令入库清理（git 历史重写需单独授权）/ T-A5 fetch2dish shebang / T-A6 lint 42 errors。
3. 阶段 B 候选：验收与生产环境分离、镜像仓库（服务器构建与红线冲突的根治）、候选页返回交互评估（A3 验收发现）。

## 阻塞
- 本地（便携 PG :54329）与生产 RDS 数据分叉，本地验证结论不代表生产。
- 生产构建暂在服务器执行（内存预检 + node 堆限 768MB），阶段 B 镜像仓库落地后解除；本机无 Docker。
- 生产 check:safety 余 2 条死规则 WARN（花生/内脏 TAG 零命中）：防线走食材级，TAG 规则可考虑清理（低优先，不阻断发布）。

## 共用资源（动服务器前必读）
- 生产服务器与买菜平台共用（阿里云 ECS 8.136.32.223，ssh 别名 fmsrv），可用内存约 1.1GB。
- 买菜平台验收环境占 3002 端口；本项目 API :3000（容器宿主 3001）、H5 dev :10086。
- 登录限速：同 IP 10 次失败/10 分钟（含正确口令），API 重启清零。
