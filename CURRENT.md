# CURRENT.md — 一屏现状（2026-10-03）

> 开工必读：.trae/rules/project_rules.md → 本文件 → 当前任务卡。历史已移入 docs/archive/ 与 git log。
> 整改依据：docs/复盘报告_V2_2026-09-29.md（复盘结论：三处 P0 防线缺口未补前，暂停新功能）。

## 代码版本
- main：`682455a`（2026-09-29 后 V2.1 流程切换已合入）。
- `fix/a2-access-control`（`2a2b9c0`）：T-A2 四角色 PASS，**已部署生产**，待产品负责人确认合并 main。
- `deploy/a2-api-on-86b1263`（`27d1224`）：生产 API 实际源码 = `86b1263` + A2 鉴权三文件，**刻意不含 T-P16/T-P17**（决定③）。

## 生产版本（https://menu.jijingkongjian.xin）
- API = `27d1224` 构建容器（family-menu-api，healthy）；H5 = `2a2b9c0` 构建产物（app.673395c1.js）。
- 2026-10-03：登录门上线（输一次家庭口令 → HttpOnly cookie），生产 ACCESS_TOKEN 已轮换；冒烟 9/9 PASS（evidence/T-A2/prod-smoke-output.txt）。
- 回滚材料：h5-dist.bak-20261003-094514 / apps.bak-20261003-100401 / .env.bak-20261003-094551（均在服务器）。
- 生产操作流水见 OPS-LOG.md。

## 任务队列（阶段 A 止血，L2）
1. A1 过敏防线：花生口径已拍板＝**名称含花生都拦**；任务卡待派发（fix/a1-allergy-defense）。
2. A3 修 T-P16：虚拟菜单内容哈希 + 口碑按菜品聚合 + CookLog 关联；任务卡待派发。
3. 清理挂账：T-A4 口令入库清理（12 个跟踪文件含本地口令值）/ T-A5 fetch2dish shebang / T-A6 lint 42 errors，任务卡待派发。

## 阻塞
- A3 未修复前 T-P16/T-P17 不上线；已部署的 API 混合包不含其逻辑。
- 本地（便携 PG :54329）与生产 RDS 数据分叉，本地验证结论不代表生产。
- 生产构建暂在服务器执行（内存预检 ≥400MB + node 堆限 768MB），与红线「本机/CI 构建」暂冲突，阶段 B 镜像仓库落地后解除；本机无 Docker。
- T-A4 清理 git 历史属破坏性操作，需产品负责人授权后执行。

## 共用资源（动服务器前必读）
- 生产服务器与买菜平台共用（阿里云 ECS 8.136.32.223，ssh 别名 fmsrv），可用内存约 1.1GB。
- 买菜平台验收环境占 3002 端口；本项目 API :3000（容器宿主 3001）、H5 dev :10086。
- 登录限速：同 IP 10 次失败/10 分钟（含正确口令），API 重启清零。
