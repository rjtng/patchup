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
      account_suspensions: {
        Row: {
          reason: string
          suspended_at: string
          suspended_by: string | null
          user_id: string
        }
        Insert: {
          reason?: string
          suspended_at?: string
          suspended_by?: string | null
          user_id: string
        }
        Update: {
          reason?: string
          suspended_at?: string
          suspended_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_suspensions_suspended_by_fkey"
            columns: ["suspended_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_suspensions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
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
          last_minute: boolean
          note: string | null
          status: Database["public"]["Enums"]["booking_status"]
        }
        Insert: {
          actor_id?: string | null
          booking_id: string
          created_at?: string
          event: string
          id?: never
          last_minute?: boolean
          note?: string | null
          status: Database["public"]["Enums"]["booking_status"]
        }
        Update: {
          actor_id?: string | null
          booking_id?: string
          created_at?: string
          event?: string
          id?: never
          last_minute?: boolean
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
      booking_photos: {
        Row: {
          booking_id: string
          created_at: string
          id: string
          storage_path: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          id?: string
          storage_path: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          id?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_photos_booking_id_fkey"
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
          discount: number
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
          discount?: number
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
          discount?: number
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
      first_booking_offer: {
        Row: {
          amount: number
          id: boolean
          updated_at: string
        }
        Insert: {
          amount?: number
          id?: boolean
          updated_at?: string
        }
        Update: {
          amount?: number
          id?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          body: string
          booking_id: string
          created_at: string
          id: string
          removed_at: string | null
          sender_id: string
          technician_id: string | null
        }
        Insert: {
          body: string
          booking_id: string
          created_at?: string
          id?: string
          removed_at?: string | null
          sender_id?: string
          technician_id?: string | null
        }
        Update: {
          body?: string
          booking_id?: string
          created_at?: string
          id?: string
          removed_at?: string | null
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
      payout_bookings: {
        Row: {
          amount: number
          booking_id: string
          payout_id: string
        }
        Insert: {
          amount: number
          booking_id: string
          payout_id: string
        }
        Update: {
          amount?: number
          booking_id?: string
          payout_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payout_bookings_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payout_bookings_payout_id_fkey"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "payouts"
            referencedColumns: ["id"]
          },
        ]
      }
      payouts: {
        Row: {
          amount: number
          id: string
          paid_at: string
          paid_by: string | null
          reference: string
          technician_id: string
        }
        Insert: {
          amount: number
          id?: string
          paid_at?: string
          paid_by?: string | null
          reference?: string
          technician_id: string
        }
        Update: {
          amount?: number
          id?: string
          paid_at?: string
          paid_by?: string | null
          reference?: string
          technician_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payouts_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payouts_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      receipts: {
        Row: {
          booking_id: string
          issued_at: string
          number: number
        }
        Insert: {
          booking_id: string
          issued_at?: string
          number?: never
        }
        Update: {
          booking_id?: string
          issued_at?: string
          number?: never
        }
        Relationships: [
          {
            foreignKeyName: "receipts_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          booking_id: string
          created_at: string
          details: string
          id: string
          reason: string
          reporter_id: string
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
        }
        Insert: {
          booking_id: string
          created_at?: string
          details: string
          id?: string
          reason: string
          reporter_id: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Update: {
          booking_id?: string
          created_at?: string
          details?: string
          id?: string
          reason?: string
          reporter_id?: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reports_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_resolved_by_fkey"
            columns: ["resolved_by"]
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
          hidden_at: string | null
          rating: number
          technician_id: string
        }
        Insert: {
          booking_id: string
          comment?: string
          created_at?: string
          customer_id: string
          customer_name?: string
          hidden_at?: string | null
          rating: number
          technician_id: string
        }
        Update: {
          booking_id?: string
          comment?: string
          created_at?: string
          customer_id?: string
          customer_name?: string
          hidden_at?: string | null
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
      technician_hours: {
        Row: {
          first_visit: string
          last_visit: string
          technician_id: string
          weekday: number
        }
        Insert: {
          first_visit: string
          last_visit: string
          technician_id: string
          weekday: number
        }
        Update: {
          first_visit?: string
          last_visit?: string
          technician_id?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "technician_hours_technician_id_fkey"
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
      technician_time_off: {
        Row: {
          created_at: string
          ends_on: string
          id: string
          starts_on: string
          technician_id: string
        }
        Insert: {
          created_at?: string
          ends_on: string
          id?: string
          starts_on: string
          technician_id: string
        }
        Update: {
          created_at?: string
          ends_on?: string
          id?: string
          starts_on?: string
          technician_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "technician_time_off_technician_id_fkey"
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
      account_deletion_blocker: { Args: never; Returns: string }
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
      busy_times: {
        Args: { except_booking?: string; technician: string }
        Returns: string[]
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
      delete_my_account: { Args: never; Returns: undefined }
      first_booking_discount: { Args: never; Returns: number }
      last_minute_record: {
        Args: { person?: string }
        Returns: {
          booking_paused_until: string
          cancellations: number
          give_backs: number
        }[]
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
      report_problem: {
        Args: { booking_id: string; details: string; reason: string }
        Returns: Database["public"]["Tables"]["reports"]["Row"]
        SetofOptions: {
          from: "*"
          to: "reports"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reschedule_booking: {
        Args: { booking_id: string; scheduled_at: string }
        Returns: Database["public"]["Tables"]["bookings"]["Row"]
        SetofOptions: {
          from: "*"
          to: "bookings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      resolve_report: {
        Args: { note: string; report_id: string }
        Returns: Database["public"]["Tables"]["reports"]["Row"]
        SetofOptions: {
          from: "*"
          to: "reports"
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
      set_customer_suspended: {
        Args: { customer_id: string; reason?: string; suspended: boolean }
        Returns: boolean
      }
      set_message_removed: {
        Args: { message_id: string; removed: boolean }
        Returns: undefined
      }
      set_review_hidden: {
        Args: { booking_id: string; hidden: boolean }
        Returns: Database["public"]["Tables"]["reviews"]["Row"]
        SetofOptions: {
          from: "*"
          to: "reviews"
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
      add_time_off: {
        Args: { ends_on: string; starts_on: string }
        Returns: Database["public"]["Tables"]["technician_time_off"]["Row"]
        SetofOptions: {
          from: "*"
          to: "technician_time_off"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      remove_time_off: { Args: { time_off_id: string }; Returns: undefined }
      set_working_hours: {
        Args: { days: Json }
        Returns: Database["public"]["Tables"]["technician_hours"]["Row"][]
        SetofOptions: {
          from: "*"
          to: "technician_hours"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      mark_notifications_read: { Args: never; Returns: undefined }
      paybacks: {
        Args: { technician?: string }
        Returns: {
          amount: number
          appliance: string
          booking_id: string
          category: string
          completed_at: string
          paid_at: string
          payout_id: string
          technician_id: string
          technician_name: string
        }[]
      }
      push_forget: { Args: { endpoints: string[] }; Returns: undefined }
      push_public_key: { Args: never; Returns: string }
      push_store_keys: {
        Args: { private_jwk: Json; public_key: string }
        Returns: string
      }
      push_take_delivery: { Args: { notification_id: string }; Returns: Json }
      record_payout: {
        Args: { amount: number; reference?: string; technician: string }
        Returns: {
          amount: number
          id: string
          paid_at: string
          paid_by: string | null
          reference: string
          technician_id: string
        }
        SetofOptions: {
          from: "*"
          to: "payouts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
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
      start_account_deletion: {
        Args: never
        Returns: {
          bucket: string
          path: string
        }[]
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
      top_technicians: {
        Args: { max_results?: number; near_city?: string }
        Returns: {
          city: string
          full_name: string
          id: string
          rating_avg: number
          rating_count: number
          services: string[]
        }[]
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
