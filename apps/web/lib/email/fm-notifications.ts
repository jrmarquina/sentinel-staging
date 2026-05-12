/**
 * FM email notifications — N-1 through N-4
 *
 * N-1  Contributor submits WO  → all org_manager capability users
 * N-2  Manager triages to OPEN → assigned worker / supplier
 * N-3  WO completed            → manager who engaged it (engaged_by_id)
 * N-4  DIRECTOR_REFERRAL type  → all org_viewer capability users (Director)
 *
 * All emails are in Spanish (Puerto Rico Head Start client).
 * Failures are logged but never surface to callers.
 */

import { createAdminClient } from '@/lib/supabase/server'
import { sendEmail } from './resend'

// ── Platform URL ───────────────────────────────────────────────────────────

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ??
  process.env.NEXT_PUBLIC_SUPABASE_URL?.replace('/supabase', '') ??
  'https://staging.sentinelmgpr.com'

function woUrl(id: string) {
  return `${APP_URL}/dashboard/fm/work-orders?focus=${id}`
}

// ── Shared HTML template ──────────────────────────────────────────────────

function emailShell(opts: {
  heading:    string
  body:       string
  ctaLabel:   string
  ctaUrl:     string
  footer?:    string
}): string {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr><td style="background:#0d1b2e;padding:24px 32px;">
          <p style="margin:0;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.12em;color:#64748b;">Sentinel · Facilities Management</p>
          <p style="margin:8px 0 0;font-size:20px;font-weight:800;color:#f8fafc;">${opts.heading}</p>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:32px;">
          ${opts.body}

          <!-- CTA button -->
          <table cellpadding="0" cellspacing="0" style="margin-top:28px;">
            <tr><td style="background:#2563eb;border-radius:8px;">
              <a href="${opts.ctaUrl}" style="display:inline-block;padding:12px 24px;font-size:14px;font-weight:700;color:#fff;text-decoration:none;">${opts.ctaLabel}</a>
            </td></tr>
          </table>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:20px 32px;border-top:1px solid #e2e8f0;background:#f8fafc;">
          <p style="margin:0;font-size:11px;color:#94a3b8;">${opts.footer ?? 'Este mensaje fue generado automáticamente por el sistema Sentinel. Por favor no responda a este correo.'}</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}

// Detail row helper — used inside email body
function detailRow(label: string, value: string) {
  return `<tr>
    <td style="padding:6px 12px 6px 0;font-size:12px;font-weight:700;color:#64748b;white-space:nowrap;vertical-align:top;">${label}</td>
    <td style="padding:6px 0;font-size:13px;color:#1e293b;">${value}</td>
  </tr>`
}

function detailTable(rows: [string, string][]): string {
  return `<table cellpadding="0" cellspacing="0" style="margin:20px 0;width:100%;background:#f8fafc;border-radius:8px;padding:12px 16px;border:1px solid #e2e8f0;">
    ${rows.map(([l, v]) => detailRow(l, v)).join('')}
  </table>`
}

// Category display names
const CATEGORY_LABELS: Record<string, string> = {
  PLOMERIA:           'Plomería',
  CARPINTERIA:        'Carpintería',
  ELECTRICIDAD:       'Electricidad',
  CISTERNA:           'Cisterna',
  TRAMPA_GRASA:       'Trampa Grasa',
  AREAS_VERDES:       'Áreas Verdes',
  AIRE_ACONDICIONADO: 'Aire Acondicionado',
  REFRIGERACION:      'Refrigeración',
  ALARMA_INCENDIO:    'Alarma de Incendio',
  EXTINTORES:         'Extintores',
  CONTROL_ACCESO:     'Control de Acceso',
  CONTROL_PLAGAS:     'Control de Plagas',
  ESTRUCTURA:         'Estructura',
  FILTRACIONES:       'Filtraciones',
  GENERADOR:          'Generador',
  PINTURA:            'Pintura',
  POZO_SEPTICO:       'Pozo Séptico',
  ROTULACION:         'Rotulación',
}

const ASSIGNEE_LABELS: Record<string, string> = {
  HS_STAFF:           'Personal Head Start',
  MUNICIPALITY:       'Municipio',
  EXTERNAL_SUPPLIER:  'Suplidor Externo',
  DIRECTOR_REFERRAL:  'Referido al Director',
}

function catLabel(c: string | null) { return c ? (CATEGORY_LABELS[c] ?? c) : '—' }
function assigneeLabel(a: string | null) { return a ? (ASSIGNEE_LABELS[a] ?? a) : '—' }

// ── Recipient helpers ──────────────────────────────────────────────────────

/**
 * Returns emails + names of all FM users with one of the given capabilities
 * in the given org. Uses the admin client to join user_roles → auth.users.
 */
