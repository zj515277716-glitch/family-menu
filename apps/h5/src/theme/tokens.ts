// apps/h5/src/theme/tokens.ts
// 主题 tokens - 方案 E 烟火朱砂（定稿基准 docs/ai-rebuild/ui/e-final.html + design-spec.md）
// 主色 #C8392E（朱砂红），背景 #FBF6EC（宣纸米黄）
// key 必须是 NutUI 4 NutCSSVariables 合法驼峰名（ NutUI 3 旧 key 不生效）

/** NutUI ConfigProvider theme prop（驼峰 key，运行时组件级覆盖） */
export const themeConfig = {
  nutuiColorPrimary: '#C8392E',
  nutuiColorPrimaryStop1: '#C8392E',
  nutuiColorPrimaryStop2: '#D85648',
  nutuiColorPrimaryPressed: '#A82A20',
  nutuiColorPrimaryDisabled: '#E89A90',
  nutuiColorPrimaryIcon: '#C8392E',
  nutuiColorSuccess: '#5C8A4E',
  nutuiColorSuccessPressed: '#72A064',
  nutuiColorWarning: '#D98C2B',
  nutuiColorWarningPressed: '#E6A452',
  nutuiColorDanger: '#A82A20',
  nutuiColorDangerPressed: '#C04035',
  nutuiColorBackground: '#FBF6EC',
  nutuiColorBackgroundComponent: '#FFFCF5',
  nutuiColorTitle: '#2A2018',
  nutuiColorText: '#7A6A55',
  nutuiColorTextHelp: '#9A8A75',
  nutuiColorTextDisabled: '#C9BCAE',
  nutuiColorBorder: '#E5D9C2',
  nutuiRadiusBase: '12px',
  nutuiRadiusS: '8px',
  nutuiRadiusL: '16px',
  nutuiButtonPrimaryBackgroundColor: '#C8392E',
  nutuiButtonPrimaryColor: '#FFFFFF',
  nutuiButtonPrimaryBorderColor: '#C8392E',
  nutuiButtonPrimaryPressed: '#A82A20',
  nutuiButtonPrimaryDisabled: '#E89A90',
  nutuiCellBackgroundColor: '#FFFCF5',
  nutuiCellBoxShadow: '0px 2px 12px rgba(200, 57, 46, 0.08)',
  nutuiTabbarActiveColor: '#C8392E',
  nutuiTabbarInactiveColor: '#7A6A55',
  nutuiTagColor: '#C8392E',
  nutuiSwitchActiveBackgroundColor: '#C8392E',
  nutuiRangeActiveColor: '#C8392E',
  nutuiInputnumberIconColor: '#C8392E',
} as const

/** 调色板速览（页面直接引用的语义色） */
export const palette = {
  primary: '#C8392E',
  primaryEnd: '#D85648',
  success: '#5C8A4E',
  warning: '#D98C2B',
  danger: '#A82A20',
  info: '#5B8DEF',
  bg: '#FBF6EC',
  bgSecondary: '#F3E9D4',
  textPrimary: '#2A2018',
  textSecondary: '#7A6A55',
  textDisabled: '#C9BCAE',
  border: '#E5D9C2',
  radiusBase: '12px',
} as const
