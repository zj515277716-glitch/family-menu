# 家庭菜谱App 开发状态
> 本文件由主Agent维护。任何时刻只允许一个活动任务卡（DEC-003）。

## 当前状态
- 当前阶段：STEP-06 H5前端（WP-05）（待用户审核）
- main HEAD：a01fdb5；回滚tag：rollback-before-step-06 -> a01fdb5；契约冻结tag：v0.2
- 阻塞/外部依赖：无
- 下一个人工决策点：STEP-06 交付审核（M3 里程碑：手机上五步流程跑通）
- 30%检查点：前两个页面（setup+tonight）完成后队长做非正式review（第504行）

## 当前任务卡：STEP-06 H5前端（对应 WP-05）
状态: 待用户审核    回环计数: 0/3
执行者: fm-dev    审查者: fm-reviewer（只读）
需求来源: 实施方案第372-382行目录结构 + 第568行WP-05 + 第611行STEP-06 + 第504行30%检查点 + 第639行前端冒烟 + 第65行Taro4+React18+NutUI + 第694行编译目标h5 + DEC-006零LLM + DEC-010主题色定稿 + STEP-02契约v0.1 + STEP-05 API 10路由 + UI设计文档（wireframes/interaction-flow/theme-tokens/assets-spec）    基线提交: main@a01fdb5    回滚点: rollback-before-step-06

### ① 目标
实现 Taro 4 + React 18 + NutUI H5 前端：5 页面走通（setup/tonight/candidates/plan/history）+ TabBar 导航 + API client + Zustand store + 主题 tokens 接入 + 装饰插画接入。先 Mock 后真 API。

### ② 验收标准 AC
- [ ] AC1 apps/h5/src/app.config.ts 配置 5 页面路由 + TabBar 3 常驻入口（今晚/历史/设置），对齐 wireframes.md 第11-34行
- [ ] AC2 apps/h5/src/api/client.ts fetch封装（由shared契约约束，ACCESS_TOKEN cookie鉴权，10条API路由对应方法），对齐实施方案第381行
- [ ] AC3 apps/h5/src/store/ Zustand全局store（tonight情境状态保持+plan状态+familyRules缓存），对齐实施方案第382行+wireframes第411行
- [ ] AC4 apps/h5/src/pages/setup/ F1家庭规则设置（人数/时长/器具/菜系/禁忌Popup，PUT /api/family/rules），对齐 wireframes第37-95行
- [ ] AC5 apps/h5/src/pages/tonight/ F2今晚情境（人数/时间档/必消食材，预填默认值，POST /api/recommend），对齐 wireframes第99-147行
- [ ] AC6 apps/h5/src/pages/candidates/ F3三套候选（评分/理由/菜品详情/整套换/单菜换/锁定），对齐 wireframes第150-234行
- [ ] AC7 apps/h5/src/pages/plan/ F4/F5清单+备菜（Tabs切换清单/备菜顺序，勾选PATCH，Timeline备菜），对齐 wireframes第238-314行
- [ ] AC8 apps/h5/src/pages/history/ F6/F7反馈+历史（反馈表单/历史列表/复做/空状态），对齐 wireframes第318-405行
- [ ] AC9 主题tokens接入（DEC-010番茄暖橙#FF6B35，NutUI ConfigProvider定制），对齐 theme-tokens.ts
- [ ] AC10 8张装饰插画从assets/接入（logo/hero/empty×3/feedback×2/placeholder），对齐 assets-spec.md
- [ ] AC11 pnpm verify exit 0（lint零error，build成功，test通过）；pnpm --filter @family-menu/h5 build成功（taro build --type h5）
- [ ] AC12 pnpm -r build成功（不破坏shared/engine/list-merger/api现有构建）

### ③ 输入资源
- docs/plan/实施方案.md @a01fdb5：
  - 第372-382行：apps/h5目录结构（pages/{setup,tonight,candidates,plan,history} + api/client.ts + store/）
  - 第568行：WP-05 H5前端 - 5页面走通（先Mock后真API）
  - 第611行：STEP-06 H5前端 - 5页面走通、素材从assets/接入、真机体验版冒烟
  - 第504行：30%检查点 - STEP-06中段（前两个页面完成时）做非正式review
  - 第639行：前端测试 - 手动5步冒烟清单（F1->F7每步可达）
  - 第65行：前端 Taro 4 + React 18 + NutUI
  - 第694行：apps/h5 Taro4+React+NutUI，编译目标h5（勿引入weapp专属API）
- UI设计文档 @a01fdb5：
  - docs/design/wireframes.md：5页面线框图 + TabBar导航 + 跨页面交互备注
  - docs/design/interaction-flow.md：Mermaid交互流程图 + 异常路径 + 可用性走查
  - docs/design/theme-tokens.ts：3套候选（A番茄暖橙定稿，DEC-010）
  - docs/design/assets-spec.md：素材清单 + 提示词（8张已生成）
