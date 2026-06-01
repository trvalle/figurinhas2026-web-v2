import type { StickerStatus } from '../types/app.types'

export const GROUP_COLORS: Record<string, string> = {
  A: '#3B82F6',
  B: '#8B5CF6',
  C: '#22C55E',
  D: '#F59E0B',
  E: '#EF4444',
  F: '#06B6D4',
  G: '#EC4899',
  H: '#84CC16',
  I: '#F97316',
  J: '#6366F1',
  K: '#14B8A6',
  Z: '#F59E0B',
}

export const STATUS_CONFIG: Record<
  StickerStatus,
  { color: string; bg: string; icon: string; label: string }
> = {
  colada: {
    color: '#22C55E',
    bg: 'rgba(34,197,94,0.14)',
    icon: '✅',
    label: 'Colada',
  },
  repetida: {
    color: '#F59E0B',
    bg: 'rgba(245,158,11,0.14)',
    icon: '🔁',
    label: 'Repetida',
  },
  faltante: {
    color: '#F43F5E',
    bg: 'rgba(244,63,94,0.14)',
    icon: '❌',
    label: 'Faltante',
  },
  estoque: {
    color: '#3B82F6',
    bg: 'rgba(59,130,246,0.14)',
    icon: '📦',
    label: 'Estoque',
  },
}

export const SEARCH_RADIUS_OPTIONS = [1, 5, 10, 25, 9999] as const

export const STICKER_REGEX = /\b([A-Z]{2,3})\s(\d{1,2})\b/g
