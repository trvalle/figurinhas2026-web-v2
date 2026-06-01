import type { DetectedSticker } from '@/services/realtimeScanner'

const STATUS_COLORS: Record<string, string> = {
  faltante: 'rgba(244, 63, 94, 0.70)',
  colada:   'rgba(34, 197, 94, 0.70)',
  repetida: 'rgba(245, 158, 11, 0.70)',
  estoque:  'rgba(59, 130, 246, 0.70)',
}

interface StickerOverlayProps {
  detected: DetectedSticker[]
}

export function StickerOverlay({ detected }: StickerOverlayProps) {
  return (
    <div className="absolute inset-0 pointer-events-none" style={{ transition: 'opacity 150ms' }}>
      {detected.map((d) =>
        d.boundingBox ? (
          <div
            key={d.code}
            className="absolute flex items-center justify-center rounded-lg text-white text-xs font-mono font-bold"
            style={{
              left: `${d.boundingBox.x * 100}%`,
              top:  `${d.boundingBox.y * 100}%`,
              width: `${d.boundingBox.width * 100}%`,
              height: `${d.boundingBox.height * 100}%`,
              backgroundColor: STATUS_COLORS[d.status] ?? STATUS_COLORS.faltante,
              border: `2px solid ${STATUS_COLORS[d.status]}`,
              transition: 'all 150ms',
            }}
          >
            {d.code}
          </div>
        ) : null,
      )}
    </div>
  )
}
