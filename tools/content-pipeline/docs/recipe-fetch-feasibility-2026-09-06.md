# 菜谱池外部内容引入可行性调查报告

> 任务来源：主控 PM 派发【只读技术调查任务·内容轨道】（CURRENT.md 下一步④"菜谱池外部抓取可行性调查已授权启动（只读调查不入库）"）
> 执行角色：fm-dev ｜ 调查日期：2026-09-06 开卡，2026-09-10 执行探测 ｜ 性质：**只读调查，未改任何业务代码、未写数据库、未启动长期服务**
> 允许产物：仅本报告文件（tools/content-pipeline/docs/ 下新建）

---

## 0. 调查边界与方法（先声明，避免误读证据）

- 探测纪律：仅对少量公开页做单次可达性探测（共 8 次 HTTP 请求，见 §6 原始记录），**未批量抓取、未跟随人机验证重定向、未模拟登录、未执行任何签名/绕过逻辑**。
- 本机走系统代理（响应中 `HTTP/1.1 200 Connection established` 行为代理 CONNECT 隧道响应，非目标站返回）。探测环境：Windows 11 + curl.exe，时间 2026-09-10 10:47–10:52（Asia/Shanghai）。
- 外部资料来自公开网络文章（WebSearch），标注了时效；仓库证据标注了文件与行号。

---

## 1. 调查项一：抓取可行性（逐源结论 + 依据）

### 1.1 下厨房（xiachufang.com）—— 结论：**有条件可行**

**实测证据（2026-09-10，命令与完整响应头见 §6）：**

| 探测对象 | 结果 | 判读 |
|---|---|---|
| `/robots.txt`（浏览器 UA） | **HTTP 200**，text/plain，1468 字节 | robots 可正常获取，规则明确 |
| `/recipe/106733852/`（curl 默认 UA，裸） | **HTTP 302** → `Location: /auth/humancheck_captcha/?xcf_token=...&next=/recipe/106733852/`，Set-Cookie: `bid=...; wait_xcf_clearance=1` | 裸客户端被拦，种下"等待人机验证"标记 |
| 同一菜谱页（完整 Chrome/126 UA + Accept + Accept-Language + cookie jar） | **仍 HTTP 302 → humancheck_captcha**（未跟随） | 拦截依据**不是 UA**，而是要求浏览器执行 JS 挑战换取 `xcf_clearance` cookie |
| `/` 首页（浏览器 UA） | **HTTP 200**，text/html;charset=UTF-8，Server: volcalb | 首页不拦 |
| `/sitemap.xml`（浏览器 UA） | **HTTP 200**，text/xml，218,667 字节，robots.txt 明示提供 | sitemap 开放 |
| `/sitemap/recipe_0.xml.gz`（浏览器 UA） | **HTTP 200**，154,920 字节，解压后为标准 urlset，含 `https://www.xiachufang.com/recipe/114/` 等，lastmod=2026-09-10 | **全量菜谱 URL 清单免费可得** |

**robots.txt 关键条款（实测原文，2026-09-10 版本）：**
- `Crawl-delay: 10` —— 官方要求爬虫请求间隔 ≥10 秒；
- `/recipe/{id}/` **本体（无查询串）不在 Disallow 列表**（2022 年旧文所述"/recipe/ 不允许"已过时，robots 已更新）；
- 被 Disallow 的相关路径：`/recipe/*/comments/`、`/recipe/*/pic/`、`/recipe/*/menu/`、`/search/`、`/category/*/pop/`、**`/vod_video/`（视频路径被禁）**；
- Sitemap: `https://www.xiachufang.com/sitemap.xml`（索引指向每日更新的 recipe_N.xml.gz 分片）。