async function getUsersByCapability(
  orgId: string,
  capabilities: string[],
): Promise<{ userId: string; email: string; fullName: string }[]> {
  try {
    const admin = createAdminClient()

    const { data: roles } = await admin
      .from('user_roles')
      .select('user_id')
      .eq('org_id', orgId)
      .in('capability', capabilities)

    if (!roles?.length) return []

    const userIds = new Set(roles.map((r: { user_id: string }) => r.user_id))

    // Get full names from profiles
    const { data: profiles } = await admin
      .from('profiles')
      .select('id, full_name')
      .in('id', [...userIds])

    const nameMap = new Map((profiles ?? []).map((p: { id: string; full_name: string | null }) => [p.id, p.full_name ?? '']))

    // Get emails from auth admin API
    const { data: authData } = await admin.auth.admin.listUsers({ perPage: 1000 })
    return (authData?.users ?? [])
      .filter((u) => userIds.has(u.id) && u.email)
      .map((u) => ({ userId: u.id, email: u.email!, fullName: nameMap.get(u.id) || u.email! }))
  } catch (e) {
    console.error('[fm-notify] getUsersByCapability failed:', e)
    return []
  }
}

/**
 * Returns the email + name of a single user by their profile id.
 */
async function getUserById(userId: string): Promise<{ userId: string; email: string; fullName: string } | null> {
  try {
    const admin = createAdminClient()
    const { data: profile } = await admin
      .from('profiles')
      .select('id, full_name')
      .eq('id', userId)
      .single()

    const { data: authUser } = await admin.auth.admin.getUserById(userId)
    if (!authUser?.user?.email) return null

    return {
      userId:   userId,
      email:    authUser.user.email,
      fullName: (profile as { full_name: string | null } | null)?.full_name ?? authUser.user.email,
    }
  } catch (e) {
    console.error('[fm-notify] getUserById failed:', e)
    return null
  }
}

// ── In-app notification insert ─────────────────────────────────────────────

/**
 * Inserts a row into the `notifications` table so the in-app bell
 * lights up in real time via Supabase Realtime.
 * Uses the admin client to bypass RLS (service role insert).
 */
async function insertInApp(opts: {
  userId:       string
  orgId:        string
  title:        string
  body?:        string
  relatedId?:   string
  relatedTable?: string
}): Promise<void> {
  try {
    const admin = createAdminClient()
    await admin.from('notifications').insert({
      user_id:       opts.userId,
      org_id:        opts.orgId,
      title:         opts.title,
      body:          opts.body ?? null,
      related_id:    opts.relatedId ?? null,
      related_table: opts.relatedTable ?? null,
    })
  } catch (e) {
    console.error('[fm-notify] insertInApp failed:', e)
  }
}

/**
 * Fan-out helper — inserts an in-app notification for each recipient.
 */
async function insertInAppMany(
  recipients: { userId: string }[],
  opts: Omit<Parameters<typeof insertInApp>[0], 'userId'>,
): Promise<void> {
  await Promise.allSettled(
    recipients.map((r) => insertInApp({ ...opts, userId: r.userId }))
  )
}

// ── WO type used across notifications ─────────────────────────────────────

interface WoSummary {
  id:            string
  title:         string
  description:   string | null
  category:      string | null
  priority:      string
  assignee_type: string | null
  due_date:      string | null
  property_name: string | null  // from joined fm_properties
  submitter_name: string | null // full_name of submitted_by_id user
}

// ── N-1: Contributor submitted → all FM managers ──────────────────────────

export async function notifyManagersNewWO(wo: WoSummary, orgId: string): Promise<void> {
  const managers = await getUsersByCapability(orgId, ['org_admin', 'fm_manager'])
  if (!managers.length) return

  const rows: [string, string][] = [
    ['Título',      wo.title],
    ['Categoría',   catLabel(wo.category)],
    ['Prioredad',   wo.priority],
    ['Propiedad',   wo.property_name ?? '—'],
    ['Enviado por', wo.submitter_name ?? '—'],
  ]
  if (wo.due_date) rows.push(['Fecha límite', new Date(wo.due_date).toLocaleDateString('es-PR', { day: 'numeric', month: 'long', year: 'numeric' })])
  if (wo.description) rows.push(['Descripción', wo.description.slice(0, 300) + (wo.description.length > 300 ? '…' : '')])

  const html = emailShell({
    heading:  'Nueva Solicitud de Mantenimiento',
    body: `
      <p style="margin:0 0 8px;font-size:15px;color:#1e293b;">Se ha recibido una nueva solicitud de mantenimiento que requiere su atención.</p>
      ${detailTable(rows)}
      <p style="font-size:12px;color:#64748b;margin:0;">Esta solicitud está en estado <strong>Pendiente de Revisión</strong>. Acceda a la plataforma para revisarla y asignarla.</p>
    `,
    ctaLabel: 'Revisar Solicitud',
    ctaUrl:   woUrl(wo.id),
  })

  await Promise.all([
    sendEmail({
      to:      managers.map((m) => m.email),
      subject: `[Sentinel FM] Nueva solicitud: ${wo.title}`,
      html,
    }),
    insertInAppMany(managers, {
      orgId:        orgId,
      title:        `Nueva solicitud: ${wo.title}`,
      body:         `Pendiente de revisión · ${wo.property_name ?? ''}`,
      relatedId:    wo.id,
      relatedTable: 'fm_work_orders',
    }),
  ])
}

