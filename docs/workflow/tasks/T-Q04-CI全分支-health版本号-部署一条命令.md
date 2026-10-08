# T-Q04 CI 全分支 + /health 版本号 + 部署一条命令（不在生产机构建）

> 立项依据：产品负责人 2026-10-08 指令。级别：a 卡 L2（CI/契约/部署配置，不触生产）；b 卡 L3（生产切换，单独授权）。红线对齐：「不在生产服务器上做大构建」。
> 现状核查（2026-10-08）：CI run #25（384e566）lint 失败 = T-A6 的 42 errors；run #26（229677f）已 **success**（T-A6 合并自然修绿）。lint 无需再改，本卡只改触发面。

## a 卡（L2，纯仓库改动，不触生产）

- AC1 `.github/workflows/ci.yml`：push 触发扩为所有分支（`branches: ['**']`），PR 触发保留；改动推送后 main 与新分支 CI 实跑绿（附 run 链接）。
- AC2 仓库根新增 `VERSION` 文件（产品负责人已定初值 `1.1.0`）；`/health` 返回 `{ status, version: '<VERSION>+<GIT_COMMIT 短哈希>', timestamp }`；GIT_COMMIT 经 Docker build arg 注入，本地 dev 未注入时仅显示文件版本；读文件失败兜底 `unknown`，/health 不得 500（compose healthcheck 依赖它）。
- AC3 Dockerfile：COPY VERSION + ARG/ENV GIT_COMMIT；构建产物不含口令（现有 placeholder DATABASE_URL 口径不变，`pnpm check:secrets` 过）。
- AC4 新增本地部署脚本（一条命令）：`deploy:api`（远端 pull + up + /health 核对 commit）与 `deploy:h5`（本地 build 产物 tar/scp/原子解包，参考 tools/deploy-h5-remote.sh 收敛）；镜像仓库为**阿里云 ACR 个人版（产品负责人已拍板）**，registry 地址/命名空间参数化（环境变量，未配置时脚本给出明确指引并退出）；ACR 推送 CI job 依赖凭据 secrets，归 b 卡；本卡只交付脚本，**禁止对 fmsrv 执行任何 ssh/部署操作**。
- AC5 门禁四项全绿 + tsc；证据 evidence/T-Q04-dev-*.md（≤1 页）。

## b 卡（L3，生产切换，产品负责人单独授权后执行）

- 前置（产品负责人操作）：开通阿里云 ACR 个人版 + 创建命名空间/仓库 + 提供 registry 地址；GitHub 仓库 Secrets 配置 ACR 用户名/密码（主控不给明文凭据）。
- 服务器 compose api 段去 `build:` 改 `image: <ACR 地址>/<命名空间>/family-menu-api:<tag>`（compose 备份 .bak）；ci.yml 加 ACR 推送 job（仅 main：buildx → push `<sha>` 与 `latest`）；首次部署选低峰，healthy 后冒烟（/health commit=本次提交号）；回滚 = 恢复备份 compose + 既有本地镜像 tag（fm-api:rollback-pre-a3 仍在）；OPS-LOG 记一行。

## 风险清单

1. ACR 个人版个人免费但需开通（实名+开通操作，产品负责人执行）；国内拉取快于 GHCR，仍预留 registry 参数化以便再迁移。
2. /health 公开返回版本与 commit：家庭站攻击面溢价低，且公开仓库 hash 本可查；不接受则去掉 commit 只留 version。
3. CI 全分支并行跑（PG service 每 job 独立容器，无本机共用 PG 干扰问题）；public 仓库 Actions 免费无限，无费用风险。
4. 版本号=提交号惯例由 commit 后缀承载，VERSION 文件为人工可读版本；两口径在 /health 同时可见，杜绝「生产到底跑的谁」再成悬案。

## 终态（主控补登）

a 卡完成（2026-10-08）：dev e487d68+1513f93（feat/t-q04-a）——ci 全分支触发（CI run #27/#28 实跑 success）、VERSION 1.1.0、/health 返回 version（兜底 unknown 恒 200，单测 5 用例）、Dockerfile 注入 GIT_COMMIT、deploy:api/deploy:h5 脚本（ACR 参数化+dry-run，未触 fmsrv）；审查建议两处已修（fetch res.status 属性名、VERSION 行尾）。门禁：test 503/20skip/0、taboo 130、lint 0、tsc 0、check:secrets 0。独立审查 **PASS**（evidence/T-Q04-a-review-2026-10-08.md）。层级：**第 2 层**（无 UI，截图不适用）；合并待产品负责人授权。b 卡待前置：产品负责人开通 ACR + GitHub Secrets 配凭据 + 选部署窗口。