**内容结构可提取性：**
- 服务端渲染实证（首页 200 的 HTML 内直接含菜谱节点）：`<a class="cover-image display-block" href="/recipe/103823174/" title="脆嫩白灼芥兰">`、`<a href="/recipe/103823174/" class="name">脆嫩白灼芥兰</a>`、`<a class="num" ...>43 人做过这道菜</a>` —— 与 2020–2026 年多份公开爬虫教程描述的列表页结构（`p.name`/`p.ing ellipsis`/`stats green-font`）一致，HTML 结构稳定、纯静态可解析；
- 详情页结构（标题/用料表/分步做法/图片 URL）在 2026-02 公开教程中仍被描述为可解析（该教程以"下厨房家常菜分类"作为零基础爬虫教学示例），**但本次因人机验证未取得详情页 HTML 样本，详情页当前结构列入未验证项（§7）**；
- 质量信号："N 人做过这道菜"在服务端渲染 HTML 中直接可得，可作为"优质菜谱"的客观筛选依据。

**判定：有条件可行。** 条件如下：
1. URL 来源走 sitemap（完全开放、robots 允许），列表/首页数据纯 HTTP 可得；
2. **详情页当前必须通过 JS 人机验证（xcf_clearance）**，纯 HTTP 客户端（curl/requests 直抓）不可行。要通过验证需要真实浏览器渲染环境（如 Playwright 驱动的浏览器）或"人工浏览器打开页面"的半自动方式——前者可能被挑战机制识别自动化浏览器（未验证），且是否授权"浏览器自动化抓取"属主控/用户决策点（本任务卡禁止绕过反爬，未做实验）；
3. 抓取频率必须遵守 `Crawl-delay: 10`，且小批量（个人自用每次数道菜），批量高频必然触发封禁（2020 年公开教程即记录过同 IP 连续访问被封的先例）。

### 1.2 小红书（xiaohongshu.com）—— 结论：**不可行（自动化获取）；仅剩人工录入路径**

**实测证据：**
- `GET /`（浏览器 UA）→ **HTTP 302 → /explore**，Server: openresty，Set-Cookie: `acw_tc`、`abRequestId`，响应头含 `xhs-real-ip`；
- `GET /explore`（浏览器 UA + cookie jar）→ **HTTP 200 但为 SPA 空壳**：title「小红书 - 你的生活兴趣社区」，内容由 Vue bundle（fe-static.xhscdn.com）运行时渲染，HTML 中**无任何笔记/菜谱内容数据**；
- 壳页面显式引入设备签名脚本：`<script src="https://as.xiaohongshu.com/api/sec/v1/ds?appId=xhs-pc-web" defer>` —— 即公开资料所述 x-s / x-t / x-s-common 签名体系的生成端。首屏内容靠 `/api/sns/web/...` 接口拉取，需签名头。

**公开资料交叉印证（2026 年多篇技术文章一致描述）：**
- Web API 反爬 = 动态签名（x-s/x-t/x-s-common，有资料称签名算法约每 24 小时迭代）+ 浏览器指纹检测（Canvas/WebGL/字体）+ IP/账号/设备复合频率控制；
- 笔记详情 URL 需携带 `xsec_token` 才可访问；现成开源方案（MediaCrawler、xhs 库）全部依赖：**登录态 cookie（a1）+ 真实浏览器环境执行 JS 生成签名**（或逆向签名库）——即"模拟登录 + 绕过反爬"，**均为本任务卡明令禁止的操作**，本次未做、以后也不应在项目内做。

**判定：不可行（自动化获取）。** 需要登录态 + JS 签名 + token 三重门槛，绕过手段超出项目纪律边界。剩余可行路径只有一条：**用户本人日常刷小红书时，把值得收录的菜谱图文人工复制/导出，交给内容管线人工录入**（origin=MANUAL，无需任何抓取代码）。

### 1.3 关于"后期视频内容"的预告判断

- 下厨房 robots.txt 明确 `Disallow: /vod_video/` —— 视频路径连 robots 层面都不允许；
- 小红书视频内容依赖其登录态+签名 API，同 §1.2 不可行。
- 与 CURRENT.md 现有定性一致："视频内容 = 挂账后期不进本轮"。若未来做，视频建议同样走"人工筛选 + 人工导入链接/文件"路径，不做自动抓取。

---

## 2. 调查项二：数据模型现状（schema 行号核实）

文件：[apps/api/prisma/schema.prisma](../../../apps/api/prisma/schema.prisma)（行号以当前工作区版本为准）

