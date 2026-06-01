'use client'
import { create } from 'zustand'
import { getSupabaseClient } from '../services/supabase'
import type { MatchResult, TradeProposal, NewProposal } from '../types/app.types'

interface TrocaState {
  matches: MatchResult[]
  proposals: TradeProposal[]
  loading: boolean
  fetchMatches: () => Promise<void>
  fetchProposals: () => Promise<void>
  sendProposal: (proposal: NewProposal) => Promise<void>
  respondProposal: (id: string, action: 'accepted' | 'rejected' | 'cancelled') => Promise<void>
}

export const useTrocaStore = create<TrocaState>((set) => ({
  matches: [],
  proposals: [],
  loading: false,

  fetchMatches: async () => {
    const supabase = getSupabaseClient()
    set({ loading: true })
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { set({ loading: false }); return }

      // Matching em tempo real: bilateral puro — repetidas vs faltantes de cada lado.
      // Usa (supabase as any).rpc para preservar o `this` binding do cliente Supabase.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc(
        'get_matches_for_user',
        { p_user_id: user.id },
      )

      if (error || !data) { set({ loading: false }); return }

      set({ matches: data as MatchResult[], loading: false })
    } catch {
      set({ loading: false })
    }
  },

  fetchProposals: async () => {
    const supabase = getSupabaseClient()
    set({ loading: true })
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { set({ loading: false }); return }

      const { data, error } = await supabase
        .from('trade_proposals')
        .select('*')
        .or(`proposer_id.eq.${user.id},receiver_id.eq.${user.id}`)
        .order('created_at', { ascending: false })

      if (error || !data) { set({ loading: false }); return }

      set({ proposals: data as TradeProposal[], loading: false })
    } catch {
      set({ loading: false })
    }
  },

  sendProposal: async (proposal) => {
    const supabase = getSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('trade_proposals')
      .insert({
        proposer_id: user.id,
        receiver_id: proposal.receiver_id,
        stickers_offered: proposal.stickers_offered,
        stickers_requested: proposal.stickers_requested,
        status: 'pending',
      })
      .select()
      .single()

    if (data) {
      set((state) => ({
        proposals: [data as TradeProposal, ...state.proposals],
      }))
    }
  },

  respondProposal: async (id, action) => {
    const supabase = getSupabaseClient()
    await supabase
      .from('trade_proposals')
      .update({ status: action })
      .eq('id', id)

    set((state) => ({
      proposals: state.proposals.map((p) =>
        p.id === id ? { ...p, status: action } : p,
      ),
    }))
  },
}))