// ── N-2: WO triaged to OPEN + assigned → assigned person ──────────────────

export async function notifyAssigneeWOOpen(
  wo: WoSummary,
  assignedToId: string,
  orgId: string,
): Promise<void> {
  const assignee = await getUserById(assignedToId)
  if (!assignee) return

  const rows: [string, string][] = [
    ['Título',    wo.title],
    ['Categoría', catLabel(wo.category)],
    ['Prioredad', wo.priority],
    ['Propiedad', wo.property_name ?? '—'],
    ['Asignado como', assigneeLabel(wo.assignee_type)],
  ]
  if (wo.due_date) rows.push(['Fecha límite', new Date(wo.due_date).toLocaleDateString('es-PR', { day: 'numeric', month: 'long', year: 'numeric' })])

  const html = emailShell({
    heading:  'Orden de Trabajo Asignada',
    body: `
      <p style="margin:0 0 8px;font-size:15px;color:#1e293b;">Estimado/a <strong>${assignee.fullName}</strong>,</p>
      <p style="font-size:14px;color:#475569;margin:0 0 8px;">Se le ha asignado la siguiente orden de trabajo.</p>
      ${detailTable(rows)}
    `,
    ctaLabel: 'Ver Orden de Trabajo',
    ctaUrl:   woUrl(wo.id),
  })

  await Promise.all([
    sendEmail({
      to:      assignee.email,
      subject: `[Sentinel FM] Orden asignada: ${wo.title}`,
      html,
    }),
    insertInApp({
      userId:       assignee.userId,
      orgId,
      title:        `Orden asignada: ${wo.title}`,
      body:         `${wo.property_name ?? ''} · ${wo.priority}`,
      relatedId:    wo.id,
      relatedTable: 'fm_work_orders',
    }),
  ])
}

// ── N-3: WO completed → manager who engaged it ────────────────────────────

export async function notifyManagerWOCompleted(
  wo: WoSummary,
  engagedById: string,
  orgId: string,
): Promise<void> {
  const manager = await getUserById(engagedById)
  if (!manager) return

  const rows: [string, string][] = [
    ['Título',    wo.title],
    ['Categoría', catLabel(wo.category)],
    ['Prioredad', wo.priority],
    ['Propiedad', wo.property_name ?? '—'],
  ]

  const html = emailShell({
    heading:  'Orden de Trabajo Completada',
    body: `
      <p style="margin:0 0 8px;font-size:15px;color:#1e293b;">Estimado/a <strong>${manager.fullName}</strong>,</p>
      <p style="font-size:14px;color:#475569;margin:0 0 8px;">La siguiente orden de trabajo ha sido marcada como completada.</p>
      ${detailTable(rows)}
    `,
    ctaLabel: 'Ver Detalles',
    ctaUrl:   woUrl(wo.id),
  })

  await Promise.all([
    sendEmail({
      to:      manager.email,
      subject: `[Sentinel FM] Completada: ${wo.title}`,
      html,
    }),
    insertInApp({
      userId:       manager.userId,
      orgId,
      title:        `Orden completada: ${wo.title}`,
      body:         `${wo.property_name ?? ''} · ${wo.priority}`,
      relatedId:    wo.id,
      relatedTable: 'fm_work_orders',
    }),
  ])
}

// ── N-4: DIRECTOR_REFERRAL → all org_viewer users (Director Municipal) ────

export async function notifyDirectorReferral(wo: WoSummary, orgId: string): Promise<void> {
  const directors = await getUsersByCapability(orgId, ['fm_viewer'])
  if (!directors.length) return

  const rows: [string, string][] = [
    ['Título',         wo.title],
    ['Categoría',      catLabel(wo.category)],
    ['Prioredad',      wo.priority],
    ['Propiedad',      wo.property_name ?? '—'],
    ['Enviado por',    wo.submitter_name ?? '—'],
    ['Tipo de asignación', 'Referido al Director'],
  ]
  if (wo.description) rows.push(['Descripción', wo.description.slice(0, 300) + (wo.description.length > 300 ? '…' : '')])

  const html = emailShell({
    heading:  'Referido de Orden de Trabajo',
    body: `
      <p style="margin:0 0 8px;font-size:15px;color:#1e293b;">Esta orden de trabajo ha sido marcada como referido al Director y requiere su conocimiento.</p>
      ${detailTable(rows)}
    `,
    ctaLabel: 'Ver Orden de Trabajo',
    ctaUrl:   woUrl(wo.id),
  })

  await Promise.all([
    sendEmail({
      to:      directors.map((d) => d.email),
      subject: `[Sentinel FM] Referido al Director: ${wo.title}`,
      html,
    }),
    insertInAppMany(directors, {
      orgId,
      title:        `Referido al Director: ${wo.title}`,
      body:         `${wo.property_name ?? ''} · ${wo.submitter_name ?? ''}`,
      relatedId:    wo.id,
      relatedTable: 'fm_work_orders',
    }),
  ])
}
