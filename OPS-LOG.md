# OPS-LOG.md — 生产操作流水

> 每次生产操作一行：时间 | 操作 | 版本/提交 | 命令 | 结果。只记操作不记口令值。

| 时间 | 操作 | 版本/提交 | 命令 | 结果 |
|---|---|---|---|---|
| 2026-10-03 09:45 | T-A2 H5 登录门发布 | H5=fix/a2-access-control `2a2b9c0` | tools/deploy-h5-remote.sh（tar/scp，自动备份 h5-dist.bak-20261003-094514） | DEPLOY_OK |
| 2026-10-03 09:45 | 轮换生产 ACCESS_TOKEN | 服务器 /opt/family-menu/.env（备份 .env.bak-20261003-094551） | openssl rand -base64 24 生成新值 → sed 原地替换 → docker compose --profile prod up -d api | OK（新值 32 位，未落盘；旧值已公开故必须轮换） |
| 2026-10-03 10:04~10:20 | T-A2 API 混合包发布（`86b1263`+A2 鉴权三文件，不含 T-P16/T-P17） | API=deploy/a2-api-on-86b1263 `27d1224` | git archive → scp → 备份 apps/packages/tools（.bak-20261003-100401）→ 解包覆盖 → docker compose --profile prod build api（内存预检 1129MB、node 堆限 768MB）→ up -d api | BUILD_OK + HEALTHY |
| 2026-10-03 10:26 | T-A2 生产冒烟 | — | node tests/e2e/T-A2-prod-smoke.mjs（口令经环境变量传入） | 9/9 PASS（evidence/T-A2/prod-smoke-output.txt） |
| 2026-10-03 10:30 | 只读核查入库口令 | — | ssh 容器内比对 production ACCESS_TOKEN vs 12 个跟踪文件中的本地值 | DIFFER：入库值＝本机开发口令，非生产口令 |
| 2026-10-06 23:32~23:36 | T-A1 API 混合包发布（86b1263+A2 三文件+A1 安全层，不含 T-P16/T-P17） | API=deploy/a1-on-prodbase `eb90ce6` | 回滚 tag fm-api:rollback-pre-a1 → 备份 .bak-20261006-233237 → git archive/scp/解包 → build api → **先只读 check** → up -d api（healthy TRY=6） | BUILD_OK + HEALTHY |
| 2026-10-06 23:46 | T-A1 生产只读 check:safety（换容器前，新镜像 docker run，零写入） | — | check-safety.ts 对生产库（50 菜/49 PUBLISHED/4 规则） | exit 1：FAIL×1 蚝油生菜含花生米（决定②误伤面）+ WARN×1 内脏 TAG 零命中；无悬空 targetId |
| 2026-10-06 23:48 | T-A1 生产冒烟 | — | node tests/e2e/T-A1-prod-smoke.mjs | 8/8 PASS（登录门回归+忌口行花生可见+HttpOnly+401/auth-me，evidence/T-A1/prod-smoke-output.txt） |
| 2026-10-07 23:27~23:45 | T-A3 全量 main 首次同步发布（V2.1+T-P16/T-P17+RIBS+A1+A2+A3，schema/迁移零增量、H5 零增量未重发） | API=main `9caa1d8` | 回滚 tag fm-api:rollback-pre-a3 → 备份 .bak-20261007-232722 → git archive/scp/解包 → build api → up -d api（healthy TRY=7，T_P16_LIVE/A1_LIVE 实证） | BUILD_OK + HEALTHY |
| 2026-10-07 23:50 | 蚝油生菜改配方去花生（产品负责人批准三选一） | 生产库 DishIngredient 1 行（备份 dish-peanut-backup-20261007.txt） | 删可选「花生米 10g」行 cmtz3tta5cr2tei1b1vvqskxm（步骤文本零花生提及，无需改步骤）→ 复查 check:safety | DELETED=1；check:safety **exit 0**（失败 0，WARN 2=死规则告警） |
| 2026-10-07 23:55 | T-A3 生产冒烟 | — | node tests/e2e/T-A3-prod-smoke.mjs | 7/7 PASS（登录门/忌口行/recommend 200/候选 virt-<hash>/无花生菜，evidence/T-A3/prod-smoke-output.txt）；冒烟 Plan+Event 已清理零残留 |
| 2026-10-08 08:0x | T-A4 本机开发口令轮换（挂账①闭环） | main `6f0e552` | 本机 .env ACCESS_TOKEN 原地替换（RNG 32hex，值不落盘不入日志）→ 起本地 API → 新值登录 200 / 旧泄漏值 401 → 停 API | OK；历史重写经评估报告不执行（保提交哈希），旧值自此失效 |
| 2026-10-08 23:2x | T-Q04b2 生产 API 切 ACR 镜像（**首次不在生产机构建**，红线根治） | API=ACR `family-menu-api:1ef04f3`（=main `1ef04f3`） | 备份 compose .bak-20261008-b2 → 上传参数化 compose（image: ACR:${API_TAG}）→ CI run#35 构建推镜像 → `pnpm deploy:api`（pull+up+服务器本地 /health 核对）→ version=**1.1.0+1ef04f3** → 冒烟 7/7 → 冒烟 Plan 清理零残留（events_deleted=1/plan_deleted=true） | DEPLOY_OK + HEALTHY；回滚：compose 备份 .bak-20261008-b2 + 旧镜像 family-menu-api:latest 与 fm-api:rollback-* 尚在；首跑探测缺陷（公网 /health 是 H5 页）已修为服务器本地探测 |
