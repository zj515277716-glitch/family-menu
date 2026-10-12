# T-Q06 组件库探针：tdesign-mobile-react × Taro 4 H5 实测

> 立项：T-Q05 实施路线第 2 步（2026-10-08 用户拍板「先立探针看看效果」，2026-10-11 导航图确认后派发）。
> 级别：L1（技术验证，隔离探针页，不动现有页面与生产）。
> 目标：实测 tdesign-mobile-react 能否在 Taro 4 + React（编译目标 h5）下正常工作，产出「可用/不可用 + 迁移成本」结论，供产品负责人在「沿用 NutUI / 迁 TDesign」之间定案。

## 背景

- 现行组件库 @nutui/nutui-react-taro 4.0.0-beta.5（唯一官方 Taro 专属包，零迁移成本）。
- 候选 tdesign-mobile-react：腾讯 TDesign 的 React 移动端版，0.x 未达 1.0，Taro 适配无官方保证。决定性变量：它是 DOM 组件库，而 Taro H5 渲染层基于 `<View>` 等抽象组件。
- 风格板分析：docs/design/v2/stage2-4-style-board.md（方案 B）。

## 验证点（探针页必须逐项过）

1. **跑得起来**：apps/h5 安装 tdesign-mobile-react 后 `pnpm dev:h5` 编译无错，页面白屏/报错与否。
2. **核心组件实测**（对应三餐流程 13 屏需要的构件）：Button、Cell/CellGroup、TabBar、Form（Input/Stepper/Picker 或 DateTimePicker）、Popup、Dialog、Toast、Tag、List/Loading、Empty。
3. **共存**：与 NutUI 同页/同工程共存不互相污染（样式 reset、全局变量冲突）。
4. **单位体系**：Taro px2rem（设计稿 750）与 tdesign 样式单位是否冲突，组件尺寸是否随根字号正常缩放。
5. **主题定制**：CSS 变量换主色（换成风格板方向① #C8541F）验证 token 落地能力。
6. **包体积**：构建产物增量粗估（对比 main 基线 dist 大小）。

## 做法约束

- 分支 `t-q06-tdesign-probe`，从 main 切出。
- 探针页 `pages/probe/tdesign`（直达路由、不进 Tabbar、不加任何现有页面入口），页面顶部标注「探针页，非产品界面」。
- 只动：package.json 依赖、app.config.ts（注册探针页）、新增探针页文件。**不改任何现有页面/组件/契约**。
- 若第 1 点即失败（编译不过/白屏），停止后续点，如实记录失败现象即算完成探针（「不可用」也是有效结论）。
- 不提交构建产物；门禁（lint/tsc/test）保持全绿。

## 交付

1. 探针页可在 `pnpm dev:h5` 下打开（http://localhost:10086/#/pages/probe/tdesign）。
2. evidence/T-Q06/probe-report.md（≤1 页）：6 个验证点逐项结论 + 截图（正常/异常各留证）+ 迁移成本粗估（页面改造点数、风险清单）+ **定案建议**（可用/有条件可用/不可用）。
3. 分支推送 + 主控复核后交产品负责人定案；探针分支在定案后按结论处理（采用则另立迁移卡，弃用则分支留档不合并）。
