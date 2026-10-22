// apps/h5/src/components/DishImage/index.tsx
// 菜品卡图（S-03/S-06）：有图走 Taro Image，无图/加载失败降级为暖色占位块
// （.fcard-ph.ph-N，菜名始终在卡内可读）；不引入任何外链假图。
import { useEffect, useState } from 'react'
import { Image, View } from '@tarojs/components'
import { resolveAssetUrl } from '../../api/client'

/** 由菜品 id 稳定映射到六种暖色占位之一（同一道菜每次一致） */
function placeholderClass(seed: string): string {
  let sum = 0
  for (let i = 0; i < seed.length; i += 1) sum += seed.charCodeAt(i)
  return `ph-${(sum % 6) + 1}`
}

interface DishImageProps {
  imageUrl?: string
  /** 稳定占位种子：菜品 id */
  seed: string
  alt: string
  /** card=菜品卡 4:3；hero=S-09 全出血大图（样式由页面容器 .dhero 控制尺寸） */
  variant?: 'card' | 'hero'
}

export default function DishImage({ imageUrl, seed, alt, variant = 'card' }: DishImageProps) {
  const [failed, setFailed] = useState(false)
  // 同一卡位换了图（如换菜后摘要卡首菜变化）时重新尝试，不沿用上一张的失败态
  useEffect(() => setFailed(false), [imageUrl])
  const src = resolveAssetUrl(imageUrl)
  if (!src || failed) {
    const ph = variant === 'hero' ? 'dhero-ph' : 'fcard-ph'
    return <View className={`${ph} ${placeholderClass(seed)}`} aria-label={alt} />
  }
  return (
    <Image
      className={variant === 'hero' ? 'dhero-img' : 'fcard-img'}
      src={src}
      mode="aspectFill"
      aria-label={alt}
      onError={() => setFailed(true)}
    />
  )
}
