'use client'
import { useState, useEffect, useCallback } from 'react'
import { getSupabaseClient } from '@/services/supabase'
import type { CatalogEntry } from '@/types/app.types'

const CACHE_KEY = 'sticker_catalog_cache_v3'
const CACHE_TTL = 24 * 60 * 60 * 1000

interface CatalogCache {
  data: CatalogEntry[]
  ts: number
}

export function useCatalog() {
  const [catalog, setCatalog] = useState<CatalogEntry[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const cached = localStorage.getItem(CACHE_KEY)
      if (cached) {
        const parsed: CatalogCache = JSON.parse(cached)
        if (Date.now() - parsed.ts < CACHE_TTL) {
          setCatalog(parsed.data)
          setLoading(false)
          return
        }
      }

      const supabase = getSupabaseClient()
      const { data } = await supabase
        .from('sticker_catalog')
        .select('*')
        .eq('is_active', true)
        .order('album_page')

      if (data) {
        const entries: CatalogEntry[] = data.map((r) => ({
          sticker_code: r.sticker_code,
          country_code: r.country_code,
          country_name: r.country_name,
          group_label: r.group_label,
          album_page: r.album_page,
          number_in_team: r.number_in_team,
        }))
        localStorage.setItem(CACHE_KEY, JSON.stringify({ data: entries, ts: Date.now() }))
        setCatalog(entries)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return { catalog, loading, reload: load }
}
