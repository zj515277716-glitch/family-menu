// apps/h5/src/theme/tokens.ts
// 主题 tokens - 方案 A 番茄暖橙（DEC-010 定稿）
// 来源：docs/design/theme-tokens.ts themeA，人工选定后拷贝引入
// 主色 #FF6B35（番茄暖橙），背景 #FFF8F3（奶油白）

/** NutUI ConfigProvider theme prop（驼峰 key，运行时组件级覆盖） */
export const themeConfig = {
  primaryColor: '#FF6B35',
  primaryColorEnd: '#FF8F5E',
  primaryColorDisabled: '#FFB48F',
  successColor: '#2BA471',
  successColorEnd: '#34C77B',
  warningColor: '#FFA000',
  warningColorEnd: '#FFB733',
  dangerColor: '#E63946',
  dangerColorEnd: '#F05560',
  infoColor: '#5B8DEF',
  titleColor: '#2B2118',
  titleColor2: '#5A4A3C',
  textColor: '#8C7B6B',
  helpColor: '#A89684',
  disableColor: '#C9BCAE',
  backgroundColor: '#FFF8F3',
  backgroundColor2: '#FFF1E6',
  backgroundColor3: '#FFE7D5',
  cellBackgroundColor: '#FFFFFF',
  cellBoxShadow: '0px 2px 8px rgba(255, 107, 53, 0.08)',
  tabBarBackgroundColor: '#FFFFFF',
  tabTextColor: '#8C7B6B',
  tabActiveTextColor: '#FF6B35',
  dividerColor: '#F0E4D8',
  borderRadius: '12px',
  borderRadiusSmall: '8px',
  borderRadiusLarge: '16px',
  buttonPrimaryBgColor: '#FF6B35',
  buttonPrimaryColor: '#FFFFFF',
  tagColor: '#FF6B35',
  checkboxCheckedColor: '#FF6B35',
  radioCheckedColor: '#FF6B35',
  stepperButtonIconColor: '#FF6B35',
  rateIconActiveColor: '#FF6B35',
  tabsHorizontalCheckedColor: '#FF6B35',
} as const

/** 调色板速览（页面直接引用的语义色） */
export const palette = {
  primary: '#FF6B35',
  primaryEnd: '#FF8F5E',
  success: '#2BA471',
  warning: '#FFA000',
  danger: '#E63946',
  info: '#5B8DEF',
  bg: '#FFF8F3',
  bgSecondary: '#FFF1E6',
  textPrimary: '#2B2118',
  textSecondary: '#8C7B6B',
  textDisabled: '#C9BCAE',
  border: '#F0E4D8',
  radiusBase: '12px',
} as const
