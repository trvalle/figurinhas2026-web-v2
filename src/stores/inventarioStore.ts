'use client'
// Portagem fiel da store mobile para web.
// entries: UserSticker & CatalogEntry (join feito na store, sem useCatalog nos componentes).
// missing: CatalogEntry[] das figurinhas não possuídas.
// upsertSticker: delta-based (igual ao mobile).
// saveScannedStickers: batch upsert +1 cada (igual ao mobile).

import { create } from 'zustand'
import { getSupabaseClient } from '../services/supabase'
import type { UserSticker, CatalogEntry, InventarioEntry } from '../types/app.types'

interface InventarioStats {
  coladas: number
  repetidas: number
  faltantes: number
  estoque: number
}

function computeStats(entries: InventarioEntry[], missing: CatalogEntry[]): InventarioStats {
  return {
    coladas: entries.filter((e) => e.is_pasted).length,
    repetidas: entries.reduce((acc, e) => acc + Math.max(0, e.quantity_owned - 1), 0),
    estoque: entries.filter((e) => !e.is_pasted && e.quantity_owned === 1).length,
    faltantes: missing.length,
  }
}

interface InventarioState {
  loading: boolean
  error: string | null
  /** Stickers que o usuário possui (quantity_owned >= 1) com dados do catálogo joinados */
  entries: InventarioEntry[]
  /** Figurinhas do catálogo que o usuário não possui */
  missing: CatalogEntry[]
  /** Stats derivados de entries + missing — mantidos por compatibilidade com componentes */
  stats: InventarioStats

  /**
   * Incrementa ou decrementa quantity_owned de um sticker (delta-based como no mobile).
   * - Se já existe: quantity_owned += delta (mínimo 0)
   * - Se não existe e delta > 0: cria com quantity_owned = delta
   */
  upsertSticker: (code: string, delta: number) => Promise<void>

  /**
   * Salva um lote de códigos escaneados com delta +1 cada (portagem do mobile).
   * Retorna o número de figurinhas salvas com sucesso.
   */
  saveScannedStickers: (codes: string[]) => Promise<number>

  /**
   * Carrega inventário completo: user_stickers + catalog em paralelo, join client-side.
   */
  fetchInventario: () => Promise<void>

  /**
   * Alterna is_pasted de um sticker (portagem do mobile — recebe boolean).
   */
  markPasted: (code: string, isPasted: boolean) => Promise<void>

  /**
   * Remove completamente a figurinha do inventário (hard delete).
   */
  removeSticker: (code: string) => Promise<void>

  /**
   * Decrementa quantity_owned em 1.
   * - is_pasted=true: mínimo 1 (protege a colada).
   * - is_pasted=false: mínimo 0 (hard delete ao chegar a 0).
   * Retorna false se bloqueado pela regra de proteção.
   */
  removeOneUnit: (code: string) => Promise<boolean>

  /**
   * Gera texto formatado com repetidas e faltantes para compartilhamento (igual ao mobile).
   */
  generateShareText: () => string

  /**
   * Move uma figurinha de Faltante para Estoque (qty=1, is_pasted=false).
   * Retorna true se adicionada, false se já estava no inventário.
   */
  addToEstoque: (code: string) => Promise<boolean>

  /**
   * Remove todas as figurinhas do usuário e re-carrega o inventário.
   */
  clearInventario: () => Promise<void>

  clearError: () => void
}

