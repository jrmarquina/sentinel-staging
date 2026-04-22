import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import { ArrowLeft, Edit2, User, MapPin, Calendar, Clock, DollarSign, FileText, FolderKanban } from 'lucide-react'
import { PriorityBadge } from '@/components/work-orders/PriorityBadge'
import { InlineStatusSelect } from '@/components/work-orders/InlineStatusSelect'
import { DeleteButton } from '@/components/ui/DeleteButton'
import type { Database } from '@sentinel/db'

type WorkOrderRow = Database['public']['Tables']['work_orders']['Row']

export async function generateMetadata({ params }: { params: { id: string } }) {
  return { title: `Work Order — Sentinel` }
}

const SEVERITY_LABELS: Record<string, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}

export default async function WorkOrderDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: roleData } = await supabase
    .from('user_roles').select('role').eq('user_id', user.id).single()
  const isAdmin = roleData?.role === 'admin'
  const canEditStatus = ['admin', 'supervisor', 'inspector'].includes(roleData?.role ?? '')

  // Note: assigned_to and created_by FK to auth.users — fetch profiles separately
  const { data, error } = await supabase
    .from('work_orders')
    .select(`
      *,
      location:locations(name, address),
      project:projects!work_orders_project_id_fkey(id, number, name)
    `)
    .eq('id', params.id)
    .is('deleted_at', null)
    .single()

  if (error || !data) notFound()

  const woRaw = data as WorkOrderRow & {
    location: { name: string | null; address: string | null } | null
    project: { id: string; number: string; name: string } | null
  }

  // Fetch profile names for assignee and creator
  const profileIds = [woRaw.assigned_to, woRaw.created_by].filter(Boolean) as string[]
  const profileMap: Record<string, { full_name: string | null; avatar_url?: string | null }> = {}
  if (profileIds.length > 0) {
    const { data: profileData } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
      .in('id', profileIds)
    for (const p of profileData ?? []) {
      if (p.id) profileMap[p.id] = p
    }
  }

  const wo = {
    ...woRaw,
    assignee: woRaw.assigned_to ? (profileMap[woRaw.assigned_to] ?? null) : null,
    creator:  woRaw.created_by  ? (profileMap[woRaw.created_by]  ?? null) : null,
  } as WorkOrderRow & {
    assignee: { full_name: string | null; avatar_url: string | null } | null
    creator: { full_name: string | null } | null
    location: { name: string | null; address: string | null } | null
    project: { id: string; number: string; name: string } | null
  }

  // Fetch attachments
  const { data: attachments } = await supabase
    .from('attachments')
    .select('*')
    .eq('related_id', params.id)
    .eq('related_table', 'work_orders')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Back + actions */}
      <div className="flex items-center justify-between gap-4">
        <Link
          href="/dashboard/work-orders"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors"
        >
          <ArrowLeft size={16} />
          Work Orders
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href={`/dashboard/work-orders/${params.id}/edit`}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            <Edit2 size={14} />
            Edit
          </Link>
          {isAdmin && (
            <DeleteButton
              id={params.id}
              table="work_orders"
              label={`Work Order ${wo.number}`}
              redirectTo="/dashboard/work-orders"
            />
          )}
        </div>
      </div>

      {/* Title card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="text-xs font-mono text-slate-400">{wo.number}</p>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-white">{wo.title}</h1>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <PriorityBadge priority={wo.priority} />
            <InlineStatusSelect workOrderId={wo.id} status={wo.status} readonly={!canEditStatus} />
            {wo.severity && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
                {SEVERITY_LABELS[wo.severity]}
              </span>
            )}
          </div>
        </div>

        {wo.description && (
          <p className="mt-4 text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
            {wo.description}
          </p>
        )}
      </div>

      {/* Details grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Assignment & dates */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Details</h2>

          <dl className="space-y-3 text-sm">
            {wo.project && (
              <div className="flex items-start gap-3">
                <FolderKanban size={15} className="text-slate-400 mt-0.5 flex-shrink-0" />
                <div>
                  <dt className="text-slate-400 text-xs">Project</dt>
                  <dd className="mt-0.5">
                    <Link
                      href={`/dashboard/projects/${wo.project.id}`}
                      className="text-blue-600 dark:text-blue-400 hover:underline text-sm font-medium"
                    >
                      {wo.project.number} — {wo.project.name}
                    </Link>
                  </dd>
                </div>
              </div>
            )}

            <div className="flex items-start gap-3">
              <User size={15} className="text-slate-400 mt-0.5 flex-shrink-0" />
              <div>
                <dt className="text-slate-400 text-xs">Assigned To</dt>
                <dd className="text-slate-900 dark:text-white mt-0.5">
                  {wo.assignee?.full_name ?? <span className="text-slate-400">Unassigned</span>}
                </dd>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <User size={15} className="text-slate-400 mt-0.5 flex-shrink-0" />
              <div>
                <dt className="text-slate-400 text-xs">Created By</dt>
                <dd className="text-slate-900 dark:text-white mt-0.5">
                  {wo.creator?.full_name ?? '—'}
                </dd>
              </div>
            </div>

            {wo.location && (
              <div className="flex items-start gap-3">
                <MapPin size={15} className="text-slate-400 mt-0.5 flex-shrink-0" />
                <div>
                  <dt className="text-slate-400 text-xs">Location</dt>
                  <dd className="text-slate-900 dark:text-white mt-0.5">
                    {wo.location.name ?? wo.location.address ?? '—'}
                    {wo.location.address && wo.location.name && (
                      <span className="block text-slate-400 text-xs">{wo.location.address}</span>
                    )}
                  </dd>
                </div>
              </div>
            )}

            {(wo as any).latitude != null && (
              <div className="flex items-start gap-3">
                <MapPin size={15} className="text-slate-400 mt-0.5 flex-shrink-0" />
                <div>
                  <dt className="text-slate-400 text-xs">Coordinates</dt>
                  <dd className="text-slate-900 dark:text-white mt-0.5 font-mono text-xs">
                    {Number((wo as any).latitude).toFixed(5)}, {Number((wo as any).longitude).toFixed(5)}
                  </dd>
                </div>
              </div>
            )}

            <div className="flex items-start gap-3">
              <Calendar size={15} className="text-slate-400 mt-0.5 flex-shrink-0" />
              <div>
                <dt className="text-slate-400 text-xs">Due Date</dt>
                <dd className="text-slate-900 dark:text-white mt-0.5">
                  {wo.due_date
                    ? format(new Date(wo.due_date), 'MMMM d, yyyy')
                    : <span className="text-slate-400">Not set</span>}
                </dd>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Clock size={15} className="text-slate-400 mt-0.5 flex-shrink-0" />
              <div>
                <dt className="text-slate-400 text-xs">Created</dt>
                <dd className="text-slate-900 dark:text-white mt-0.5">
                  {format(new Date(wo.created_at), 'MMM d, yyyy h:mm a')}
                </dd>
              </div>
            </div>

            {wo.closed_at && (
              <div className="flex items-start gap-3">
                <Clock size={15} className="text-slate-400 mt-0.5 flex-shrink-0" />
                <div>
                  <dt className="text-slate-400 text-xs">Closed</dt>
                  <dd className="text-slate-900 dark:text-white mt-0.5">
                    {format(new Date(wo.closed_at), 'MMM d, yyyy h:mm a')}
                  </dd>
                </div>
              </div>
            )}
          </dl>
        </div>

        {/* Costs */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Labor & Costs</h2>

          <dl className="space-y-3 text-sm">
            <div className="flex items-start gap-3">
              <Clock size={15} className="text-slate-400 mt-0.5 flex-shrink-0" />
              <div>
                <dt className="text-slate-400 text-xs">Labor Hours</dt>
                <dd className="text-slate-900 dark:text-white mt-0.5">{wo.labor_hours ?? 0} hrs</dd>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <DollarSign size={15} className="text-slate-400 mt-0.5 flex-shrink-0" />
              <div>
                <dt className="text-slate-400 text-xs">Labor Cost</dt>
                <dd className="text-slate-900 dark:text-white mt-0.5">
                  ${(wo.labor_cost ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </dd>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <DollarSign size={15} className="text-slate-400 mt-0.5 flex-shrink-0" />
              <div>
                <dt className="text-slate-400 text-xs">Materials Cost</dt>
                <dd className="text-slate-900 dark:text-white mt-0.5">
                  ${(wo.materials_cost ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </dd>
              </div>
            </div>

            <div className="flex items-start gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
              <DollarSign size={15} className="text-slate-600 dark:text-slate-300 mt-0.5 flex-shrink-0" />
              <div>
                <dt className="text-slate-400 text-xs">Total Cost</dt>
                <dd className="text-lg font-semibold text-slate-900 dark:text-white mt-0.5">
                  ${(wo.total_cost ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </dd>
              </div>
            </div>
          </dl>
        </div>
      </div>

      {/* Blocked banner */}
      {wo.blocked && (
        <div className="flex items-start gap-3 px-5 py-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl">
          <span className="text-amber-600 text-lg flex-shrink-0">🔒</span>
          <div>
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
              Blocked by {wo.blocked_by ?? 'external dependency'}
            </p>
            {wo.blocked_by_reason && (
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-1 leading-relaxed">{wo.blocked_by_reason}</p>
            )}
            {wo.blocked_since && (
              <p className="text-xs text-amber-600 mt-1">Since {format(new Date(wo.blocked_since), 'MMM d, yyyy')}</p>
            )}
          </div>
        </div>
      )}

      {/* Notes */}
      {wo.notes && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">Notes</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">{wo.notes}</p>
        </div>
      )}

      {/* Photos */}
      {(attachments ?? []).length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">
            Photos & Attachments ({attachments!.length})
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {(attachments ?? []).map((att) => {
              const isImage = att.file_type.startsWith('image/')
              return (
                <a
                  key={att.id}
                  href={`/api/attachments/${att.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group block rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 hover:border-blue-400 transition-colors"
                >
                  {isImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/attachments/${att.id}`}
                      alt={att.file_name}
                      className="w-full h-28 object-cover group-hover:opacity-90 transition-opacity"
                    />
                  ) : (
                    <div className="w-full h-28 flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-800">
                      <FileText size={24} className="text-slate-400" />
                      <span className="text-xs text-slate-400 mt-1 px-2 text-center truncate w-full">{att.file_name}</span>
                    </div>
                  )}
                </a>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
