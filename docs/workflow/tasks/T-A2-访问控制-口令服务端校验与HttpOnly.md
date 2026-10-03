# T-A2 访问控制：口令改服务端校验 + HttpOnly cookie + 登录限速

> 立项依据：复盘报告 V2 §P0-2、§5.1 A2（口令已公开在公网 JS，生产正在暴露）。级别 L2（更换口令/生产部署属 L3，单独报批）。主控决定①（2026-10-02）：**进门先输一次家庭口令**，家人每台设备首次打开输一次。顺序：A2 → A1 → A3，一次一张，WIP=1。

## 背景事实

- 生产构建把 `TARO_APP_ACCESS_TOKEN` 编译进 H5 JS（[app.tsx:13-15](../../../apps/h5/src/app.tsx#L13-L15) 再写 cookie）——拿到网址即拿到口令，可读写全部数据（含 `PUT /api/family/exclusions`）。
- [app.ts:27-38](../../../apps/api/src/app.ts#L27-L38) 普通字符串比对口令、无限速；`/health/db` 失败回显详情。

## AC（逐条 [✓]/[✗] 自检）

- AC1 前端零口令：h5 源码与生产构建产物均不含口令/token 常量；首次打开显示「输入家庭口令」页，通过后才进首页（主控决定①形态）。
- AC2 服务端校验：常量时间比较 + 登录接口简单限速（内存计数，不引依赖）；通过后下发 HttpOnly + Secure + SameSite=Lax 长期 cookie；口令值只从服务端环境变量读，**不碰任何 .env 文件**。
- AC3 未认证 401：不带 cookie 访问业务 /api 一律 401；h5 统一封装把 401 导回登录态，禁止静默失败。
- AC4 冒烟：tests/e2e 新增 Playwright 用例「输口令 → 进首页」通过；产物 grep 无口令。
- AC5 门禁：`pnpm lint`、`pnpm -r exec tsc --noEmit`、`pnpm test`、`pnpm test:taboo` 全绿。
- AC6 证据：dev 报告 `evidence/T-A2-dev-2026-10-02.md`（≤1 页）+ reviewer 独立跑命令记录。

## 测试先行（fm-dev 先写、先看见红）

1. 不带 cookie 调业务 /api → 期望 401（现状 200，先失败）。
2. 生产构建产物 grep 口令 → 期望 0 命中（现状能命中，先失败）。

## 边界约束

- 允许改：apps/api/src/**（认证相关）、apps/h5/src/app.tsx、apps/h5/src/api/client.ts、apps/h5 新增登录页（功能必需）、tests/e2e/**。
- 禁改：packages/shared/src、prisma/schema.prisma 与现有迁移、engine/list-merger、planService 业务逻辑、现有测试断言基线（新增除外）；禁引入新依赖。
- **L3 步骤 dev 不执行**：更换生产口令、生产部署、对生产库任何操作——停手，把命令与回滚脚本写进 dev 报告交主控，主控同意后才执行，执行后 OPS-LOG.md 记一行。

## 环境与分支

分支 `fix/a2-access-control`（main `682455a`）。便携 PG 需要时启动：`& "d:\codex\family-menu\.pg\bin\pg_ctl.exe" -D "d:\codex\family-menu\.pg\data" -o "-p 54329" -l "d:\codex\family-menu\.pg\pg.log" start`，连接串 `postgresql://postgres@127.0.0.1:54329/family_menu`，用完 `-m fast stop`。本地 API :3000 / H5 :10086。分支首提交为 Playwright 基线（当前工作区未提交的 package.json / pnpm-lock.yaml / tests/e2e / evidence/T-000-v21，属本卡冒烟验收依赖）。

## 异常升级

需改 shared 契约 / 认证形态影响家人使用（含决定①细节）/ 本地复现不了 401 现状 / 限速方案有争议 → 停手报主控，不自行改方案。

## 终态（主控补登 · 2026-10-03）

**结论：PASS → 已部署生产（第 3 层达成）**

- DEV：3 提交 `06d7e21`/`b40dd21`/`2a2b9c0`（证据 evidence/T-A2-dev-2026-10-02.md）。
- REVIEW：PASS（曾因提交标题 336 字打回一次，rebase 重写后复审关闭；证据 evidence/T-A2-review-2026-10-02.md）。
- VERIFY：13/13 PASS（证据 evidence/T-A2-verify-2026-10-02.md + evidence/T-A2/*.png）。
- L3（产品负责人 2026-10-03 批准）：口令已轮换、H5 登录门与 API 混合包（`27d1224`＝86b1263+A2 三文件，不含 T-P16/T-P17）已上线，生产冒烟 9/9；流水见 OPS-LOG.md。
- 偏离卡中描述一条（dev 已如实记录）：本机「无 cookie 现状」实为 401（ACCESS_TOKEN 已配置），真漏洞为口令公开可自取自取合法 cookie，以产物 grep + 登录契约测试守住。
