'use client'
import { GROUP_COLORS } from '@/utils/constants'

interface StickerSlotProps {
  code: string
  groupLabel: string
  selected: boolean
  isSpecial?: boolean
  onClick: () => void
}

export function StickerSlot({ code, groupLabel, selected, isSpecial = false, onClick }: StickerSlotProps) {
  const color = GROUP_COLORS[groupLabel] ?? '#64748B'

  return (
    <button
      onClick={onClick}
      className="flex items-center justify-center rounded-lg transition-all duration-100 active:scale-95 select-none"
      style={{
        minWidth: 44,
        minHeight: 44,
        backgroundColor: selected ? color : 'rgba(255,255,255,0.04)',
        border: selected ? 'none' : '1.5px solid rgba(255,255,255,0.08)',
        color: selected ? '#fff' : 'rgba(255,255,255,0.25)',
        fontSize: 10,
        fontFamily: 'var(--font-jetbrains)',
        fontWeight: selected ? 700 : 400,
        boxShadow: selected ? `0 2px 8px ${color}55` : 'none',
        transform: isSpecial && selected ? 'scale(1.05)' : undefined,
        outline: isSpecial ? `1.5px dashed ${color}88` : undefined,
        outlineOffset: 2,
      }}
    >
      {code}
    </button>
  )
}
