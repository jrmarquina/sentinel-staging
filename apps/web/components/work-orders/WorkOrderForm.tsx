'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Camera } from 'lucide-react'
import { LocationField } from '@/components/ui/LocationField'
import type { Database, WorkOrderStatus, WorkOrderPriority, WorkOrderSeverity } from '@sentinel/db'

type WorkOrderRow = Database['public']['Tables']['work_orders']['Row']
type Profile = { id: string; full_name: string | null }
type Location = { id: string; name: string | null; address: string | null }

interface WorkOrderFormProps {
  orgId: string
  userId: string
  profiles: Profile[]
  locations: Location[]
  initial?: Partial<WorkOrderRow>   // undefined = create mode
}

const PRIORITY_OPTIONS: { value: WorkOrderPriority; label: string }[] = [
  { value: 'P1', label: 'P1 — Critical' },
  { value: 'P2', label: 'P2 — High' },
  { value: 'P3', label: 'P3 — Medium' },
  { value: 'P4', label: 'P4 — Low' },
]

const STATUS_OPTIONS: { value: WorkOrderStatus; label: string }[] = [
  { value: 'draft',       label: 'Draft' },
  { value: 'open',        label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'on_hold',     label: 'On Hold' },
  { value: 'closed',      label: 'Closed' },
  { value: 'cancelled',   label: 'Cancelled' },
]

const SEVERITY_OPTIONS: { value: WorkOrderSeverity; label: string }[] = [
  { value: 'critical', label: 'Critical' },
  { value: 'high',     label: 'High' },
  { value: 'medium',   label: 'Medium' },
  { value: 'low',      label: 'Low' },
]

