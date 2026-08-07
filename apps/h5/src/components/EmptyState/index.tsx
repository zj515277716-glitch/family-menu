// apps/h5/src/components/EmptyState/index.tsx
// 通用空状态组件：装饰插画 + 文案 + 出口按钮（无死胡同，wireframes 第414行）
import { View, Text, Image } from '@tarojs/components'
import { Button } from '@nutui/nutui-react-taro'

interface EmptyStateProps {
  /** 装饰插画资源（import 自 assets/） */
  image: string
  /** 主文案 */
  title: string
  /** 辅助描述 */
  desc?: string
  /** 出口按钮文字 */
  btnText?: string
  /** 出口按钮点击 */
  onBtnClick?: () => void
}

export default function EmptyState({
  image,
  title,
  desc,
  btnText,
  onBtnClick,
}: EmptyStateProps) {
  return (
    <View style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '48px 24px' }}>
      <Image
        src={image}
        mode="aspectFit"
        style={{ width: '240px', height: '180px' }}
      />
      <Text style={{ fontSize: '30px', fontWeight: 600, color: '#2B2118', marginTop: '16px' }}>
        {title}
      </Text>
      {desc && (
        <Text style={{ fontSize: '26px', color: '#8C7B6B', marginTop: '8px', textAlign: 'center' }}>
          {desc}
        </Text>
      )}
      {btnText && (
        <Button
          type="primary"
          size="large"
          onClick={onBtnClick}
          style={{ marginTop: '24px', width: '60%' }}
        >
          {btnText}
        </Button>
      )}
    </View>
  )
}
