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
      application_documents: {
        Row: {
          application_id: string
          created_at: string
          document_version_id: string
          id: string
          requirement_id: string
        }
        Insert: {
          application_id: string
          created_at?: string
          document_version_id: string
          id?: string
          requirement_id: string
        }
        Update: {
          application_id?: string
          created_at?: string
          document_version_id?: string
          id?: string
          requirement_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_documents_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_documents_document_version_id_fkey"
            columns: ["document_version_id"]
            isOneToOne: false
            referencedRelation: "document_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_documents_requirement_id_fkey"
            columns: ["requirement_id"]
            isOneToOne: false
            referencedRelation: "project_requirements"
            referencedColumns: ["id"]
          },
        ]
      }
      applications: {
        Row: {
          company_snapshot: Json | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          created_by: string | null
          declaration_accepted: boolean
          declaration_name: string | null
          duration_weeks: number | null
          id: string
          methodology: string | null
          organization_id: string
          price: number | null
          project_id: string
          requirements_version: number | null
          status: Database["public"]["Enums"]["application_status"]
          status_note: string | null
          submitted_at: string | null
          technical_response: string | null
          updated_at: string
        }
        Insert: {
          company_snapshot?: Json | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          declaration_accepted?: boolean
          declaration_name?: string | null
          duration_weeks?: number | null
          id?: string
          methodology?: string | null
          organization_id: string
          price?: number | null
          project_id: string
          requirements_version?: number | null
          status?: Database["public"]["Enums"]["application_status"]
          status_note?: string | null
          submitted_at?: string | null
          technical_response?: string | null
          updated_at?: string
        }
        Update: {
          company_snapshot?: Json | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          declaration_accepted?: boolean
          declaration_name?: string | null
          duration_weeks?: number | null
          id?: string
          methodology?: string | null
          organization_id?: string
          price?: number | null
          project_id?: string
          requirements_version?: number | null
          status?: Database["public"]["Enums"]["application_status"]
          status_note?: string | null
          submitted_at?: string | null
          technical_response?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "applications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_events: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          details: Json | null
          entity: string
          entity_id: string | null
          id: number
          organization_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          details?: Json | null
          entity: string
          entity_id?: string | null
          id?: never
          organization_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          details?: Json | null
          entity?: string
          entity_id?: string | null
          id?: never
          organization_id?: string | null
        }
        Relationships: []
      }
      awards: {
        Row: {
          application_id: string
          created_at: string
          decided_by: string
          id: string
          notes: string | null
          project_id: string
          value: number | null
        }
        Insert: {
          application_id: string
          created_at?: string
          decided_by?: string
          id?: string
          notes?: string | null
          project_id: string
          value?: number | null
        }
        Update: {
          application_id?: string
          created_at?: string
          decided_by?: string
          id?: string
          notes?: string | null
          project_id?: string
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "awards_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "awards_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      contractor_profiles: {
        Row: {
          address: string | null
          bbbee_level: string | null
          cidb_grade: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          csd_no: string | null
          description: string | null
          employees: number | null
          organization_id: string
          regions: string[]
          registration_no: string | null
          tax_no: string | null
          trades: string[]
          updated_at: string
          vat_no: string | null
          years_operating: number | null
        }
        Insert: {
          address?: string | null
          bbbee_level?: string | null
          cidb_grade?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          csd_no?: string | null
          description?: string | null
          employees?: number | null
          organization_id: string
          regions?: string[]
          registration_no?: string | null
          tax_no?: string | null
          trades?: string[]
          updated_at?: string
          vat_no?: string | null
          years_operating?: number | null
        }
        Update: {
          address?: string | null
          bbbee_level?: string | null
          cidb_grade?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          csd_no?: string | null
          description?: string | null
          employees?: number | null
          organization_id?: string
          regions?: string[]
          registration_no?: string | null
          tax_no?: string | null
          trades?: string[]
          updated_at?: string
          vat_no?: string | null
          years_operating?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contractor_profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      document_versions: {
        Row: {
          created_at: string
          document_id: string
          expires_at: string | null
          file_name: string
          id: string
          mime_type: string
          organization_id: string
          sha256: string | null
          size_bytes: number
          storage_path: string
          uploaded_by: string | null
          version: number
        }
        Insert: {
          created_at?: string
          document_id: string
          expires_at?: string | null
          file_name: string
          id?: string
          mime_type: string
          organization_id: string
          sha256?: string | null
          size_bytes: number
          storage_path: string
          uploaded_by?: string | null
          version: number
        }
        Update: {
          created_at?: string
          document_id?: string
          expires_at?: string | null
          file_name?: string
          id?: string
          mime_type?: string
          organization_id?: string
          sha256?: string | null
          size_bytes?: number
          storage_path?: string
          uploaded_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_versions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_versions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          current_version: number
          expires_at: string | null
          id: string
          issued_at: string | null
          organization_id: string
          reference_no: string | null
          title: string
          updated_at: string
          verification: Database["public"]["Enums"]["verification_status"]
          verification_note: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          category: string
          created_at?: string
          created_by?: string | null
          current_version?: number
          expires_at?: string | null
          id?: string
          issued_at?: string | null
          organization_id: string
          reference_no?: string | null
          title: string
          updated_at?: string
          verification?: Database["public"]["Enums"]["verification_status"]
          verification_note?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          current_version?: number
          expires_at?: string | null
          id?: string
          issued_at?: string | null
          organization_id?: string
          reference_no?: string | null
          title?: string
          updated_at?: string
          verification?: Database["public"]["Enums"]["verification_status"]
          verification_note?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      external_tender_items: {
        Row: {
          category: string | null
          id: string
          label: string
          mandatory: boolean
          organization_id: string
          sort_order: number
          tender_id: string
        }
        Insert: {
          category?: string | null
          id?: string
          label: string
          mandatory?: boolean
          organization_id: string
          sort_order?: number
          tender_id: string
        }
        Update: {
          category?: string | null
          id?: string
          label?: string
          mandatory?: boolean
          organization_id?: string
          sort_order?: number
          tender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_tender_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_tender_items_tender_id_fkey"
            columns: ["tender_id"]
            isOneToOne: false
            referencedRelation: "external_tenders"
            referencedColumns: ["id"]
          },
        ]
      }
      external_tenders: {
        Row: {
          buyer: string | null
          closes_at: string | null
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          organization_id: string
          title: string
        }
        Insert: {
          buyer?: string | null
          closes_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          title: string
        }
        Update: {
          buyer?: string | null
          closes_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_tenders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      fp_daily: {
        Row: {
          created_at: string
          day: string
          engine_h: number
          fault_code: string | null
          fault_severity: string | null
          id: string
          idle_h: number
          is_sample: boolean
          litres: number
          machine_id: string
          machine_type: string
          org_id: string
          site: string
        }
        Insert: {
          created_at?: string
          day: string
          engine_h: number
          fault_code?: string | null
          fault_severity?: string | null
          id?: string
          idle_h: number
          is_sample?: boolean
          litres: number
          machine_id: string
          machine_type?: string
          org_id: string
          site?: string
        }
        Update: {
          created_at?: string
          day?: string
          engine_h?: number
          fault_code?: string | null
          fault_severity?: string | null
          id?: string
          idle_h?: number
          is_sample?: boolean
          litres?: number
          machine_id?: string
          machine_type?: string
          org_id?: string
          site?: string
        }
        Relationships: [
          {
            foreignKeyName: "fp_daily_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      fp_events: {
        Row: {
          created_at: string
          id: number
          is_bot: boolean
          org_id: string
          payload: Json
          token_id: string
          type: string
        }
        Insert: {
          created_at?: string
          id?: never
          is_bot?: boolean
          org_id: string
          payload?: Json
          token_id: string
          type: string
        }
        Update: {
          created_at?: string
          id?: never
          is_bot?: boolean
          org_id?: string
          payload?: Json
          token_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "fp_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fp_events_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "fp_tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      fp_settings: {
        Row: {
          baseline_idle_share: number
          diesel_price: number | null
          diesel_source: string | null
          diesel_verified: boolean
          fault_repeat: number
          fuel_sd: number
          idle_burn_lph: number
          idle_limit: number
          org_id: string
          updated_at: string
        }
        Insert: {
          baseline_idle_share?: number
          diesel_price?: number | null
          diesel_source?: string | null
          diesel_verified?: boolean
          fault_repeat?: number
          fuel_sd?: number
          idle_burn_lph?: number
          idle_limit?: number
          org_id: string
          updated_at?: string
        }
        Update: {
          baseline_idle_share?: number
          diesel_price?: number | null
          diesel_source?: string | null
          diesel_verified?: boolean
          fault_repeat?: number
          fuel_sd?: number
          idle_burn_lph?: number
          idle_limit?: number
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fp_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      fp_tokens: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          label: string
          notes: string | null
          org_id: string
          revoked_at: string | null
          token: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          label: string
          notes?: string | null
          org_id: string
          revoked_at?: string | null
          token?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          label?: string
          notes?: string | null
          org_id?: string
          revoked_at?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "fp_tokens_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_org_id: string | null
          code: string
          created_at: string
          created_by: string | null
          email: string
          expires_at: string
          id: string
          organization_name: string
          status: Database["public"]["Enums"]["invitation_status"]
        }
        Insert: {
          accepted_org_id?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          email: string
          expires_at?: string
          id?: string
          organization_name: string
          status?: Database["public"]["Enums"]["invitation_status"]
        }
        Update: {
          accepted_org_id?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          email?: string
          expires_at?: string
          id?: string
          organization_name?: string
          status?: Database["public"]["Enums"]["invitation_status"]
        }
        Relationships: [
          {
            foreignKeyName: "invitations_accepted_org_id_fkey"
            columns: ["accepted_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      mail_cfg: {
        Row: {
          k: string
          v: string
        }
        Insert: {
          k: string
          v: string
        }
        Update: {
          k?: string
          v?: string
        }
        Relationships: []
      }
      memberships: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      mobilisation_items: {
        Row: {
          application_id: string
          created_at: string
          done: boolean
          done_at: string | null
          due_date: string | null
          id: string
          label: string
          note: string | null
          organization_id: string
          sort_order: number
        }
        Insert: {
          application_id: string
          created_at?: string
          done?: boolean
          done_at?: string | null
          due_date?: string | null
          id?: string
          label: string
          note?: string | null
          organization_id: string
          sort_order?: number
        }
        Update: {
          application_id?: string
          created_at?: string
          done?: boolean
          done_at?: string | null
          due_date?: string | null
          id?: string
          label?: string
          note?: string | null
          organization_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "mobilisation_items_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mobilisation_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          kind: string
          link: string | null
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          kind: string
          link?: string | null
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          link?: string | null
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["org_kind"]
          name: string
          status: Database["public"]["Enums"]["org_status"]
        }
        Insert: {
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["org_kind"]
          name: string
          status?: Database["public"]["Enums"]["org_status"]
        }
        Update: {
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["org_kind"]
          name?: string
          status?: Database["public"]["Enums"]["org_status"]
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          phone: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          phone?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
        }
        Relationships: []
      }
      project_invites: {
        Row: {
          created_at: string
          organization_id: string
          project_id: string
        }
        Insert: {
          created_at?: string
          organization_id: string
          project_id: string
        }
        Update: {
          created_at?: string
          organization_id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_invites_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_invites_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_requirements: {
        Row: {
          active: boolean
          category: string
          created_at: string
          description: string | null
          id: string
          label: string
          mandatory: boolean
          project_id: string
          sort_order: number
          version: number
        }
        Insert: {
          active?: boolean
          category: string
          created_at?: string
          description?: string | null
          id?: string
          label: string
          mandatory?: boolean
          project_id: string
          sort_order?: number
          version?: number
        }
        Update: {
          active?: boolean
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          label?: string
          mandatory?: boolean
          project_id?: string
          sort_order?: number
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_requirements_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          briefing_at: string | null
          buyer_org_id: string
          closes_at: string | null
          created_at: string
          created_by: string | null
          evaluation_criteria: string | null
          id: string
          location: string | null
          opens_at: string | null
          reference: string | null
          requirements_version: number
          scope: string | null
          status: Database["public"]["Enums"]["project_status"]
          summary: string | null
          title: string
          trade: string | null
          updated_at: string
          visibility: Database["public"]["Enums"]["project_visibility"]
        }
        Insert: {
          briefing_at?: string | null
          buyer_org_id: string
          closes_at?: string | null
          created_at?: string
          created_by?: string | null
          evaluation_criteria?: string | null
          id?: string
          location?: string | null
          opens_at?: string | null
          reference?: string | null
          requirements_version?: number
          scope?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          summary?: string | null
          title: string
          trade?: string | null
          updated_at?: string
          visibility?: Database["public"]["Enums"]["project_visibility"]
        }
        Update: {
          briefing_at?: string | null
          buyer_org_id?: string
          closes_at?: string | null
          created_at?: string
          created_by?: string | null
          evaluation_criteria?: string | null
          id?: string
          location?: string | null
          opens_at?: string | null
          reference?: string | null
          requirements_version?: number
          scope?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          summary?: string | null
          title?: string
          trade?: string | null
          updated_at?: string
          visibility?: Database["public"]["Enums"]["project_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "projects_buyer_org_id_fkey"
            columns: ["buyer_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      pw_reset_codes: {
        Row: {
          attempts: number
          code_hash: string
          email: string
          expires_at: string
          sent_at: string
        }
        Insert: {
          attempts?: number
          code_hash: string
          email: string
          expires_at: string
          sent_at?: string
        }
        Update: {
          attempts?: number
          code_hash?: string
          email?: string
          expires_at?: string
          sent_at?: string
        }
        Relationships: []
      }
      reviews: {
        Row: {
          application_id: string
          compliance_ok: boolean | null
          created_at: string
          id: string
          notes: string | null
          price_score: number | null
          reviewer_id: string
          technical_score: number | null
        }
        Insert: {
          application_id: string
          compliance_ok?: boolean | null
          created_at?: string
          id?: string
          notes?: string | null
          price_score?: number | null
          reviewer_id?: string
          technical_score?: number | null
        }
        Update: {
          application_id?: string
          compliance_ok?: boolean | null
          created_at?: string
          id?: string
          notes?: string | null
          price_score?: number | null
          reviewer_id?: string
          technical_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "reviews_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
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
      admin_can_app: { Args: { _a: string }; Returns: boolean }
      admin_can_org: { Args: { _o: string }; Returns: boolean }
      admin_can_project: { Args: { _p: string }; Returns: boolean }
      admin_can_user: { Args: { _u: string }; Returns: boolean }
      award_application: {
        Args: { _app: string; _notes: string; _value: number }
        Returns: undefined
      }
      can_view_project: { Args: { _project: string }; Returns: boolean }
      complete_password_reset: {
        Args: { p_code: string; p_email: string; p_password: string }
        Returns: boolean
      }
      fp_event: {
        Args: {
          p_payload?: Json
          p_token: string
          p_type: string
          p_ua?: string
        }
        Returns: undefined
      }
      fp_is_bot: { Args: { p_ua: string }; Returns: boolean }
      fp_open: { Args: { p_token: string; p_ua?: string }; Returns: Json }
      fp_org: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      is_org_member: { Args: { _org: string }; Returns: boolean }
      my_contractor_org: { Args: never; Returns: string }
      notify_admins: {
        Args: { _body: string; _kind: string; _link: string; _title: string }
        Returns: undefined
      }
      notify_org: {
        Args: {
          _body: string
          _kind: string
          _link: string
          _org: string
          _title: string
        }
        Returns: undefined
      }
      notify_project_admins: {
        Args: {
          _body: string
          _kind: string
          _link: string
          _project: string
          _title: string
        }
        Returns: undefined
      }
      refresh_my_expiry_reminders: { Args: never; Returns: number }
      request_password_reset: { Args: { p_email: string }; Returns: undefined }
      set_application_status: {
        Args: {
          _app: string
          _note: string
          _status: Database["public"]["Enums"]["application_status"]
        }
        Returns: undefined
      }
      set_contractor_status: {
        Args: {
          _org: string
          _status: Database["public"]["Enums"]["org_status"]
        }
        Returns: undefined
      }
      start_mobilisation: { Args: { _app: string }; Returns: undefined }
      submit_application: { Args: { _app: string }; Returns: Json }
      withdraw_application: { Args: { _app: string }; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "contractor"
      application_status:
        | "draft"
        | "submitted"
        | "under_review"
        | "shortlisted"
        | "awarded"
        | "unsuccessful"
        | "withdrawn"
      invitation_status: "pending" | "accepted" | "revoked"
      org_kind: "buyer" | "contractor"
      org_status: "active" | "suspended"
      project_status: "draft" | "open" | "closed" | "awarded" | "cancelled"
      project_visibility: "public" | "invited"
      verification_status: "unverified" | "verified" | "rejected"
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
      app_role: ["admin", "contractor"],
      application_status: [
        "draft",
        "submitted",
        "under_review",
        "shortlisted",
        "awarded",
        "unsuccessful",
        "withdrawn",
      ],
      invitation_status: ["pending", "accepted", "revoked"],
      org_kind: ["buyer", "contractor"],
      org_status: ["active", "suspended"],
      project_status: ["draft", "open", "closed", "awarded", "cancelled"],
      project_visibility: ["public", "invited"],
      verification_status: ["unverified", "verified", "rejected"],
    },
  },
} as const
