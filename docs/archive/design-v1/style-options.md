# H5 视觉风格重设计候选方案

> 产物归属：UI/UX 设计 Agent（本仓库设计轨道，非代码任务）
> 对齐：[AGENTS.md](../../AGENTS.md) 铁律--视觉定稿=人工决策点，本文件仅提供候选，不自行决定最终风格
> 技术栈：Taro 4 + React + `@nutui/nutui-react-taro` 4.x（编译目标 H5，微信内打开）
> 配套：[现有 theme-tokens.ts](../design/theme-tokens.ts)（已有 A/B/C 三套暖色系候选）｜[wireframes.md](../design/wireframes.md)｜[assets-spec.md](../design/assets-spec.md)

---

## 0. 背景与重设计目标

### 0.1 用户反馈
当前界面"排版差、没有美感"。

### 0.2 现状问题诊断（基于仓库文件，非主观）

| # | 问题 | 证据 |
|---|---|---|
| 1 | 字号零散无阶梯 | [app.css](../../apps/h5/src/app.css) 用 28px/24px；[candidates/index.css](../../apps/h5/src/pages/candidates/index.css) 用 32px/26px/24px 混杂，无 token 化 |
| 2 | 间距无规律 | margin/padding 散用 4/8/12/16px，无统一变量 |
| 3 | 卡片层级弱 | [app.css#L60-L66](../../apps/h5/src/app.css#L60-L66) 阴影 `0px 2px 8px rgba(...,0.08)` 过浅，圆角单一 12px，无大小阶梯 |
| 4 | 视觉无节奏 | [tonight/index.tsx](../../apps/h5/src/pages/tonight/index.tsx) hero 后直接堆 3 卡，无留白呼吸 |
| 5 | 已有候选差异化不足 | [theme-tokens.ts](../design/theme-tokens.ts) A/B/C 三套全为暖橙红色系，色相跨度小 |

### 0.3 重设计目标
- 提供**色相跨度大、风格语言明确**的 3 套候选（日系暖木 / 中式烟火 / 北欧清新）
- 每套含完整 NutUI 主题 tokens + 设计系统扩展变量（字号/间距/阴影阶梯）
- 解决排版问题：建立 6 级字号 + 5 级间距 + 3 级圆角 + 3 级阴影的 token 体系
- 保持"家庭晚餐规划"温馨、清晰、易操作的调性，适配做饭时单手查看

### 0.4 设计约束（铁律自检）
- 菜品图一律标注"试做实拍"，不生成 AI 写实菜品图（对齐 [assets-spec.md](../design/assets-spec.md) 第 15 行 + DEC-007）
- 功能图标引用 NutUI 内置 Icon / iconfont，不编写生图提示词
- 视觉风格为候选，**需用户人工定稿**，本文件推荐仅供参考
- 不修改任何业务代码，仅产出设计文档

---

## 1. 三套候选方案总览

| 维度 | 方案 D：和风暖木 | 方案 E：烟火朱砂 | 方案 F：青瓷清新 |
|---|---|---|---|
| 风格语言 | 日系治愈食堂（无印良品"素"美学） | 现代中式家庭（烟火气） | 北欧明亮厨房（极简通透） |
| 主色 | `#B07D4E` 暖木褐 | `#C8392E` 朱砂红 | `#4A9D8F` 青瓷绿 |
| 背景 | `#FAF6F0` 米白 | `#FBF6EC` 暖米黄（宣纸感） | `#F7FAF9` 极浅青白 |
| 正文 | `#3D2E1F` 深胡桃暖黑 | `#2A2018` 墨黑暖调 | `#1F2A2E` 深石墨青 |
| 点缀色 | 抹茶绿 `#6B9E5E` | 墨黑 + 朱砂 | 薄荷 + 浅木 |
| 圆角基准 | 16px（大圆角，柔和） | 12px（中圆角，有分量） | 20px（超大圆角，通透） |
| 阴影风格 | 极柔长投影，低饱和 | 中等暖红投影，沉稳 | 极轻冷投影，通透 |
| 字体感 | Light/Regular，留白大，行高 1.7 | Regular/Medium，行高 1.65，标题略加粗 | 几何无衬线，行高 1.6，轻盈 |
| 适合人群 | 追求安静、整洁、日式美学 | 喜欢中式家庭氛围、传统现代结合 | 年轻家庭、偏好明亮清爽 |
| 食欲感 | 中（木质温暖，克制） | 强（朱砂红，红烧联想） | 中（清新，轻食联想） |
| 预览图 | [见 §3.1](#31-方案-d和风暖木) | [见 §3.2](#32-方案-e烟火朱砂) | [见 §3.3](#33-方案-f青瓷清新) |

---

## 2. 通用设计 token 体系（三套共用骨架）

> 三套方案共享同一套 token 命名与层级，仅取值不同。前端可按定稿方案整体替换值。
> NutUI 内置变量用 `--nutui-` 前缀（覆盖面最广，推荐主用）；项目自定义设计 token 用 `--fm-` 前缀（字号/间距/阴影阶梯，供业务样式引用）。

### 2.1 字号阶梯（6 级）

| token | 用途 | 建议值（px，Taro 750 设计稿） |
|---|---|---|
| `--fm-font-size-xs` | 辅助说明/角标 | 22 |
| `--fm-font-size-sm` | 次要文字/标签 | 24 |
| `--fm-font-size-base` | 正文 | 28 |
| `--fm-font-size-lg` | 卡片标题 | 32 |
| `--fm-font-size-xl` | 页面标题 | 36-38 |
| `--fm-font-size-xxl` | 大标题/Hero | 44-46 |

### 2.2 间距阶梯（5 级）

| token | 用途 | 值 |
|---|---|---|
| `--fm-spacing-xs` | 紧凑间隙 | 8px |
| `--fm-spacing-sm` | 卡片内元素 | 12px |
| `--fm-spacing-md` | 卡片内边距 | 16px |
| `--fm-spacing-lg` | 区块间距 | 24px |
| `--fm-spacing-xl` | 大留白 | 32px |

### 2.3 圆角阶梯（3 级）

| token | 用途 |
|---|---|
| `--nutui-border-radius-small` | 小元素（Tag/Input） |
| `--nutui-border-radius` | 卡片基准 |
| `--nutui-border-radius-large` | 大卡片/Hero |

### 2.4 阴影阶梯（3 级）

| token | 用途 |
|---|---|
| `--fm-shadow-sm` | 轻浮起（Tag/小卡） |
| `--fm-shadow-card`（= `--nutui-cell-box-shadow`） | 标准卡片 |
| `--fm-shadow-lg` | 浮层/弹窗/底栏 |

---

## 3. 候选方案详述

### 3.1 方案 D：和风暖木

#### 3.1.1 风格描述

借鉴日式定食屋与无印良品的"素"美学：暖木质主色 + 充足留白 + 克制点缀。不靠强对比吸引注意，而靠木质温暖感和呼吸感传递"好好吃饭"的仪式感。主色 `#B07D4E` 取自胡桃木，明度适中、不刺眼；背景 `#FAF6F0` 米白带极浅暖意；点缀抹茶绿 `#6B9E5E` 用于成功/正向反馈，与木色形成自然植物搭配。

- **色彩体系**：暖木褐主色 + 米白背景 + 抹茶绿点缀 + 深胡桃暖黑文字
- **设计理念**：克制、留白、木质温暖；"少即是多"，靠呼吸感而非装饰
- **字体层次**：思源黑体 Light/Regular 为主，标题用 Medium；行高 1.7（宽松）；字间距略放大
- **卡片样式**：白底 + 16px 大圆角 + 极柔长投影（`rgba(176,125,78,0.06)`）+ 极细米色边（`1px solid #E8DECF`）
- **圆角阴影**：圆角偏大（16/20），阴影低饱和、扩散大，营造"漂浮"感

#### 3.1.2 调色板

| 角色 | 色值 | 用途 |
|---|---|---|
| 主色 primary | `#B07D4E` | 主按钮/选中态/强调 |
| 主色渐变 end | `#C9986A` | 渐变结束 |
| 主色浅 light | `#F2EBE0` | 选中背景/卡片副底 |
| 成功 success | `#6B9E5E` | 抹茶绿，正向反馈 |
| 警告 warning | `#D9A441` | 提示 |
| 危险 danger | `#C25B4E` | 错误/删除 |
| 背景 bg | `#FAF6F0` | 页面底色 |
| 背景副 bg2 | `#F2EBE0` | 分区/空状态 |
| 正文 title | `#3D2E1F` | 主文字 |
| 次文字 text | `#8A7560` | 辅助文字 |
| 分割线 | `#E8DECF` | 边框/分隔 |

#### 3.1.3 今晚页线框示意

```
+--------------------------------------+  ← 留白 24px
|  [logo]  今晚吃什么                   |  ← 标题 36px Medium，行高1.7
|                                       |
|  +----------------------------------+ |
|  |                                  | |
|  |     [Hero 木质餐桌插画]           | |  ← 16px圆角，极柔长投影
|  |     冒热气的碗，暖光              | |
|  |                                  | |
|  +----------------------------------+ |
|       留白 24px（呼吸感）              |
|  +----------------------------------+ |
|  | 几个人吃？                        | |  ← 卡片白底+米色细边
|  | [  -  ]  [  4  ]  [  +  ]         | |
|  +----------------------------------+ |
|       留白 12px                        |
|  +----------------------------------+ |
|  | 今晚有多少时间？                  | |
|  | ( )15分  ( )30分  ( )60分         | |
|  +----------------------------------+ |
|       留白 12px                        |
|  +----------------------------------+ |
|  | 冰箱里必须消耗的？                | |
|  | [搜索食材____________]            | |
|  | [番茄×] [鸡蛋×]                   | |
|  +----------------------------------+ |
|       留白 32px                        |
|  [========  推荐今晚吃什么  ========] |  ← 暖木褐主按钮，16px圆角
+--------------------------------------+
```

#### 3.1.4 预览图（今晚页）

原始 prompt：
> Mobile app UI mockup vertical 9x16 dinner planning app tonight page Japanese Muji warm wood aesthetic warm brown color B07D4E as primary cream beige FAF6F0 background matcha green accent generous whitespace large 16px rounded corners soft long shadow top header with minimalist logo and title flat illustration hero of wooden dining table with steaming bowl three clean white cards showing people counter time budget radio buttons and ingredient search tags a prominent warm brown bottom CTA button serene cozy atmosphere high detail dribbble behance

预览图 URL（点击生成）：

https://console.enterprise.trae.cn/api/ide/v1/text_to_image?prompt=Mobile%20app%20UI%20mockup%20vertical%209x16%20dinner%20planning%20app%20tonight%20page%20Japanese%20Muji%20warm%20wood%20aesthetic%20warm%20brown%20color%20B07D4E%20as%20primary%20cream%20beige%20FAF6F0%20background%20matcha%20green%20accent%20generous%20whitespace%20large%2016px%20rounded%20corners%20soft%20long%20shadow%20top%20header%20with%20minimalist%20logo%20and%20title%20flat%20illustration%20hero%20of%20wooden%20dining%20table%20with%20steaming%20bowl%20three%20clean%20white%20cards%20showing%20people%20counter%20time%20budget%20radio%20buttons%20and%20ingredient%20search%20tags%20a%20prominent%20warm%20brown%20bottom%20CTA%20button%20serene%20cozy%20atmosphere%20high%20detail%20dribbble%20behance&image_size=768x1024

#### 3.1.5 NutUI 主题 tokens

```css
:root {
  /* 方案 D：和风暖木 */
  --nutui-color-primary: #B07D4E;
  --nutui-color-primary-end: #C9986A;
  --nutui-color-primary-disabled: #D9BC9A;
  --nutui-color-primary-light: #F2EBE0;
  --nutui-color-success: #6B9E5E;
  --nutui-color-success-end: #7FB572;
  --nutui-color-warning: #D9A441;
  --nutui-color-warning-end: #E6BC66;
  --nutui-color-danger: #C25B4E;
  --nutui-color-danger-end: #D17568;
  --nutui-color-info: #6B8FA8;
  --nutui-title-color: #3D2E1F;
  --nutui-title-color2: #5A4632;
  --nutui-text-color: #8A7560;
  --nutui-text-help: #A89880;
  --nutui-disable-color: #C9BCAE;
  --nutui-background-color: #FAF6F0;
  --nutui-background-color2: #F2EBE0;
  --nutui-background-color3: #E8DECF;
  --nutui-cell-background-color: #FFFFFF;
  --nutui-cell-box-shadow: 0px 4px 16px rgba(176, 125, 78, 0.06);
  --nutui-tabbar-background-color: #FFFFFF;
  --nutui-tab-text-color: #8A7560;
  --nutui-tab-active-text-color: #B07D4E;
  --nutui-divider-color: #E8DECF;
  --nutui-border-color: #E8DECF;
  --nutui-border-radius: 16px;
  --nutui-border-radius-small: 12px;
  --nutui-border-radius-large: 20px;
  --nutui-button-primary-background-color: #B07D4E;
  --nutui-button-primary-color: #FFFFFF;
  --nutui-tag-color: #B07D4E;
  --nutui-checkbox-checked-color: #B07D4E;
  --nutui-radio-checked-color: #B07D4E;
  --nutui-stepper-button-icon-color: #B07D4E;
  --nutui-rate-icon-active-color: #B07D4E;
  --nutui-tabs-horizontal-checked-color: #B07D4E;

  /* 设计系统扩展（--fm- 前缀，项目自定义） */
  --fm-font-size-xs: 22px;
  --fm-font-size-sm: 24px;
  --fm-font-size-base: 28px;
  --fm-font-size-lg: 32px;
  --fm-font-size-xl: 36px;
  --fm-font-size-xxl: 44px;
  --fm-line-height: 1.7;
  --fm-spacing-xs: 8px;
  --fm-spacing-sm: 12px;
  --fm-spacing-md: 16px;
  --fm-spacing-lg: 24px;
  --fm-spacing-xl: 32px;
  --fm-radius-card: 16px;
  --fm-shadow-sm: 0px 2px 8px rgba(176, 125, 78, 0.04);
  --fm-shadow-card: 0px 4px 16px rgba(176, 125, 78, 0.06);
  --fm-shadow-lg: 0px 8px 24px rgba(176, 125, 78, 0.08);
  --fm-card-border: 1px solid #E8DECF;
}
```

> ConfigProvider（驼峰 key）形式与上方 cssVars 一一对应、值一致（如 `primaryColor: '#B07D4E'`、`titleColor: '#3D2E1F'`），命名规则见 [theme-tokens.ts](../design/theme-tokens.ts) 既有约定，此处不再重复列举。

---

### 3.2 方案 E：烟火朱砂

#### 3.2.1 风格描述

中式厨房的烟火气，用现代设计语言重新表达。主色 `#C8392E` 取自红烧菜酱色与朱砂，沉稳而有食欲；背景 `#FBF6EC` 暖米黄带宣纸质感；文字 `#2A2018` 墨黑暖调，有分量。整体传达"家的味道"与晚餐时刻的踏实感，但通过卡片化、留白、克制的朱砂强调色避免老气。

- **色彩体系**：朱砂红主色 + 暖米黄宣纸背景 + 墨黑文字 + 朱砂强调点缀
- **设计理念**：烟火气 + 现代克制；用朱砂做点睛，大面积留白托底
- **字体层次**：思源黑体 Regular/Medium，标题略加粗有分量；行高 1.65；正文清晰易读
- **卡片样式**：米白底（`#FFFCF5`，比页面底更亮）+ 12px 中圆角 + 中等暖红投影（`rgba(200,57,46,0.08)`）+ 顶部可加 2px 朱砂色条作强调
- **圆角阴影**：圆角适中（12/16），投影带暖红色相，沉稳不飘

#### 3.2.2 调色板

| 角色 | 色值 | 用途 |
|---|---|---|
| 主色 primary | `#C8392E` | 主按钮/选中态/强调 |
| 主色渐变 end | `#D85648` | 渐变结束 |
| 主色浅 light | `#F3E0DC` | 选中背景 |
| 成功 success | `#5C8A4E` | 正向反馈 |
| 警告 warning | `#D98C2B` | 提示 |
| 危险 danger | `#A82A20` | 错误/删除 |
| 背景 bg | `#FBF6EC` | 页面底色（宣纸感） |
| 背景副 bg2 | `#F3E9D4` | 分区 |
| 卡片底 | `#FFFCF5` | 卡片比页面更亮 |
| 正文 title | `#2A2018` | 墨黑暖调 |
| 次文字 text | `#7A6A55` | 辅助文字 |
| 分割线 | `#E5D9C2` | 边框/分隔 |

#### 3.2.3 今晚页线框示意

```
+--------------------------------------+  ← 留白 16px
|  [logo]  今晚吃什么                   |  ← 标题 38px Medium，墨黑
|                                       |
|  +----------------------------------+ |
|  |▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔| |  ← 顶部2px朱砂色条强调
|  |                                  | |
|  |   [Hero 中式厨房插画]              | |  ← 12px圆角，暖红投影
|  |   炒锅冒热气，暖光                 | |
|  |                                  | |
|  +----------------------------------+ |
|       留白 16px                        |
|  +----------------------------------+ |
|  | 几个人吃？                        | |  ← 卡片米白底#FFFCF5
|  | [  -  ]  [  4  ]  [  +  ]         | |
|  +----------------------------------+ |
|       留白 12px                        |
|  +----------------------------------+ |
|  | 今晚有多少时间？                  | |
|  | ( )15分  ( )30分  ( )60分         | |
|  +----------------------------------+ |
|       留白 12px                        |
|  +----------------------------------+ |
|  | 冰箱里必须消耗的？                | |
|  | [搜索食材____________]            | |
|  | [番茄×] [鸡蛋×]                   | |
|  +----------------------------------+ |
|       留白 24px                        |
|  [========  推荐今晚吃什么  ========] |  ← 朱砂红主按钮，12px圆角
+--------------------------------------+
```

#### 3.2.4 预览图（今晚页）

原始 prompt：
> Mobile app UI mockup vertical 9x16 dinner planning app tonight page modern Chinese family style vermilion red C8392E primary warm rice paper FBF6EC background ink black text medium 12px rounded corners subtle warm shadow top header with logo and title flat illustration hero of Chinese kitchen with wok and steam three cream cards showing people counter time radio and ingredient tags prominent red bottom CTA button warm bustling family kitchen atmosphere high detail dribbble behance

预览图 URL（点击生成）：

https://console.enterprise.trae.cn/api/ide/v1/text_to_image?prompt=Mobile%20app%20UI%20mockup%20vertical%209x16%20dinner%20planning%20app%20tonight%20page%20modern%20Chinese%20family%20style%20vermilion%20red%20C8392E%20primary%20warm%20rice%20paper%20FBF6EC%20background%20ink%20black%20text%20medium%2012px%20rounded%20corners%20subtle%20warm%20shadow%20top%20header%20with%20logo%20and%20title%20flat%20illustration%20hero%20of%20Chinese%20kitchen%20with%20wok%20and%20steam%20three%20cream%20cards%20showing%20people%20counter%20time%20radio%20and%20ingredient%20tags%20prominent%20red%20bottom%20CTA%20button%20warm%20bustling%20family%20kitchen%20atmosphere%20high%20detail%20dribbble%20behance&image_size=768x1024

#### 3.2.5 NutUI 主题 tokens

```css
:root {
  /* 方案 E：烟火朱砂 */
  --nutui-color-primary: #C8392E;
  --nutui-color-primary-end: #D85648;
  --nutui-color-primary-disabled: #E89A90;
  --nutui-color-primary-light: #F3E0DC;
  --nutui-color-success: #5C8A4E;
  --nutui-color-success-end: #72A064;
  --nutui-color-warning: #D98C2B;
  --nutui-color-warning-end: #E6A452;
  --nutui-color-danger: #A82A20;
  --nutui-color-danger-end: #C04035;
  --nutui-color-info: #4A7BA8;
  --nutui-title-color: #2A2018;
  --nutui-title-color2: #4A3A2C;
  --nutui-text-color: #7A6A55;
  --nutui-text-help: #9A8A75;
  --nutui-disable-color: #C2B5A0;
  --nutui-background-color: #FBF6EC;
  --nutui-background-color2: #F3E9D4;
  --nutui-background-color3: #E9DCBF;
  --nutui-cell-background-color: #FFFCF5;
  --nutui-cell-box-shadow: 0px 2px 12px rgba(200, 57, 46, 0.08);
  --nutui-tabbar-background-color: #FFFCF5;
  --nutui-tab-text-color: #7A6A55;
  --nutui-tab-active-text-color: #C8392E;
  --nutui-divider-color: #E5D9C2;
  --nutui-border-color: #E5D9C2;
  --nutui-border-radius: 12px;
  --nutui-border-radius-small: 8px;
  --nutui-border-radius-large: 16px;
  --nutui-button-primary-background-color: #C8392E;
  --nutui-button-primary-color: #FFFFFF;
  --nutui-tag-color: #C8392E;
  --nutui-checkbox-checked-color: #C8392E;
  --nutui-radio-checked-color: #C8392E;
  --nutui-stepper-button-icon-color: #C8392E;
  --nutui-rate-icon-active-color: #C8392E;
  --nutui-tabs-horizontal-checked-color: #C8392E;

  /* 设计系统扩展（--fm- 前缀，项目自定义） */
  --fm-font-size-xs: 22px;
  --fm-font-size-sm: 24px;
  --fm-font-size-base: 28px;
  --fm-font-size-lg: 32px;
  --fm-font-size-xl: 38px;
  --fm-font-size-xxl: 46px;
  --fm-line-height: 1.65;
  --fm-spacing-xs: 8px;
  --fm-spacing-sm: 12px;
  --fm-spacing-md: 16px;
  --fm-spacing-lg: 24px;
  --fm-spacing-xl: 32px;
  --fm-radius-card: 12px;
  --fm-shadow-sm: 0px 1px 6px rgba(200, 57, 46, 0.05);
  --fm-shadow-card: 0px 2px 12px rgba(200, 57, 46, 0.08);
  --fm-shadow-lg: 0px 6px 20px rgba(200, 57, 46, 0.10);
  --fm-card-border: 1px solid #E5D9C2;
  --fm-card-accent-bar: 2px solid #C8392E;
}
```

---

### 3.3 方案 F：青瓷清新

#### 3.3.1 风格描述

明亮清新的现代厨房，借鉴北欧极简 + 青瓷釉色。主色 `#4A9D8F` 取自青瓷釉的青绿，干净通透不冷冽；背景 `#F7FAF9` 极浅青白；文字 `#1F2A2E` 深石墨青，比纯黑柔和。整体年轻、轻盈、现代，适合偏好明亮界面与轻食联想的用户。通过超大圆角与极轻投影营造通透感。

- **色彩体系**：青瓷绿主色 + 极浅青白背景 + 深石墨青文字 + 薄荷点缀
- **设计理念**：通透、明亮、轻盈；大圆角 + 极轻投影 + 充足留白
- **字体层次**：HarmonyOS Sans / 思源黑体 Regular，几何圆润感；行高 1.6；字重适中不厚重
- **卡片样式**：纯白底 + 20px 超大圆角 + 极轻冷投影（`rgba(74,157,143,0.06)`）+ 极细边（`1px solid #ECF3F1`）
- **圆角阴影**：圆角最大（20/28），阴影最轻、冷色相，通透不沉

#### 3.3.2 调色板

| 角色 | 色值 | 用途 |
|---|---|---|
| 主色 primary | `#4A9D8F` | 主按钮/选中态/强调 |
| 主色渐变 end | `#6BB3A6` | 渐变结束 |
| 主色浅 light | `#E1F0EC` | 选中背景/卡片副底 |
| 成功 success | `#5BA876` | 正向反馈 |
| 警告 warning | `#E8A93C` | 提示 |
| 危险 danger | `#E15A5A` | 错误/删除 |
| 背景 bg | `#F7FAF9` | 页面底色 |
| 背景副 bg2 | `#ECF3F1` | 分区 |
| 正文 title | `#1F2A2E` | 深石墨青 |
| 次文字 text | `#6B7B80` | 辅助文字 |
| 分割线 | `#DDE7E4` | 边框/分隔 |

#### 3.3.3 今晚页线框示意

```
+--------------------------------------+  ← 留白 24px
|  [logo]  今晚吃什么                   |  ← 标题 36px Regular，石墨青
|                                       |
|  ╭──────────────────────────────────╮ |
|  │                                  │ |  ← 20px超大圆角，极轻投影
|  │   [Hero 明亮厨房插画]             | |     通透白底
|  │   现代厨房，自然光                 | |
|  │                                  │ |
|  ╰──────────────────────────────────╯ |
|       留白 24px                        |
|  ╭──────────────────────────────────╮ |
|  │ 几个人吃？                        │ |  ← 纯白卡+极细边
|  │ [  -  ]  [  4  ]  [  +  ]         │ |
|  ╰──────────────────────────────────╯ |
|       留白 12px                        |
|  ╭──────────────────────────────────╮ |
|  │ 今晚有多少时间？                  │ |
|  │ ( )15分  ( )30分  ( )60分         │ |
|  ╰──────────────────────────────────╯ |
|       留白 12px                        |
|  ╭──────────────────────────────────╮ |
|  │ 冰箱里必须消耗的？                │ |
|  │ [搜索食材____________]            │ |
|  │ [番茄×] [鸡蛋×]                   │ |
|  ╰──────────────────────────────────╯ |
|       留白 32px                        |
|  [========  推荐今晚吃什么  ========] |  ← 青瓷绿主按钮，20px圆角
+--------------------------------------+
```

#### 3.3.4 预览图（今晚页）

原始 prompt：
> Mobile app UI mockup vertical 9x16 dinner planning app tonight page Nordic fresh bright style celadon green 4A9D8F primary pure white background graphite text extra large 20px rounded corners ultra light shadow top header with logo and title flat illustration hero of bright modern kitchen three pure white cards showing people counter time radio and ingredient tags prominent celadon green bottom CTA button clean airy bright atmosphere high detail dribbble behance

预览图 URL（点击生成）：

https://console.enterprise.trae.cn/api/ide/v1/text_to_image?prompt=Mobile%20app%20UI%20mockup%20vertical%209x16%20dinner%20planning%20app%20tonight%20page%20Nordic%20fresh%20bright%20style%20celadon%20green%204A9D8F%20primary%20pure%20white%20background%20graphite%20text%20extra%20large%2020px%20rounded%20corners%20ultra%20light%20shadow%20top%20header%20with%20logo%20and%20title%20flat%20illustration%20hero%20of%20bright%20modern%20kitchen%20three%20pure%20white%20cards%20showing%20people%20counter%20time%20radio%20and%20ingredient%20tags%20prominent%20celadon%20green%20bottom%20CTA%20button%20clean%20airy%20bright%20atmosphere%20high%20detail%20dribbble%20behance&image_size=768x1024

#### 3.3.5 NutUI 主题 tokens

```css
:root {
  /* 方案 F：青瓷清新 */
  --nutui-color-primary: #4A9D8F;
  --nutui-color-primary-end: #6BB3A6;
  --nutui-color-primary-disabled: #A5CDC6;
  --nutui-color-primary-light: #E1F0EC;
  --nutui-color-success: #5BA876;
  --nutui-color-success-end: #74BF8C;
  --nutui-color-warning: #E8A93C;
  --nutui-color-warning-end: #F0C068;
  --nutui-color-danger: #E15A5A;
  --nutui-color-danger-end: #EB7B7B;
  --nutui-color-info: #5B8DEF;
  --nutui-title-color: #1F2A2E;
  --nutui-title-color2: #38474C;
  --nutui-text-color: #6B7B80;
  --nutui-text-help: #8B9BA0;
  --nutui-disable-color: #B5C2C5;
  --nutui-background-color: #F7FAF9;
  --nutui-background-color2: #ECF3F1;
  --nutui-background-color3: #DDE7E4;
  --nutui-cell-background-color: #FFFFFF;
  --nutui-cell-box-shadow: 0px 4px 20px rgba(74, 157, 143, 0.06);
  --nutui-tabbar-background-color: #FFFFFF;
  --nutui-tab-text-color: #6B7B80;
  --nutui-tab-active-text-color: #4A9D8F;
  --nutui-divider-color: #DDE7E4;
  --nutui-border-color: #DDE7E4;
  --nutui-border-radius: 20px;
  --nutui-border-radius-small: 14px;
  --nutui-border-radius-large: 28px;
  --nutui-button-primary-background-color: #4A9D8F;
  --nutui-button-primary-color: #FFFFFF;
  --nutui-tag-color: #4A9D8F;
  --nutui-checkbox-checked-color: #4A9D8F;
  --nutui-radio-checked-color: #4A9D8F;
  --nutui-stepper-button-icon-color: #4A9D8F;
  --nutui-rate-icon-active-color: #4A9D8F;
  --nutui-tabs-horizontal-checked-color: #4A9D8F;

  /* 设计系统扩展（--fm- 前缀，项目自定义） */
  --fm-font-size-xs: 22px;
  --fm-font-size-sm: 24px;
  --fm-font-size-base: 28px;
  --fm-font-size-lg: 32px;
  --fm-font-size-xl: 36px;
  --fm-font-size-xxl: 44px;
  --fm-line-height: 1.6;
  --fm-spacing-xs: 8px;
  --fm-spacing-sm: 12px;
  --fm-spacing-md: 16px;
  --fm-spacing-lg: 24px;
  --fm-spacing-xl: 32px;
  --fm-radius-card: 20px;
  --fm-shadow-sm: 0px 2px 10px rgba(74, 157, 143, 0.04);
  --fm-shadow-card: 0px 4px 20px rgba(74, 157, 143, 0.06);
  --fm-shadow-lg: 0px 8px 28px rgba(74, 157, 143, 0.08);
  --fm-card-border: 1px solid #ECF3F1;
}
```

---

## 4. 方案对比矩阵

| 评估维度 | 方案 D 和风暖木 | 方案 E 烟火朱砂 | 方案 F 青瓷清新 |
|---|---|---|---|
| 食欲感（暖色心理学） | 中 | 强 | 中 |
| 家庭温馨感 | 强（木质温暖） | 强（烟火气） | 中（清新偏轻食） |
| 视觉差异化（vs 现有A橙） | 高（褐+绿） | 中高（更深红） | 极高（青绿冷调） |
| 留白/呼吸感 | 强 | 中 | 强 |
| 做饭时单手可读性 | 强（大留白） | 强（高对比） | 强（大圆角清晰） |
| 中老年友好度 | 中 | 强（高对比朱砂） | 中（青绿辨识度） |
| 年轻化/现代感 | 中 | 中 | 强 |
| 与"2分钟定今晚"轻快主流程契合 | 中（偏慢节奏） | 强（朱砂点睛醒目） | 强（轻快通透） |
| WCAG AA 主文字对比度 | ≥4.5:1 达标 | ≥4.5:1 达标（墨黑on米黄） | ≥4.5:1 达标 |
| 实现复杂度 | 低 | 低（含 accent-bar） | 低 |
| 菜品实拍图兼容性 | 好（暖底衬食） | 好（暖底衬食） | 中（冷底，红菜偏突出） |

> 菜品图一律"试做实拍"（DEC-007），上表"菜品实拍图兼容性"指该风格背景与真实菜品照片的视觉协调度，不涉及生成菜品图。

---

## 5. 推荐方案及理由

### 5.1 推荐：方案 E 烟火朱砂（首推） + 方案 D 和风暖木（备选）

**首推 E 的理由：**
1. **食欲感最强**：朱砂红 `#C8392E` 直接关联红烧/酱色，暖色心理学中诱发食欲效果最佳，契合"晚餐规划"核心场景
2. **差异化充足**：相比现有方案 A 番茄暖橙 `#FF6B35`，朱砂红饱和度更低、更沉稳，避免了"又一版橙色"的同质化感
3. **高对比可读**：墨黑 `#2A2018` on 暖米黄 `#FBF6EC` 对比度充裕，做饭时（手油、光暗）单手查看更省力，对中老年家庭成员友好
4. **烟火气契合家庭**：宣纸感背景 + 朱砂强调，传达"家的味道"，与目标用户（家庭主妇/煮夫）情感共鸣强
5. **主流程点睛**：朱砂红主按钮在暖米黄底上醒目，强化"2分钟定今晚"的轻快主路径

**备选 D 的理由：**
若用户偏好更安静、克制、日式美学的调性（不希望红色过于强烈），和风暖木的木质温暖 + 大留白是更柔和的选择，同时保留了家庭温馨感。

**不首推 F 的理由：**
青瓷清新最年轻现代，但青绿冷调对"诱发食欲"略弱，且与中式家常菜实拍图（多为暖色调）的视觉协调度不如暖色方案。若用户明确偏好明亮清爽风格，F 仍是合格候选。

### 5.2 重要声明
- 以上推荐**仅为设计建议，不代表已定稿**（铁律：不自行决定最终视觉风格）
- 最终方案需用户从 D/E/F（或结合现有 A/B/C）中**人工选定一套**
- 选定后，前端 WP-05 将对应方案的 cssVars 拷贝至 [app.css](../../apps/h5/src/app.css) `:root`，或扩展 [theme-tokens.ts](../design/theme-tokens.ts) 新增对应候选

---

## 6. 落地建议（选定后执行，本次不改动代码）

1. **主题接入**：将定稿方案的 cssVars 块整体替换 [app.css](../../apps/h5/src/app.css) 第 12-51 行的 `:root` 内容
2. **token 化排版**：业务样式中的零散 px 值改为引用 `--fm-font-size-*` / `--fm-spacing-*`，消除 [candidates/index.css](../../apps/h5/src/pages/candidates/index.css) 等的硬编码
3. **卡片统一**：`.fm-card` 改用 `var(--fm-radius-card)` + `var(--fm-shadow-card)` + `var(--fm-card-border)`，建立层级
4. **呼吸感**：今晚页 hero 与卡片间、卡片之间引入 `--fm-spacing-lg`(24px) 留白，打破连续堆叠
5. **图标**：继续引用 NutUI Icon / iconfont（见 [assets-spec.md](../design/assets-spec.md) §5），不生图
6. **菜品图**：沿用"试做实拍"策略，占位图保持占位感（见 [assets-spec.md](../design/assets-spec.md) §4 末尾边界）

> 以上 1-4 涉及业务代码改动，属 WP-05 前端工作范围，需由队长派发任务卡后执行；本设计 Agent 仅产出方案，不直接改码。

---

## 7. 自检清单

| 检查项 | 结果 | 说明 |
|---|---|---|
| 是否提供 2-3 套候选 | 通过 | 提供 D/E/F 共 3 套 |
| 候选是否差异化明显 | 通过 | 暖木褐 / 朱砂红 / 青瓷绿，色相跨度大 |
| 每套是否含完整 NutUI tokens | 通过 | cssVars 完整 + configProvider 说明一一对应 |
| 每套是否含预览图 URL | 通过 | 3 个 text_to_image URL，格式符合要求 |
| 是否自行决定最终风格 | 通过 | 未定稿，仅给推荐，明确需人工选定 |
| 菜品图是否标注"试做实拍" | 通过 | §4 对比表 + §5.1 + §6 均标注，未生成菜品图 |
| 图标是否引用 NutUI/iconfont | 通过 | §6 落地建议明确引用，未编写图标生图提示词 |
| 是否修改业务代码 | 通过 | 仅新建本文档，未改 apps/h5 任何代码 |
| 输出路径是否正确 | 通过 | `docs/ui-redesign/style-options.md` |
