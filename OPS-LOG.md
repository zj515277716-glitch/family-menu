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