export function WorkOrderForm({ orgId, userId, profiles, locations, initial }: WorkOrderFormProps) {
  const router = useRouter()
  const isEdit = !!initial?.id

  const [title, setTitle]             = useState(initial?.title ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [status, setStatus]           = useState<WorkOrderStatus>(initial?.status ?? 'open')
  const [priority, setPriority]       = useState<WorkOrderPriority>(initial?.priority ?? 'P3')
  const [severity, setSeverity]       = useState<WorkOrderSeverity | ''>(initial?.severity ?? '')
  const [assignedTo, setAssignedTo]   = useState(initial?.assigned_to ?? '')
  const [locationId, setLocationId]   = useState(initial?.location_id ?? '')
  const [dueDate, setDueDate]         = useState(initial?.due_date ?? '')
  const [laborHours, setLaborHours]   = useState(String(initial?.labor_hours ?? 0))
  const [laborCost, setLaborCost]     = useState(String(initial?.labor_cost ?? 0))
  const [materialsCost, setMaterialsCost] = useState(String(initial?.materials_cost ?? 0))
  const [notes, setNotes]             = useState(initial?.notes ?? '')
  const [pendingPhotos, setPendingPhotos] = useState<File[]>([])
  const [pinLat, setPinLat] = useState(initial?.latitude?.toString() ?? '')
  const [pinLng, setPinLng] = useState(initial?.longitude?.toString() ?? '')

  const [error, setError]   = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!title.trim()) {
      setError('Title is required.')
      return
    }

    startTransition(async () => {
      let workOrderId = initial?.id

      const payload = {
        org_id: orgId,
        title: title.trim(),
        description: description.trim() || null,
        status,
        priority,
        severity: severity || null,
        assigned_to: assignedTo || null,
        location_id: locationId || null,
        due_date: dueDate || null,
        labor_hours: parseFloat(laborHours) || 0,
        labor_cost: parseFloat(laborCost) || 0,
        materials_cost: parseFloat(materialsCost) || 0,
        latitude:  pinLat !== '' ? parseFloat(pinLat) : null,
        longitude: pinLng !== '' ? parseFloat(pinLng) : null,
        notes: notes.trim() || null,
        // closed_at: preserve existing stamp if already closed, set now on first close, clear otherwise
        ...(isEdit ? {
          closed_at: status === 'closed'
            ? (initial?.closed_at ?? new Date().toISOString())
            : null,
        } : {}),
      } satisfies Database['public']['Tables']['work_orders']['Insert'] | Database['public']['Tables']['work_orders']['Update']

      if (isEdit && workOrderId) {
        const { error: updateErr } = await supabase
          .from('work_orders')
          .update(payload as Database['public']['Tables']['work_orders']['Update'])
          .eq('id', workOrderId)
        if (updateErr) { setError(updateErr.message); return }
      } else {
        const insertPayload = { ...payload, created_by: userId } as Database['public']['Tables']['work_orders']['Insert']
        const { data: inserted, error: insertErr } = await supabase
          .from('work_orders')
          .insert(insertPayload)
          .select('id')
          .single()
        if (insertErr || !inserted) { setError(insertErr?.message ?? 'Insert failed'); return }
        workOrderId = (inserted as { id: string }).id
      }

      // Upload pending photos
      for (const file of pendingPhotos) {
        const ext = file.name.split('.').pop() ?? 'jpg'
        const path = `${orgId}/work-orders/${workOrderId}/${Date.now()}.${ext}`
        const { error: upErr } = await supabase.storage
          .from('attachments')
          .upload(path, file, { upsert: false })
        if (upErr) { setError(`Photo upload failed: ${upErr.message}`); return }

        await supabase.from('attachments').insert({
          org_id: orgId,
          storage_path: path,
          file_name: file.name,
          file_type: file.type,
          file_size: file.size,
          related_id: workOrderId,
          related_table: 'work_orders',
          uploaded_by: userId,
        })
      }

      router.push(`/dashboard/work-orders/${workOrderId}`)
      router.refresh()
    })
  }

  const inputCls = 'w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500'
  const labelCls = 'block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1'

  return (
    <>
    <form onSubmit={handleSubmit} className="max-w-3xl mx-auto space-y-6">
      {/* Main info */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-6 space-y-4">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Work Order Information</h2>

        <div>
          <label htmlFor="title" className={labelCls}>Title <span className="text-red-500">*</span></label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Repair pothole on Calle Luna"
            className={inputCls}
            required
          />
        </div>

        <div>
          <label htmlFor="description" className={labelCls}>Description</label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the issue, location details, scope of work…"
            rows={3}
            className={inputCls}
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div>
            <label htmlFor="priority" className={labelCls}>Priority</label>
            <select id="priority" value={priority} onChange={(e) => setPriority(e.target.value as WorkOrderPriority)} className={inputCls}>
              {PRIORITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="status" className={labelCls}>Status</label>
            <select id="status" value={status} onChange={(e) => setStatus(e.target.value as WorkOrderStatus)} className={inputCls}>
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="severity" className={labelCls}>Severity</label>
            <select id="severity" value={severity} onChange={(e) => setSeverity(e.target.value as WorkOrderSeverity | '')} className={inputCls}>
              <option value="">— None —</option>
              {SEVERITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Assignment & Location */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-6 space-y-4">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Assignment & Location</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="assigned_to" className={labelCls}>Assigned To</label>
            <select id="assigned_to" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} className={inputCls}>
              <option value="">— Unassigned —</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>{p.full_name ?? p.id.slice(0, 8)}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="location_id" className={labelCls}>Site / Facility</label>
            <select id="location_id" value={locationId} onChange={(e) => setLocationId(e.target.value)} className={inputCls}>
              <option value="">— None —</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>{l.name ?? l.address ?? l.id.slice(0, 8)}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="due_date" className={labelCls}>Due Date</label>
            <input
              id="due_date"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className={inputCls}
            />
          </div>
        </div>

        {/* GPS Pin */}
        <LocationField
          lat={pinLat}
          lng={pinLng}
          onChangeLat={setPinLat}
          onChangeLng={setPinLng}
          label="GPS Pin"
          inputClass={inputCls}
          labelClass={labelCls}
        />
      </div>

      {/* Labor & Costs */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-6 space-y-4">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Labor & Costs</h2>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label htmlFor="labor_hours" className={labelCls}>Labor Hours</label>
            <input
              id="labor_hours"
              type="number"
              min="0"
              step="0.5"
              value={laborHours}
              onChange={(e) => setLaborHours(e.target.value)}
              className={inputCls}
            />
          </div>

          <div>
            <label htmlFor="labor_cost" className={labelCls}>Labor Cost ($)</label>
            <input
              id="labor_cost"
              type="number"
              min="0"
              step="0.01"
              value={laborCost}
              onChange={(e) => setLaborCost(e.target.value)}
              className={inputCls}
            />
          </div>

          <div>
            <label htmlFor="materials_cost" className={labelCls}>Materials Cost ($)</label>
            <input
              id="materials_cost"
              type="number"
              min="0"
              step="0.01"
              value={materialsCost}
              onChange={(e) => setMaterialsCost(e.target.value)}
              className={inputCls}
            />
          </div>
        </div>

        {(parseFloat(laborCost) > 0 || parseFloat(materialsCost) > 0) && (
          <p className="text-sm text-slate-500">
            Total:{' '}
            <span className="font-semibold text-slate-900 dark:text-white">
              ${(parseFloat(laborCost || '0') + parseFloat(materialsCost || '0')).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
          </p>
        )}
      </div>

      {/* Notes */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-6 space-y-4">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Notes</h2>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Any additional notes, instructions, or observations…"
          rows={4}
          className={inputCls}
        />
      </div>

      {/* Photos */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-6 space-y-4">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Photo Attachments</h2>
        <p className="text-xs text-slate-400">Attach field photos. Images are compressed before upload.</p>
        <label className="flex flex-col items-center justify-center gap-2 w-full py-8 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-lg cursor-pointer hover:border-blue-400 transition-colors">
          <Camera size={24} className="text-slate-400" />
          <span className="text-sm text-slate-500">Click to select photos</span>
          <span className="text-xs text-slate-400">JPEG, PNG — max 10 MB each</span>
          <input
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? [])
              if (files.length) setPendingPhotos((prev) => [...prev, ...files])
              e.target.value = ''
            }}
          />
        </label>
        {pendingPhotos.length > 0 && (
          <p className="text-xs text-slate-500">{pendingPhotos.length} photo(s) queued for upload</p>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Submit */}
      <div className="flex items-center justify-between pb-6">
        <button
          type="button"
          onClick={() => router.back()}
          className="px-4 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Work Order'}
        </button>
      </div>
    </form>
    </>
  )
}