| 核查点 | 现状 | 行号 |
|---|---|---|
| Dish 图片字段 | **不存在**（model Dish 全字段无 imageUrl/image） | Dish 定义 L89-107 |
| steps 存储结构 | `steps Json`，约定 `[{order, text, parallel?}]` | L100；契约 [packages/shared/src/schemas/dish.ts](../../../packages/shared/src/schemas/dish.ts) DishStepSchema L22-26（**步骤不支持嵌图**） |
| DRAFT 状态字段 | `status ContentStatus @default(DRAFT)`；枚举 DRAFT/TESTED/PUBLISHED | L101、枚举 L116-120 |
| 来源标记 | `origin ContentOrigin @default(LLM_DRAFT)`；枚举仅 **LLM_DRAFT / MANUAL 两个值，无"外部抓取"来源** | L102、枚举 L122-125 |
| 来源 URL / 授权台账 | 仅 `licenseNote String?`（授权台账字段，可暂存来源 URL，但语义不符且无结构） | L103 |
| Ingredient 图片 | 无（食材不需要图，可接受） | Ingredient L68-77 |
| Menu（菜单套） | `prepSequence Json`（备菜顺序）、`status ContentStatus @default(DRAFT)` | Menu L140-150（prepSequence L146、status L147） |

**外部菜谱落库还缺的字段（建议清单，仅建议不动手）：**
1. `Dish.imageUrl String?`（或 `images Json?` 数组，存相对 URL）—— 前端屏②/屏⑪已预留图位（PRODUCT-CONFIRMATION B4：列表位 56×56、详情位高 170），目前只能渲染 emoji/占位图；
2. `Dish.sourceUrl String?` —— 记录外部原帖地址，便于回查与微调对照；
3. `Dish.sourceSite String?`（或并入 sourceUrl 前缀判断）—— 区分 xiachufang / xiaohongshu-manual / 手写；
4. `ContentOrigin` 枚举扩展（如 `EXTERNAL_FETCH`）或复用 `MANUAL` —— **涉及 packages/shared 契约冻结区，必须主控→架构评估→用户批准后才可动**；
5. 步骤配图（steps 内嵌 imageUrl）—— 本轮不建议，做法页图文改版（T-P06）时随 UI 方案一并定。

---

## 3. 调查项三：图片存储方案对比与建议

| 方案 | 做法 | 优点 | 缺点 | 适配本项目 |
|---|---|---|---|---|
| A. 前端静态资源 | 图片放 apps/h5/src/assets（现约定：8 张 `*​@2x.png` 在此），import 引用 | 加载零跨域；Taro4 h5 构建自动 hash 打包 | **每加图必须重新构建 H5 并部署**（现部署为 Docker+阿里云 ECS，T-P07 流程）；仓库体积膨胀；菜谱池增长后不可持续 | 不推荐用于菜谱池图片（仅适合 UI 固定素材，现状即如此） |
| B. 外链 URL | Dish 存下厨房/小红书图片 CDN 原链 | 零存储成本 | **防盗链风险高**：国内 CDN 普遍校验 Referer，公网站点（menu.jijingkongjian.xin）加载大概率裂图；外链随时失效；本次未实测防盗链行为（列入未验证项） | 不推荐 |
| C. 服务端静态目录（推荐） | 内容管线抓取时把图片**下载转存**到服务端图片目录（Docker 卷挂载，由现有 Caddy/nginx 增加一条静态路由，如 `/img/`），Dish 存相对 URL | 无防盗链问题（自有域名）；**新增菜品图无需重建前端**；可加长缓存头；符合"个人自用、单机部署"现状（docker-compose.yml + Caddyfile 已在仓库） | 需一次性的部署配置改动（Caddy 静态路由 + 卷）；抓取器要带下载转存逻辑 | **推荐** |
| D. 存数据库二进制 | bytea 存图 + API 出流 | 数据集中 | 库体积暴涨、无 HTTP 缓存头、备份迁移变重 | 不推荐 |

**建议**：方案 C。规模估算：单图 50–500KB，100 道菜 ×2–3 图 ≈ 10–150MB 本地磁盘，个人自用版完全无压力；DB 不存二进制，库体积不受影响。

---

## 4. 调查项四：管线衔接建议（tools/content-pipeline 新增 fetch 步骤）

