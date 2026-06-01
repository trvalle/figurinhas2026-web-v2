import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient as BaseClient } from '@supabase/supabase-js'
import type { Database } from '../types/database.types'

export type SupabaseClient = BaseClient<Database>

let _client: SupabaseClient | undefined

export function getSupabaseClient(): SupabaseClient {
  if (!_client) {
    _client = createBrowserClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    ) as unknown as SupabaseClient
  }
  return _client
}