- STEP-02 契约 v0.1 @v0.1 tag：packages/shared/src/schemas/api.ts（10条路由请求/响应schema + 类型导出）
- STEP-05 API @a01fdb5：apps/api/src/routes/{family,recommend,plans}.ts（10条路由，ACCESS_TOKEN cookie鉴权）
- 现有基线 @a01fdb5：
  - apps/h5/config/{dev.js, index.js, prod.js}：Taro编译配置
  - apps/h5/src/app.config.ts：当前仅 pages/index/index（需改为5页面+tabBar）
  - apps/h5/src/app.ts：应用入口
  - apps/h5/src/pages/index/：临时首页（需替换）
  - apps/h5/src/assets/：8张装饰插画已入库
  - apps/h5/package.json：已有 @tarojs/* ^4.2.0 + react ^18.3.0 + @family-menu/shared workspace:*
  - apps/h5/babel.config.js + tsconfig.json
- AGENTS.md @a01fdb5（第694行：apps/h5 Taro4+React+NutUI，编译目标h5，勿引入weapp专属API；铁律6：运行时零LLM）

### ④ 边界约束（不允许做什么）
- 可修改：apps/h5/src/* + apps/h5/config/* + apps/h5/package.json + apps/h5/tsconfig.json + apps/h5/babel.config.js（如需）
- 禁改 packages/shared（v0.1 冻结）
- 禁改 packages/engine / packages/list-merger（STEP-04 已合并）
- 禁改 apps/api（STEP-05 已合并）
- 禁改 apps/api/prisma/schema.prisma
- 禁改 docker-compose.yml / 四件套 / 实施方案
- 运行时零 LLM（DEC-006）
- 编译目标 h5（勿引入 weapp 专属 API，AGENTS.md 第694行）
- 不引入 DEC-008 禁止项（Redis/消息队列/微服务/K8s）
- 新增依赖在完成报告列出（预计：@nutui/nutui-react-taro + @nutui/icons-react-taro + zustand）
- git 提交信息 [WP-05] 动词开头

### ⑤ 异常升级路径
- 契约缺字段（shared v0.1 不满足前端需求）-> 停下@队长转 fm-arch（契约变更流程）
- NutUI 4.x 与 Taro 4 兼容性问题 -> 报队长
- API 接口不匹配 -> 停下@队长
- 第3次被打回 -> 停止修改

## 最小测试（fm-tester 照跑，真实执行，禁止Mock冒充）
- `pnpm install --frozen-lockfile`（exit 0）
- `pnpm verify`（lint+build+test，exit 0，lint 零 error）
- `pnpm -r build`（不破坏其他包构建）
- `pnpm --filter @family-menu/h5 build`（taro build --type h5 成功）

## 审查重点
- 5 页面与 wireframes.md 逐项一致（setup/tonight/candidates/plan/history）
- TabBar 3 常驻入口（今晚/历史/设置）+ 2 流式页（candidates/plan）
- API client 与 shared v0.1 api.ts 契约一致（10 条路由）
- Zustand store 状态保持（tonight 情境跳 candidates 返回不丢）
- 主题 tokens 接入（DEC-010 番茄暖橙 #FF6B35）
- 8 张装饰插画从 assets/ 接入
- 编译目标 h5（无 weapp 专属 API）
- 运行时零 LLM（DEC-006）
- 无死胡同（每个空状态/异常态都有出口）
- 跨页面交互（wireframes 第409-414行：状态保持/返回箭头/Plan状态机/无死胡同）

## 交付门禁
开发（fm-dev）-> 独立测试（fm-tester）-> 交叉审查（fm-reviewer）-> 主复验 -> 状态改"待用户审核"并暂停；
用户批准前不合并、不启动下一 STEP（DEC-005）。

## 完成报告（fm-dev 填写）
- AC自检: [ ]AC1...（逐条[✓]/[✗]）
- 交付物: <路径@commit>
- 测试结果: <用例通过数/exit code>
- 新增依赖及理由: <列出>
- 遗留与下一步建议:

## 审查报告（fm-reviewer 填写，任何✗=打回，回环+1）
- [ ] 契约一致性（5页面与wireframes一致；API client与shared v0.1 api.ts一致；目录结构与第372-382行一致）
- [ ] 越界检查（仅改 apps/h5/*；不改 shared/engine/list-merger/api/prisma）
- [ ] 安全缺陷（无LLM调用DEC-006；无DEC-008禁止项；无weapp专属API；编译目标h5）
- [ ] 逻辑正确性（5页面功能正确F1-F7；API client 10路由正确；Zustand状态保持正确；无死胡同）
- [ ] 可维护性（命名规范；NutUI组件用法正确；主题tokens接入；插画引用正确）

## 总任务拆解
| STEP | 对应WP | 内容 | 状态 |
|---|---|---|---|
| STEP-00 | - | 协作框架四件套 | 已合并 |
| STEP-01 | WP-00 | 工程基线 | 已合并 |
| STEP-02 | WP-01 | 契约冻结 v0.1 | 已合并 |
| STEP-03 | WP-02 | 数据层 | 已合并 |
| STEP-04 | WP-03/06 | 推荐引擎+清单合并器 | 已合并 |
| UI设计 | - | 前置UI设计（线框+流程+主题+插画） | 已完成 |
| STEP-05 | WP-04 | API（Fastify路由+口令鉴权+契约测试） | 已合并 |
| STEP-06 | WP-05 | H5前端（5页面走通） | 进行中 |
| STEP-07 | WP-07 | 内容管线CLI | 未开始 |
| STEP-08 | WP-09/10 | 部署+集成验收 | 未开始 |
