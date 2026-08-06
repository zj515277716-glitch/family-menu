# 家庭菜谱App 开发决策
> 只记录跨步骤有效的决策。普通实现细节留在任务卡、代码和测试中。

- DEC-001 技术基线：实施方案第二章定案。2026-08-06 联网核对各组件当前稳定版本号（来源见各条括号）：
  · Node.js 22.23.2（LTS "Jod"，2026-07-29 安全发布）— nodejs.org/en/blog/release/v22.23.2
  · pnpm 11.20（2026-08-03）— pnpm.io/blog
  · Fastify 5.10.0（2026-07-04）— releasebot.io（Fastify v5.10.0 release notes，引 fastify/fastify GitHub releases）
  · Prisma 7.7.0（v7 系列最新 minor，2026-04-07；@lamhieu/prisma 镜像 2026-06 已达 7.8.0，官方包版本应 ≥7.7.0）— issoh.co.jp 引 Prisma 官方 changelog + npmjs.com/package/@lamhieu/prisma
    注：Prisma 7 为 Rust-free 重写版（2025-11-19 GA），含破坏性变更（datasource URL 迁至 prisma.config.ts、generator 由 prisma-client-js 改为 prisma-client、运行时需 driver adapter）。实施方案 3.2 的 schema 示例为旧版风格，STEP-03 数据层需按 Prisma 7 适配——具体方案由 fm-arch/fm-dev 在 STEP-03 评估，本条只记录核对到的事实，不做技术决策。
  · @prisma/client 同 prisma 版本（7.7.0+）
  · Taro 4.2.0（@tarojs/cli）— npmjs.com/package/@tarojs/cli
  · NutUI @nutui/nutui-react-taro 4.0.0-beta.5（latest tag 仍为 beta，2026-07 发布）— npmjs.com/package/@nutui/nutui-react-taro
    注：React 版 NutUI Taro 当前无 4.0 stable 正式版。是否接受 beta 或回退 3.x stable 属技术决策，STEP-02 契约冻结 / STEP-06 前端启动时抛 fm-arch 评估，本条不预定论。
  · Vitest 4.1.10 — npmjs.com/package/vitest
  · TypeScript（strict）/ PostgreSQL 18（RDS）/ Docker Compose + Caddy：沿用实施方档第二章定案，精确版本随 STEP-01 工程基线锁定。
  核对方式说明：因本机 PowerShell 执行策略为 Restricted，curl/irm 脚本式查询 npm registry 受阻，改用 WebSearch 核对各包 npm 页面与官方博客/发布说明。核对日 2026-08-06。
- DEC-002 角色与制衡：主/开发/测试/审查四角色固定；各角色独立上下文（分Agent）；
  审查角色权限只读；主Agent不写代码、不做技术决策。
- DEC-003 WIP=1：代码任务严格串行，STATUS.md任何时刻只有一个活动任务卡；
  内容轨（起草/试做）与素材轨（生图）为非代码轨道，可并行。
- DEC-004 无上下文恢复协议：每步开始前完整读取实施方案+四件套；仓库文件与
  测试结果优先于聊天上下文；每步结束必须追加开发日志，未记录不得开始下一步。
  简化：以git commit hash替代逐文件SHA256（本项目自STEP-00即有git保证完整性）。
- DEC-005 用户审核门禁：每STEP完成开发/测试/审查/复验后停"待用户审核"；
  批准前不合并、不启动下一STEP；内部审查不得当作用户审核。
- DEC-006 运行时零LLM：产品运行链路不调用任何大模型；内容三态
  DRAFT->TESTED->PUBLISHED，升级仅通过试做记录（CookLog）。
- DEC-007 素材三层策略：功能图标用图标库；装饰插画AI生成（风格基座+一次成套）；
  菜品图一律试做实拍，禁止AI生成菜品实拍感图片。
- DEC-008 YAGNI边界：实施方案1.3清单为范围硬边界；触碰需走新功能闭环（6.7）
  由用户裁决。
- DEC-009 运行底座：全部角色在Trae内以自定义智能体承担（2026-08-06三条件实测
  通过：①禁写保留读②SOLO Coder派发-回收③上下文隔离，记录见trae-base-test）；
  队长=SOLO Coder（项目规则约束"只派发不亲自读写"）；reviewer锁只读；跨模型
  审查仅在M1–M4 gate由Claude Code执行一次；跨工具人工中转不进STEP内流程。
- DEC-010 视觉定稿：主题色方案 A 番茄暖橙（主色 #FF6B35）。
  2026-08-07 用户审核 UI 设计文档时选定。fm-ui 产出 3 套候选（A 番茄暖橙 /
  B 红烧暖红 / C 蜜糖琥珀），用户选 A（食欲感最强、与高频食材色彩呼应）。
  docs/design/theme-tokens.ts 中 themeA 为定稿方案，STEP-06 前端直接引用。
