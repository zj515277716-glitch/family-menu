# PD-019 视觉基准重做：替换 PD-010/PD-011 的「E 烟火朱砂 e-final」

> 状态：**待产品负责人确认**（本文档与 PRODUCT-CONFIRMATION 补丁均未合并，确认前旧基准仍有效）
> 起草：主控（TRAE 主会话），2026-10-08｜立项：T-Q05

## 问题（与 PD-010/011 冲突点）

PD-010 选定视觉方向「E 烟火朱砂」（#C8392E 朱砂红）、PD-011 以 `docs/ai-rebuild/ui/e-final.html`（15 屏）+ `design-spec.md` 为 UI 唯一事实源并定稿冻结。现状是产品负责人反馈「排版差、没有美感」（docs/ui-redesign/style-options.md §0.1），需要重做视觉基准。

## 决定（待确认）

1. **PD-010/PD-011 的旧视觉基准进入归档**（docs/ai-rebuild/ui/ 整个目录移交 docs/archive/，仅追溯）：
   - e-final.html（15 屏）、design-spec.md、direction-D/E/F.html、dish-detail-vA/B/C.html
   - **注意**：仅归档「视觉基准」部分；其中承载的**页面结构、信息架构、屏号①~⑮引用**在 C 部分（验收条款）中被引用（如 C-3 屏⑤→②、C-5 屏③），属本补丁关联修订范围（见下）。
2. **新视觉基准由 T-Q05 设计包产出后替换**：风格板（含组件库选型）→ 整体导航图 → 缺页对账 →（产品负责人确认导航图后）手机高保真原型 → 新 design-spec。
3. **保留不动**：产品需求（A 部分）、功能行为条款（C 部分的具体行为口径）——本次只换「皮肤」不换「骨架与行为」。

## 影响

| 影响面 | 处置 |
|---|---|
| C 部分验收条款中的「屏号①~⑮」「e-final.html/design-spec.md 为视觉基准」引用 | 随新基准落地同步改指向新文档（修订点集中一次改，不逐条散落） |
| 生产 UI 代码（apps/h5，现为朱砂红 token + NutUI 4 beta） | 等新基准定稿后按新 token/组件库改（属 T-Q05 后续实施卡，本补丁不直接改码） |
| docs/design/（v1：theme-tokens/wireframes/interaction-flow/assets-spec/preview.*） | 见《T-Q05 阶段②③④·缺页与旧稿对账》——**功能行为类沿用，纯视觉资产类归档** |
| docs/ui-redesign/style-options.md（2026-09 设计 Agent 重设计候选，未入库） | 入库归档作追溯（其 D/E/F 候选与 PD-010 的 E 同源，已被新基准流程取代） |

## 关联修订（本补丁一并处理）

- PRODUCT-CONFIRMATION 头部状态行增补 PD-019；§B 改为「旧基准已归档（PD-019），新基准 = T-Q05 设计包（链接）」；§C 中引用 e-final/design-spec/屏号的 6 处改指新基准文档。
- PD-010「E 烟火朱砂」结论保留在归档文件中（历史事实，不抹除）。
