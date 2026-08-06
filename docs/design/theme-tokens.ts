/**
 * NutUI 4.x 主题色 tokens - family-menu
 * ============================================================================
 * 产物归属：UI/UX 设计 Agent｜对齐实施方案「环节 2.5」设计系统=NutUI 默认规范+主题色常量
 * 风格方向：温暖、家庭、食欲感（暖橙/暖红色系）
 *
 * 【重要】视觉定稿 = 人工决策点（铁律：不自行决定最终视觉风格）
 *   本文件提供 3 套候选主题（A/B/C），由人工选定一套后，
 *   前端 WP-05 将选定方案的常量拷贝/引用至 apps/h5/src 引入使用。
 *   推荐方案仅为设计建议，不代表已定稿。
 *
 * 设计依据：
 *   - 色彩心理学：暖橙/暖红诱发食欲，奶油白背景营造家庭温馨感
 *   - WCAG AA：主文字与背景对比度 ≥ 4.5:1，次文字 ≥ 3:1
 *   - NutUI 4.x CSS 变量体系（@nutui/nutui-react-taro 4.0.0-beta.5）
 *
 * 提供两种消费形式（二选一或并用）：
 *   1) configProvider：传给 <ConfigProvider theme={...}>，运行时组件级覆盖（驼峰 key）
 *   2) cssVars：注入全局 :root（带 --nutui- 前缀），H5 覆盖面最广，推荐主用
 *   两套 key 一一对应，值一致。
 *
 * 用法示例（前端）：
 *   import { getTheme, recommendedThemeKey } from './theme-tokens';
 *   const theme = getTheme('A')!; // 人工定稿后改为硬编码 key
 *   // app.css 注入 theme.cssVars；或 <ConfigProvider theme={theme.configProvider}>
 * ============================================================================
 */

/** 单套主题候选结构 */
export interface ThemeCandidate {
  /** 方案标识 */
  key: 'A' | 'B' | 'C';
  /** 方案名 */
  name: string;
  /** 风格说明 */
  description: string;
  /** NutUI ConfigProvider theme prop（驼峰 key，运行时组件级覆盖） */
  configProvider: Record<string, string>;
  /** CSS 变量块（带 --nutui- 前缀，注入 :root，H5 全局覆盖） */
  cssVars: string;
  /** 调色板速览（设计沟通/走查对比用） */
  palette: {
    primary: string;
    primaryEnd: string;
    success: string;
    warning: string;
    danger: string;
    info: string;
    bg: string;
    bgSecondary: string;
    textPrimary: string;
    textSecondary: string;
    textDisabled: string;
    border: string;
    radiusBase: string;
  };
}

// ───────────────────────── 风格提示词基座（与 assets-spec.md 共用） ─────────────────────────
// 扁平插画风格，暖色主调，圆角造型，家庭厨房主题，柔和光影，画面简洁无文字，
// 统一描边粗细，平视视角。每套方案对应一个主色调。

