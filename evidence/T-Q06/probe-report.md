# T-Q06 探针报告：tdesign-mobile-react 0.23.3 × Taro 4.2 H5

> 2026-10-13 fm-dev｜分支 t-q06-tdesign-probe｜环境：dev:h5 webpack 编译零错误，Playwright 375×812 实测
> **定案建议：有条件可用——今日能跑通，但建议沿用 NutUI（除非对 TDesign 视觉有强偏好，且接受下述风险再立迁移卡）**

## 6 验证点逐项结论

| # | 验证点 | 结论 | 关键证据 |
|---|---|---|---|
| 1 | 跑得起来 | ✅ 通过 | dev:h5 编译零错误；探针页渲染完整，无 pageerror（01-probe-full.png、11-probe-on-10086.png、runtime-log.txt） |
| 2 | 核心组件 | ✅ 9/11 通过，2 项有怪癖 | Button/Cell/CellGroup/TabBar/Input/Popup/Dialog(命令式portal)/Toast/Tag/List/Loading/Empty 全渲染可交互（02~05、07~09）。**Stepper ⚠**：受控 value 不回显（源码 value=2 显示 0，点 + 变 1，内部状态自治，07 vs 10）。**Picker ⚠**：纯面板，0.23.3 不消费 visible，须自包 Popup（页内已注明，05 可用） |
| 3 | 与 NutUI 共存 | ✅ 通过 | 同排两库主按钮各自主色独立（01b）；--td-brand-color 覆盖后 --nutui-color-primary 仍为 #C8392E；类名/变量均带前缀（.t-* / .nut-*）互不污染；探针页加载 TD 样式后登录页 NutUI 渲染如常（06） |
| 4 | 单位体系 | ⚠️ 有差异（非阻断） | Taro px2rem 对本工程源码生效（750px→375px，根字号 20px）；**TD 样式为固定 px 不经 rem**（按钮恒 40px），NutUI 随 rem 缩放（32px）。混用时两库尺寸缩放逻辑不一致；全迁则尺寸体系跟随 TD 固定 px，长辈模式放大字号组件不跟随 |
| 5 | 主题定制 | ✅ 通过 | :root 覆盖 --td-brand-color-1..10（7 阶 = #C8541F），全页 TD 组件跟随，实测 --td-brand-color=#c8541f；token 落地能力与 NutUI cssVars 同级 |
| 6 | 包体积 | ✅ 增量可控 | dist：main 1,616 KB → 分支 1,948 KB，**+332 KB raw / +77 KB gzip**，且被页面级代码分割隔离在探针页异步 chunk，既有页面包体零影响（bundle-size.txt）。双库并存上界；全迁（卸 NutUI）每页增量小于此值 |

## 迁移成本粗估（若定案迁移）

- **改造点数**：8 个页面全部重写（风格板 §4 已估）；三餐流程所需构件 TD 全部具备（本探针 11 类实测），但图标需另迁 @nutui/icons-react-taro → tdesign-icons-react（未实测）；请求封装/store/样式 token 可保留。
- **风险清单**：① 0.x 未达 1.0，API 可能 breaking（Stepper/Picker 怪癖即为实例，每个组件用前都要实测）；② 无官方 Taro 适配，Taro 升级可能静默坏；③ 单位体系差异需另立尺寸策略；④ 回退成本高（页面重写后回不去）。
- **工作量量级**：探针本身 ≈ 0.5 天（本次实测）；8 页迁移 + 逐组件排怪癖 + 回归，粗估 3~5 天，另加 fm-verify 全屏回归。

## 依据

风格板推荐沿用 NutUI 的理由（偏好问题=排版问题而非库能力、零迁移成本）本次探针未被推翻：TD 在 Taro H5「能用」，但没有展现出 NutUI 做不到的能力；主题 token 两者同级。**建议按风格板默认路径走（沿用 NutUI + 换 token + 排版重构），本分支留档不合并**；若产品负责人体验探针页后仍偏好 TDesign，再立迁移卡（量级如上）。

证据清单：01 真整页（视口拉高法，Taro 滚动容器为内层 div，fullPage 直截只得视口）、01b 顶部首屏、02 Toast、03 Dialog、04 Popup、05 Picker、06 登录页共存核对、07~10 Form/TabBar/List/Stepper 局部、11 10086 端口复验、runtime-log.txt、bundle-size.txt、shoot.mjs/diag.mjs/stepper-check.mjs/fullpage.mjs（取证脚本）。
