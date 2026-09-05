// apps/h5/src/components/EmptyState/index.tsx
// 通用空状态组件（定稿 .empty-card 结构）：emoji + 一句结论 + 两行解释 + 全宽出口按钮
// 基准：docs/ai-rebuild/ui/e-final.html §空态 + design-spec.md §3（DEC-007 禁止 AI 插画）
import { View } from '@tarojs/components'
import { Button } from '@nutui/nutui-react-taro'

interface EmptyStateProps {
  /** 占位 emoji（DEC-007：菜品图一律 emoji 占位，禁止 AI 生成图） */
  emoji: string
  /** 主文案（一句结论） */
  title: string
  /** 辅助描述（两行解释） */
  desc?: string
  /** 出口按钮文字 */
  btnText?: string
  /** 出口按钮点击 */
  onBtnClick?: () => void
}

export default function EmptyState({
  emoji,
  title,
  desc,
  btnText,
  onBtnClick,
}: EmptyStateProps) {
  return (
    <View className="fm-card fm-empty">
      <View className="fm-empty-emoji">{emoji}</View>
      <View className="fm-empty-title">{title}</View>
      {desc && <View className="fm-empty-text">{desc}</View>}
      {btnText && (
        <Button
          className="fm-btn-primary"
          onClick={onBtnClick}
          style={{ marginTop: '32px' }}
        >
          {btnText}
        </Button>
      )}
    </View>
  )
}