**现状链路**（已核实代码）：
- 起草：[draft.ts](../src/draft.ts) L64-98 `validateDraftDish` 强制注入 `status='DRAFT'`/`origin='LLM_DRAFT'`（双保险第一层），产物写 `out/*.draft.json`（L175-188）；
- 导入：[import.ts](../src/import.ts) L89-131 `prepareDraftDish` 再次强制 DRAFT（第二层：L42-43 `status: 'DRAFT'`/`origin: 'LLM_DRAFT'` 字面量类型编译期锁定）→ upsert Ingredient → 建 Dish；
- 升级：仅靠 CookLog 试做记录（schema L169-181 注释），运行时零 LLM。

**现有 draft.json 产物结构**（实证样本 `out/weekday_fast_fish_30min_1786252204698.draft.json`）：`id / name / mealRole / cuisine / flavorTags / spicyLevel / splitFlavor / activeMinutes / totalMinutes / equipment / steps[{order,text,parallel?}] / status / origin / ingredients[{name,category,defaultUnit,qty,unit,optional}]` —— **无图片、无来源字段**。

**建议的新步骤（fetch CLI，与 draft/import 同级，零 LLM）：**

```
[来源筛选] → [fetch 抓取 CLI] → [人工微调] → [fm-import 落 DRAFT] → [试做升级]（现有链路不变）
```

1. **来源筛选**（人工，个人自用合理）：下厨房用 sitemap 分片 + 分类页/首页人工挑菜（"N 人做过"作参考）；小红书走人工复制粘贴。
2. **fetch 抓取 CLI**：
   - 输入：菜谱 URL（或用户粘贴的 HTML/文本）；
   - 解析：标题 / 用料表（名称+用量+单位）/ 分步骤文本 / 封面图 URL / "N 人做过"信号；
   - 产物：`out/<source>_<slug>_<timestamp>.fetch.json`，结构 = DraftDish 兼容字段 + 工具内部扩展字段（沿用 DraftIngredientSchema 的"HOW 不改 shared"模式）：`sourceUrl`、`sourceSite`、`imageUrl`、`fetchedAt`、`qualitySignal`；
   - 图片转存：同一 CLI 内下载图片到图片目录（§3 方案 C），避免外链防盗链；
   - 若走浏览器方案（待主控决策），浏览器仅用于通过页面挑战后取渲染后 HTML，抓取频率 ≥10s/页、单次会话 ≤10 页。
3. **人工微调**（对应需求"微调后整理"）：在 fetch.json 上人工改写——用料对齐 Ingredient 库命名（aliases 归一，如 西红柿=番茄）、用量单位规范化（g/个/ml）、步骤改写为家常口径、填 activeMinutes/totalMinutes/mealRole/equipment；此步本质是"人审"，是内容质量的总闸门。
4. **导入落库**：微调后的文件过 `fm-import`（复用 importDraft 双保险，产物恒 DRAFT）；若 ContentOrigin 允许，标 MANUAL 或新增来源枚举（§2 第 4 条，须契约批准）。
5. **升级发布**：沿用现行"试做 → CookLog → TESTED → 发布 PUBLISHED"链路，不新增发布通道。

**流程图上与铁律的关系**：fetch 步骤在 tools/（非 apps/），运行时零 LLM；产物只落 DRAFT；不触碰 packages/shared。

---

## 5. 调查项五：风险清单

