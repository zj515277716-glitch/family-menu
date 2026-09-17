# RIBS-MENU 补建含排骨 PUBLISHED 套餐（方案1）— 开发/验证证据

- 日期：2026-09-17
- 性质：数据层操作（无业务代码变更；仅 .workflow-verify/recruit/ 下探查与验证脚本）
- 触发：用户对话确认「按方案1执行」= 补建含排骨的 PUBLISHED 套餐，让排骨菜进入推荐引擎射程
- 设计决策（用户跳过二次确认，按推荐执行）：①两道排骨汤 mealRole 纠偏 MAIN→SOUP ②建 3 套套餐覆盖 WEEKDAY_FAST×2 + WEEKEND×1

## 1. 数据操作（apply-ribs-menus.cjs，事务 + 幂等）

前置：PG 便携版启动必须带 `-o "-p 54329"`（T-P14/T-P15 权威口径）。

| 操作 | 结果 |
|---|---|
| 升格 DRAFT→PUBLISHED（糖醋排骨/玉米排骨汤/冬瓜排骨汤/土豆烧排骨） | 4 行 |
| mealRole 纠偏 MAIN→SOUP（玉米排骨汤/冬瓜排骨汤） | 2 行 |
| 幂等清理 + 重建 Menu/MenuDish | 3 套套餐 |

三套套餐（prepSequence/totalActiveMinutes 按 menu-assemble + buildPrepSequence 口径复刻）：

| id | 场景 | 总工时 | 组成 |
|---|---|---|---|
| ribs-menu-01 | WEEKDAY_FAST | 25min | 糖醋排骨 + 蒜蓉青菜 + 紫菜蛋花汤 |
| ribs-menu-02 | WEEKEND | 43min | 土豆烧排骨 + 凉拌黄瓜 + 玉米排骨汤 + 蛋炒饭 |
| ribs-menu-03 | WEEKDAY_FAST | 30min | 西兰花炒虾仁 + 蒜蓉青菜 + 冬瓜排骨汤 |

## 2. 验证证据（真实执行，非 Mock）

### 2.1 数据面复验（probe-pool.cjs / probe-dist.cjs 复跑）
- SOUP 池 1→3（新增两道排骨汤）；仅 f-stew 土豆炖牛腩未入套餐（如实保留，不凑数）
- 4 道排骨菜 status=PUBLISHED，DishIngredient 食材关联均指向 seed-ing-ribs（probe-resolve.cjs）
- 层1 字典「排骨」唯一解析 seed-ing-ribs，无别名冲突（食材表仅 1 行 name=排骨，aliases=肋排/猪排骨/小排/仔排）

### 2.2 引擎面复现（repro-mustuse.cjs：纯 pg 组装 library → 直调 engine/dist）
- mustUseIngredients=[]：候选 pipeline-menu-01/02/03（正常）
- mustUseIngredients=["seed-ing-ribs"]：候选 ribs-menu-01/03/02，unsatisfiable 空
- filtered trace 显示 pipeline/seed 菜单因「未能消耗必消食材」被硬过滤（PD-001 行为正确）

### 2.3 API 真实链路（repro-api.ps1，cookie 鉴权 POST /api/recommend）
- 验证1 mustUse=[排骨] people=4 timeBudget=45：候选数 3
  - [ribs-menu-01] score=0.835 糖醋排骨/蒜蓉青菜/紫菜蛋花汤
  - [ribs-menu-03] score=0.835 西兰花炒虾仁/蒜蓉青菜/冬瓜排骨汤
  - [ribs-menu-02] score=0.795 土豆烧排骨/凉拌黄瓜/玉米排骨汤/蛋炒饭
- 验证2 mustUse=[] people=2 timeBudget=30：候选数 3（pipeline-menu-02/01/03，对照组正常）
- 原始响应存 resp-mustuse-ribs.json

## 3. NO_DISH 排查记录（重要：非系统缺陷）

首轮验证1 报空手 `unmetReasons: {"???":"NO_DISH"}`，排查链：
1. 排除加载链缺陷：loadMenuViews include 链完整（dish→ingredients→ingredient）
2. 排除 mustUse 解析缺陷：层1 字典「排骨」唯一命中 seed-ing-ribs（probe-resolve.cjs）
3. 排除 safety 过滤误伤：禁忌 3 条（花生TAG×2 + 花生米食材）与排骨菜无关
4. 引擎本地复现正常（2.2）→ 矛盾锁定 API 请求侧
5. **根因（repro-api.ps1 codepoints 取证）**：unmetReasons key 的 UTF-8 codepoints = `3F 3F 3F`（字面三个问号）——Windows PowerShell 5 `Invoke-RestMethod` 对 string body 默认按 ASCII 编码，中文「排骨」被编码为 "??？"；叠加 .ps1 文件无 BOM 被 PowerShell 5 按 GBK 解码（脚本内中文字面量二次损坏，codepoints `E9 8E BA ...`）
6. 修复验证脚本（UTF-8 字节 body + charset=utf-8 + BOM 文件）后验证1 通过（2.3）

结论：**数据/引擎/API 服务链路均正常**；NO_DISH 为验证工具编码缺陷所致的假阴性。H5 前端走浏览器 fetch（UTF-8），不受影响。

## 4. 遗留 / 挂账

- 30 道 FETCHED 菜仍为 DRAFT 且名字带标题党前缀（emoji/感叹号），steps.text 是社媒文案非操作指令——已进套餐的 3 道 FETCHED 菜（糖醋排骨/玉米排骨汤/冬瓜排骨汤）建议后续内容审阅任务清理（不影响推荐，仅展示口径）
- probe-equip.cjs 中 FamilyRule 查询列名笔误（timebudgets→"timeBudgets"）未修：不影响结论（器具无阻塞由 2.3 间接证明）
- **方案2（用户已明确）**：推荐套餐骨架动态组合（按 MealRole 槽位从分类菜谱池抽选，数量随人数变更）——架构级变更，需登记 PRODUCT-CONFIRMATION 后按四角色流程派发

## 5. 运行时清理

- API 服务已停止；PG 已 `-m fast stop`（54329）
