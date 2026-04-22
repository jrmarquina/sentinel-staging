'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Plus, Trash2, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useT } from '@/lib/locale'
import { LocationField } from '@/components/ui/LocationField'
import type { Database, InspectionStatus, InspectionItemSeverity } from '@sentinel/db'

type Profile = Database['public']['Tables']['profiles']['Row']
type Project = Pick<Database['public']['Tables']['projects']['Row'], 'id' | 'name' | 'code'>
type WorkOrder = Pick<Database['public']['Tables']['work_orders']['Row'], 'id' | 'number' | 'title'>
type InspectionRow = Database['public']['Tables']['inspections']['Row']
type ChecklistItemRow = Database['public']['Tables']['inspection_checklist_items']['Row']

interface ChecklistDraft {
  id?: string
  item_number: number
  category: string
  description: string
  severity: InspectionItemSeverity
  notes: string
}

interface Props {
  orgId: string
  userId: string
  members: Profile[]
  projects: Project[]
  workOrders: WorkOrder[]
  defaultProjectId?: string
  initial?: InspectionRow
  initialChecklist?: ChecklistItemRow[]
}

const STATUSES: InspectionStatus[] = ['draft', 'in_progress', 'completed', 'approved']
const SEVERITIES: InspectionItemSeverity[] = ['critical', 'major', 'minor', 'informational']

// Default checklist template for road/infrastructure inspections
const DEFAULT_CHECKLIST: Omit<ChecklistDraft, 'id'>[] = [
  { item_number: 1,  category: 'Pavement',  description: 'Surface condition — check for cracks, potholes, rutting', severity: 'major' as const,  notes: '' },
  { item_number: 2,  category: 'Pavement',  description: 'Pavement markings visibility and condition', severity: 'minor' as const,  notes: '' },
  { item_number: 3,  category: 'Drainage',  description: 'Storm drains clear and functional', severity: 'major' as const,  notes: '' },
  { item_number: 4,  category: 'Drainage',  description: 'Curb and gutter condition', severity: 'minor' as const,  notes: '' },
  { item_number: 5,  category: 'Signage',   description: 'Traffic signs present, visible, and undamaged', severity: 'major' as const,  notes: '' },
  { item_number: 6,  category: 'Signage',   description: 'Street name signs legible', severity: 'minor' as const,  notes: '' },
  { item_number: 7,  category: 'Safety',    description: 'Guard rails intact and properly positioned', severity: 'critical' as const, notes: '' },
  { item_number: 8,  category: 'Safety',    description: 'No hazardous debris on roadway', severity: 'critical' as const, notes: '' },
  { item_number: 9,  category: 'Sidewalk',  description: 'Sidewalk continuity and ADA compliance', severity: 'major' as const,  notes: '' },
  { item_number: 10, category: 'Sidewalk',  description: 'Curb cuts present at intersections', severity: 'minor' as const,  notes: '' },
]