// ============================================================================
// 方案 A：番茄暖橙（推荐 · 食欲感最强）
// 主色 #FF6B35 取自成熟番茄/胡萝卜，明度高、暖意足，最易激发食欲；
// 背景 #FFF8F3 奶油白带暖意，文字 #2B2118 暖黑不冷硬，整体家庭厨房感。
// ============================================================================
const themeA: ThemeCandidate = {
  key: 'A',
  name: '番茄暖橙',
  description: '暖橙主调+奶油白背景，食欲感最强，明快温暖，适合"2分钟定今晚"的轻快主流程。',
  palette: {
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
  },
  configProvider: {
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
  },
  cssVars: `:root {
  /* 方案 A：番茄暖橙 */
  --nutui-color-primary: #FF6B35;
  --nutui-color-primary-end: #FF8F5E;
  --nutui-color-primary-disabled: #FFB48F;
  --nutui-color-primary-light: #FFF1E6;
  --nutui-color-success: #2BA471;
  --nutui-color-success-end: #34C77B;
  --nutui-color-warning: #FFA000;
  --nutui-color-warning-end: #FFB733;
  --nutui-color-danger: #E63946;
  --nutui-color-danger-end: #F05560;
  --nutui-color-info: #5B8DEF;
  --nutui-title-color: #2B2118;
  --nutui-title-color2: #5A4A3C;
  --nutui-text-color: #8C7B6B;
  --nutui-text-help: #A89684;
  --nutui-disable-color: #C9BCAE;
  --nutui-background-color: #FFF8F3;
  --nutui-background-color2: #FFF1E6;
  --nutui-background-color3: #FFE7D5;
  --nutui-cell-background-color: #FFFFFF;
  --nutui-cell-box-shadow: 0px 2px 8px rgba(255, 107, 53, 0.08);
  --nutui-tabbar-background-color: #FFFFFF;
  --nutui-tab-text-color: #8C7B6B;
  --nutui-tab-active-text-color: #FF6B35;
  --nutui-divider-color: #F0E4D8;
  --nutui-border-color: #F0E4D8;
  --nutui-border-radius: 12px;
  --nutui-border-radius-small: 8px;
  --nutui-border-radius-large: 16px;
  --nutui-button-primary-background-color: #FF6B35;
  --nutui-button-primary-color: #FFFFFF;
  --nutui-tag-color: #FF6B35;
  --nutui-checkbox-checked-color: #FF6B35;
  --nutui-radio-checked-color: #FF6B35;
  --nutui-stepper-button-icon-color: #FF6B35;
  --nutui-rate-icon-active-color: #FF6B35;
  --nutui-tabs-horizontal-checked-color: #FF6B35;
}`,
};

