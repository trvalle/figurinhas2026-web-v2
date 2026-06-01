import type { CatalogEntry } from '@/types/app.types'

export interface SlotConfig {
  code: string
  isHighlight: boolean
}

export function buildSpreadLayout(stickers: CatalogEntry[]): {
  leftPage: SlotConfig[]
  rightPage: SlotConfig[]
} {
  const sorted = [...stickers].sort((a, b) => a.number_in_team - b.number_in_team)
  const isFWC = sorted.length > 0 && sorted[0]!.country_code === 'FWC'

  if (isFWC) {
    return {
      leftPage: sorted
        .filter((s) => s.album_page % 2 !== 0)
        .map((s) => ({ code: s.sticker_code, isHighlight: false })),
      rightPage: sorted
        .filter((s) => s.album_page % 2 === 0)
        .map((s) => ({ code: s.sticker_code, isHighlight: false })),
    }
  }

  const toSlot = (s: CatalogEntry): SlotConfig => ({
    code: s.sticker_code,
    isHighlight: s.number_in_team === 13,
  })

  return {
    leftPage: sorted.filter((s) => s.number_in_team <= 10).map(toSlot),
    rightPage: sorted.filter((s) => s.number_in_team >= 11).map(toSlot),
  }
}