export const useInventarioStore = create<InventarioState>((set, get) => ({
  loading: false,
  error: null,
  entries: [],
  missing: [],
  stats: { coladas: 0, repetidas: 0, faltantes: 0, estoque: 0 },

  clearError: () => set({ error: null }),

  // ── upsertSticker ──────────────────────────────────────────────────────────

  upsertSticker: async (code, delta) => {
    set({ loading: true, error: null })
    const supabase = getSupabaseClient()
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { set({ error: 'Usuário não autenticado.', loading: false }); return }

      const { data: existing } = await supabase
        .from('user_stickers')
        .select('id, quantity_owned')
        .eq('user_id', user.id)
        .eq('sticker_code', code)
        .maybeSingle()

      if (existing) {
        const newQty = Math.max(0, existing.quantity_owned + delta)
        await supabase
          .from('user_stickers')
          .update({ quantity_owned: newQty, updated_at: new Date().toISOString() })
          .eq('id', existing.id)
      } else if (delta > 0) {
        await supabase.from('user_stickers').insert({
          user_id: user.id,
          sticker_code: code,
          quantity_owned: delta,
        })
      }

      set({ loading: false })
      // Re-fetch para manter entries consistentes com catalog join
      await get().fetchInventario()
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Erro desconhecido.', loading: false })
    }
  },

  // ── saveScannedStickers ───────────────────────────────────────────────────

  saveScannedStickers: async (codes) => {
    if (codes.length === 0) return 0
    set({ loading: true, error: null })
    const supabase = getSupabaseClient()
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { set({ error: 'Usuário não autenticado.', loading: false }); return 0 }

      const { data: existing } = await supabase
        .from('user_stickers')
        .select('id, sticker_code, quantity_owned')
        .eq('user_id', user.id)
        .in('sticker_code', codes)

      const existingMap = new Map((existing ?? []).map((s) => [s.sticker_code, s]))

      const toUpdate: { id: string; quantity_owned: number; updated_at: string }[] = []
      const toInsert: { user_id: string; sticker_code: string; quantity_owned: number }[] = []

      for (const code of codes) {
        const found = existingMap.get(code)
        if (found) {
          toUpdate.push({
            id: found.id,
            quantity_owned: found.quantity_owned + 1,
            updated_at: new Date().toISOString(),
          })
        } else {
          toInsert.push({ user_id: user.id, sticker_code: code, quantity_owned: 1 })
        }
      }

      let saved = 0
      for (const row of toUpdate) {
        const { error } = await supabase
          .from('user_stickers')
          .update({ quantity_owned: row.quantity_owned, updated_at: row.updated_at })
          .eq('id', row.id)
        if (!error) saved++
      }
      if (toInsert.length > 0) {
        const { data, error } = await supabase
          .from('user_stickers')
          .insert(toInsert)
          .select('id')
        if (!error) saved += (data ?? []).length
      }

      set({ loading: false })
      await get().fetchInventario()
      return saved
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Erro desconhecido.', loading: false })
      return 0
    }
  },

  // ── fetchInventario ───────────────────────────────────────────────────────

  fetchInventario: async () => {
    set({ loading: true, error: null })
    const supabase = getSupabaseClient()
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { set({ error: 'Usuário não autenticado.', loading: false }); return }

      const [userResult, catalogResult] = await Promise.all([
        supabase.from('user_stickers').select('*').eq('user_id', user.id),
        supabase.from('sticker_catalog').select('*').eq('is_active', true).order('album_page'),
      ])

      if (userResult.error) { set({ error: userResult.error.message, loading: false }); return }
      if (catalogResult.error) { set({ error: catalogResult.error.message, loading: false }); return }

      const userStickers: UserSticker[] = (userResult.data ?? []) as UserSticker[]
      const catalog: CatalogEntry[] = (catalogResult.data ?? []) as CatalogEntry[]

      const catalogMap = new Map<string, CatalogEntry>(catalog.map((c) => [c.sticker_code, c]))
      const ownedCodes = new Set<string>(
        userStickers.filter((s) => s.quantity_owned > 0).map((s) => s.sticker_code),
      )

      const entries: InventarioEntry[] = userStickers
        .filter((s) => s.quantity_owned > 0)
        .map((s) => {
          const cat = catalogMap.get(s.sticker_code)
          return {
            ...s,
            country_code: cat?.country_code ?? '',
            country_name: cat?.country_name ?? '—',
            group_label: cat?.group_label ?? '?',
            album_page: cat?.album_page ?? 0,
            number_in_team: cat?.number_in_team ?? 0,
          } as InventarioEntry
        })
        .sort((a, b) => a.album_page - b.album_page || a.number_in_team - b.number_in_team)

      const missing: CatalogEntry[] = catalog
        .filter((c) => !ownedCodes.has(c.sticker_code))
        .sort((a, b) => a.album_page - b.album_page || a.number_in_team - b.number_in_team)

      set({ entries, missing, stats: computeStats(entries, missing), loading: false })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Erro desconhecido.', loading: false })
    }
  },

  // ── markPasted ────────────────────────────────────────────────────────────

  markPasted: async (code, isPasted) => {
    set({ loading: true, error: null })
    const supabase = getSupabaseClient()
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { set({ error: 'Usuário não autenticado.', loading: false }); return }

      const existing = get().entries.find((e) => e.sticker_code === code)
      if (!existing) {
        // Cria o registro como colada (figurinha não estava no inventário)
        await supabase.from('user_stickers').upsert(
          { user_id: user.id, sticker_code: code, quantity_owned: 1, is_pasted: isPasted },
          { onConflict: 'user_id,sticker_code' },
        )
        await get().fetchInventario()
        return
      }

      await supabase
        .from('user_stickers')
        .update({ is_pasted: isPasted, updated_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .eq('sticker_code', code)

      set((state) => {
        const entries = state.entries.map((e) =>
          e.sticker_code === code ? { ...e, is_pasted: isPasted } : e,
        )
        return { entries, stats: computeStats(entries, state.missing), loading: false }
      })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Erro desconhecido.', loading: false })
    }
  },

  // ── removeSticker ─────────────────────────────────────────────────────────

  removeSticker: async (code) => {
    set({ loading: true, error: null })
    const supabase = getSupabaseClient()
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { set({ error: 'Usuário não autenticado.', loading: false }); return }

      await supabase
        .from('user_stickers')
        .delete()
        .eq('user_id', user.id)
        .eq('sticker_code', code)

      set((state) => {
        const removed = state.entries.find((e) => e.sticker_code === code)
        const entries = state.entries.filter((e) => e.sticker_code !== code)
        const missing: CatalogEntry[] = removed
          ? [
              ...state.missing,
              {
                sticker_code: removed.sticker_code,
                country_code: removed.country_code,
                country_name: removed.country_name,
                group_label: removed.group_label,
                album_page: removed.album_page,
                number_in_team: removed.number_in_team,
              },
            ].sort((a, b) => a.album_page - b.album_page || a.number_in_team - b.number_in_team)
          : state.missing
        return { entries, missing, stats: computeStats(entries, missing), loading: false }
      })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Erro desconhecido.', loading: false })
    }
  },

  // ── removeOneUnit ─────────────────────────────────────────────────────────

  removeOneUnit: async (code) => {
    const entry = get().entries.find((e) => e.sticker_code === code)
    if (!entry) return false

    const minimumAllowed = entry.is_pasted ? 1 : 0
    if (entry.quantity_owned <= minimumAllowed) return false

    const newQuantity = entry.quantity_owned - 1
    set({ loading: true, error: null })
    const supabase = getSupabaseClient()
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { set({ error: 'Usuário não autenticado.', loading: false }); return false }

      if (newQuantity === 0) {
        await supabase
          .from('user_stickers')
          .delete()
          .eq('user_id', user.id)
          .eq('sticker_code', code)

        set((state) => {
          const removed = state.entries.find((e) => e.sticker_code === code)
          const entries = state.entries.filter((e) => e.sticker_code !== code)
          const missing: CatalogEntry[] = removed
            ? [
                ...state.missing,
                {
                  sticker_code: removed.sticker_code,
                  country_code: removed.country_code,
                  country_name: removed.country_name,
                  group_label: removed.group_label,
                  album_page: removed.album_page,
                  number_in_team: removed.number_in_team,
                },
              ].sort((a, b) => a.album_page - b.album_page || a.number_in_team - b.number_in_team)
            : state.missing
          return { entries, missing, stats: computeStats(entries, missing), loading: false }
        })
      } else {
        await supabase
          .from('user_stickers')
          .update({ quantity_owned: newQuantity, updated_at: new Date().toISOString() })
          .eq('user_id', user.id)
          .eq('sticker_code', code)

        set((state) => {
          const entries = state.entries.map((e) =>
            e.sticker_code === code ? { ...e, quantity_owned: newQuantity } : e,
          )
          return { entries, stats: computeStats(entries, state.missing), loading: false }
        })
      }
      return true
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Erro desconhecido.', loading: false })
      return false
    }
  },

  // ── generateShareText ─────────────────────────────────────────────────────

  generateShareText: () => {
    const { entries, missing } = get()
    const repetidas = entries.filter((e) => e.quantity_owned >= 2)
    const repetidasStr = repetidas
      .map((e) => `${e.sticker_code} (x${e.quantity_owned})`)
      .join(' | ')
    const faltantesStr = missing.map((m) => m.sticker_code).join(' | ')

    return [
      '⚽ MINHAS REPETIDAS — Copa 2026',
      repetidasStr || '(nenhuma repetida ainda)',
      '',
      `❌ PRECISO: ${faltantesStr || '(álbum completo!)'}`,
      'Gerado pelo app Figurinhas 2026 📲',
    ].join('\n')
  },

  // ── addToEstoque ──────────────────────────────────────────────────────────

  addToEstoque: async (code) => {
    const supabase = getSupabaseClient()
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return false

      const existing = get().entries.find((e) => e.sticker_code === code)
      if (existing && existing.quantity_owned > 0) return false

      await supabase.from('user_stickers').upsert(
        { user_id: user.id, sticker_code: code, quantity_owned: 1, is_pasted: false },
        { onConflict: 'user_id,sticker_code' },
      )

      set((state) => {
        const catalogEntry = state.missing.find((m) => m.sticker_code === code)
        if (!catalogEntry) return state

        const newEntry: InventarioEntry = {
          id: '',
          user_id: user.id,
          sticker_code: code,
          quantity_owned: 1,
          is_pasted: false,
          updated_at: new Date().toISOString(),
          country_code: catalogEntry.country_code,
          country_name: catalogEntry.country_name,
          group_label: catalogEntry.group_label,
          album_page: catalogEntry.album_page,
          number_in_team: catalogEntry.number_in_team,
        }

        const entries = [...state.entries, newEntry].sort(
          (a, b) => a.album_page - b.album_page || a.number_in_team - b.number_in_team,
        )
        const missing = state.missing.filter((m) => m.sticker_code !== code)
        return { entries, missing, stats: computeStats(entries, missing) }
      })

      return true
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Erro desconhecido.' })
      return false
    }
  },

  // ── clearInventario ───────────────────────────────────────────────────────

  clearInventario: async () => {
    set({ loading: true, error: null })
    const supabase = getSupabaseClient()
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { set({ error: 'Usuário não autenticado.', loading: false }); return }

      const { error } = await supabase
        .from('user_stickers')
        .delete()
        .eq('user_id', user.id)

      if (error) throw error
      await get().fetchInventario()
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Erro desconhecido.', loading: false })
    }
  },
}))