// ============================================================================
// 方案 B：红烧暖红（家庭温情 · 沉稳）
// 主色 #D64545 取自红烧菜酱色，饱和度略低、沉稳，传达"家的味道"温情；
// 背景 #FFFAF5 微暖白，文字 #2A1F1A 深咖暖黑，整体更有"晚餐时刻"的踏实感。
// ============================================================================
const themeB: ThemeCandidate = {
  key: 'B',
  name: '红烧暖红',
  description: '暖红主调+微暖白背景，沉稳温情，"家的味道"感更强，适合强调晚餐仪式感。',
  palette: {
    primary: '#D64545',
    primaryEnd: '#E06565',
    success: '#2BA471',
    warning: '#E8941E',
    danger: '#C1121F',
    info: '#5B8DEF',
    bg: '#FFFAF5',
    bgSecondary: '#FDEEE8',
    textPrimary: '#2A1F1A',
    textSecondary: '#8A776E',
    textDisabled: '#C9BCB2',
    border: '#F0E5DE',
    radiusBase: '12px',
  },
  configProvider: {
    primaryColor: '#D64545',
    primaryColorEnd: '#E06565',
    primaryColorDisabled: '#EFA0A0',
    successColor: '#2BA471',
    successColorEnd: '#34C77B',
    warningColor: '#E8941E',
    warningColorEnd: '#F0AE4C',
    dangerColor: '#C1121F',
    dangerColorEnd: '#D83340',
    infoColor: '#5B8DEF',
    titleColor: '#2A1F1A',
    titleColor2: '#574339',
    textColor: '#8A776E',
    helpColor: '#A69286',
    disableColor: '#C9BCB2',
    backgroundColor: '#FFFAF5',
    backgroundColor2: '#FDEEE8',
    backgroundColor3: '#F8DDD3',
    cellBackgroundColor: '#FFFFFF',
    cellBoxShadow: '0px 2px 8px rgba(214, 69, 69, 0.08)',
    tabBarBackgroundColor: '#FFFFFF',
    tabTextColor: '#8A776E',
    tabActiveTextColor: '#D64545',
    dividerColor: '#F0E5DE',
    borderRadius: '12px',
    borderRadiusSmall: '8px',
    borderRadiusLarge: '16px',
    buttonPrimaryBgColor: '#D64545',
    buttonPrimaryColor: '#FFFFFF',
    tagColor: '#D64545',
    checkboxCheckedColor: '#D64545',
    radioCheckedColor: '#D64545',
    stepperButtonIconColor: '#D64545',
    rateIconActiveColor: '#D64545',
    tabsHorizontalCheckedColor: '#D64545',
  },
  cssVars: `:root {
  /* 方案 B：红烧暖红 */
  --nutui-color-primary: #D64545;
  --nutui-color-primary-end: #E06565;
  --nutui-color-primary-disabled: #EFA0A0;
  --nutui-color-primary-light: #FDEEE8;
  --nutui-color-success: #2BA471;
  --nutui-color-success-end: #34C77B;
  --nutui-color-warning: #E8941E;
  --nutui-color-warning-end: #F0AE4C;
  --nutui-color-danger: #C1121F;
  --nutui-color-danger-end: #D83340;
  --nutui-color-info: #5B8DEF;
  --nutui-title-color: #2A1F1A;
  --nutui-title-color2: #574339;
  --nutui-text-color: #8A776E;
  --nutui-text-help: #A69286;
  --nutui-disable-color: #C9BCB2;
  --nutui-background-color: #FFFAF5;
  --nutui-background-color2: #FDEEE8;
  --nutui-background-color3: #F8DDD3;
  --nutui-cell-background-color: #FFFFFF;
  --nutui-cell-box-shadow: 0px 2px 8px rgba(214, 69, 69, 0.08);
  --nutui-tabbar-background-color: #FFFFFF;
  --nutui-tab-text-color: #8A776E;
  --nutui-tab-active-color: #D64545;
  --nutui-divider-color: #F0E5DE;
  --nutui-border-color: #F0E5DE;
  --nutui-border-radius: 12px;
  --nutui-border-radius-small: 8px;
  --nutui-border-radius-large: 16px;
  --nutui-button-primary-background-color: #D64545;
  --nutui-button-primary-color: #FFFFFF;
  --nutui-tag-color: #D64545;
  --nutui-checkbox-checked-color: #D64545;
  --nutui-radio-checked-color: #D64545;
  --nutui-stepper-button-icon-color: #D64545;
  --nutui-rate-icon-active-color: #D64545;
  --nutui-tabs-horizontal-checked-color: #D64545;
}`,
};