| # | 风险 | 等级 | 缓解 |
|---|---|---|---|
| 1 | 下厨房反爬封禁：人机验证已实测存在；2020 年公开教程记录同 IP 连续访问被封先例 | 高（若批量）/ 低（若小批量限速） | 严格遵守 Crawl-delay:10；单次会话少量手动触发；不写重试风暴；被拦即停 |
| 2 | 详情页 JS 挑战对自动化浏览器的检测能力未知（xcf_clearance 机制类似 CF clearance，可能识别无头浏览器） | 中 | 待主控决策是否授权浏览器方案；备选"人工浏览器打开→另存 HTML→CLI 解析"的半自动方案（零对抗） |
| 3 | 图片外链防盗链（未实测） | 中（若用外链） | 采纳 §3 方案 C 下载转存，风险归零 |
| 4 | 数据体积：图片文件增长 | 低 | 本地磁盘估 10–150MB/百道菜；DB 只存 URL |
| 5 | 内容质量筛选："评分高"缺乏统一客观定义 | 中 | 用下厨房"N 人做过"做初筛 + 人工挑选终审；小红书内容只能人工选 |
| 6 | 契约与迁移风险：加 imageUrl/sourceUrl/sourceSite/origin 枚举值 = 动 shared + prisma | 高（流程） | 必须走"主控→架构影响评估→用户批准"再开开发卡；本调查不动任何契约 |
| 7 | 视频内容：下厨房 /vod_video/ 被 robots 禁止；小红书视频依赖登录态 | 高 | 维持"视频挂账后期"定性（CURRENT.md 已如此） |
| 8 | 法律/礼仪面：用户已明确不考虑版权，但 robots.txt 礼仪仍建议遵守（个人自用、低频、不用作商用分发） | 低 | licenseNote 字段（schema L103）已有，导入时记录来源 URL |

---

## 6. 探测原始记录（命令 + 退出码 + 响应头原文）

环境：Windows 11，curl.exe（经系统代理，首行 `HTTP/1.1 200 Connection established` 为代理 CONNECT 响应）。命令均在 `d:\codex\family-menu` 下执行，全部 `EXIT=0`。请求间遵守 Crawl-delay ≥10s（Start-Sleep 11）。

```
# P1  GET https://www.xiachufang.com/robots.txt （UA: Chrome/126）
HTTP/1.1 200 OK | Date: Thu, 10 Sep 2026 02:47:34 GMT | Content-Type: text/plain; charset=utf-8
Content-Length: 1468 | Server: volcalb | Cache-Control: max-age=604800

# P2  GET https://www.xiachufang.com/recipe/106733852/ （curl 默认 UA，裸）
HTTP/1.1 302 Moved Temporarily | Date: Thu, 10 Sep 2026 02:48:09 GMT | Server: volcalb
Set-Cookie: bid=jiSkNzSN;Path=/;Expires=Mon, 19-Jan-2080 14:09:52 GMT;
Set-Cookie: wait_xcf_clearance=1;Path=/;Domain=.xiachufang.com
Location: /auth/humancheck_captcha/?xcf_token=...&next=%2Frecipe%2F106733852%2F
Cache-Control: no-store, no-cache, must-revalidate...   SIZE=8

# P3  同 P2 URL（浏览器 UA + Accept + Accept-Language + cookie jar，未跟随）
HTTP/1.1 302 Moved Temporarily | Date: Thu, 10 Sep 2026 02:48:53 GMT | Server: volcalb
Set-Cookie: bid=hPBaFozF...; Set-Cookie: wait_xcf_clearance=1...
Location: /auth/humancheck_captcha/?xcf_token=...（token 与 P2 不同次生成）

# P4  GET https://www.xiachufang.com/ （浏览器 UA）
HTTP/1.1 200 OK | Date: Thu, 10 Sep 2026 02:49:41 GMT | Content-Type: text/html;charset=UTF-8
Server: volcalb | Set-Cookie: bid=wvs2Gf37... | Cache-Control: no-store...
（body 实证含 class="cover-image"/class="name"/class="num"/"43 人做过这道菜"/href="/recipe/103823174/"）

# P5  GET https://www.xiachufang.com/sitemap.xml （浏览器 UA）
HTTP/1.1 200 OK | Date: Thu, 10 Sep 2026 02:49:53 GMT | Content-Type: text/xml; charset=utf-8
Content-Length: 218667 | Last-Modified: Wed, 09 Sep 2026 21:48:34 GMT
（内容为 sitemapindex → /sitemap/recipe_0..N.xml.gz，lastmod 2026-09-10）

# P6  GET https://www.xiachufang.com/sitemap/recipe_0.xml.gz （浏览器 UA）
HTTP/1.1 200 OK | Date: Thu, 10 Sep 2026 02:50:54 GMT | Content-Type: application/octet-stream
Content-Length: 154920 | Last-Modified: Wed, 09 Sep 2026 20:00:35 GMT
（本地 GzipStream 解压：urlset 含 <loc>https://www.xiachufang.com/recipe/114/</loc> lastmod 2026-09-10）

# P7  GET https://www.xiaohongshu.com/ （浏览器 UA）
HTTP/1.1 302 Found | Date: Thu, 10 Sep 2026 02:50:59 GMT | Server: openresty
Location: /explore | Set-Cookie: acw_tc=...; abRequestId=...
Alt-Svc: h3=... | XHS-REQUEST-TIME: 0.015 | xhs-real-ip: 58.46.65.235

# P8  GET https://www.xiaohongshu.com/explore （浏览器 UA + cookie jar）
HTTP/1.1 200 OK | Date: Thu, 10 Sep 2026 02:51:26 GMT | Content-Type: text/html; charset=utf-8
Server: openresty | XHS-REQUEST-TIME: 0.062
（body 为 SPA 壳：<title>小红书 - 你的生活兴趣社区</title>，Vue bundle 渲染，
  含 <script src="https://as.xiaohongshu.com/api/sec/v1/ds?appId=xhs-pc-web"> 设备签名脚本，
  HTML 内无笔记/菜谱数据）
```

