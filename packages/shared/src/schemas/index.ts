import { z } from 'zod'

// ─── Auth Schemas ─────────────────────────────────────────────────────────────

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

export const inviteUserSchema = z.object({
  email: z.string().email('Invalid email address'),
  role: z.enum(['admin', 'supervisor', 'inspector', 'vendor', 'viewer']),
  full_name: z.string().min(2, 'Name must be at least 2 characters').max(120, 'Name is too long').optional(),
})

export const setPasswordSchema = z
  .object({
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirm_password: z.string(),
  })
  .refine((data) => data.password === data.confirm_password, {
    message: 'Passwords do not match',
    path: ['confirm_password'],
  })

// ─── Location Schemas ─────────────────────────────────────────────────────────

export const coordinatesSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy: z.number().optional(),
})

export const locationSchema = z.object({
  name: z.string().min(1, 'Location name is required').optional(),
  address: z.string().optional(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
})

// ─── Calendar Event Schemas ───────────────────────────────────────────────────

export const calendarEventSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  start_at: z.string().datetime(),
  end_at: z.string().datetime().optional(),
  event_type: z.enum(['work_order', 'inspection', 'contract_milestone', 'maintenance']),
  all_day: z.boolean().default(false),
  color: z.string().optional(),
  recurrence_rule: z.string().optional(),
  related_id: z.string().uuid().optional(),
  related_table: z.string().optional(),
})

// ─── Notification Schemas ─────────────────────────────────────────────────────

export const createNotificationSchema = z.object({
  user_id: z.string().uuid(),
  title: z.string().min(1),
  body: z.string().optional(),
  related_id: z.string().uuid().optional(),
  related_table: z.string().optional(),
})

export type LoginInput = z.infer<typeof loginSchema>
export type InviteUserInput = z.infer<typeof inviteUserSchema>
export type SetPasswordInput = z.infer<typeof setPasswordSchema>
export type Coordinates = z.infer<typeof coordinatesSchema>
export type LocationInput = z.infer<typeof locationSchema>
export type CalendarEventInput = z.infer<typeof calendarEventSchema>
export type CreateNotificationInput = z.infer<typeof createNotificationSchema>
