// apps/h5/src/global.d.ts
// 全局环境类型声明（无 import/export，保持全局脚本作用域）

// Taro 构建时用 defineConstants 将 process.env.TARO_APP_* 替换为字面量；
// 此处仅为让 tsc 认识该形状。
declare const process: {
  env: Record<string, string | undefined>
}

// 静态资源模块声明（Taro webpack 图片 import）
declare module '*.png' {
  const src: string
  export default src
}
declare module '*.jpg' {
  const src: string
  export default src
}
declare module '*.jpeg' {
  const src: string
  export default src
}
declare module '*.webp' {
  const src: string
  export default src
}
