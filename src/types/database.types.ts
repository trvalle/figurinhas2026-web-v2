export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      match_cache: {
        Row: {
          computed_at: string
          distance_km: number
          id: string
          is_bilateral: boolean
          match_score: number
          stickers_a_can_give: string[]
          stickers_b_can_give: string[]
          user_a_id: string
          user_a_revealed: boolean
          user_b_id: string
          user_b_revealed: boolean
        }
        Insert: {
          computed_at?: string
          distance_km: number
          id?: string
          is_bilateral: boolean
          match_score: number
          stickers_a_can_give: string[]
          stickers_b_can_give: string[]
          user_a_id: string
          user_a_revealed?: boolean
          user_b_id: string
          user_b_revealed?: boolean
        }
        Update: {
          computed_at?: string
          distance_km?: number
          id?: string
          is_bilateral?: boolean
          match_score?: number
          stickers_a_can_give?: string[]
          stickers_b_can_give?: string[]
          user_a_id?: string
          user_a_revealed?: boolean
          user_b_id?: string
          user_b_revealed?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "match_cache_user_a_id_fkey"
            columns: ["user_a_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_cache_user_a_id_fkey"
            columns: ["user_a_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_cache_user_b_id_fkey"
            columns: ["user_b_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_cache_user_b_id_fkey"
            columns: ["user_b_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      spatial_ref_sys: {
        Row: {
          auth_name: string | null
          auth_srid: number | null
          proj4text: string | null
          srid: number
          srtext: string | null
        }
        Insert: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid: number
          srtext?: string | null
        }
        Update: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid?: number
          srtext?: string | null
        }
        Relationships: []
      }
      sticker_catalog: {
        Row: {
          album_page: number
          country_code: string
          country_name: string
          group_label: string
          is_active: boolean
          number_in_team: number
          sticker_code: string
        }
        Insert: {
          album_page: number
          country_code: string
          country_name: string
          group_label: string
          is_active?: boolean
          number_in_team: number
          sticker_code: string
        }
        Update: {
          album_page?: number
          country_code?: string
          country_name?: string
          group_label?: string
          is_active?: boolean
          number_in_team?: number
          sticker_code?: string
        }
        Relationships: []
      }
      trade_proposals: {
        Row: {
          created_at: string
          id: string
          proposer_id: string
          proposer_whatsapp_revealed: boolean
          receiver_id: string
          receiver_whatsapp_revealed: boolean
          status: string
          stickers_offered: string[]
          stickers_requested: string[]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          proposer_id: string
          proposer_whatsapp_revealed?: boolean
          receiver_id: string
          receiver_whatsapp_revealed?: boolean
          status?: string
          stickers_offered: string[]
          stickers_requested: string[]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          proposer_id?: string
          proposer_whatsapp_revealed?: boolean
          receiver_id?: string
          receiver_whatsapp_revealed?: boolean
          status?: string
          stickers_offered?: string[]
          stickers_requested?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trade_proposals_proposer_id_fkey"
            columns: ["proposer_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_proposals_proposer_id_fkey"
            columns: ["proposer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_proposals_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_proposals_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_stickers: {
        Row: {
          id: string
          is_pasted: boolean
          quantity_owned: number
          sticker_code: string
          updated_at: string
          user_id: string
        }
        Insert: {
          id?: string
          is_pasted?: boolean
          quantity_owned?: number
          sticker_code: string
          updated_at?: string
          user_id: string
        }
        Update: {
          id?: string
          is_pasted?: boolean
          quantity_owned?: number
          sticker_code?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_stickers_sticker_code_fkey"
            columns: ["sticker_code"]
            isOneToOne: false
            referencedRelation: "sticker_catalog"
            referencedColumns: ["sticker_code"]
          },
          {
            foreignKeyName: "user_stickers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_stickers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          address_display: string
          cpf_hash: string | null
          created_at: string
          display_name: string
          expo_push_token: string | null
          id: string
          is_approved: boolean
          is_visible: boolean
          location: unknown
          notifications_enabled: boolean
          search_radius_km: number
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          address_display: string
          cpf_hash?: string | null
          created_at?: string
          display_name: string
          expo_push_token?: string | null
          id: string
          is_approved?: boolean
          is_visible?: boolean
          location?: unknown
          notifications_enabled?: boolean
          search_radius_km?: number
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          address_display?: string
          cpf_hash?: string | null
          created_at?: string
          display_name?: string
          expo_push_token?: string | null
          id?: string
          is_approved?: boolean
          is_visible?: boolean
          location?: unknown
          notifications_enabled?: boolean
          search_radius_km?: number
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      geography_columns: {
        Row: {
          coord_dimension: number | null
          f_geography_column: unknown
          f_table_catalog: unknown
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Relationships: []
      }
      geometry_columns: {
        Row: {
          coord_dimension: number | null
          f_geometry_column: unknown
          f_table_catalog: string | null
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Insert: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Update: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Relationships: []
      }
      public_profiles: {
        Row: {
          address_display: string | null
          display_name: string | null
          id: string | null
          is_visible: boolean | null
          search_radius_km: number | null
        }
        Insert: {
          address_display?: string | null
          display_name?: string | null
          id?: string | null
          is_visible?: boolean | null
          search_radius_km?: number | null
        }
        Update: {
          address_display?: string | null
          display_name?: string | null
          id?: string | null
          is_visible?: boolean | null
          search_radius_km?: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      approve_user: { Args: { target_user_id: string }; Returns: undefined }
      get_nearby_users: {
        Args: { p_radius_meters: number; p_user_id: string }
        Returns: {
          distance_km: number
          id: string
          notifications_enabled: boolean
        }[]
      }
      get_pending_users: {
        Args: never
        Returns: {
          address_display: string
          created_at: string
          display_name: string
          email: string
          id: string
          whatsapp: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      geometry_dump: {
        path: number[] | null
        geom: unknown
      }
      valid_detail: {
        valid: boolean | null
        reason: string | null
        location: unknown
      }
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
