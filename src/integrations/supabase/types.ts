export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      broker_mapping: {
        Row: {
          ativo: boolean
          corretor_nome: string
          created_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ativo?: boolean
          corretor_nome: string
          created_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ativo?: boolean
          corretor_nome?: string
          created_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "broker_mapping_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_requests: {
        Row: {
          bonus_corretor: number
          corretor_user_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          motivo_negacao: string | null
          observacao_corretor: string | null
          observacao_financeiro: string | null
          paid_at: string | null
          sale_id: string
          status: Database["public"]["Enums"]["request_status"]
          tipo: Database["public"]["Enums"]["request_type"]
          updated_at: string
          valor_sinal: number
          valor_solicitado: number
        }
        Insert: {
          bonus_corretor?: number
          corretor_user_id: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          motivo_negacao?: string | null
          observacao_corretor?: string | null
          observacao_financeiro?: string | null
          paid_at?: string | null
          sale_id: string
          status?: Database["public"]["Enums"]["request_status"]
          tipo?: Database["public"]["Enums"]["request_type"]
          updated_at?: string
          valor_sinal?: number
          valor_solicitado: number
        }
        Update: {
          bonus_corretor?: number
          corretor_user_id?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          motivo_negacao?: string | null
          observacao_corretor?: string | null
          observacao_financeiro?: string | null
          paid_at?: string | null
          sale_id?: string
          status?: Database["public"]["Enums"]["request_status"]
          tipo?: Database["public"]["Enums"]["request_type"]
          updated_at?: string
          valor_sinal?: number
          valor_solicitado?: number
        }
        Relationships: [
          {
            foreignKeyName: "commission_requests_corretor_user_id_fkey"
            columns: ["corretor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_requests_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      config_kv: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      nf_requests: {
        Row: {
          arquivo_nf_url: string | null
          cancelada_at: string | null
          corretor_user_id: string
          created_at: string
          drive_file_id: string | null
          emitida_at: string | null
          id: string
          numero_nf: string | null
          observacao_corretor: string | null
          observacao_financeiro: string | null
          observacao_recebimento: string | null
          recebida_at: string | null
          sale_id: string
          solicitado_por: string
          status: Database["public"]["Enums"]["nf_status"]
          updated_at: string
        }
        Insert: {
          arquivo_nf_url?: string | null
          cancelada_at?: string | null
          corretor_user_id: string
          created_at?: string
          drive_file_id?: string | null
          emitida_at?: string | null
          id?: string
          numero_nf?: string | null
          observacao_corretor?: string | null
          observacao_financeiro?: string | null
          observacao_recebimento?: string | null
          recebida_at?: string | null
          sale_id: string
          solicitado_por: string
          status?: Database["public"]["Enums"]["nf_status"]
          updated_at?: string
        }
        Update: {
          arquivo_nf_url?: string | null
          cancelada_at?: string | null
          corretor_user_id?: string
          created_at?: string
          drive_file_id?: string | null
          emitida_at?: string | null
          id?: string
          numero_nf?: string | null
          observacao_corretor?: string | null
          observacao_financeiro?: string | null
          observacao_recebimento?: string | null
          recebida_at?: string | null
          sale_id?: string
          solicitado_por?: string
          status?: Database["public"]["Enums"]["nf_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nf_requests_corretor_user_id_fkey"
            columns: ["corretor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nf_requests_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nf_requests_solicitado_por_fkey"
            columns: ["solicitado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
        }
        Relationships: []
      }
      request_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          payload: Json | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          payload?: Json | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          payload?: Json | null
        }
        Relationships: []
      }
      sales: {
        Row: {
          adiant_corretor: number | null
          adiant_gerente: number | null
          bonus_corretor: number | null
          bonus_gerente: number | null
          coaphar: string | null
          comissao_bruta: number | null
          comissao_ger_bruta: number | null
          comissao_liq_corretor: number | null
          comissao_liq_gerente: number | null
          comprador: string | null
          corretor: string | null
          created_at: string
          data: string | null
          empreendimento: string | null
          gerente: string | null
          id: string
          mes_ano: string | null
          observacoes: string | null
          pct_corretor: number | null
          pct_gerente: number | null
          row_hash: string | null
          status: string | null
          unidade: string | null
          updated_at: string
          valor_venda: number | null
        }
        Insert: {
          adiant_corretor?: number | null
          adiant_gerente?: number | null
          bonus_corretor?: number | null
          bonus_gerente?: number | null
          coaphar?: string | null
          comissao_bruta?: number | null
          comissao_ger_bruta?: number | null
          comissao_liq_corretor?: number | null
          comissao_liq_gerente?: number | null
          comprador?: string | null
          corretor?: string | null
          created_at?: string
          data?: string | null
          empreendimento?: string | null
          gerente?: string | null
          id?: string
          mes_ano?: string | null
          observacoes?: string | null
          pct_corretor?: number | null
          pct_gerente?: number | null
          row_hash?: string | null
          status?: string | null
          unidade?: string | null
          updated_at?: string
          valor_venda?: number | null
        }
        Update: {
          adiant_corretor?: number | null
          adiant_gerente?: number | null
          bonus_corretor?: number | null
          bonus_gerente?: number | null
          coaphar?: string | null
          comissao_bruta?: number | null
          comissao_ger_bruta?: number | null
          comissao_liq_corretor?: number | null
          comissao_liq_gerente?: number | null
          comprador?: string | null
          corretor?: string | null
          created_at?: string
          data?: string | null
          empreendimento?: string | null
          gerente?: string | null
          id?: string
          mes_ano?: string | null
          observacoes?: string | null
          pct_corretor?: number | null
          pct_gerente?: number | null
          row_hash?: string | null
          status?: string | null
          unidade?: string | null
          updated_at?: string
          valor_venda?: number | null
        }
        Relationships: []
      }
      sync_log: {
        Row: {
          error: string | null
          finished_at: string | null
          id: string
          rows_imported: number | null
          started_at: string
          status: string
        }
        Insert: {
          error?: string | null
          finished_at?: string | null
          id?: string
          rows_imported?: number | null
          started_at?: string
          status?: string
        }
        Update: {
          error?: string | null
          finished_at?: string | null
          id?: string
          rows_imported?: number | null
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_financeiro: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "diretor" | "gerente" | "corretor" | "financeiro"
      nf_status: "solicitada" | "emitida" | "recebida" | "cancelada"
      request_status: "pendente" | "aprovado" | "negado" | "pago"
      request_type: "adiantamento" | "comissao_final"
    }
    CompositeTypes: {
      [_ in never]: never
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
    Enums: {
      app_role: ["admin", "diretor", "gerente", "corretor", "financeiro"],
      nf_status: ["solicitada", "emitida", "recebida", "cancelada"],
      request_status: ["pendente", "aprovado", "negado", "pago"],
      request_type: ["adiantamento", "comissao_final"],
    },
  },
} as const
