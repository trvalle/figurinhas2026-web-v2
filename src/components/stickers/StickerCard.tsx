'use client'
import { useRef } from 'react'
import { StickerBadge } from './StickerBadge'
import { STATUS_CONFIG } from '@/utils/constants'
import type { InventarioEntry } from '@/types/app.types'

interface StickerCardProps {
  sticker: InventarioEntry
  listContext?: 'default' | 'faltante'
  onSwipeRight?: () => void
  onSwipeLeft?: () => void
  onPress?: () => void
}

export function StickerCard({
  sticker,
  listContext = 'default',
  onSwipeRight,
  onSwipeLeft,
  onPress,
}: StickerCardProps) {
  const startX = useRef(0)
  const startY = useRef(0)
  const isDragging = useRef(false)

  const status = sticker.is_pasted
    ? 'colada'
    : sticker.quantity_owned > 1
    ? 'repetida'
    : 'estoque'

  const cfg = STATUS_CONFIG[status]

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-white/4 transition-colors active:bg-white/6 touch-pan-y"
      onPointerDown={(e) => {
        startX.current = e.clientX
        startY.current = e.clientY
        isDragging.current = false
      }}
      onPointerMove={(e) => {
        const dx = Math.abs(e.clientX - startX.current)
        const dy = Math.abs(e.clientY - startY.current)
        if (dx > 5 || dy > 5) isDragging.current = true
      }}
      onPointerUp={(e) => {
        const delta = e.clientX - startX.current
        const dyAbs = Math.abs(e.clientY - startY.current)
        if (dyAbs > 40) return
        if (delta > 60 && onSwipeRight) {
          onSwipeRight()
        } else if (delta < -60 && onSwipeLeft) {
          onSwipeLeft()
        } else if (!isDragging.current && onPress) {
          onPress()
        }
      }}
    >
      <StickerBadge
        code={sticker.sticker_code}
        groupLabel={sticker.group_label}
        size="md"
      />
      <div className="flex-1 min-w-0">
        <p className="text-ink-100 font-heading font-semibold text-sm truncate">
          {sticker.country_name}
        </p>
        <p className="text-ink-500 text-xs font-body">
          Pág. {sticker.album_page} · #{sticker.number_in_team}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {sticker.quantity_owned > 1 && (
          <span className="text-xs font-mono text-gold-400 bg-gold-500/10 px-2 py-0.5 rounded-full">
            ×{sticker.quantity_owned}
          </span>
        )}
        <span
          className="text-xs font-body px-2 py-0.5 rounded-full"
          style={{ color: cfg.color, backgroundColor: cfg.bg }}
        >
          {cfg.label}
        </span>
      </div>

      {listContext === 'faltante' && (
        <div className="text-ink-600 text-xs ml-1 select-none">→</div>
      )}
    </div>
  )
}
