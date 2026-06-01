'use client'
import { create } from 'zustand'
import { getSupabaseClient } from '../services/supabase'
import type { UserProfile } from '../types/app.types'

interface UserState {
  profile: UserProfile | null
  loading: boolean
  fetchProfile: () => Promise<void>
  updateProfile: (data: Partial<UserProfile>) => Promise<void>
  clearProfile: () => void
}

export const useUserStore = create<UserState>((set) => ({
  profile: null,
  loading: false,

  fetchProfile: async () => {
    const supabase = getSupabaseClient()
    set({ loading: true })
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { set({ profile: null, loading: false }); return }

      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single()

      if (error) { set({ profile: null, loading: false }); return }

      set({
        profile: {
          id: data.id,
          display_name: data.display_name,
          address_display: data.address_display,
          whatsapp: data.whatsapp ?? undefined,
          search_radius_km: data.search_radius_km,
          notifications_enabled: data.notifications_enabled,
          is_visible: data.is_visible,
          created_at: data.created_at,
          updated_at: data.updated_at,
        },
        loading: false,
      })
    } catch {
      set({ profile: null, loading: false })
    }
  },

  updateProfile: async (data) => {
    const supabase = getSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    set({ loading: true })
    try {
      await supabase.from('users').update(data).eq('id', user.id)
      const { data: updated } = await supabase
        .from('users').select('*').eq('id', user.id).single()
      if (updated) {
        set({
          profile: {
            id: updated.id,
            display_name: updated.display_name,
            address_display: updated.address_display,
            whatsapp: updated.whatsapp ?? undefined,
            search_radius_km: updated.search_radius_km,
            notifications_enabled: updated.notifications_enabled,
            is_visible: updated.is_visible,
            created_at: updated.created_at,
            updated_at: updated.updated_at,
          },
        })
      }
    } finally {
      set({ loading: false })
    }
  },

  clearProfile: () => set({ profile: null }),
}))
