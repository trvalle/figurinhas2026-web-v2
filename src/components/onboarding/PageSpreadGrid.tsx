'use client'
import { StickerSlot } from './StickerSlot'
import { buildSpreadLayout, type SlotConfig } from '@/utils/spreadLayout'
import type { CatalogEntry } from '@/types/app.types'

interface PageSpreadGridProps {
  stickers: CatalogEntry[]
  selected: Set<string>
  onToggle: (code: string) => void
  onSelectAll: (codes: string[]) => void
  onSelectNone: (codes: string[]) => void
  spreadIndex: number
}

type Slot = SlotConfig | null

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

function buildLeftRows(slots: SlotConfig[]): Slot[][] {
  const s = (i: number): Slot => slots[i] ?? null
  return [
    [null, null, s(0), s(1)],
    [s(2), s(3), s(4), s(5)],
    [s(6), s(7), s(8), s(9)],
  ]
}

function buildRightRows(slots: SlotConfig[]): Slot[][] {
  const s = (i: number): Slot => slots[i] ?? null
  return [
    [s(0), s(1), null, s(2)],
    [s(3), s(4), s(5), s(6)],
    [null, s(7), s(8), s(9)],
  ]
}

function renderRows(
  rows: Slot[][],
  groupLabel: string,
  selected: Set<string>,
  onToggle: (code: string) => void,
) {
  return (
    <div className="flex flex-col gap-1 flex-1 min-w-0">
      {rows.map((row, ri) => (
        <div key={ri} className="flex gap-1">
          {row.map((slot, si) =>
            slot === null ? (
              <div key={si} style={{ minWidth: 44, minHeight: 44 }} />
            ) : (
              <StickerSlot
                key={slot.code}
                code={slot.code}
                groupLabel={groupLabel}
                selected={selected.has(slot.code)}
                isSpecial={slot.isHighlight}
                onClick={() => onToggle(slot.code)}
              />
            )
          )}
        </div>
      ))}
    </div>
  )
}

function renderFWCPage(
  slots: SlotConfig[],
  selected: Set<string>,
  onToggle: (code: string) => void,
) {
  const rows = chunk(slots, 2)
  return (
    <div className="flex flex-col gap-1 flex-1 min-w-0">
      {rows.map((row, ri) => (
        <div key={ri} className="flex gap-1 justify-center">
          {row.map((s) => (
            <StickerSlot
              key={s.code}
              code={s.code}
              groupLabel="Z"
              selected={selected.has(s.code)}
              isSpecial={s.isHighlight}
              onClick={() => onToggle(s.code)}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

export function PageSpreadGrid({
  stickers,
  selected,
  onToggle,
  onSelectAll,
  onSelectNone,
  spreadIndex,
}: PageSpreadGridProps) {
  const { leftPage, rightPage } = buildSpreadLayout(stickers)
  const isFWC = stickers[0]?.country_code === 'FWC'
  const groupLabel = stickers[0]?.group_label ?? ''
  const countryName = stickers[0]?.country_name ?? ''
  const allCodes = stickers.map((s) => s.sticker_code)
  const selectedCount = allCodes.filter((c) => selected.has(c)).length
  const isEven = spreadIndex % 2 === 0

  return (
    <div
      className="rounded-xl p-3"
      style={{
        backgroundColor: isEven ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.015)',
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <p className="text-ink-400 text-xs font-body uppercase tracking-wider truncate flex-1">
          {countryName}
          {groupLabel && groupLabel !== 'Z' && (
            <span className="ml-2 text-ink-600">Grupo {groupLabel}</span>
          )}
        </p>
        <span className="text-ink-500 text-xs font-body ml-2 flex-shrink-0">
          {selectedCount} de {allCodes.length}
        </span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr',
          gap: 6,
          alignItems: 'start',
        }}
      >
        {isFWC
          ? renderFWCPage(leftPage, selected, onToggle)
          : renderRows(buildLeftRows(leftPage), groupLabel, selected, onToggle)}
        <div className="w-px bg-ink-700/50 self-stretch mx-1" />
        {isFWC
          ? renderFWCPage(rightPage, selected, onToggle)
          : renderRows(buildRightRows(rightPage), groupLabel, selected, onToggle)}
      </div>

      <div className="flex gap-2 mt-3">
        <button
          onClick={() => onSelectAll(allCodes)}
          className="flex-1 py-1.5 rounded-lg text-xs font-body text-ink-400 hover:text-ink-200 border border-ink-700 hover:border-ink-500 transition-colors"
        >
          Todas
        </button>
        <button
          onClick={() => onSelectNone(allCodes)}
          className="flex-1 py-1.5 rounded-lg text-xs font-body text-ink-400 hover:text-ink-200 border border-ink-700 hover:border-ink-500 transition-colors"
        >
          Nenhuma
        </button>
      </div>
    </div>
  )
}
