// ─── Map Constants ────────────────────────────────────────────────────────────

export const MAP_CONFIG = {
  CENTER: { lng: -66.0858, lat: 18.383 },
  ZOOM: 13,
  BOUNDS: {
    SW: [-66.1197, 18.3394] as [number, number],
    NE: [-66.0519, 18.4267] as [number, number],
  },
  TILE_URL: 'https://tiles.openfreemap.org/styles/liberty',
} as const

// ─── Role Constants ───────────────────────────────────────────────────────────

export const APP_ROLES = ['admin', 'supervisor', 'inspector', 'vendor', 'viewer'] as const
export type AppRole = (typeof APP_ROLES)[number]

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: 'Administrator',
  supervisor: 'Supervisor',
  inspector: 'Inspector',
  vendor: 'Vendor',
  viewer: 'Viewer',
}

// Roles that can write to most resources
export const WRITE_ROLES: AppRole[] = ['admin', 'supervisor', 'inspector']
// Roles that can reassign or manage work orders
export const MANAGE_ROLES: AppRole[] = ['admin', 'supervisor']

// ─── FM Role Mapping ──────────────────────────────────────────────────────────
// Maps the FM v2 role naming convention to platform app_role values.

/** FM v2 role string (as used in the legacy Prisma model) */
export type FmRole = 'ADMIN' | 'MANAGER' | 'INSPECTOR' | 'CLIENT_VIEWER'

/** How FM roles appear to FM users in the UI */
export const FM_ROLE_LABELS: Record<AppRole, string> = {
  admin:      'Admin',
  supervisor: 'Manager',
  inspector:  'Inspector',
  vendor:     'Vendor',
  viewer:     'Client Viewer',
}

/** Map an FM or platform role string → app_role. Safe for unknown inputs. */
export function normalizeFmRole(role: string): AppRole {
  const map: Record<string, AppRole> = {
    // FM naming
    ADMIN:         'admin',
    MANAGER:       'supervisor',
    INSPECTOR:     'inspector',
    CLIENT_VIEWER: 'viewer',
    // Platform naming (pass-through)
    admin:         'admin',
    supervisor:    'supervisor',
    inspector:     'inspector',
    vendor:        'vendor',
    viewer:        'viewer',
  }
  return map[role.trim()] ?? 'viewer'
}

/** Convert a platform app_role back to FM's display label */
export function roleToFmLabel(role: AppRole): string {
  return FM_ROLE_LABELS[role]
}

// ─── Calendar Event Colors ────────────────────────────────────────────────────

export const EVENT_COLORS = {
  work_order: '#3B82F6',       // blue
  inspection: '#10B981',       // green
  contract_milestone: '#F59E0B', // amber
  maintenance: '#8B5CF6',      // purple
} as const

// ─── File Upload Limits ───────────────────────────────────────────────────────

export const UPLOAD_LIMITS = {
  PHOTO_MAX_BYTES: 10 * 1024 * 1024,          // 10 MB raw
  PHOTO_COMPRESSED_MAX_BYTES: 1.5 * 1024 * 1024, // 1.5 MB after compression
  PHOTO_COMPRESSED_QUALITY: 0.82,
  PHOTO_MAX_DIMENSION: 1920,
  DOCUMENT_MAX_BYTES: 25 * 1024 * 1024,       // 25 MB
  AVATAR_MAX_BYTES: 2 * 1024 * 1024,          // 2 MB
} as const

// ─── Storage Buckets ──────────────────────────────────────────────────────────

export const STORAGE_BUCKETS = {
  PHOTOS: 'photos',
  DOCUMENTS: 'documents',
  AVATARS: 'avatars',
} as const
