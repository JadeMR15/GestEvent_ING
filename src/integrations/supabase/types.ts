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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      email_log: {
        Row: {
          event_id: string
          id: string
          recipient_count: number
          sent_at: string
          type: Database["public"]["Enums"]["email_log_type"]
        }
        Insert: {
          event_id: string
          id?: string
          recipient_count?: number
          sent_at?: string
          type: Database["public"]["Enums"]["email_log_type"]
        }
        Update: {
          event_id?: string
          id?: string
          recipient_count?: number
          sent_at?: string
          type?: Database["public"]["Enums"]["email_log_type"]
        }
        Relationships: []
      }
      event_media: {
        Row: {
          caption: string
          created_at: string
          event_id: string
          id: string
          sort_order: number
          type: string
          url: string
        }
        Insert: {
          caption?: string
          created_at?: string
          event_id: string
          id?: string
          sort_order?: number
          type?: string
          url: string
        }
        Update: {
          caption?: string
          created_at?: string
          event_id?: string
          id?: string
          sort_order?: number
          type?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_media_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          association: string
          capacity: number
          city: string
          cover_image_url: string | null
          created_at: string
          description: string
          id: string
          latitude: number | null
          location: string
          longitude: number | null
          max_per_person: number
          organizer_id: string
          price: number
          required_document: string
          school: string
          starts_at: string
          status: string
          title: string
          updated_at: string
          waitlist_member_priority: boolean
        }
        Insert: {
          association?: string
          capacity?: number
          city?: string
          cover_image_url?: string | null
          created_at?: string
          description?: string
          id?: string
          latitude?: number | null
          location?: string
          longitude?: number | null
          max_per_person?: number
          organizer_id: string
          price?: number
          required_document?: string
          school?: string
          starts_at: string
          status?: string
          title: string
          updated_at?: string
          waitlist_member_priority?: boolean
        }
        Update: {
          association?: string
          capacity?: number
          city?: string
          cover_image_url?: string | null
          created_at?: string
          description?: string
          id?: string
          latitude?: number | null
          location?: string
          longitude?: number | null
          max_per_person?: number
          organizer_id?: string
          price?: number
          required_document?: string
          school?: string
          starts_at?: string
          status?: string
          title?: string
          updated_at?: string
          waitlist_member_priority?: boolean
        }
        Relationships: []
      }
      profiles: {
        Row: {
          association: string
          avatar_path: string | null
          birth_date: string | null
          created_at: string
          full_name: string
          gender: string | null
          id: string
          school: string
          school_email: string | null
          student_doc_path: string | null
          updated_at: string
          verification_attempts: number
          verification_audited_at: string | null
          verification_audited_by: string | null
          verification_auto: boolean
          verification_checks: Json | null
          verification_expires_at: string | null
          verification_method: string | null
          verification_note: string | null
          verification_status: Database["public"]["Enums"]["verification_status"]
          verified_at: string | null
        }
        Insert: {
          association?: string
          avatar_path?: string | null
          birth_date?: string | null
          created_at?: string
          full_name?: string
          gender?: string | null
          id: string
          school?: string
          school_email?: string | null
          student_doc_path?: string | null
          updated_at?: string
          verification_attempts?: number
          verification_audited_at?: string | null
          verification_audited_by?: string | null
          verification_auto?: boolean
          verification_checks?: Json | null
          verification_expires_at?: string | null
          verification_method?: string | null
          verification_note?: string | null
          verification_status?: Database["public"]["Enums"]["verification_status"]
          verified_at?: string | null
        }
        Update: {
          association?: string
          avatar_path?: string | null
          birth_date?: string | null
          created_at?: string
          full_name?: string
          gender?: string | null
          id?: string
          school?: string
          school_email?: string | null
          student_doc_path?: string | null
          updated_at?: string
          verification_attempts?: number
          verification_audited_at?: string | null
          verification_audited_by?: string | null
          verification_auto?: boolean
          verification_checks?: Json | null
          verification_expires_at?: string | null
          verification_method?: string | null
          verification_note?: string | null
          verification_status?: Database["public"]["Enums"]["verification_status"]
          verified_at?: string | null
        }
        Relationships: []
      }
      registrations: {
        Row: {
          attended_at: string | null
          document_url: string | null
          event_id: string
          expires_at: string | null
          guest_email: string | null
          guest_name: string | null
          id: string
          qr_code: string
          registered_at: string
          status: Database["public"]["Enums"]["registration_status"]
          ticket_type_id: string | null
          user_id: string
        }
        Insert: {
          attended_at?: string | null
          document_url?: string | null
          event_id: string
          expires_at?: string | null
          guest_email?: string | null
          guest_name?: string | null
          id?: string
          qr_code?: string
          registered_at?: string
          status?: Database["public"]["Enums"]["registration_status"]
          ticket_type_id?: string | null
          user_id: string
        }
        Update: {
          attended_at?: string | null
          document_url?: string | null
          event_id?: string
          expires_at?: string | null
          guest_email?: string | null
          guest_name?: string | null
          id?: string
          qr_code?: string
          registered_at?: string
          status?: Database["public"]["Enums"]["registration_status"]
          ticket_type_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "registrations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registrations_ticket_type_id_fkey"
            columns: ["ticket_type_id"]
            isOneToOne: false
            referencedRelation: "ticket_types"
            referencedColumns: ["id"]
          },
        ]
      }
      school_domain_requests: {
        Row: {
          admin_note: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          domain: string
          email: string
          id: string
          status: string
          user_id: string
        }
        Insert: {
          admin_note?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          domain: string
          email: string
          id?: string
          status?: string
          user_id: string
        }
        Update: {
          admin_note?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          domain?: string
          email?: string
          id?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      school_domains: {
        Row: {
          active: boolean
          created_at: string
          domain: string
          id: string
          school_name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          domain: string
          id?: string
          school_name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          domain?: string
          id?: string
          school_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      school_email_tokens: {
        Row: {
          created_at: string
          email: string
          expires_at: string
          id: string
          token_hash: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          token_hash: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          token_hash?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      ticket_types: {
        Row: {
          capacity: number
          description: string
          event_id: string
          id: string
          name: string
          price: number
          sort_order: number
        }
        Insert: {
          capacity?: number
          description?: string
          event_id: string
          id?: string
          name: string
          price?: number
          sort_order?: number
        }
        Update: {
          capacity?: number
          description?: string
          event_id?: string
          id?: string
          name?: string
          price?: number
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "ticket_types_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
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
      volunteers: {
        Row: {
          created_at: string
          email: string | null
          event_id: string
          id: string
          name: string | null
          role_name: string | null
          status: Database["public"]["Enums"]["volunteer_status"]
          token: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          event_id: string
          id?: string
          name?: string | null
          role_name?: string | null
          status?: Database["public"]["Enums"]["volunteer_status"]
          token?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          event_id?: string
          id?: string
          name?: string | null
          role_name?: string | null
          status?: Database["public"]["Enums"]["volunteer_status"]
          token?: string
          user_id?: string | null
        }
        Relationships: []
      }
      waitlist: {
        Row: {
          event_id: string
          id: string
          joined_at: string
          offer_expires_at: string | null
          offer_notified_at: string | null
          offered_at: string | null
          position: number
          priority: number
          responded_at: string | null
          status: Database["public"]["Enums"]["waitlist_status"]
          user_id: string
        }
        Insert: {
          event_id: string
          id?: string
          joined_at?: string
          offer_expires_at?: string | null
          offer_notified_at?: string | null
          offered_at?: string | null
          position?: number
          priority?: number
          responded_at?: string | null
          status?: Database["public"]["Enums"]["waitlist_status"]
          user_id: string
        }
        Update: {
          event_id?: string
          id?: string
          joined_at?: string
          offer_expires_at?: string | null
          offer_notified_at?: string | null
          offered_at?: string | null
          position?: number
          priority?: number
          responded_at?: string | null
          status?: Database["public"]["Enums"]["waitlist_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "waitlist_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      waitlist_legacy: {
        Row: {
          confirmation_deadline: string | null
          created_at: string
          event_id: string
          id: string
          participant_id: string
          position: number
        }
        Insert: {
          confirmation_deadline?: string | null
          created_at?: string
          event_id: string
          id?: string
          participant_id: string
          position: number
        }
        Update: {
          confirmation_deadline?: string | null
          created_at?: string
          event_id?: string
          id?: string
          participant_id?: string
          position?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_email_webhook_secret: {
        Args: { _secret: string }
        Returns: boolean
      }
      claim_waitlist_notifications: {
        Args: { _limit?: number }
        Returns: {
          event_id: string
          id: string
          offer_expires_at: string
          user_id: string
        }[]
      }
      classify_school_email: { Args: { _email: string }; Returns: Json }
      consume_school_email_token: {
        Args: { _token_hash: string }
        Returns: Json
      }
      email_domain: { Args: { _email: string }; Returns: string }
      event_raw_free_spots: { Args: { _event_id: string }; Returns: number }
      expire_student_verifications: { Args: never; Returns: number }
      expire_waitlist_offers: { Args: never; Returns: number }
      get_event_availability: { Args: { _event_id: string }; Returns: Json }
      get_event_checkin_stats: { Args: { p_event_id: string }; Returns: Json }
      get_event_organizer_email: {
        Args: { p_event_id: string }
        Returns: string
      }
      get_event_waitlist: {
        Args: { _event_id: string }
        Returns: {
          full_name: string
          joined_at: string
          offer_expires_at: string
          rank: number
          status: Database["public"]["Enums"]["waitlist_status"]
          user_id: string
        }[]
      }
      get_my_waitlist: {
        Args: { _event_id?: string }
        Returns: {
          event_cover_image_url: string
          event_id: string
          event_location: string
          event_starts_at: string
          event_title: string
          id: string
          joined_at: string
          offer_expires_at: string
          offered_at: string
          rank: number
          status: Database["public"]["Enums"]["waitlist_status"]
        }[]
      }
      get_participant_emails: {
        Args: { _event_id: string }
        Returns: {
          email: string
          full_name: string
          user_id: string
        }[]
      }
      get_public_events: {
        Args: never
        Returns: {
          association: string
          capacity: number
          city: string
          cover_image_url: string | null
          created_at: string
          description: string
          id: string
          latitude: number | null
          location: string
          longitude: number | null
          max_per_person: number
          organizer_id: string
          price: number
          required_document: string
          school: string
          starts_at: string
          status: string
          title: string
          updated_at: string
          waitlist_member_priority: boolean
        }[]
        SetofOptions: {
          from: "*"
          to: "events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_volunteer_by_token: { Args: { p_token: string }; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_association_member: {
        Args: { _event_id: string; _user_id: string }
        Returns: boolean
      }
      is_public_email_domain: { Args: { _domain: string }; Returns: boolean }
      is_verified: { Args: { _user_id: string }; Returns: boolean }
      join_waitlist: { Args: { _event_id: string }; Returns: Json }
      leave_waitlist: { Args: { _event_id: string }; Returns: undefined }
      offer_next_spot: { Args: { _event_id: string }; Returns: number }
      pick_verification_audits: {
        Args: { _count?: number }
        Returns: {
          full_name: string
          id: string
          school: string
          verification_checks: Json
          verification_note: string
          verified_at: string
        }[]
      }
      process_waitlist: { Args: never; Returns: undefined }
      record_verification_audit: {
        Args: { _note?: string; _ok: boolean; _user_id: string }
        Returns: undefined
      }
      release_expired_reservations: { Args: never; Returns: undefined }
      school_year_end: { Args: { _at?: string }; Returns: string }
      update_event: {
        Args: {
          _association: string
          _capacity: number
          _cover_image_url: string
          _description: string
          _event_id: string
          _location: string
          _price: number
          _school: string
          _starts_at: string
          _status: string
          _title: string
        }
        Returns: undefined
      }
      verification_audit_stats: { Args: never; Returns: Json }
      volunteer_checkin: {
        Args: { _qr_code: string; _token: string }
        Returns: Json
      }
      waitlist_rank: { Args: { _entry_id: string }; Returns: number }
    }
    Enums: {
      app_role: "admin" | "organizer" | "participant" | "volunteer"
      email_log_type:
        | "confirmation"
        | "reminder"
        | "cancellation"
        | "waitlist"
        | "custom"
      event_status: "draft" | "published" | "cancelled" | "completed"
      registration_status:
        | "pending"
        | "registered"
        | "waitlisted"
        | "attended"
        | "cancelled"
      user_role: "admin" | "organizer" | "participant"
      verification_status:
        | "unverified"
        | "pending"
        | "review"
        | "verified"
        | "rejected"
      volunteer_status: "active" | "inactive"
      waitlist_status: "waiting" | "offered" | "accepted" | "expired" | "left"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["admin", "organizer", "participant", "volunteer"],
      email_log_type: [
        "confirmation",
        "reminder",
        "cancellation",
        "waitlist",
        "custom",
      ],
      event_status: ["draft", "published", "cancelled", "completed"],
      registration_status: [
        "pending",
        "registered",
        "waitlisted",
        "attended",
        "cancelled",
      ],
      user_role: ["admin", "organizer", "participant"],
      verification_status: [
        "unverified",
        "pending",
        "review",
        "verified",
        "rejected",
      ],
      volunteer_status: ["active", "inactive"],
      waitlist_status: ["waiting", "offered", "accepted", "expired", "left"],
    },
  },
} as const
