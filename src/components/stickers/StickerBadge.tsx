'use client'
import { GROUP_COLORS } from '@/utils/constants'

interface StickerBadgeProps {
  code: string
  groupLabel: string
  size?: 'sm' | 'md' | 'lg'
}

const SIZE_MAP = { sm: 36, md: 48, lg: 60 }

export function StickerBadge({ code, groupLabel, size = 'md' }: StickerBadgeProps) {
  const px = SIZE_MAP[size]
  const color = GROUP_COLORS[groupLabel] ?? '#64748B'
  const fontSize = size === 'sm' ? 10 : size === 'md' ? 12 : 14

  return (
    <div
      className="rounded-xl flex items-center justify-center font-display text-white select-none"
      style={{
        width: px,
        height: px,
        backgroundColor: color,
        fontSize,
        flexShrink: 0,
      }}
    >
      {code}
    </div>
  )
}