// ============================================================================
// 方案 C：蜜糖琥珀（明亮 · 清爽）
// 主色 #E89A3C 取自蜜糖/南瓜，偏黄橙，明快清爽，搭配更亮的暖白背景；
// 适合偏好"轻松轻量"调性、希望界面更明亮的场景。
// ============================================================================
const themeC: ThemeCandidate = {
  key: 'C',
  name: '蜜糖琥珀',
  description: '蜜糖橙黄主调+亮暖白背景，明快清爽，轻量感强，适合偏好明亮界面的用户。',
  palette: {
    primary: '#E89A3C',
    primaryEnd: '#F2B66B',
    success: '#2BA471',
    warning: '#F0A500',
    danger: '#E63946',
    info: '#5B8DEF',
    bg: '#FFFBF0',
    bgSecondary: '#FFF4DE',
    textPrimary: '#2B2418',
    textSecondary: '#8A7E66',
    textDisabled: '#CCC0A8',
    border: '#F0E8D2',
    radiusBase: '14px',
  },
  configProvider: {
    primaryColor: '#E89A3C',
    primaryColorEnd: '#F2B66B',
    primaryColorDisabled: '#F6D29A',
    successColor: '#2BA471',
    successColorEnd: '#34C77B',
    warningColor: '#F0A500',
    warningColorEnd: '#FFBE2E',
    dangerColor: '#E63946',
    dangerColorEnd: '#F05560',
    infoColor: '#5B8DEF',
    titleColor: '#2B2418',
    titleColor2: '#574A33',
    textColor: '#8A7E66',
    helpColor: '#A69B82',
    disableColor: '#CCC0A8',
    backgroundColor: '#FFFBF0',
    backgroundColor2: '#FFF4DE',
    backgroundColor3: '#FFE9C2',
    cellBackgroundColor: '#FFFFFF',
    cellBoxShadow: '0px 2px 8px rgba(232, 154, 60, 0.10)',
    tabBarBackgroundColor: '#FFFFFF',
    tabTextColor: '#8A7E66',
    tabActiveTextColor: '#E89A3C',
    dividerColor: '#F0E8D2',
    borderRadius: '14px',
    borderRadiusSmall: '10px',
    borderRadiusLarge: '18px',
    buttonPrimaryBgColor: '#E89A3C',
    buttonPrimaryColor: '#FFFFFF',
    tagColor: '#E89A3C',
    checkboxCheckedColor: '#E89A3C',
    radioCheckedColor: '#E89A3C',
    stepperButtonIconColor: '#E89A3C',
    rateIconActiveColor: '#E89A3C',
    tabsHorizontalCheckedColor: '#E89A3C',
  },
  cssVars: `:root {
  /* 方案 C：蜜糖琥珀 */
  --nutui-color-primary: #E89A3C;
  --nutui-color-primary-end: #F2B66B;
  --nutui-color-primary-disabled: #F6D29A;
  --nutui-color-primary-light: #FFF4DE;
  --nutui-color-success: #2BA471;
  --nutui-color-success-end: #34C77B;
  --nutui-color-warning: #F0A500;
  --nutui-color-warning-end: #FFBE2E;
  --nutui-color-danger: #E63946;
  --nutui-color-danger-end: #F05560;
  --nutui-color-info: #5B8DEF;
  --nutui-title-color: #2B2418;
  --nutui-title-color2: #574A33;
  --nutui-text-color: #8A7E66;
  --nutui-text-help: #A69B82;
  --nutui-disable-color: #CCC0A8;
  --nutui-background-color: #FFFBF0;
  --nutui-background-color2: #FFF4DE;
  --nutui-background-color3: #FFE9C2;
  --nutui-cell-background-color: #FFFFFF;
  --nutui-cell-box-shadow: 0px 2px 8px rgba(232, 154, 60, 0.10);
  --nutui-tabbar-background-color: #FFFFFF;
  --nutui-tab-text-color: #8A7E66;
  --nutui-tab-active-text-color: #E89A3C;
  --nutui-divider-color: #F0E8D2;
  --nutui-border-color: #F0E8D2;
  --nutui-border-radius: 14px;
  --nutui-border-radius-small: 10px;
  --nutui-border-radius-large: 18px;
  --nutui-button-primary-background-color: #E89A3C;
  --nutui-button-primary-color: #FFFFFF;
  --nutui-tag-color: #E89A3C;
  --nutui-checkbox-checked-color: #E89A3C;
  --nutui-radio-checked-color: #E89A3C;
  --nutui-stepper-button-icon-color: #E89A3C;
  --nutui-rate-icon-active-color: #E89A3C;
  --nutui-tabs-horizontal-checked-color: #E89A3C;
}`,
};

/** 全部候选主题（人工选定一套定稿） */
export const themeCandidates: readonly ThemeCandidate[] = [themeA, themeB, themeC] as const;

/**
 * 推荐方案 key（仅设计建议，不代表已定稿）。
 * 选 A 的理由：暖橙食欲感最强、与"番茄/胡萝卜"等高频食材色彩呼应，
 * 明度足使主操作按钮醒目，最契合"2 分钟定今晚"的轻快主流程。
 */
export const recommendedThemeKey: ThemeCandidate['key'] = 'A';

/** 按 key 取主题候选 */
export function getTheme(key: ThemeCandidate['key']): ThemeCandidate | undefined {
  return themeCandidates.find((t) => t.key === key);
}

/** 推荐方案（便捷引用，人工定稿前用于占位联调） */
export const recommendedTheme: ThemeCandidate = getTheme(recommendedThemeKey)!;
