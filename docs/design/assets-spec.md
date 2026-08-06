# UI 素材清单 + 风格提示词基座

> 产物归属：UI/UX 设计 Agent｜对齐实施方案第 5.2 节「UI 素材管线（三层素材策略）」
> 必含字段（5.2 第 430 行）：素材名 / 用途页面 / 尺寸与格式 / 命名 / 完整提示词 / 生成状态
> 配套：[wireframes.md](./wireframes.md)｜[theme-tokens.ts](./theme-tokens.ts)（视觉定稿前用推荐方案 A 的暖橙色）

---

## 1. 三层素材策略

| 层 | 素材 | 来源 | 理由 |
|---|---|---|---|
| 装饰插画 | logo、页面 hero、空状态×3、锁定/反馈成功图、菜品占位图 | **AI 生图**（一次成套） | 量少设计成本高，AI 最划算；无真实性问题 |
| 功能图标 | tabBar / 操作 / 分类 / 器具 icon | **图标库**（NutUI 内置 + iconfont 补充） | 矢量、免费、风格统一；AI 生图小尺寸一致性差 |
| 菜品照片 | 每道菜 / 每套菜单主图 | **试做实拍**（内容轨试做时拍摄） | 真实=信任；AI 菜品图"图不符实"损害锁定率；与试做管线零成本融合 |

**边界（5.2 第 434 行）**：AI 素材仅用于装饰性 UI，不生成"以假乱真"的菜品实拍感图片；占位图与实拍图不混用场景。

---

## 2. 风格提示词基座

> 所有插画提示词 = 基座 + 素材专属描述。基座保证全套风格统一，专属描述保证精准控制。
> 主色调随 [theme-tokens.ts](./theme-tokens.ts) 人工定稿结果替换（当前以推荐方案 A「番茄暖橙」为准）。

```text
扁平插画风格，暖橙(#FF6B35)+奶油白(#FFF8F3)主色调，圆角造型，家庭厨房主题，
柔和光影，画面简洁无文字，统一描边粗细(约3px)，平视视角，温馨家庭氛围
```

---

## 3. 命名与规格约定

- 命名规范：`asset-{page}-{name}@2x.png`（page 取 setup/tonight/candidates/plan/history/common）
- 尺寸标注为逻辑像素（@1x），实际出图 @2x（2 倍）保证 H5 高清屏清晰
- 格式：装饰大图用 WebP（体积小，H5 全支持）；图标用 PNG（透明背景）；logo 提供 PNG + SVG
- 入库路径：`apps/h5/src/assets/`
- 一致性：同一会话连续生成全套装饰插画，首张定稿后作为参考图续生；一次成套、入库即锁定，不单张补生

---

## 4. 素材清单 A：装饰插画（AI 生图）