robots.txt 关键原文（P1 body，2026-09-10 实测）：

```
User-agent: *
Crawl-delay: 10
Disallow: /*/comments/
Disallow: /category/*/pop/   ...   Disallow: /recipe/*/?
Allow: /recipe/*/?ref=*
Disallow: /recipe/*/pic/
Disallow: /search/
Disallow: /vod_video/
Sitemap: https://www.xiachufang.com/sitemap.xml
（注：/recipe/{id}/ 本体无查询串，不在 Disallow 列表）
```

---

## 7. 未验证项与需主控决策点

**未验证项（如实列出，本次未取得数据）：**
1. 下厨房菜谱**详情页**当前真实 HTML 结构（因人机验证未取得样本；结构与字段位置引自 2020–2026 公开教程 + 首页服务端渲染实证类比）；
2. 下厨房图片 CDN 是否校验 Referer（防盗链强度）；
3. 下厨房 sitemap 分片总数与全量菜谱规模（只取了索引与 1 个分片头）；
4. 真实浏览器（Playwright）通过 xcf_clearance 挑战的成功率与稳定性；
5. 小红书登录态下的页面结构（禁止模拟登录，未涉及）。

**需主控/用户决策点（本代理不脑补）：**
1. **是否授权"浏览器自动化"方案**：下厨房详情页需要浏览器渲染过挑战。授权则可做全自动 fetch CLI（带失败即停、限速、小批量约束）；不授权则走"人工浏览器另存 HTML → CLI 解析"半自动路线（零对抗、最稳）。两者产物链路完全一致，仅取数方式不同。
2. **契约变更审批**：Dish 增加 imageUrl/sourceUrl/sourceSite、ContentOrigin 是否扩枚举——涉及 packages/shared 与 prisma 迁移，须用户批准后另开开发卡。
3. **小红书内容引入口径**：自动化获取已判定不可行，是否接受"人工复制粘贴录入（origin=MANUAL）"作为唯一路径。

---

## 8. 结论摘要（一句话版）

- **下厨房：有条件可行**——sitemap/列表页开放，详情页被 JS 人机验证拦住，需浏览器渲染方案（待授权）或人工另存 HTML 半自动方案；结构服务端渲染、可稳定解析；务必限速 ≥10s/页。
- **小红书：不可行**（自动化），仅剩人工录入路径。
- **落库缺口**：Dish 缺图片/来源 URL/来源标记字段（schema L89-107），动契约须批准。
- **图片**：建议服务端静态目录 + Caddy 静态路由（下载转存，不用外链、不进 DB、不重建前端）。
- **管线**：在 tools/content-pipeline 新增 fetch CLI（零 LLM）产出 `*.fetch.json` → 人工微调 → 复用现有 fm-import 落 DRAFT，升级链路不变。
- **值得开开发卡**：值得，但建议拆两卡——①契约+prisma 字段扩展卡（小，需用户批准）；②fetch CLI + 图片转存 + Caddy 路由卡（中，待浏览器方案决策后开工）。
