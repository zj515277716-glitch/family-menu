// apps/h5/src/theme/tokens.ts
// 主题 tokens —— design-spec-v2 §1 定稿（方向① 暖白极简 × 网格卡片风）
// 事实源：docs/design/v2/prototypes/style-1/style.css（token 组）；
// 改 token 先改设计稿事实源，再同步本文件与 app.css。
// key 必须是 NutUI 4 NutCSSVariables 合法驼峰名（NutUI 3 旧 key 不生效）。

/** NutUI ConfigProvider theme prop（驼峰 key，运行时组件级覆盖） */
export const themeConfig = {
  nutuiColorPrimary: '#C8541F',
  nutuiColorPrimaryStop1: '#D86A2E',
  nutuiColorPrimaryStop2: '#C8521C',
  nutuiColorPrimaryPressed: '#A8431A',
  nutuiColorPrimaryDisabled: '#E5B79D',
  nutuiColorPrimaryIcon: '#C8541F',
  nutuiColorSuccess: '#476B3C',
  nutuiColorSuccessPressed: '#5A8150',
  nutuiColorWarning: '#9A671C',
  nutuiColorWarningPressed: '#B07A28',
  nutuiColorDanger: '#A63A22',
  nutuiColorDangerPressed: '#BC4A30',
  nutuiColorBackground: '#FAFAF8',
  nutuiColorBackgroundComponent: '#FFFFFF',
  nutuiColorTitle: '#2C2420',
  nutuiColorText: '#6F6156',
  nutuiColorTextHelp: '#8A7B6B',
  nutuiColorTextDisabled: '#C9BFAF',
  nutuiColorBorder: '#EFE9E0',
  nutuiRadiusBase: '24px', // 12px 逻辑（750 设计稿 ×2）
  nutuiRadiusS: '16px', // 8px 逻辑
  nutuiRadiusL: '32px', // 16px 逻辑
  nutuiButtonPrimaryBackgroundColor: '#C8541F',
  nutuiButtonPrimaryColor: '#FFFFFF',
  nutuiButtonPrimaryBorderColor: '#C8541F',
  nutuiButtonPrimaryPressed: '#A8431A',
  nutuiButtonPrimaryDisabled: '#E5B79D',
  nutuiTabbarActiveColor: '#C8541F',
  nutuiTabbarInactiveColor: '#8A7B6B',
  nutuiTagColor: '#C8541F',
  nutuiSwitchActiveBackgroundColor: '#C8541F',
  nutuiRangeActiveColor: '#C8541F',
  nutuiInputnumberIconColor: '#C8541F',
} as const
