# T-C02 小红书 CDP 采集脚本（试采验证）

> 状态：**待用户审核**（fm-dev 交付 8/8 AC（真实采集 1 篇五要素 + 3 图下载、零新增依赖，报告 [evidence/T-C02-dev-2026-09-10.md](../../../evidence/T-C02-dev-2026-09-10.md)）→ fm-reviewer 复审**通过**（会话安全 6 项子检查全过；建议级 C-1 out/ 未入 .gitignore、C-2 图片扩展名）→ fm-verify 产物抽查**通过**（V6：五要素齐全 + 字节精确一致 + RIFF/WEBP 魔数证实）→ 主控收敛完毕；2026-09-10 用户四项裁决后 git 提交（脚本入库；out/ 产物按 C-1 裁决不入库）→ **已完结**）

## 背景

内容轨道调查（tools/content-pipeline/docs/recipe-fetch-feasibility-2026-09-06.md）结论：小红书纯 HTTP 不可行（Vue SPA 空壳 + as.xiaohongshu.com 设备签名 + 需 x-s/x-t/a1 登录态）。用户裁决（2026-09-10）：**走 CDP 自动采集，此方法用户已在其他 agent 工具跑通；需人工登录/验证时打开页面由用户人工处理。** 用户已通过 CDP 浏览器完成登录。

**CDP 浏览器现场（生产资料，禁杀禁清）**：Edge，`--remote-debugging-port=9222`，`--user-data-dir=d:\codex\family-menu\.workflow-verify\cdp-xhs-profile`，已登录小红书。tab id 参考 67EA7F81D1F63284FE45EBC5881BD4B6（以 /json 实时列表为准）。

## AC（逐条 [✓]/[✗] 自检）

- **AC1 CDP 连接复用**：连 `http://127.0.0.1:9222` 现有会话（GET /json 找 xiaohongshu tab 的 webSocketDebuggerUrl）；不得新开登录流程、不得新开无登录态实例。
- **AC2 登录态验证**：将目标 tab 导航到 `https://www.xiaohongshu.com/explore`，确认未跳登录页（URL 不含 `/login` + 截图存证）。
- **AC3 真实采集 ≥1 篇美食笔记**：提取 标题/正文文本/图片 URL 列表/作者/笔记链接，落 `tools/content-pipeline/out/xhs/<noteId>.fetch.json`（内部扩展字段格式，**不直接入库**，入库属 T-C01 合入后的流程）。
- **AC4 图片下载 ≥1 张**：下载到 `tools/content-pipeline/out/xhs/images/`，真实字节非空（文件大小入报告）。
- **AC5 会话安全与节流**：不关闭浏览器、不清 cookie/localStorage、不登出；页面动作间隔 ≥5s。
- **AC6 依赖纪律**：优先 Node 原生能力（WebSocket/HTTP）实现最小 CDP 客户端；如确需新增 npm 依赖，在完成报告列明名称与理由（按 AGENTS 规则 7）。
- **AC7 证据落盘（R-1 纪律）**：完成报告落盘 `evidence/T-C02-dev-2026-09-10.md`，含命令+退出码+产物清单+截图路径。
- **AC8 失效即停**：登录态失效（跳登录页）或验证码/风控弹窗 → 截图留证+停手报告，等用户人工处理，不自行扫码重试。

## 边界

- **允许**：新增 `tools/content-pipeline/xhs-fetch.mjs`（及必要辅助模块）、`tools/content-pipeline/out/xhs/**`、`evidence/T-C02-dev-2026-09-10.md`。
- **禁改**：tools/content-pipeline 的 import.ts / DraftDish schema / package.json（T-C01 正并行修改，避免冲突）、packages/**、apps/**、浏览器登录态与其 user-data-dir。
- 浏览器若已被关闭：用**同一** user-data-dir 重启可恢复登录态：`Start-Process "msedge.exe" -ArgumentList '--remote-debugging-port=9222','--user-data-dir=d:\codex\family-menu\.workflow-verify\cdp-xhs-profile','https://www.xiaohongshu.com'`。
- >30s 命令 Start-Process 脱离+轮询；退出码 $LASTEXITCODE；截图落 `.workflow-verify/tp-c02/`。

## 异常升级

验证码/风控/登录失效 → 停手截图报告；连续 2 次采集失败 → 停手报告，不暴力重试。