export function InspectionForm({ orgId, userId, members, projects, workOrders, defaultProjectId, initial, initialChecklist }: Props) {
  const t = useT()
  const router = useRouter()
  const supabase = createClient()
  const isEdit = !!initial

  const [title, setTitle] = useState(initial?.title ?? '')
  const [projectId, setProjectId] = useState(initial?.project_id ?? defaultProjectId ?? '')
  const [workOrderId, setWorkOrderId] = useState(initial?.work_order_id ?? '')
  const [inspectorId, setInspectorId] = useState(initial?.inspector_id ?? '')
  const [status, setStatus] = useState<InspectionStatus>(initial?.status ?? 'draft')
  const [scheduledAt, setScheduledAt] = useState(
    initial?.scheduled_at ? initial.scheduled_at.split('T')[0] : ''
  )
  const [address, setAddress] = useState(initial?.address ?? '')
  const [latitude, setLatitude] = useState(initial?.latitude?.toString() ?? '')
  const [longitude, setLongitude] = useState(initial?.longitude?.toString() ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [useDefaultChecklist, setUseDefaultChecklist] = useState(!isEdit)
  const [checklist, setChecklist] = useState<ChecklistDraft[]>(
    initialChecklist
      ? initialChecklist.map((i) => ({ id: i.id, item_number: i.item_number, category: i.category, description: i.description, severity: i.severity, notes: i.notes ?? '' }))
      : DEFAULT_CHECKLIST.map((i) => ({ ...i }))
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function addChecklistItem() {
    setChecklist((prev) => [
      ...prev,
      { item_number: prev.length + 1, category: '', description: '', severity: 'minor', notes: '' },
    ])
  }

  function removeChecklistItem(idx: number) {
    setChecklist((prev) => prev.filter((_, i) => i !== idx).map((item, i) => ({ ...item, item_number: i + 1 })))
  }

  function updateItem(idx: number, field: keyof ChecklistDraft, value: string) {
    setChecklist((prev) => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    setError(null)

    const payload = {
      org_id:       orgId,
      title:        title.trim(),
      project_id:   projectId || null,
      work_order_id: workOrderId || null,
      inspector_id: inspectorId || null,
      status,
      scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
      address:      address.trim() || null,
      latitude:     latitude !== '' ? parseFloat(latitude) : null,
      longitude:    longitude !== '' ? parseFloat(longitude) : null,
      notes:        notes.trim() || null,
    }

    let inspectionId: string

    if (isEdit && initial) {
      const { error: updateError } = await supabase
        .from('inspections')
        .update(payload as Database['public']['Tables']['inspections']['Update'])
        .eq('id', initial.id)
      if (updateError) { setError(updateError.message); setSaving(false); return }
      inspectionId = initial.id
    } else {
      const { data: created, error: insertError } = await supabase
        .from('inspections')
        .insert({ ...payload, created_by: userId } as Database['public']['Tables']['inspections']['Insert'])
        .select('id')
        .single()
      if (insertError || !created) { setError(insertError?.message ?? 'Unknown error'); setSaving(false); return }
      inspectionId = created.id as string
    }

    // Upsert checklist items
    if (checklist.length > 0) {
      const items = checklist
        .filter((item) => item.description.trim())
        .map((item) => ({
          ...(item.id ? { id: item.id } : {}),
          inspection_id: inspectionId,
          org_id:        orgId,
          item_number:   item.item_number,
          category:      item.category.trim() || 'General',
          description:   item.description.trim(),
          severity:      item.severity,
          notes:         item.notes.trim() || null,
        } as Database['public']['Tables']['inspection_checklist_items']['Insert']))

      await supabase.from('inspection_checklist_items').upsert(items, { onConflict: 'id' })
    }

    router.push(`/dashboard/inspections/${inspectionId}`)
  }

  const inputClass = 'w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500'
  const labelClass = 'block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1'
  const sectionClass = 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-4'

  const SEVERITY_COLOR: Record<InspectionItemSeverity, string> = {
    critical:      'border-red-400 dark:border-red-700',
    major:         'border-orange-400 dark:border-orange-700',
    minor:         'border-slate-200 dark:border-slate-700',
    informational: 'border-blue-200 dark:border-blue-900',
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/inspections" className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-white">
          {isEdit ? t('insp.form.saveBtn') : t('insp.newBtn')}
        </h1>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300">
          <AlertCircle size={16} />{error}
        </div>
      )}

      {/* Info */}
      <div className={sectionClass}>
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white uppercase tracking-wider">{t('insp.form.sectionInfo')}</h2>
        <div>
          <label className={labelClass}>{t('insp.form.title')} *</label>
          <input type="text" required value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder={t('insp.form.titlePlaceholder')} className={inputClass} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>{t('insp.form.project')}</label>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={inputClass}>
              <option value="">{t('insp.form.noProject')}</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>{t('insp.form.workOrder')}</label>
            <select value={workOrderId} onChange={(e) => setWorkOrderId(e.target.value)} className={inputClass}>
              <option value="">{t('insp.form.noWorkOrder')}</option>
              {workOrders.map((wo) => <option key={wo.id} value={wo.id}>{wo.number} — {wo.title}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className={labelClass}>{t('insp.form.inspector')}</label>
            <select value={inspectorId} onChange={(e) => setInspectorId(e.target.value)} className={inputClass}>
              <option value="">{t('insp.form.noInspector')}</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.full_name ?? m.id}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>{t('insp.form.status')}</label>
            <select value={status} onChange={(e) => setStatus(e.target.value as InspectionStatus)} className={inputClass}>
              {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>{t('insp.form.scheduled')}</label>
            <input type="date" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className={inputClass} />
          </div>
        </div>
      </div>

      {/* Location */}
      <div className={sectionClass}>
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white uppercase tracking-wider">{t('insp.form.sectionLocation')}</h2>
        <LocationField
          lat={latitude}
          lng={longitude}
          onChangeLat={setLatitude}
          onChangeLng={setLongitude}
          label={t('insp.form.address')}
          inputClass={inputClass}
          labelClass={labelClass}
          showAddressField
          address={address}
          onChangeAddress={setAddress}
          addressPlaceholder="e.g. Calle San Jorge km 2.1"
        />
      </div>

      {/* Checklist */}
      <div className={sectionClass}>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white uppercase tracking-wider">{t('insp.form.sectionChecklist')}</h2>
          <div className="flex items-center gap-2">
            {!isEdit && (
              <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer">
                <input type="checkbox" checked={useDefaultChecklist}
                  onChange={(e) => {
                    setUseDefaultChecklist(e.target.checked)
                    if (e.target.checked) setChecklist(DEFAULT_CHECKLIST.map((i) => ({ ...i })))
                    else setChecklist([])
                  }} className="rounded" />
                Use standard template
              </label>
            )}
            <button type="button" onClick={addChecklistItem}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs border border-slate-200 dark:border-slate-700 rounded text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
              <Plus size={12} />{t('insp.form.addItem')}
            </button>
          </div>
        </div>

        <div className="space-y-2">
          {checklist.map((item, idx) => (
            <div key={idx} className={`grid grid-cols-12 gap-2 p-3 rounded-lg border ${SEVERITY_COLOR[item.severity]} bg-white dark:bg-slate-800/50`}>
              <div className="col-span-1 flex items-center">
                <span className="text-xs font-mono text-slate-400">{item.item_number}</span>
              </div>
              <div className="col-span-3">
                <input type="text" value={item.category}
                  onChange={(e) => updateItem(idx, 'category', e.target.value)}
                  placeholder={t('insp.form.itemCategory')}
                  className="w-full px-2 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
              <div className="col-span-5">
                <input type="text" value={item.description}
                  onChange={(e) => updateItem(idx, 'description', e.target.value)}
                  placeholder={t('insp.form.itemDescription')}
                  className="w-full px-2 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
              <div className="col-span-2">
                <select value={item.severity} onChange={(e) => updateItem(idx, 'severity', e.target.value)}
                  className="w-full px-2 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500">
                  {SEVERITIES.map((s) => <option key={s} value={s}>{t(('insp.severity.' + s) as import('@/lib/translations/en').TranslationKey)}</option>)}
                </select>
              </div>
              <div className="col-span-1 flex items-center justify-end">
                <button type="button" onClick={() => removeChecklistItem(idx)}
                  className="p-1 text-slate-300 hover:text-red-500 transition-colors">
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {checklist.length === 0 && (
          <p className="text-xs text-slate-400 text-center py-4">No checklist items yet. Add items above or enable the standard template.</p>
        )}
      </div>

      {/* Notes */}
      <div className={sectionClass}>
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white uppercase tracking-wider">{t('insp.form.notes')}</h2>
        <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)}
          placeholder={t('insp.form.notesPlaceholder')} className={inputClass} />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={saving || !title.trim()}
          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
          {saving ? t('common.saving') : isEdit ? t('insp.form.saveBtn') : t('insp.form.createBtn')}
        </button>
        <Link href="/dashboard/inspections" className="px-5 py-2.5 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors">
          {t('common.cancel')}
        </Link>
      </div>
    </form>
  )
}
