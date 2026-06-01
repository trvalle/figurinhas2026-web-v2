export type StickerStatus = 'colada' | 'repetida' | 'faltante' | 'estoque'

export interface UserSticker {
  id: string
  user_id: string
  sticker_code: string
  quantity_owned: number
  is_pasted: boolean
  updated_at: string
}

export interface CatalogEntry {
  sticker_code: string
  country_code: string
  country_name: string
  group_label: string
  album_page: number
  number_in_team: number
}

/** Sticker com dados do catálogo já joinados — usado em entries da store */
export type InventarioEntry = UserSticker & CatalogEntry

export interface UserProfile {
  id: string
  display_name: string
  address_display: string
  whatsapp?: string
  search_radius_km: number
  notifications_enabled: boolean
  is_visible: boolean
  created_at: string
  updated_at: string
}

export interface MatchResult {
  user_a_id: string
  user_b_id: string
  match_score: number
  is_bilateral: boolean
  distance_km: number
  stickers_a_can_give: string[]
  stickers_b_can_give: string[]
  // Campos do match_cache legado — opcionais para compatibilidade
  id?: string
  computed_at?: string
  user_a_revealed?: boolean
  user_b_revealed?: boolean
}

export type TradeProposalStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'cancelled'
  | 'completed'

export interface TradeProposal {
  id: string
  proposer_id: string
  receiver_id: string
  stickers_offered: string[]
  stickers_requested: string[]
  status: TradeProposalStatus
  proposer_whatsapp_revealed: boolean
  receiver_whatsapp_revealed: boolean
  created_at: string
  updated_at: string
}

export interface NewProposal {
  receiver_id: string
  stickers_offered: string[]
  stickers_requested: string[]
}

export type OnboardingStatus = 'not_started' | 'in_progress' | 'completed'

export interface PageSpread {
  page_left: number
  page_right: number
  stickers: CatalogEntry[]
}
