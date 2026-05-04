// ⚠️  AUTO-GENERATED — DO NOT HAND-EDIT
// Regenerate with: pnpm db:types
// This file is generated from your self-hosted Supabase schema.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type AppRole = 'admin' | 'supervisor' | 'inspector' | 'vendor' | 'viewer'

export type EventType =
  | 'work_order'
  | 'inspection'
  | 'contract_milestone'
  | 'maintenance'

export type WorkOrderStatus =
  | 'draft'
  | 'open'
  | 'in_progress'
  | 'on_hold'
  | 'closed'
  | 'cancelled'

export type WorkOrderPriority = 'P1' | 'P2' | 'P3' | 'P4'

export type WorkOrderSeverity = 'critical' | 'high' | 'medium' | 'low'

export type ContractStatus =
  | 'draft'
  | 'pending_approval'
  | 'active'
  | 'completed'
  | 'terminated'
  | 'expired'

export type BidType = 'informal_quote' | 'sealed_bid'

export type BidStatus = 'pending' | 'under_review' | 'accepted' | 'rejected' | 'withdrawn'

export type PotholeStatus =
  | 'reported'
  | 'verified'
  | 'assigned'
  | 'in_repair'
  | 'repaired'
  | 'closed'
  | 'recurring'

export type SurfaceDefectType =
  | 'pothole'
  | 'alligator_crack'
  | 'linear_crack'
  | 'edge_failure'
  | 'subsidence'
  | 'rutting'
  | 'surface_deterioration'

export type ProjectStatus =
  | 'planning'
  | 'active'
  | 'on_hold'
  | 'completed'
  | 'cancelled'

export type ProjectDelayStatus = 'on_track' | 'at_risk' | 'overdue' | 'closed' | 'unknown'

export type InspectionStatus = 'draft' | 'in_progress' | 'completed' | 'approved'

export type InspectionItemResult = 'pass' | 'fail' | 'na' | 'observation'

export type InspectionItemSeverity = 'critical' | 'major' | 'minor' | 'informational'

