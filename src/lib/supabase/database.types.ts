// Generated from the database by Supabase. After changing the database, regenerate:
//   npx supabase gen types typescript --project-id vfipnxfyzhldhryyrcwe > src/lib/supabase/database.types.ts
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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      addresses: {
        Row: {
          barangay: string
          city: string
          created_at: string
          id: string
          label: string
          landmark: string
          latitude: number | null
          longitude: number | null
          province: string
          street: string
          updated_at: string
          user_id: string
        }
        Insert: {
          barangay: string
          city: string
          created_at?: string
          id?: string
          label?: string
          landmark?: string
          latitude?: number | null
          longitude?: number | null
          province: string
          street: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          barangay?: string
          city?: string
          created_at?: string
          id?: string
          label?: string
          landmark?: string
          latitude?: number | null
          longitude?: number | null
          province?: string
          street?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "addresses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_events: {
        Row: {
          actor_id: string | null
          booking_id: string
          created_at: string
          event: string
          id: number
          note: string | null
          status: Database["public"]["Enums"]["booking_status"]
        }
        Insert: {
          actor_id?: string | null
          booking_id: string
          created_at?: string
          event: string
          id?: never
          note?: string | null
          status: Database["public"]["Enums"]["booking_status"]
        }
        Update: {
          actor_id?: string | null
          booking_id?: string
          created_at?: string
          event?: string
          id?: never
          note?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
        }
        Relationships: [
          {
            foreignKeyName: "booking_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_events_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          appliance: string
          barangay: string
          brand: string
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          category_id: string
          city: string
          completed_at: string | null
          created_at: string
          customer_id: string
          final_amount: number | null
          id: string
          inspection_fee: number
          landmark: string
          latitude: number | null
          longitude: number | null
          problem: string
          province: string
          scheduled_at: string
          status: Database["public"]["Enums"]["booking_status"]
          street: string
          technician_id: string | null
          updated_at: string
        }
        Insert: {
          appliance: string
          barangay: string
          brand?: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          category_id: string
          city: string
          completed_at?: string | null
          created_at?: string
          customer_id: string
          final_amount?: number | null
          id?: string
          inspection_fee: number
          landmark?: string
          latitude?: number | null
          longitude?: number | null
          problem: string
          province: string
          scheduled_at: string
          status?: Database["public"]["Enums"]["booking_status"]
          street: string
          technician_id?: string | null
          updated_at?: string
        }
        Update: {
          appliance?: string
          barangay?: string
          brand?: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          category_id?: string
          city?: string
          completed_at?: string | null
          created_at?: string
          customer_id?: string
          final_amount?: number | null
          id?: string
          inspection_fee?: number
          landmark?: string
          latitude?: number | null
          longitude?: number | null
          problem?: string
          province?: string
          scheduled_at?: string
          status?: Database["public"]["Enums"]["booking_status"]
          street?: string
          technician_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "service_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_reads: {
        Row: {
          booking_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          booking_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          booking_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_reads_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          booking_id: string
          created_at: string
          id: string
          sender_id: string
          technician_id: string | null
        }
        Insert: {
          body: string
          booking_id: string
          created_at?: string
          id?: string
          sender_id?: string
          technician_id?: string | null
        }
        Update: {
          body?: string
          booking_id?: string
          created_at?: string
          id?: string
          sender_id?: string
          technician_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          booking_id: string | null
          created_at: string
          id: string
          pushed_at: string | null
          read_at: string | null
          title: string
          url: string
          user_id: string
        }
        Insert: {
          body?: string
          booking_id?: string | null
          created_at?: string
          id?: string
          pushed_at?: string | null
          read_at?: string | null
          title: string
          url?: string
          user_id: string
        }
        Update: {
          body?: string
          booking_id?: string | null
          created_at?: string
          id?: string
          pushed_at?: string | null
          read_at?: string | null
          title?: string
          url?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string
          id: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string
          id: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
      phone_numbers: {
        Row: {
          phone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          phone: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          phone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "phone_numbers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          p256dh: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          p256dh: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          p256dh?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          booking_id: string
          created_at: string
          id: string
          items: Json
          note: string
          responded_at: string | null
          status: Database["public"]["Enums"]["quote_status"]
          technician_id: string
          total: number
        }
        Insert: {
          booking_id: string
          created_at?: string
          id?: string
          items: Json
          note?: string
          responded_at?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          technician_id: string
          total: number
        }
        Update: {
          booking_id?: string
          created_at?: string
          id?: string
          items?: Json
          note?: string
          responded_at?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          technician_id?: string
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "quotes_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          booking_id: string
          comment: string
          created_at: string
          customer_id: string
          customer_name: string
          rating: number
          technician_id: string
        }
        Insert: {
          booking_id: string
          comment?: string
          created_at?: string
          customer_id: string
          customer_name?: string
          rating: number
          technician_id: string
        }
        Update: {
          booking_id?: string
          comment?: string
          created_at?: string
          customer_id?: string
          customer_name?: string
          rating?: number
          technician_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      service_categories: {
        Row: {
          icon: string
          id: string
          inspection_fee: number
          is_active: boolean
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          icon?: string
          id?: string
          inspection_fee?: number
          is_active?: boolean
          name: string
          slug: string
          sort_order?: number
        }
        Update: {
          icon?: string
          id?: string
          inspection_fee?: number
          is_active?: boolean
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      technician_documents: {
        Row: {
          content_type: string
          file_name: string
          id: string
          kind: Database["public"]["Enums"]["document_kind"]
          size_bytes: number
          storage_path: string
          technician_id: string
          uploaded_at: string
        }
        Insert: {
          content_type: string
          file_name: string
          id?: string
          kind: Database["public"]["Enums"]["document_kind"]
          size_bytes: number
          storage_path: string
          technician_id?: string
          uploaded_at?: string
        }
        Update: {
          content_type?: string
          file_name?: string
          id?: string
          kind?: Database["public"]["Enums"]["document_kind"]
          size_bytes?: number
          storage_path?: string
          technician_id?: string
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "technician_documents_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "technician_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      technician_locations: {
        Row: {
          accuracy: number | null
          booking_id: string
          latitude: number
          longitude: number
          technician_id: string
          updated_at: string
        }
        Insert: {
          accuracy?: number | null
          booking_id: string
          latitude: number
          longitude: number
          technician_id: string
          updated_at?: string
        }
        Update: {
          accuracy?: number | null
          booking_id?: string
          latitude?: number
          longitude?: number
          technician_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "technician_locations_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "technician_locations_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      technician_profiles: {
        Row: {
          bio: string
          city: string
          created_at: string
          id: string
          is_available: boolean
          rating_avg: number
          rating_count: number
          updated_at: string
          verification_status: Database["public"]["Enums"]["verification_status"]
          verified_at: string | null
          years_experience: number | null
        }
        Insert: {
          bio?: string
          city?: string
          created_at?: string
          id: string
          is_available?: boolean
          rating_avg?: number
          rating_count?: number
          updated_at?: string
          verification_status?: Database["public"]["Enums"]["verification_status"]
          verified_at?: string | null
          years_experience?: number | null
        }
        Update: {
          bio?: string
          city?: string
          created_at?: string
          id?: string
          is_available?: boolean
          rating_avg?: number
          rating_count?: number
          updated_at?: string
          verification_status?: Database["public"]["Enums"]["verification_status"]
          verified_at?: string | null
          years_experience?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "technician_profiles_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      technician_services: {
        Row: {
          category_id: string
          technician_id: string
        }
        Insert: {
          category_id: string
          technician_id: string
        }
        Update: {
          category_id?: string
          technician_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "technician_services_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "service_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "technician_services_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "technician_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_booking: {
        Args: { booking_id: string }
        Returns: Database["public"]["Tables"]["bookings"]["Row"]
        SetofOptions: {
          from: "*"
          to: "bookings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_emails: {
        Args: { user_ids: string[] }
        Returns: {
          email: string
          id: string
        }[]
      }
      admin_overview: { Args: never; Returns: Json }
      admin_technicians: {
        Args: {
          status?: Database["public"]["Enums"]["verification_status"]
          technician_id?: string
        }
        Returns: {
          bio: string
          city: string
          email: string
          full_name: string
          id: string
          is_available: boolean
          joined_at: string
          jobs_completed: number
          rating_avg: number
          rating_count: number
          services: string[]
          verification_status: Database["public"]["Enums"]["verification_status"]
          verified_at: string
          years_experience: number
        }[]
      }
      assign_technician: {
        Args: { booking_id: string; technician_id: string }
        Returns: Database["public"]["Tables"]["bookings"]["Row"]
        SetofOptions: {
          from: "*"
          to: "bookings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cancel_booking: {
        Args: { booking_id: string; reason?: string }
        Returns: Database["public"]["Tables"]["bookings"]["Row"]
        SetofOptions: {
          from: "*"
          to: "bookings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      chat_conversations: {
        Args: never
        Returns: {
          appliance: string
          booking_id: string
          category: string
          is_customer: boolean
          last_at: string
          last_body: string
          last_from_me: boolean
          other_name: string
          status: Database["public"]["Enums"]["booking_status"]
          unread: number
        }[]
      }
      complete_booking: {
        Args: { booking_id: string }
        Returns: Database["public"]["Tables"]["bookings"]["Row"]
        SetofOptions: {
          from: "*"
          to: "bookings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_booking: {
        Args: {
          address_id: string
          appliance: string
          brand?: string
          category_id: string
          problem: string
          scheduled_at: string
          technician_id?: string
        }
        Returns: Database["public"]["Tables"]["bookings"]["Row"]
        SetofOptions: {
          from: "*"
          to: "bookings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      decline_booking: {
        Args: { booking_id: string; reason?: string }
        Returns: Database["public"]["Tables"]["bookings"]["Row"]
        SetofOptions: {
          from: "*"
          to: "bookings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      mark_arrived: {
        Args: { booking_id: string }
        Returns: Database["public"]["Tables"]["bookings"]["Row"]
        SetofOptions: {
          from: "*"
          to: "bookings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      mark_chat_read: { Args: { booking_id: string }; Returns: undefined }
      mark_en_route: {
        Args: { booking_id: string }
        Returns: Database["public"]["Tables"]["bookings"]["Row"]
        SetofOptions: {
          from: "*"
          to: "bookings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      respond_to_quote: {
        Args: { approve: boolean; quote_id: string }
        Returns: Database["public"]["Tables"]["bookings"]["Row"]
        SetofOptions: {
          from: "*"
          to: "bookings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      search_technicians: {
        Args: { max_results?: number; service_slugs?: string[]; terms?: string[] }
        Returns: {
          bio: string
          city: string
          full_name: string
          id: string
          is_available: boolean
          rating_avg: number
          rating_count: number
          services: string[]
          years_experience: number
        }[]
      }
      send_quote: {
        Args: { booking_id: string; items: Json; note?: string }
        Returns: Database["public"]["Tables"]["quotes"]["Row"]
        SetofOptions: {
          from: "*"
          to: "quotes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_technician_verification: {
        Args: {
          status: Database["public"]["Enums"]["verification_status"]
          technician_id: string
        }
        Returns: Database["public"]["Tables"]["technician_profiles"]["Row"]
        SetofOptions: {
          from: "*"
          to: "technician_profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      mark_notifications_read: { Args: never; Returns: undefined }
      push_forget: { Args: { endpoints: string[] }; Returns: undefined }
      push_public_key: { Args: never; Returns: string }
      push_store_keys: {
        Args: { private_jwk: Json; public_key: string }
        Returns: string
      }
      push_take_delivery: { Args: { notification_id: string }; Returns: Json }
      remove_push_subscription: {
        Args: { endpoint: string }
        Returns: undefined
      }
      save_push_subscription: {
        Args: { subscription: Json }
        Returns: undefined
      }
      send_test_notification: { Args: never; Returns: undefined }
      share_location: {
        Args: {
          accuracy?: number
          booking_id: string
          latitude: number
          longitude: number
        }
        Returns: undefined
      }
      submit_review: {
        Args: { booking_id: string; comment?: string; rating: number }
        Returns: Database["public"]["Tables"]["reviews"]["Row"]
        SetofOptions: {
          from: "*"
          to: "reviews"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      document_kind: "government_id" | "nbi_clearance" | "certificate"
      booking_status:
        | "requested"
        | "accepted"
        | "en_route"
        | "arrived"
        | "quoted"
        | "in_progress"
        | "completed"
        | "cancelled"
      quote_status: "pending" | "approved" | "declined"
      user_role: "customer" | "technician" | "admin"
      verification_status: "pending" | "approved" | "rejected" | "suspended"
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
