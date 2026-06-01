// src/theme/tokens.ts
// Fonte única da verdade para design tokens — web V2.
// Cores e semântica idênticas ao app mobile.

export const colors = {
  gold: {
    50: '#FFFBEB',
    100: '#FEF3C7',
    200: '#FDE68A',
    300: '#FCD34D',
    400: '#FBBF24',
    500: '#F59E0B',
    600: '#D97706',
    700: '#B45309',
  },
  verde: {
    300: '#86EFAC',
    400: '#4ADE80',
    500: '#22C55E',
    600: '#16A34A',
    700: '#15803D',
  },
  scarlet: {
    300: '#FDA4AF',
    400: '#FB7185',
    500: '#F43F5E',
    600: '#E11D48',
    700: '#BE123C',
  },
  cobalt: {
    300: '#93C5FD',
    400: '#60A5FA',
    500: '#3B82F6',
    600: '#2563EB',
    700: '#1D4ED8',
  },
  ink: {
    50: '#F8FAFC',
    100: '#F1F5F9',
    200: '#E2E8F0',
    300: '#CBD5E1',
    400: '#94A3B8',
    500: '#64748B',
    600: '#475569',
    700: '#334155',
    800: '#1E293B',
    900: '#0F172A',
  },
} as const

export const semantic = {
  primary: colors.gold[500],
  primaryLight: colors.gold[400],
  success: colors.verde[500],
  warning: colors.gold[500],
  danger: colors.scarlet[500],
  info: colors.cobalt[500],
  bg: colors.ink[900],
  surface: colors.ink[800],
  border: 'rgba(255,255,255,0.07)',
  text1: colors.ink[100],
  text2: colors.ink[400],
  text3: colors.ink[500],
} as const

export const statusColors = {
  colada: colors.verde[500],
  repetida: colors.gold[500],
  faltante: colors.scarlet[500],
  estoque: colors.cobalt[500],
} as const

export const groupColors: Record<string, string> = {
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
}

const PAGE_COLOR_PALETTE = [
  '#3B82F6',
  '#F59E0B',
  '#F43F5E',
  '#22C55E',
  '#8B5CF6',
] as const

export function pageColor(albumPage: number): string {
  const idx = Math.floor(albumPage / 2) % PAGE_COLOR_PALETTE.length
  return PAGE_COLOR_PALETTE[idx] as string
}

export const shadows = {
  sm: '0 1px 3px rgba(0,0,0,0.12)',
  md: '0 4px 12px rgba(0,0,0,0.18)',
  lg: '0 10px 30px rgba(0,0,0,0.25)',
  glow: '0 0 20px rgba(245,158,11,0.4)',
} as const
