import type { CatalogEntry } from '@/types/app.types'

const CACHE_KEY = 'sticker_catalog_cache'

// ─── Tabelas de correção fuzzy (portadas do mobile) ───────────────────────────

const PREFIX_CORRECTIONS: Record<string, string> = {
  'OAT': 'QAT',
  'EGV': 'EGY',
}

const DIGIT_TO_LETTER: Record<string, string> = {
  '0': 'O', '1': 'I', '8': 'B', '6': 'G', '5': 'S',
}

const LETTER_TO_DIGIT: Record<string, string> = {
  'O': '0', 'Q': '0', 'D': '0',
  'I': '1', 'L': '1',
  'B': '8', 'S': '5', 'G': '6', 'Z': '2',
}

// 3 letras  |  dígito na 3ª pos (HA1→HAI)  |  dígito na 2ª pos (B1H→BIH)  |  2 letras
const OCR_REGEX = /\b([A-Z]{3}|[A-Z]{2}[0-9]|[A-Z][0-9][A-Z]|[A-Z]{2})\s*([0-9GOQDILBSZ]{1,2})\b/g

function fixPrefix(s: string): string {
  return s.split('').map((c) => DIGIT_TO_LETTER[c] ?? c).join('')
}

function fixNumber(s: string): string {
  return s.split('').map((c) => LETTER_TO_DIGIT[c] ?? c).join('')
}

function fuzzyLookup(rawPrefix: string, correctedNum: string, validCodes: Set<string>): string | null {
  const fp = fixPrefix(rawPrefix)
  const cp = PREFIX_CORRECTIONS[rawPrefix] ?? PREFIX_CORRECTIONS[fp] ?? fp
  for (const candidate of [`${rawPrefix} ${correctedNum}`, `${fp} ${correctedNum}`, `${cp} ${correctedNum}`]) {
    if (validCodes.has(candidate)) return candidate
  }
  return null
}

// ─── Converte Blob → base64 ───────────────────────────────────────────────────

async function toBase64(imageData: Blob | string): Promise<string> {
  if (typeof imageData === 'string') return imageData
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1] ?? '')
    reader.onerror = reject
    reader.readAsDataURL(imageData)
  })
}

// ─── recognizeText — chama Edge Function (Google Cloud Vision) ────────────────

export async function recognizeText(imageData: Blob | string): Promise<string> {
  const base64 = await toBase64(imageData)
  const { getSupabaseClient } = await import('./supabase')
  const supabase = getSupabaseClient()

  const { data, error } = await supabase.functions.invoke('ocr', {
    body: { image: base64 },
  })

  if (error) throw new Error(error.message)

  const payload = data as { text?: string; error?: string }
  if (payload.error) throw new Error(payload.error)

  const text = payload.text ?? ''
  console.debug('[OCR raw]', JSON.stringify(text))
  return text
}

// ─── loadCatalogCache ─────────────────────────────────────────────────────────

export async function loadCatalogCache(): Promise<CatalogEntry[]> {
  try {
    const cached = localStorage.getItem(CACHE_KEY)
    if (cached) {
      const parsed: { data: CatalogEntry[]; ts: number } = JSON.parse(cached)
      if (Date.now() - parsed.ts < 24 * 60 * 60 * 1000) return parsed.data
    }
    const { getSupabaseClient } = await import('./supabase')
    const supabase = getSupabaseClient()
    const { data } = await supabase.from('sticker_catalog').select('*')
    if (!data || data.length === 0) return []
    const entries: CatalogEntry[] = data.map((r) => ({
      sticker_code:   r.sticker_code,
      country_code:   r.country_code,
      country_name:   r.country_name,
      group_label:    r.group_label,
      album_page:     r.album_page,
      number_in_team: r.number_in_team,
    }))
    localStorage.setItem(CACHE_KEY, JSON.stringify({ data: entries, ts: Date.now() }))
    return entries
  } catch {
    return []
  }
}

// ─── extractCodes ─────────────────────────────────────────────────────────────

function extractCodes(text: string, validCodes: Set<string> | null, found: Set<string>): void {
  const normalized = text.toUpperCase().replace(/[_\-·•|]/g, ' ').replace(/\s+/g, ' ').trim()
  const regex = new RegExp(OCR_REGEX.source, OCR_REGEX.flags)
  let m: RegExpExecArray | null

  while ((m = regex.exec(normalized)) !== null) {
    const rawPrefix = m[1]!
    const rawNum    = m[2]!
    const correctedNum = fixNumber(rawNum)
    if (!/^\d{1,2}$/.test(correctedNum)) continue

    if (validCodes) {
      const code = fuzzyLookup(rawPrefix, correctedNum, validCodes)
      if (code) found.add(code)
    } else {
      const cp = PREFIX_CORRECTIONS[rawPrefix] ?? fixPrefix(rawPrefix)
      found.add(`${PREFIX_CORRECTIONS[cp] ?? cp} ${correctedNum}`)
    }
  }
}

// ─── extractAndValidateCodes ──────────────────────────────────────────────────

export async function extractAndValidateCodes(text: string): Promise<{ codes: string[]; rawText: string }> {
  const found = new Set<string>()
  try {
    const catalog    = await loadCatalogCache()
    const validCodes = catalog.length > 0 ? new Set(catalog.map((c) => c.sticker_code)) : null
    extractCodes(text, validCodes, found)
    for (const line of text.split('\n')) extractCodes(line, validCodes, found)
  } catch {
    extractCodes(text, null, found)
    for (const line of text.split('\n')) extractCodes(line, null, found)
  }
  return { codes: [...found], rawText: text }
}
