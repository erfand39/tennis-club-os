export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      attendance_records: {
        Row: {
          location_id: string
          organization_id: string
          participant_id: string
          recorded_at: string
          recorded_by: string
          status: Database["public"]["Enums"]["attendance_status"]
        }
        ComputedFields: never
        Insert: {
          location_id: string
          organization_id: string
          participant_id: string
          recorded_at?: string
          recorded_by: string
          status: Database["public"]["Enums"]["attendance_status"]
        }
        Update: {
          location_id?: string
          organization_id?: string
          participant_id?: string
          recorded_at?: string
          recorded_by?: string
          status?: Database["public"]["Enums"]["attendance_status"]
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_organization_id_location_id_participant_fkey"
            columns: ["organization_id", "location_id", "participant_id"]
            isOneToOne: false
            referencedRelation: "session_participants"
            referencedColumns: ["organization_id", "location_id", "id"]
          },
        ]
      }
      booking_prices: {
        Row: {
          amount_minor: number
          booked_minutes: number
          booking_id: string
          court_id: string
          currency: string
          kind: Database["public"]["Enums"]["booking_kind"]
          location_id: string
          organization_id: string
          pricing_rule_id: string
          unit_amount_minor: number
          unit_minutes: number
        }
        ComputedFields: never
        Insert: {
          amount_minor: number
          booked_minutes: number
          booking_id: string
          court_id: string
          currency: string
          kind: Database["public"]["Enums"]["booking_kind"]
          location_id: string
          organization_id: string
          pricing_rule_id: string
          unit_amount_minor: number
          unit_minutes: number
        }
        Update: {
          amount_minor?: number
          booked_minutes?: number
          booking_id?: string
          court_id?: string
          currency?: string
          kind?: Database["public"]["Enums"]["booking_kind"]
          location_id?: string
          organization_id?: string
          pricing_rule_id?: string
          unit_amount_minor?: number
          unit_minutes?: number
        }
        Relationships: [
          {
            foreignKeyName: "booking_prices_organization_id_location_id_court_id_kind_b_fkey"
            columns: [
              "organization_id",
              "location_id",
              "court_id",
              "kind",
              "booking_id",
            ]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: [
              "organization_id",
              "location_id",
              "court_id",
              "kind",
              "id",
            ]
          },
          {
            foreignKeyName: "booking_prices_organization_id_location_id_court_id_kind_p_fkey"
            columns: [
              "organization_id",
              "location_id",
              "court_id",
              "kind",
              "pricing_rule_id",
            ]
            isOneToOne: false
            referencedRelation: "pricing_rules"
            referencedColumns: [
              "organization_id",
              "location_id",
              "court_id",
              "kind",
              "id",
            ]
          },
        ]
      }
      bookings: {
        Row: {
          booker_name: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          court_id: string
          created_at: string
          created_by: string
          ends_at: string | null
          id: string
          kind: Database["public"]["Enums"]["booking_kind"]
          location_id: string
          organization_id: string
          revision: number
          slot: unknown
          starts_at: string | null
          status: Database["public"]["Enums"]["booking_status"]
          timezone: string
        }
        ComputedFields: never
        Insert: {
          booker_name?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          court_id: string
          created_at?: string
          created_by: string
          ends_at?: never
          id?: string
          kind: Database["public"]["Enums"]["booking_kind"]
          location_id: string
          organization_id: string
          revision?: number
          slot: unknown
          starts_at?: never
          status?: Database["public"]["Enums"]["booking_status"]
          timezone: string
        }
        Update: {
          booker_name?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          court_id?: string
          created_at?: string
          created_by?: string
          ends_at?: never
          id?: string
          kind?: Database["public"]["Enums"]["booking_kind"]
          location_id?: string
          organization_id?: string
          revision?: number
          slot?: unknown
          starts_at?: never
          status?: Database["public"]["Enums"]["booking_status"]
          timezone?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_organization_id_location_id_court_id_fkey"
            columns: ["organization_id", "location_id", "court_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["organization_id", "location_id", "id"]
          },
        ]
      }
      club_expenses: {
        Row: {
          amount_minor: number
          category: string
          created_at: string
          created_by: string
          currency: string
          effective_on: string
          id: string
          location_id: string
          method: Database["public"]["Enums"]["payment_method"]
          organization_id: string
          title: string
          void_reason: string | null
          voided_at: string | null
        }
        ComputedFields: never
        Insert: {
          amount_minor: number
          category: string
          created_at?: string
          created_by: string
          currency: string
          effective_on: string
          id?: string
          location_id: string
          method: Database["public"]["Enums"]["payment_method"]
          organization_id: string
          title: string
          void_reason?: string | null
          voided_at?: string | null
        }
        Update: {
          amount_minor?: number
          category?: string
          created_at?: string
          created_by?: string
          currency?: string
          effective_on?: string
          id?: string
          location_id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          organization_id?: string
          title?: string
          void_reason?: string | null
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "club_expenses_organization_id_location_id_fkey"
            columns: ["organization_id", "location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      coach_availability: {
        Row: {
          coach_id: string
          id: string
          local_minutes: unknown
          location_id: string
          organization_id: string
          valid_dates: unknown
          weekday: number
        }
        ComputedFields: never
        Insert: {
          coach_id: string
          id?: string
          local_minutes: unknown
          location_id: string
          organization_id: string
          valid_dates: unknown
          weekday: number
        }
        Update: {
          coach_id?: string
          id?: string
          local_minutes?: unknown
          location_id?: string
          organization_id?: string
          valid_dates?: unknown
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "coach_availability_organization_id_location_id_coach_id_fkey"
            columns: ["organization_id", "location_id", "coach_id"]
            isOneToOne: false
            referencedRelation: "coach_locations"
            referencedColumns: ["organization_id", "location_id", "coach_id"]
          },
        ]
      }
      coach_courts: {
        Row: {
          coach_id: string
          court_id: string
          location_id: string
          organization_id: string
        }
        ComputedFields: never
        Insert: {
          coach_id: string
          court_id: string
          location_id: string
          organization_id: string
        }
        Update: {
          coach_id?: string
          court_id?: string
          location_id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_courts_organization_id_location_id_coach_id_fkey"
            columns: ["organization_id", "location_id", "coach_id"]
            isOneToOne: false
            referencedRelation: "coach_locations"
            referencedColumns: ["organization_id", "location_id", "coach_id"]
          },
          {
            foreignKeyName: "coach_courts_organization_id_location_id_court_id_fkey"
            columns: ["organization_id", "location_id", "court_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["organization_id", "location_id", "id"]
          },
        ]
      }
      coach_locations: {
        Row: {
          active: boolean
          coach_id: string
          location_id: string
          organization_id: string
        }
        ComputedFields: never
        Insert: {
          active?: boolean
          coach_id: string
          location_id: string
          organization_id: string
        }
        Update: {
          active?: boolean
          coach_id?: string
          location_id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_locations_organization_id_coach_id_fkey"
            columns: ["organization_id", "coach_id"]
            isOneToOne: false
            referencedRelation: "coach_profiles"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "coach_locations_organization_id_location_id_fkey"
            columns: ["organization_id", "location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      coach_payables: {
        Row: {
          amount_minor: number | null
          approved_at: string | null
          basis_minor: number | null
          currency: string
          id: string
          location_id: string
          manual_amount_minor: number | null
          organization_id: string
          paid_at: string | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          payment_reference: string | null
          session_id: string
          status: string
        }
        ComputedFields: never
        Insert: {
          amount_minor?: number | null
          approved_at?: string | null
          basis_minor?: number | null
          currency: string
          id?: string
          location_id: string
          manual_amount_minor?: number | null
          organization_id: string
          paid_at?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          payment_reference?: string | null
          session_id: string
          status?: string
        }
        Update: {
          amount_minor?: number | null
          approved_at?: string | null
          basis_minor?: number | null
          currency?: string
          id?: string
          location_id?: string
          manual_amount_minor?: number | null
          organization_id?: string
          paid_at?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          payment_reference?: string | null
          session_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_payables_organization_id_location_id_session_id_fkey"
            columns: ["organization_id", "location_id", "session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["organization_id", "location_id", "id"]
          },
        ]
      }
      coach_payment_adjustments: {
        Row: {
          delta_minor: number
          effective_at: string
          id: string
          location_id: string
          organization_id: string
          payable_id: string
          reason: string
          recorded_by: string
        }
        ComputedFields: never
        Insert: {
          delta_minor: number
          effective_at?: string
          id?: string
          location_id: string
          organization_id: string
          payable_id: string
          reason: string
          recorded_by: string
        }
        Update: {
          delta_minor?: number
          effective_at?: string
          id?: string
          location_id?: string
          organization_id?: string
          payable_id?: string
          reason?: string
          recorded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_payment_adjustments_organization_id_location_id_paya_fkey"
            columns: ["organization_id", "location_id", "payable_id"]
            isOneToOne: false
            referencedRelation: "coach_payables"
            referencedColumns: ["organization_id", "location_id", "id"]
          },
        ]
      }
      coach_profiles: {
        Row: {
          contact_email: string | null
          contact_phone: string | null
          id: string
          joined_on: string | null
          name: string
          notes: string | null
          organization_id: string
          pay_amount_minor: number | null
          pay_basis: string | null
          qualification: string | null
          revision: number
          specialty: string | null
          status: Database["public"]["Enums"]["resource_status"]
          updated_at: string
          user_id: string | null
        }
        ComputedFields: never
        Insert: {
          contact_email?: string | null
          contact_phone?: string | null
          id?: string
          joined_on?: string | null
          name: string
          notes?: string | null
          organization_id: string
          pay_amount_minor?: number | null
          pay_basis?: string | null
          qualification?: string | null
          revision?: number
          specialty?: string | null
          status?: Database["public"]["Enums"]["resource_status"]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          contact_email?: string | null
          contact_phone?: string | null
          id?: string
          joined_on?: string | null
          name?: string
          notes?: string | null
          organization_id?: string
          pay_amount_minor?: number | null
          pay_basis?: string | null
          qualification?: string | null
          revision?: number
          specialty?: string | null
          status?: Database["public"]["Enums"]["resource_status"]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coach_profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      court_maintenance_blocks: {
        Row: {
          court_id: string
          id: string
          location_id: string
          organization_id: string
          reason: string
          released_at: string | null
          slot: unknown
        }
        ComputedFields: never
        Insert: {
          court_id: string
          id?: string
          location_id: string
          organization_id: string
          reason: string
          released_at?: string | null
          slot: unknown
        }
        Update: {
          court_id?: string
          id?: string
          location_id?: string
          organization_id?: string
          reason?: string
          released_at?: string | null
          slot?: unknown
        }
        Relationships: [
          {
            foreignKeyName: "court_maintenance_blocks_organization_id_location_id_court_fkey"
            columns: ["organization_id", "location_id", "court_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["organization_id", "location_id", "id"]
          },
        ]
      }
      court_operating_hours: {
        Row: {
          court_id: string
          id: string
          local_minutes: unknown
          location_id: string
          organization_id: string
          valid_dates: unknown
          weekday: number
        }
        ComputedFields: never
        Insert: {
          court_id: string
          id?: string
          local_minutes: unknown
          location_id: string
          organization_id: string
          valid_dates: unknown
          weekday: number
        }
        Update: {
          court_id?: string
          id?: string
          local_minutes?: unknown
          location_id?: string
          organization_id?: string
          valid_dates?: unknown
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "court_operating_hours_organization_id_location_id_court_id_fkey"
            columns: ["organization_id", "location_id", "court_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["organization_id", "location_id", "id"]
          },
        ]
      }
      courts: {
        Row: {
          amenities: string[]
          capacity: number
          id: string
          location_id: string
          name: string
          notes: string | null
          organization_id: string
          revision: number
          status: Database["public"]["Enums"]["resource_status"]
          surface: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          amenities?: string[]
          capacity?: number
          id?: string
          location_id: string
          name: string
          notes?: string | null
          organization_id: string
          revision?: number
          status?: Database["public"]["Enums"]["resource_status"]
          surface: string
          updated_at?: string
        }
        Update: {
          amenities?: string[]
          capacity?: number
          id?: string
          location_id?: string
          name?: string
          notes?: string | null
          organization_id?: string
          revision?: number
          status?: Database["public"]["Enums"]["resource_status"]
          surface?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "courts_organization_id_location_id_fkey"
            columns: ["organization_id", "location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          active: boolean
          amount_minor: number
          booking_id: string | null
          id: string
          invoice_id: string
          location_id: string
          organization_id: string
          package_id: string | null
        }
        ComputedFields: never
        Insert: {
          active?: boolean
          amount_minor: number
          booking_id?: string | null
          id?: string
          invoice_id: string
          location_id: string
          organization_id: string
          package_id?: string | null
        }
        Update: {
          active?: boolean
          amount_minor?: number
          booking_id?: string | null
          id?: string
          invoice_id?: string
          location_id?: string
          organization_id?: string
          package_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_organization_id_location_id_booking_id_fkey"
            columns: ["organization_id", "location_id", "booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["organization_id", "location_id", "id"]
          },
          {
            foreignKeyName: "invoice_items_organization_id_location_id_invoice_id_fkey"
            columns: ["organization_id", "location_id", "invoice_id"]
            isOneToOne: false
            referencedRelation: "invoice_balances"
            referencedColumns: ["organization_id", "location_id", "invoice_id"]
          },
          {
            foreignKeyName: "invoice_items_organization_id_location_id_invoice_id_fkey"
            columns: ["organization_id", "location_id", "invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["organization_id", "location_id", "id"]
          },
          {
            foreignKeyName: "invoice_items_organization_id_location_id_package_id_fkey"
            columns: ["organization_id", "location_id", "package_id"]
            isOneToOne: false
            referencedRelation: "training_packages"
            referencedColumns: ["organization_id", "location_id", "id"]
          },
        ]
      }
      invoices: {
        Row: {
          currency: string
          discount_minor: number
          discount_reason: string | null
          id: string
          invoice_number: number
          issued_at: string
          issued_by: string
          location_id: string
          organization_id: string
          revision: number
          total_amount_minor: number
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        ComputedFields: never
        Insert: {
          currency: string
          discount_minor?: number
          discount_reason?: string | null
          id?: string
          invoice_number?: never
          issued_at?: string
          issued_by: string
          location_id: string
          organization_id: string
          revision?: number
          total_amount_minor: number
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          currency?: string
          discount_minor?: number
          discount_reason?: string | null
          id?: string
          invoice_number?: never
          issued_at?: string
          issued_by?: string
          location_id?: string
          organization_id?: string
          revision?: number
          total_amount_minor?: number
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_organization_id_location_id_fkey"
            columns: ["organization_id", "location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      location_closures: {
        Row: {
          id: string
          location_id: string
          organization_id: string
          reason: string
          released_at: string | null
          slot: unknown
        }
        ComputedFields: never
        Insert: {
          id?: string
          location_id: string
          organization_id: string
          reason: string
          released_at?: string | null
          slot: unknown
        }
        Update: {
          id?: string
          location_id?: string
          organization_id?: string
          reason?: string
          released_at?: string | null
          slot?: unknown
        }
        Relationships: [
          {
            foreignKeyName: "location_closures_organization_id_location_id_fkey"
            columns: ["organization_id", "location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      locations: {
        Row: {
          active: boolean
          id: string
          name: string
          organization_id: string
          schedule_revision: number
          timezone: string
        }
        ComputedFields: never
        Insert: {
          active?: boolean
          id?: string
          name: string
          organization_id: string
          schedule_revision?: number
          timezone?: string
        }
        Update: {
          active?: boolean
          id?: string
          name?: string
          organization_id?: string
          schedule_revision?: number
          timezone?: string
        }
        Relationships: [
          {
            foreignKeyName: "locations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      member_locations: {
        Row: {
          location_id: string
          organization_id: string
          user_id: string
        }
        ComputedFields: never
        Insert: {
          location_id: string
          organization_id: string
          user_id: string
        }
        Update: {
          location_id?: string
          organization_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_locations_organization_id_location_id_fkey"
            columns: ["organization_id", "location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "member_locations_organization_id_user_id_fkey"
            columns: ["organization_id", "user_id"]
            isOneToOne: false
            referencedRelation: "organization_members"
            referencedColumns: ["organization_id", "user_id"]
          },
        ]
      }
      organization_members: {
        Row: {
          active: boolean
          created_at: string
          organization_id: string
          role: Database["public"]["Enums"]["club_role"]
          user_id: string
        }
        ComputedFields: never
        Insert: {
          active?: boolean
          created_at?: string
          organization_id: string
          role: Database["public"]["Enums"]["club_role"]
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["club_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          access_revision: number
          created_at: string
          currency: string
          id: string
          name: string
        }
        ComputedFields: never
        Insert: {
          access_revision?: number
          created_at?: string
          currency?: string
          id?: string
          name: string
        }
        Update: {
          access_revision?: number
          created_at?: string
          currency?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount_minor: number
          effective_at: string
          id: string
          invoice_id: string
          location_id: string
          method: Database["public"]["Enums"]["payment_method"]
          organization_id: string
          received_by: string
          reference: string | null
        }
        ComputedFields: never
        Insert: {
          amount_minor: number
          effective_at?: string
          id?: string
          invoice_id: string
          location_id: string
          method: Database["public"]["Enums"]["payment_method"]
          organization_id: string
          received_by: string
          reference?: string | null
        }
        Update: {
          amount_minor?: number
          effective_at?: string
          id?: string
          invoice_id?: string
          location_id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          organization_id?: string
          received_by?: string
          reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_organization_id_location_id_invoice_id_fkey"
            columns: ["organization_id", "location_id", "invoice_id"]
            isOneToOne: false
            referencedRelation: "invoice_balances"
            referencedColumns: ["organization_id", "location_id", "invoice_id"]
          },
          {
            foreignKeyName: "payments_organization_id_location_id_invoice_id_fkey"
            columns: ["organization_id", "location_id", "invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["organization_id", "location_id", "id"]
          },
        ]
      }
      pricing_rules: {
        Row: {
          amount_minor: number
          court_id: string
          effective: unknown
          id: string
          kind: Database["public"]["Enums"]["booking_kind"]
          location_id: string
          organization_id: string
          unit_minutes: number
        }
        ComputedFields: never
        Insert: {
          amount_minor: number
          court_id: string
          effective: unknown
          id?: string
          kind: Database["public"]["Enums"]["booking_kind"]
          location_id: string
          organization_id: string
          unit_minutes: number
        }
        Update: {
          amount_minor?: number
          court_id?: string
          effective?: unknown
          id?: string
          kind?: Database["public"]["Enums"]["booking_kind"]
          location_id?: string
          organization_id?: string
          unit_minutes?: number
        }
        Relationships: [
          {
            foreignKeyName: "pricing_rules_organization_id_location_id_court_id_fkey"
            columns: ["organization_id", "location_id", "court_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["organization_id", "location_id", "id"]
          },
        ]
      }
      pricing_specials: {
        Row: {
          amount_minor: number
          duration_minutes: unknown
          id: string
          local_minutes: unknown
          location_id: string
          organization_id: string
          rate_id: string
          retired_at: string | null
          weekday: number
        }
        ComputedFields: never
        Insert: {
          amount_minor: number
          duration_minutes: unknown
          id?: string
          local_minutes: unknown
          location_id: string
          organization_id: string
          rate_id: string
          retired_at?: string | null
          weekday: number
        }
        Update: {
          amount_minor?: number
          duration_minutes?: unknown
          id?: string
          local_minutes?: unknown
          location_id?: string
          organization_id?: string
          rate_id?: string
          retired_at?: string | null
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "pricing_specials_organization_id_location_id_rate_id_fkey"
            columns: ["organization_id", "location_id", "rate_id"]
            isOneToOne: false
            referencedRelation: "pricing_rules"
            referencedColumns: ["organization_id", "location_id", "id"]
          },
        ]
      }
      profiles: {
        Row: {
          display_name: string
          user_id: string
        }
        ComputedFields: never
        Insert: {
          display_name: string
          user_id: string
        }
        Update: {
          display_name?: string
          user_id?: string
        }
        Relationships: []
      }
      programs: {
        Row: {
          id: string
          location_id: string
          name: string
          organization_id: string
          status: Database["public"]["Enums"]["resource_status"]
        }
        ComputedFields: never
        Insert: {
          id?: string
          location_id: string
          name: string
          organization_id: string
          status?: Database["public"]["Enums"]["resource_status"]
        }
        Update: {
          id?: string
          location_id?: string
          name?: string
          organization_id?: string
          status?: Database["public"]["Enums"]["resource_status"]
        }
        Relationships: [
          {
            foreignKeyName: "programs_organization_id_location_id_fkey"
            columns: ["organization_id", "location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      refunds: {
        Row: {
          amount_minor: number
          effective_at: string
          id: string
          location_id: string
          organization_id: string
          payment_id: string
          reason: string
          recorded_by: string
        }
        ComputedFields: never
        Insert: {
          amount_minor: number
          effective_at?: string
          id?: string
          location_id: string
          organization_id: string
          payment_id: string
          reason: string
          recorded_by: string
        }
        Update: {
          amount_minor?: number
          effective_at?: string
          id?: string
          location_id?: string
          organization_id?: string
          payment_id?: string
          reason?: string
          recorded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "refunds_organization_id_location_id_payment_id_fkey"
            columns: ["organization_id", "location_id", "payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["organization_id", "location_id", "id"]
          },
        ]
      }
      session_participants: {
        Row: {
          id: string
          location_id: string
          organization_id: string
          registered_at: string
          session_id: string
          student_id: string
          withdrawn_at: string | null
        }
        ComputedFields: never
        Insert: {
          id?: string
          location_id: string
          organization_id: string
          registered_at?: string
          session_id: string
          student_id: string
          withdrawn_at?: string | null
        }
        Update: {
          id?: string
          location_id?: string
          organization_id?: string
          registered_at?: string
          session_id?: string
          student_id?: string
          withdrawn_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "session_participants_organization_id_location_id_session_i_fkey"
            columns: ["organization_id", "location_id", "session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["organization_id", "location_id", "id"]
          },
          {
            foreignKeyName: "session_participants_organization_id_location_id_student_i_fkey"
            columns: ["organization_id", "location_id", "student_id"]
            isOneToOne: false
            referencedRelation: "student_locations"
            referencedColumns: ["organization_id", "location_id", "student_id"]
          },
        ]
      }
      sessions: {
        Row: {
          actual_slot: unknown
          booking_id: string
          capacity: number
          coach_id: string
          id: string
          location_id: string
          organization_id: string
          pay_basis_snapshot: string | null
          pay_currency_snapshot: string | null
          pay_rate_snapshot: number | null
          program_id: string | null
          revision: number
          status: Database["public"]["Enums"]["session_status"]
        }
        ComputedFields: never
        Insert: {
          actual_slot?: unknown
          booking_id: string
          capacity: number
          coach_id: string
          id?: string
          location_id: string
          organization_id: string
          pay_basis_snapshot?: string | null
          pay_currency_snapshot?: string | null
          pay_rate_snapshot?: number | null
          program_id?: string | null
          revision?: number
          status?: Database["public"]["Enums"]["session_status"]
        }
        Update: {
          actual_slot?: unknown
          booking_id?: string
          capacity?: number
          coach_id?: string
          id?: string
          location_id?: string
          organization_id?: string
          pay_basis_snapshot?: string | null
          pay_currency_snapshot?: string | null
          pay_rate_snapshot?: number | null
          program_id?: string | null
          revision?: number
          status?: Database["public"]["Enums"]["session_status"]
        }
        Relationships: [
          {
            foreignKeyName: "sessions_organization_id_location_id_booking_id_fkey"
            columns: ["organization_id", "location_id", "booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["organization_id", "location_id", "id"]
          },
          {
            foreignKeyName: "sessions_organization_id_location_id_coach_id_fkey"
            columns: ["organization_id", "location_id", "coach_id"]
            isOneToOne: false
            referencedRelation: "coach_locations"
            referencedColumns: ["organization_id", "location_id", "coach_id"]
          },
          {
            foreignKeyName: "sessions_organization_id_location_id_program_id_fkey"
            columns: ["organization_id", "location_id", "program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["organization_id", "location_id", "id"]
          },
        ]
      }
      student_level_changes: {
        Row: {
          current_level: string | null
          effective_at: string
          id: string
          organization_id: string
          previous_level: string | null
          student_id: string
        }
        ComputedFields: never
        Insert: {
          current_level?: string | null
          effective_at?: string
          id?: string
          organization_id: string
          previous_level?: string | null
          student_id: string
        }
        Update: {
          current_level?: string | null
          effective_at?: string
          id?: string
          organization_id?: string
          previous_level?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_level_changes_organization_id_student_id_fkey"
            columns: ["organization_id", "student_id"]
            isOneToOne: false
            referencedRelation: "student_profiles"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      student_locations: {
        Row: {
          active: boolean
          location_id: string
          organization_id: string
          student_id: string
        }
        ComputedFields: never
        Insert: {
          active?: boolean
          location_id: string
          organization_id: string
          student_id: string
        }
        Update: {
          active?: boolean
          location_id?: string
          organization_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_locations_organization_id_location_id_fkey"
            columns: ["organization_id", "location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "student_locations_organization_id_student_id_fkey"
            columns: ["organization_id", "student_id"]
            isOneToOne: false
            referencedRelation: "student_profiles"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      student_profiles: {
        Row: {
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          id: string
          joined_on: string | null
          name: string
          notes: string | null
          organization_id: string
          revision: number
          skill_level: string | null
          status: Database["public"]["Enums"]["resource_status"]
          updated_at: string
          user_id: string | null
        }
        ComputedFields: never
        Insert: {
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          joined_on?: string | null
          name: string
          notes?: string | null
          organization_id: string
          revision?: number
          skill_level?: string | null
          status?: Database["public"]["Enums"]["resource_status"]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          joined_on?: string | null
          name?: string
          notes?: string | null
          organization_id?: string
          revision?: number
          skill_level?: string | null
          status?: Database["public"]["Enums"]["resource_status"]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      training_packages: {
        Row: {
          created_at: string
          id: string
          location_id: string
          organization_id: string
          sessions: number | null
          status: string
          student_id: string
          title: string
          valid_from: string
          valid_until: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          id?: string
          location_id: string
          organization_id: string
          sessions?: number | null
          status?: string
          student_id: string
          title: string
          valid_from: string
          valid_until: string
        }
        Update: {
          created_at?: string
          id?: string
          location_id?: string
          organization_id?: string
          sessions?: number | null
          status?: string
          student_id?: string
          title?: string
          valid_from?: string
          valid_until?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_packages_organization_id_location_id_student_id_fkey"
            columns: ["organization_id", "location_id", "student_id"]
            isOneToOne: false
            referencedRelation: "student_locations"
            referencedColumns: ["organization_id", "location_id", "student_id"]
          },
        ]
      }
      training_uses: {
        Row: {
          id: string
          location_id: string
          organization_id: string
          package_id: string
          participant_id: string
          reversal_reason: string | null
          reversed_at: string | null
          student_id: string
          used_at: string
        }
        ComputedFields: never
        Insert: {
          id?: string
          location_id: string
          organization_id: string
          package_id: string
          participant_id: string
          reversal_reason?: string | null
          reversed_at?: string | null
          student_id: string
          used_at?: string
        }
        Update: {
          id?: string
          location_id?: string
          organization_id?: string
          package_id?: string
          participant_id?: string
          reversal_reason?: string | null
          reversed_at?: string | null
          student_id?: string
          used_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_uses_organization_id_location_id_student_id_packa_fkey"
            columns: [
              "organization_id",
              "location_id",
              "student_id",
              "package_id",
            ]
            isOneToOne: false
            referencedRelation: "training_packages"
            referencedColumns: [
              "organization_id",
              "location_id",
              "student_id",
              "id",
            ]
          },
          {
            foreignKeyName: "training_uses_organization_id_location_id_student_id_parti_fkey"
            columns: [
              "organization_id",
              "location_id",
              "student_id",
              "participant_id",
            ]
            isOneToOne: false
            referencedRelation: "session_participants"
            referencedColumns: [
              "organization_id",
              "location_id",
              "student_id",
              "id",
            ]
          },
        ]
      }
    }
    Views: {
      invoice_balances: {
        Row: {
          currency: string | null
          due_minor: number | null
          invoice_id: string | null
          location_id: string | null
          organization_id: string | null
          received_minor: number | null
          status: string | null
          total_amount_minor: number | null
        }
        ComputedFields: never
        Relationships: [
          {
            foreignKeyName: "invoices_organization_id_location_id_fkey"
            columns: ["organization_id", "location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
    }
    Functions: {
      add_session_participant: {
        Args: {
          p_location: string
          p_org: string
          p_request: string
          p_session: string
          p_student: string
        }
        Returns: string
      }
      block_court: {
        Args: {
          p_court: string
          p_end: string
          p_location: string
          p_org: string
          p_reason: string
          p_request: string
          p_start: string
        }
        Returns: string
      }
      calendar_booking_history: {
        Args: { p_booking: string; p_location: string; p_org: string }
        Returns: {
          action: string
          created_at: string
          new_start: string
          old_start: string
        }[]
      }
      cancel_booking: {
        Args: {
          p_booking: string
          p_location: string
          p_org: string
          p_reason: string
          p_request: string
        }
        Returns: string
      }
      class_attendance_history: {
        Args: { p_location: string; p_org: string; p_session: string }
        Returns: {
          actor: string
          corrected: boolean
          reason: string
          recorded_at: string
        }[]
      }
      close_location: {
        Args: {
          p_end: string
          p_location: string
          p_org: string
          p_reason: string
          p_request: string
          p_start: string
        }
        Returns: string
      }
      club_finance_result: {
        Args: {
          p_command: string
          p_location: string
          p_org: string
          p_request: string
        }
        Returns: string
      }
      club_members: {
        Args: { p_org: string }
        Returns: {
          active: boolean
          display_name: string
          email: string
          location_ids: string[]
          person_id: string
          role: Database["public"]["Enums"]["club_role"]
          user_id: string
        }[]
      }
      create_booking: {
        Args: {
          p_booker_name?: string
          p_capacity?: number
          p_coach?: string
          p_court: string
          p_end: string
          p_kind: Database["public"]["Enums"]["booking_kind"]
          p_location: string
          p_org: string
          p_request: string
          p_start: string
          p_student?: string
        }
        Returns: string
      }
      edit_calendar_booking: {
        Args: {
          p_booking: string
          p_location: string
          p_org: string
          p_reason: string
          p_request: string
          p_revision: number
          p_start: string
        }
        Returns: string
      }
      finance_command_result: {
        Args: {
          p_command: string
          p_location: string
          p_org: string
          p_request: string
        }
        Returns: string
      }
      issue_booking_invoice:
        | {
            Args: {
              p_booking: string
              p_discount: number
              p_location: string
              p_org: string
              p_reason: string
              p_request: string
            }
            Returns: string
          }
        | {
            Args: {
              p_booking: string
              p_location: string
              p_org: string
              p_request: string
            }
            Returns: string
          }
      leave_club: { Args: { p_org: string }; Returns: undefined }
      record_class_attendance: {
        Args: {
          p_attendance: Json
          p_booking_revision: number
          p_end: string
          p_location: string
          p_org: string
          p_reason: string
          p_request: string
          p_revision: number
          p_session: string
          p_start: string
        }
        Returns: string
      }
      record_club_finance: {
        Args: {
          p_command: string
          p_data: Json
          p_location: string
          p_org: string
          p_request: string
        }
        Returns: string
      }
      record_payment:
        | {
            Args: {
              p_amount: number
              p_invoice: string
              p_location: string
              p_method: Database["public"]["Enums"]["payment_method"]
              p_org: string
              p_reference: string
              p_request: string
            }
            Returns: string
          }
        | {
            Args: {
              p_amount: number
              p_invoice: string
              p_location: string
              p_method: Database["public"]["Enums"]["payment_method"]
              p_org: string
              p_request: string
            }
            Returns: string
          }
      record_refund: {
        Args: {
          p_amount: number
          p_location: string
          p_org: string
          p_payment: string
          p_reason: string
          p_request: string
        }
        Returns: string
      }
      release_court_block: {
        Args: {
          p_block: string
          p_location: string
          p_org: string
          p_request: string
        }
        Returns: string
      }
      release_location_closure: {
        Args: {
          p_closure: string
          p_location: string
          p_org: string
          p_request: string
        }
        Returns: string
      }
      reschedule_booking: {
        Args: {
          p_booking: string
          p_location: string
          p_org: string
          p_request: string
          p_start: string
        }
        Returns: string
      }
      resource_history: {
        Args: {
          p_id: string
          p_kind: Database["public"]["Enums"]["club_resource_kind"]
          p_org: string
        }
        Returns: {
          action: string
          actor: string
          current_status: Database["public"]["Enums"]["resource_status"]
          occurred_at: string
          previous_status: Database["public"]["Enums"]["resource_status"]
        }[]
      }
      save_club_resource: {
        Args: {
          p_id: string
          p_kind: Database["public"]["Enums"]["club_resource_kind"]
          p_locations: string[]
          p_org: string
          p_request: string
          p_revision: number
          p_values: Json
        }
        Returns: string
      }
      set_club_member: {
        Args: {
          p_active: boolean
          p_locations: string[]
          p_org: string
          p_person?: string
          p_role: Database["public"]["Enums"]["club_role"]
          p_user: string
        }
        Returns: undefined
      }
      set_court_rate: {
        Args: {
          p_amount: number
          p_court: string
          p_from: string
          p_kind: Database["public"]["Enums"]["booking_kind"]
          p_location: string
          p_minutes: number
          p_org: string
          p_request: string
        }
        Returns: string
      }
      set_resource_hours: {
        Args: {
          p_end: number
          p_from: string
          p_id: string
          p_kind: Database["public"]["Enums"]["club_resource_kind"]
          p_location: string
          p_org: string
          p_request: string
          p_start: number
          p_weekday: number
        }
        Returns: string
      }
      update_my_profile: {
        Args: { p_display_name: string }
        Returns: undefined
      }
      void_invoice: {
        Args: {
          p_invoice: string
          p_location: string
          p_org: string
          p_reason: string
          p_request: string
        }
        Returns: string
      }
      withdraw_session_participant: {
        Args: {
          p_location: string
          p_org: string
          p_participant: string
          p_request: string
          p_session: string
        }
        Returns: string
      }
    }
    Enums: {
      attendance_status: "present" | "late" | "absent" | "excused"
      booking_kind: "rental" | "private" | "group"
      booking_status: "confirmed" | "cancelled"
      club_resource_kind: "court" | "coach" | "student"
      club_role:
        | "owner"
        | "admin"
        | "receptionist"
        | "coach"
        | "accountant"
        | "student"
      payment_method: "cash" | "card" | "transfer"
      resource_status: "active" | "inactive" | "archived"
      session_status: "scheduled" | "completed" | "cancelled"
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
      attendance_status: ["present", "late", "absent", "excused"],
      booking_kind: ["rental", "private", "group"],
      booking_status: ["confirmed", "cancelled"],
      club_resource_kind: ["court", "coach", "student"],
      club_role: [
        "owner",
        "admin",
        "receptionist",
        "coach",
        "accountant",
        "student",
      ],
      payment_method: ["cash", "card", "transfer"],
      resource_status: ["active", "inactive", "archived"],
      session_status: ["scheduled", "completed", "cancelled"],
    },
  },
} as const
