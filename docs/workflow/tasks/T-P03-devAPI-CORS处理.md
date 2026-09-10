# T-P03 dev API 跨域（CORS）处理（E1 修复）

> 状态：**待用户审核**（fm-dev 交付 → fm-reviewer 复审**通过**（4 条建议级无阻断）→ fm-verify 验收**通过**（AC3 无挂具真实浏览器直调）→ 主控收敛完毕；证据 [evidence/T-P03-2026-09-06.md](../../../evidence/T-P03-2026-09-06.md)；2026-09-06 用户裁决后 git 提交 `f1b0954`（7 文件 +356/-8，**含新增依赖 @fastify/cors ^11.3.0**））
> 依据：[evidence/T-P02-2026-09-06.md](../../../evidence/T-P02-2026-09-06.md) §5 卡外发现 E1（探针原文 .workflow-verify/e1-preflight-result.txt）；2026-09-06 产品负责人裁决开卡修复
> WIP=1：本卡为当前唯一活动代码任务。派发者：主控 PM。执行者：fm-dev → fm-reviewer → fm-verify。

## 背景

T-P02 首次浏览器级验收暴露 E1：H5 dev(:10086) 与 API(:3000) 跨源，浏览器预检 OPTIONS 落入 authHook 返回 401，且响应零 CORS 头（acao/acam/allowHeader 均 null），真实浏览器直调 :3000 被预检阻断——T-P02 验收只能以 Playwright route 挂具代答预检完成（方法学已披露）。生产同源部署（menu.jijingkongjian.xin）不受影响；本卡目标仅 dev 体验与浏览器级验收可用性，不涉及生产行为变更。

## 目标（AC 逐条可判）

- **AC1 预检放行**：从 `http://127.0.0.1:10086` 与 `http://localhost:10086` 发起的 OPTIONS 预检不再 401（2xx），且响应含 `Access-Control-Allow-Origin`（按白名单回显请求源）、`Access-Control-Allow-Methods`、`Access-Control-Allow-Headers`、`Access-Control-Allow-Credentials: true`（本站 cookie 鉴权，credentials 必须 true）。
- **AC2 鉴权语义不变**：无令牌跨源真实请求仍 401（但带 CORS 头）；带 ACCESS_TOKEN cookie 的跨源推荐请求正常 200；同源请求行为与现状一致（tp01/tp02 回归全绿可证）。
- **AC3 真实浏览器无挂具直调**：fm-verify 用 Playwright **不注册任何 route 拦截**，从 :10086 页面真实走通「设置必消 → 点推荐 → 出候选或空手卡」至少一场景，consoleErrors=[]。
- **AC4 真实测试证据**：方案选型说明（插件 vs 零依赖手写预检豁免，含新增依赖理由或零依赖证明）+ 预检查证原文（curl/脚本）+ tp01 回归全绿（EXIT=0，命令+数字结果）+ teardown 强制（测试 Plan/Event 清零，清理前后 COUNT 留证）+ 未验证项必填。

## 输入资源

- E1 探针原文：`.workflow-verify/e1-preflight-result.txt`（3 条 OPTIONS 全部 401 + 三 CORS 头 null）
- 现状：apps/api/src/app.ts（Fastify5，无 CORS 处理）；鉴权 authHook（cookie `ACCESS_TOKEN=family-menu-local-2026`，无令牌 401）；路由前缀 /api
- 本机环境：PG 17.5 @ 127.0.0.1:54329（trust）；API :3000（tsx watch）；H5 dev :10086（Taro4）；根 .env 含 DATABASE_URL / ACCESS_TOKEN / PORT
- 回归先例：tests/tp01-mustuse-regression.cjs（真实 HTTP+PG 直查；pg 经 `createRequire(path.join(__dirname,'..','apps','api','package.json'))` 解析）；teardown 脚本先例 tests/tp02-cleanup-test-plans.cjs

## 允许修改范围

- apps/api/src/**（app.ts 及必要的插件/钩子）
- tests/ 下扩展回归（可选）
- **禁止**：packages/shared（契约）、packages/engine、packages/list-merger、apps/h5/**、apps/api/prisma/**（schema/迁移）、生产环境写入
- 新增依赖允许但须在回报中列出并说明理由；零依赖方案（如 addOptions 路由/钩子内预检短路）亦可，由 fm-dev 选型并自证，fm-reviewer 复核

## 边界约束

- 生产环境只读：https://menu.jijingkongjian.xin 仅允许无副作用调用
- 不切换分支、不做 git 提交（提交与否由产品负责人决定）
- 临时脚本一律 `.cjs`；停服务后必须复测端口；长驻 dev 服务脱离包装器启动（`Start-Process cmd /c "... > log 2>&1"`），防会话结束连带杀进程
- teardown 强制（T-P01/T-P02 教训）：测试产生的 Plan/Event 必须清零，清理前后 COUNT 留证

## 验收环节（fm-verify 执行）

- AC1/AC2 以独立脚本复现（不经开发代码路径）
- AC3 真实浏览器**无挂具**直调（本卡核心证明，区别于 T-P02 的挂具方法）
- 截图/日志落 `.workflow-verify/`（gitignore，不入库）；仓库零新增依赖（Playwright 复用 `.workflow-verify/` 内安装）

## 异常升级

预检行为与探针不符 / 需改契约或 prisma / 影响生产部署形态 → 停下写回报报主控，不脑补、不绕过。

## 回报格式（成员必填，缺项退回）

- AC 自检逐条 [✓]/[✗]
- 命令 + 退出码 + 数字结果原文（完整粘贴）
- **未验证项（必填，哪怕写"无"）**
- 卡外发现（有则列，无则写"无"）
