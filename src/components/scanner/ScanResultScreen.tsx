'use client'
import { useState, useMemo } from 'react'
import { X, Plus, PackagePlus } from 'lucide-react'
import { StickerBadge } from '@/components/stickers/StickerBadge'
import { useCatalog } from '@/hooks/useCatalog'

function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/^([A-Z]{2,3})[\s\-]*([0-9]{1,2})$/, '$1 $2')
}

interface ScanResultScreenProps {
  codes: string[]
  sourceLabel: string
  onConfirm: (codes: string[]) => Promise<void>
  onCancel: () => void
}

export function ScanResultScreen({ codes, sourceLabel, onConfirm, onCancel }: ScanResultScreenProps) {
  const { catalog } = useCatalog()
  const [extra, setExtra] = useState('')
  const [pending, setPending] = useState<string[]>(codes)
  const [saving, setSaving] = useState(false)

  const catalogMap = useMemo(() => {
    const m = new Map(catalog.map((c) => [c.sticker_code, c]))
    return m
  }, [catalog])

  const sorted = useMemo(
    () => [...pending].sort((a, b) => {
      const pa = catalogMap.get(a)?.album_page ?? 999
      const pb = catalogMap.get(b)?.album_page ?? 999
      return pa - pb
    }),
    [pending, catalogMap],
  )

  const addExtra = () => {
    const code = normalizeCode(extra)
    if (code && !pending.includes(code)) {
      setPending((prev) => [...prev, code])
    }
    setExtra('')
  }

  const remove = (code: string) => setPending((prev) => prev.filter((c) => c !== code))

  const handleConfirm = async () => {
    setSaving(true)
    try {
      await onConfirm(pending)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col h-full bg-ink-900">
      <div className="flex items-center justify-between px-4 py-3 border-b border-ink-700">
        <div>
          <h2 className="font-heading font-bold text-ink-100">
            {pending.length} figurinha{pending.length !== 1 ? 's' : ''} encontrada{pending.length !== 1 ? 's' : ''}
          </h2>
          <p className="text-ink-500 text-xs font-body">{sourceLabel}</p>
        </div>
        <button onClick={onCancel} className="text-ink-400 hover:text-ink-200 transition-colors">
          <X size={20} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-center px-6">
            <X size={32} className="text-scarlet-500" />
            <p className="text-ink-400 font-body text-sm">
              Nenhum código reconhecido. Tente adicionar manualmente abaixo.
            </p>
          </div>
        ) : (
          <>
            <div className="divide-y divide-ink-700/30">
              {sorted.map((code) => {
                const entry = catalogMap.get(code)
                return (
                  <div key={code} className="flex items-center gap-3 px-4 py-3">
                    <StickerBadge
                      code={code}
                      groupLabel={entry?.group_label ?? 'Z'}
                      size="md"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-ink-100 font-heading font-semibold text-sm">
                        {entry?.country_name ?? code}
                      </p>
                      {entry && (
                        <p className="text-ink-500 text-xs font-body">
                          Pág. {entry.album_page} · #{entry.number_in_team}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => remove(code)}
                      className="w-7 h-7 flex items-center justify-center text-ink-600 hover:text-scarlet-400 transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </div>
                )
              })}
            </div>

            <div className="px-4 py-5">
              <button
                onClick={() => void handleConfirm()}
                disabled={pending.length === 0 || saving}
                className="w-full py-3.5 bg-gold-500 hover:bg-gold-600 disabled:opacity-50 rounded-xl font-heading font-bold text-lg text-ink-900 flex items-center justify-center gap-2 transition-colors active:scale-[0.98]"
              >
                {saving ? (
                  <div className="w-5 h-5 rounded-full border-2 border-ink-900/30 border-t-ink-900 animate-spin" />
                ) : (
                  <>
                    <PackagePlus size={20} />
                    Adicionar para o estoque ({pending.length})
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>

      <div className="px-4 py-3 border-t border-ink-700/50 bg-ink-800/50">
        <div className="flex gap-2">
          <input
            value={extra}
            onChange={(e) => setExtra(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && addExtra()}
            placeholder="Ex: BRA 7"
            className="flex-1 bg-ink-700 border border-ink-600 rounded-lg px-3 py-2 text-sm font-mono text-ink-100 placeholder:text-ink-600 focus:outline-none focus:border-gold-500"
          />
          <button
            onClick={addExtra}
            className="w-10 h-10 bg-gold-500 rounded-lg flex items-center justify-center flex-shrink-0"
          >
            <Plus size={18} className="text-ink-900" />
          </button>
        </div>
      </div>
    </div>
  )
}