| 素材名 | 用途页面 | 尺寸与格式 | 命名 | 完整提示词 | 生成状态 |
|---|---|---|---|---|---|
| 应用 Logo | 启动页 / NavBar | 200×200 PNG+SVG | `asset-common-logo@2x.png` | 扁平插画风格，暖橙(#FF6B35)+奶油白(#FFF8F3)主色调，圆角造型，家庭厨房主题，柔和光影，画面简洁无文字，统一描边粗细(约3px)，平视视角，温馨家庭氛围 ＋素材专属：一个圆形餐盘上叠放一双筷子与一把锅铲，简洁标志感，居中构图，橙色为主，留白充足（200×200） | 待生成 |
| 今晚 Hero | tonight 顶部 | 750×480 WebP | `asset-tonight-hero@2x.png` | （同基座）＋素材专属：今晚吃什么主题，一张木质餐桌摆着空碗与冒热气的锅，旁边一个对话气泡里是问号，暖光，家庭厨房背景虚化，横向构图（750×480） | 待生成 |
| 候选空状态 | candidates 0套时 | 480×360 WebP | `asset-candidates-empty@2x.png` | （同基座）＋素材专属：空状态-无候选页，一只空盘子和一双筷子放桌上，旁边一个放大镜与一个问号气泡，略带疑惑但温和的情绪，暖色调（480×360） | 待生成 |
| 历史空状态 | history 首次使用 | 480×360 WebP | `asset-history-empty@2x.png` | （同基座）＋素材专属：空状态-无做饭记录页，一只空盘子和一双筷子，旁边一个日历图标与一个问号气泡，引导感，暖色调（480×360） | 待生成 |
| 清单空状态 | plan 清单为空(兜底) | 480×360 WebP | `asset-plan-empty@2x.png` | （同基座）＋素材专属：空状态-采购清单为空，一个空购物篮与一张清单纸，旁边一个小对勾气泡，暖色调（480×360） | 待生成 |
| 锁定成功反馈 | candidates 锁定后 | 240×240 WebP | `asset-candidates-lock-success@2x.png` | （同基座）＋素材专属：锁定成功反馈，一只手竖起大拇指按在一个带对勾的圆形菜单卡上，简洁庆祝感，暖橙主色（240×240） | 待生成 |
| 反馈成功反馈 | history 提交做了后 | 240×240 WebP | `asset-history-feedback-success@2x.png` | （同基座）＋素材专属：做饭完成反馈，一个干净的空盘与一双并拢的筷子，上方一个小星星，满足感，暖色调（240×240） | 待生成 |
| 菜品占位图 | 菜品/菜单主图无实拍时 | 400×400 WebP | `asset-common-dish-placeholder@2x.png` | （同基座）＋素材专属：菜品占位图(非写实)，扁平插画风格的一个餐盘轮廓内放一双筷子与一个相机图标，明显占位感、不可与真实菜品混淆，居中构图（400×400） | 待生成 |

> 菜品占位图严格保持"占位感"（餐盘轮廓+相机图标），不可生成写实菜品，避免误导用户以为是实拍（5.2 第 434 行边界）。一旦该菜品有实拍图，占位图立即替换下线，两者不混用。

---

## 5. 素材清单 B：功能图标（图标库，不 AI 生图）

> 来源：优先 NutUI 内置 `<Icon name="...">`；不足部分用 iconfont 补充（统一项目图标库，描边 2px，圆角线脚）。
> 不编写生图提示词。下表「提示词」列填图标来源与建议关键词，供前端 WP-05 引用。

| 素材名 | 用途页面 | 尺寸与格式 | 命名 | 来源 / 关键词 | 生成状态 |
|---|---|---|---|---|---|
| Tab-今晚(默认/选中) | TabBar | 81×81 PNG×2态 | `asset-tonight-tab@2x.png` | NutUI Icon `home`/iconfont「晚餐/碗」选中态用主色 | 不适用 |
| Tab-历史(默认/选中) | TabBar | 81×81 PNG×2态 | `asset-history-tab@2x.png` | NutUI Icon `date`/iconfont「日历」选中态用主色 | 不适用 |
| Tab-设置(默认/选中) | TabBar | 81×81 PNG×2态 | `asset-setup-tab@2x.png` | NutUI Icon `setting`/iconfont「齿轮」选中态用主色 | 不适用 |
| 推荐 | tonight 主按钮 | 48×48 PNG | `asset-tonight-recommend@2x.png` | NutUI Icon `star`/iconfont「推荐/魔法棒」 | 不适用 |
| 锁定 | candidates 操作 | 48×48 PNG | `asset-candidates-lock@2x.png` | NutUI Icon `lock` | 不适用 |
| 换菜 | candidates 操作 | 48×48 PNG | `asset-candidates-swap@2x.png` | NutUI Icon `refresh`/iconfont「刷新/交换」 | 不适用 |
| 复做 | history 操作 | 48×48 PNG | `asset-history-repeat@2x.png` | NutUI Icon `refresh2`/iconfont「重做」 | 不适用 |
| 搜索 | setup/tonight 搜索框 | 48×48 PNG | `asset-common-search@2x.png` | NutUI Icon `search` | 不适用 |
| 返回 | NavBar | 48×48 PNG | `asset-common-back@2x.png` | NutUI Icon `left` | 不适用 |
| 勾选 | plan 清单项 | 48×48 PNG | `asset-plan-check@2x.png` | NutUI Checkbox 内置（不单独出图） | 不适用 |
| 分类-蔬菜 | plan 分组头 | 48×48 PNG | `asset-plan-cat-vegetable@2x.png` | iconfont「蔬菜/菜叶」 | 不适用 |
| 分类-肉类 | plan 分组头 | 48×48 PNG | `asset-plan-cat-meat@2x.png` | iconfont「肉类」 | 不适用 |
| 分类-水产 | plan 分组头 | 48×48 PNG | `asset-plan-cat-seafood@2x.png` | iconfont「鱼」 | 不适用 |
| 分类-蛋奶 | plan 分组头 | 48×48 PNG | `asset-plan-cat-eggdairy@2x.png` | iconfont「鸡蛋」 | 不适用 |
| 分类-调料 | plan 分组头 | 48×48 PNG | `asset-plan-cat-condiment@2x.png` | iconfont「调料瓶」 | 不适用 |
| 分类-主食 | plan 分组头 | 48×48 PNG | `asset-plan-cat-staple@2x.png` | iconfont「米饭/碗」 | 不适用 |
| 器具-炒锅 | setup 器具 | 48×48 PNG | `asset-setup-eq-wok@2x.png` | iconfont「炒锅」 | 不适用 |
| 器具-电饭煲 | setup 器具 | 48×48 PNG | `asset-setup-eq-rice-cooker@2x.png` | iconfont「电饭煲」 | 不适用 |
| 器具-蒸锅 | setup 器具 | 48×48 PNG | `asset-setup-eq-steamer@2x.png` | iconfont「蒸锅」 | 不适用 |
| 器具-空气炸锅 | setup 器具 | 48×48 PNG | `asset-setup-eq-air-fryer@2x.png` | iconfont「空气炸锅」 | 不适用 |

> 分类/器具图标若 iconfont 无完全匹配项，可用「文字+主色圆角底块」兜底（CATEGORIES/EQUIPMENT 文本本身即清晰），不强行 AI 生图。

---

## 6. 素材清单 C：菜品照片（试做实拍，不生成）

> 一律标注「试做实拍」，不编写生图提示词（DEC-007 对齐）。随内容轨试做同步拍摄积累，入库 `apps/h5/src/assets/dishes/`。

| 素材名 | 用途页面 | 尺寸与格式 | 命名 | 来源 | 生成状态 |
|---|---|---|---|---|---|
| 菜品主图 | candidates/plan 菜品卡 | 400×400 WebP | `dishes/dish-{dishId}@2x.png` | 试做实拍（内容轨试做时拍摄，正面平视，自然光） | 试做积累中 |
| 菜单主图 | candidates 菜单卡顶部 | 750×400 WebP | `dishes/menu-{menuId}@2x.png` | 试做实拍（套餐成菜合影） | 试做积累中 |

实拍规范（建议写入内容轨手册）：
- 正面平视或 45° 俯拍，自然光，不后期过度调色
- 背景简洁（木质/白色餐桌），突出菜品
- 命名与 `dishId`/`menuId` 严格对应，便于前端按 id 引用
- 无实拍期间使用 `asset-common-dish-placeholder` 占位，不混用

---

## 7. 一致性纪律（5.2 第 432 行）

1. 同一会话连续生成全套装饰插画（第 4 节 8 张），首张定稿后作为参考图续生。
2. 一次成套、入库即锁定，不单张补生（跨批次风格漂移是主要失败模式）。
3. 视觉定稿 = 人工决策点：装饰插画定稿、主题色定稿均由人工确认后入库，STEP-06 直接引用。

---

## 8. 生成状态总览

| 类别 | 数量 | 来源 | 状态 |
|---|---|---|---|
| 装饰插画 | 8 张 | AI 生图 | 待生成（人工定稿主题色后投喂） |
| 功能图标 | 20 项 | 图标库(NutUI/iconfont) | 不适用（前端直接引用图标库） |
| 菜品照片 | 按菜品数 | 试做实拍 | 试做积累中（随内容轨） |

> 下一步（素材轨 8.3）：人工在 ChatGPT/即梦/豆包生图，同会话一次成套生成 8 张装饰插画 -> 命名入库 -> 视觉定稿 -> STEP-06 引用。