// Required by @supabase/supabase-js v2.46+
type GenericRelationship = {
  foreignKeyName: string
  columns: string[]
  isOneToOne?: boolean
  referencedRelation: string
  referencedColumns: string[]
}

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string
          name: string
          slug: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: GenericRelationship[]
      }
      profiles: {
        Row: {
          id: string
          org_id: string
          full_name: string | null
          avatar_url: string | null
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          id: string
          org_id: string
          full_name?: string | null
          avatar_url?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: {
          org_id?: string
          full_name?: string | null
          avatar_url?: string | null
          updated_at?: string
          deleted_at?: string | null
        }
        Relationships: GenericRelationship[]
      }
      user_roles: {
        Row: {
          id: string
          org_id: string
          user_id: string
          role: AppRole
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          user_id: string
          role: AppRole
          created_at?: string
          updated_at?: string
        }
        Update: {
          role?: AppRole
          updated_at?: string
        }
        Relationships: GenericRelationship[]
      }
      locations: {
        Row: {
          id: string
          org_id: string
          name: string | null
          address: string | null
          geom: unknown | null
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          org_id: string
          name?: string | null
          address?: string | null
          geom?: unknown | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: {
          name?: string | null
          address?: string | null
          geom?: unknown | null
          updated_at?: string
          deleted_at?: string | null
        }
        Relationships: GenericRelationship[]
      }
      attachments: {
        Row: {
          id: string
          org_id: string
          storage_path: string
          file_name: string
          file_type: string
          file_size: number
          related_id: string | null
          related_table: string | null
          uploaded_by: string
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          org_id: string
          storage_path: string
          file_name: string
          file_type: string
          file_size: number
          related_id?: string | null
          related_table?: string | null
          uploaded_by: string
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: {
          deleted_at?: string | null
          updated_at?: string
        }
        Relationships: GenericRelationship[]
      }
      calendar_events: {
        Row: {
          id: string
          org_id: string
          title: string
          start_at: string
          end_at: string | null
          event_type: EventType
          related_id: string | null
          related_table: string | null
          color: string | null
          all_day: boolean
          recurrence_rule: string | null
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          org_id: string
          title: string
          start_at: string
          end_at?: string | null
          event_type: EventType
          related_id?: string | null
          related_table?: string | null
          color?: string | null
          all_day?: boolean
          recurrence_rule?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: {
          title?: string
          start_at?: string
          end_at?: string | null
          color?: string | null
          recurrence_rule?: string | null
          updated_at?: string
          deleted_at?: string | null
        }
        Relationships: GenericRelationship[]
      }
      notifications: {
        Row: {
          id: string
          org_id: string
          user_id: string
          title: string
          body: string | null
          read_at: string | null
          related_id: string | null
          related_table: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          user_id: string
          title: string
          body?: string | null
          read_at?: string | null
          related_id?: string | null
          related_table?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          read_at?: string | null
          updated_at?: string
        }
        Relationships: GenericRelationship[]
      }
      contracts: {
        Row: {
          id: string
          org_id: string
          number: string
          title: string
          description: string | null
          status: ContractStatus
          vendor_name: string | null
          vendor_contact: string | null
          vendor_email: string | null
          contract_value: number | null
          start_date: string | null
          end_date: string | null
          signed_at: string | null
          terminated_at: string | null
          termination_reason: string | null
          notes: string | null
          created_by: string
          created_at: string
          updated_at: string
          deleted_at: string | null
          /** Previous contract value before the most recent amendment (null = never amended) */
          previous_value: number | null
          /** Previous end date before the most recent amendment (null = never amended) */
          previous_end_date: string | null
          /** Timestamp of the most recent amendment; null means the contract has never been amended */
          amended_at: string | null
        }
        Insert: {
          id?: string
          org_id: string
          number?: string
          title: string
          description?: string | null
          status?: ContractStatus
          vendor_name?: string | null
          vendor_contact?: string | null
          vendor_email?: string | null
          contract_value?: number | null
          start_date?: string | null
          end_date?: string | null
          signed_at?: string | null
          terminated_at?: string | null
          termination_reason?: string | null
          notes?: string | null
          created_by: string
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
          previous_value?: number | null
          previous_end_date?: string | null
          amended_at?: string | null
        }
        Update: {
          title?: string
          description?: string | null
          status?: ContractStatus
          vendor_name?: string | null
          vendor_contact?: string | null
          vendor_email?: string | null
          contract_value?: number | null
          start_date?: string | null
          end_date?: string | null
          signed_at?: string | null
          terminated_at?: string | null
          termination_reason?: string | null
          notes?: string | null
          updated_at?: string
          deleted_at?: string | null
          previous_value?: number | null
          previous_end_date?: string | null
          amended_at?: string | null
        }
        Relationships: GenericRelationship[]
      }
      contract_bids: {
        Row: {
          id: string
          org_id: string
          contract_id: string
          bid_type: BidType
          vendor_name: string
          vendor_contact: string | null
          vendor_email: string | null
          amount: number | null
          notes: string | null
          status: BidStatus
          submitted_at: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          created_by: string
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          org_id: string
          contract_id: string
          bid_type?: BidType
          vendor_name: string
          vendor_contact?: string | null
          vendor_email?: string | null
          amount?: number | null
          notes?: string | null
          status?: BidStatus
          submitted_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          created_by: string
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: {
          bid_type?: BidType
          vendor_name?: string
          vendor_contact?: string | null
          vendor_email?: string | null
          amount?: number | null
          notes?: string | null
          status?: BidStatus
          submitted_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          updated_at?: string
          deleted_at?: string | null
        }
        Relationships: GenericRelationship[]
      }
      pothole_reports: {
        Row: {
          id: string
          org_id: string
          number: string
          title: string
          description: string | null
          defect_type: SurfaceDefectType
          status: PotholeStatus
          severity: WorkOrderSeverity
          pci_score: number | null
          address: string | null
          latitude: number | null
          longitude: number | null
          assigned_to: string | null
          reported_by: string | null
          work_order_id: string | null
          before_photo_id: string | null
          after_photo_id: string | null
          is_recurring: boolean
          recurrence_count: number
          repair_cost: number
          repaired_at: string | null
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          org_id: string
          number?: string
          title: string
          description?: string | null
          defect_type?: SurfaceDefectType
          status?: PotholeStatus
          severity?: WorkOrderSeverity
          pci_score?: number | null
          address?: string | null
          latitude?: number | null
          longitude?: number | null
          assigned_to?: string | null
          reported_by?: string | null
          work_order_id?: string | null
          before_photo_id?: string | null
          after_photo_id?: string | null
          is_recurring?: boolean
          recurrence_count?: number
          repair_cost?: number
          repaired_at?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: {
          title?: string
          description?: string | null
          defect_type?: SurfaceDefectType
          status?: PotholeStatus
          severity?: WorkOrderSeverity
          pci_score?: number | null
          address?: string | null
          latitude?: number | null
          longitude?: number | null
          assigned_to?: string | null
          reported_by?: string | null
          work_order_id?: string | null
          before_photo_id?: string | null
          after_photo_id?: string | null
          is_recurring?: boolean
          recurrence_count?: number
          repair_cost?: number
          repaired_at?: string | null
          updated_at?: string
          deleted_at?: string | null
        }
        Relationships: GenericRelationship[]
      }
      work_orders: {
        Row: {
          id: string
          org_id: string
          number: string
          title: string
          description: string | null
          status: WorkOrderStatus
          priority: WorkOrderPriority
          severity: WorkOrderSeverity | null
          assigned_to: string | null
          location_id: string | null
          due_date: string | null
          started_at: string | null
          closed_at: string | null
          labor_hours: number
          labor_cost: number
          materials_cost: number
          total_cost: number
          latitude: number | null
          longitude: number | null
          blocked: boolean
          blocked_by: string | null
          blocked_by_reason: string | null
          blocked_since: string | null
          notes: string | null
          created_by: string
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          org_id: string
          number?: string
          title: string
          description?: string | null
          status?: WorkOrderStatus
          priority?: WorkOrderPriority
          severity?: WorkOrderSeverity | null
          assigned_to?: string | null
          location_id?: string | null
          due_date?: string | null
          started_at?: string | null
          closed_at?: string | null
          labor_hours?: number
          labor_cost?: number
          materials_cost?: number
          latitude?: number | null
          longitude?: number | null
          blocked?: boolean
          blocked_by?: string | null
          blocked_by_reason?: string | null
          blocked_since?: string | null
          notes?: string | null
          created_by: string
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: {
          title?: string
          description?: string | null
          status?: WorkOrderStatus
          priority?: WorkOrderPriority
          severity?: WorkOrderSeverity | null
          assigned_to?: string | null
          location_id?: string | null
          due_date?: string | null
          started_at?: string | null
          closed_at?: string | null
          labor_hours?: number
          labor_cost?: number
          materials_cost?: number
          latitude?: number | null
          longitude?: number | null
          blocked?: boolean
          blocked_by?: string | null
          blocked_by_reason?: string | null
          blocked_since?: string | null
          notes?: string | null
          updated_at?: string
          deleted_at?: string | null
        }
        Relationships: GenericRelationship[]
      }
      audit_log: {
        Row: {
          id: string
          org_id: string
          user_id: string | null
          action: string
          table_name: string
          record_id: string
          old_data: Json | null
          new_data: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          user_id?: string | null
          action: string
          table_name: string
          record_id: string
          old_data?: Json | null
          new_data?: Json | null
          created_at?: string
        }
        Update: Record<string, never>
        Relationships: GenericRelationship[]
      }
      projects: {
        Row: {
          id: string
          org_id: string
          number: string
          name: string
          code: string
          description: string | null
          status: ProjectStatus
          address: string | null
          latitude: number | null
          longitude: number | null
          cover_image_id: string | null
          start_date: string | null
          planned_end_date: string | null
          end_date: string | null
          budget: number | null
          actual_cost: number
          project_manager: string | null
          blocked: boolean
          blocked_by: string | null
          blocked_by_reason: string | null
          blocked_since: string | null
          cover_url: string | null
          created_by: string
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          org_id: string
          number?: string
          name: string
          code: string
          description?: string | null
          status?: ProjectStatus
          address?: string | null
          latitude?: number | null
          longitude?: number | null
          cover_image_id?: string | null
          start_date?: string | null
          planned_end_date?: string | null
          end_date?: string | null
          budget?: number | null
          actual_cost?: number
          project_manager?: string | null
          blocked?: boolean
          blocked_by?: string | null
          blocked_by_reason?: string | null
          blocked_since?: string | null
          cover_url?: string | null
          created_by: string
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: {
          name?: string
          code?: string
          description?: string | null
          status?: ProjectStatus
          address?: string | null
          latitude?: number | null
          longitude?: number | null
          cover_image_id?: string | null
          start_date?: string | null
          planned_end_date?: string | null
          end_date?: string | null
          budget?: number | null
          actual_cost?: number
          project_manager?: string | null
          blocked?: boolean
          blocked_by?: string | null
          blocked_by_reason?: string | null
          blocked_since?: string | null
          cover_url?: string | null
          updated_at?: string
          deleted_at?: string | null
        }
        Relationships: GenericRelationship[]
      }
      inspections: {
        Row: {
          id: string
          org_id: string
          number: string
          title: string
          project_id: string | null
          work_order_id: string | null
          pothole_id: string | null
          status: InspectionStatus
          inspector_id: string | null
          score: number | null
          scheduled_at: string | null
          started_at: string | null
          completed_at: string | null
          latitude: number | null
          longitude: number | null
          address: string | null
          notes: string | null
          created_by: string
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          org_id: string
          number?: string
          title: string
          project_id?: string | null
          work_order_id?: string | null
          pothole_id?: string | null
          status?: InspectionStatus
          inspector_id?: string | null
          score?: number | null
          scheduled_at?: string | null
          started_at?: string | null
          completed_at?: string | null
          latitude?: number | null
          longitude?: number | null
          address?: string | null
          notes?: string | null
          created_by: string
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: {
          title?: string
          project_id?: string | null
          work_order_id?: string | null
          pothole_id?: string | null
          status?: InspectionStatus
          inspector_id?: string | null
          score?: number | null
          scheduled_at?: string | null
          started_at?: string | null
          completed_at?: string | null
          latitude?: number | null
          longitude?: number | null
          address?: string | null
          notes?: string | null
          updated_at?: string
          deleted_at?: string | null
        }
        Relationships: GenericRelationship[]
      }
      inspection_checklist_items: {
        Row: {
          id: string
          inspection_id: string
          org_id: string
          item_number: number
          category: string
          description: string
          result: InspectionItemResult | null
          severity: InspectionItemSeverity
          notes: string | null
          photo_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          inspection_id: string
          org_id: string
          item_number: number
          category: string
          description: string
          result?: InspectionItemResult | null
          severity?: InspectionItemSeverity
          notes?: string | null
          photo_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          item_number?: number
          category?: string
          description?: string
          result?: InspectionItemResult | null
          severity?: InspectionItemSeverity
          notes?: string | null
          photo_id?: string | null
          updated_at?: string
        }
        Relationships: GenericRelationship[]
      }
    }
    Views: Record<string, never>
    Functions: {
      locations_within_radius: {
        Args: {
          center_lat: number
          center_lng: number
          radius_meters: number
        }
        Returns: Database['public']['Tables']['locations']['Row'][]
      }
    }
    Enums: {
      app_role: AppRole
      event_type: EventType
      work_order_status: WorkOrderStatus
      work_order_priority: WorkOrderPriority
      work_order_severity: WorkOrderSeverity
      contract_status: ContractStatus
      bid_type: BidType
      bid_status: BidStatus
      pothole_status: PotholeStatus
      surface_defect_type: SurfaceDefectType
      project_status: ProjectStatus
      inspection_status: InspectionStatus
      inspection_item_result: InspectionItemResult
      inspection_item_severity: InspectionItemSeverity
    }
    CompositeTypes: Record<string, never>
  }
}
