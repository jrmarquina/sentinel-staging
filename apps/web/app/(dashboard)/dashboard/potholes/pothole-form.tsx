'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Camera, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useT } from '@/lib/locale'
import { LocationField } from '@/components/ui/LocationField'
import type { Database, PotholeStatus, SurfaceDefectType, WorkOrderSeverity } from '@sentinel/db'

type Profile = Database['public']['Tables']['profiles']['Row']
type PotholeRow = Database['public']['Tables']['pothole_reports']['Row']

interface PotholeFormProps {
  orgId: string
  userId: string
  members: Profile[]
  initial?: PotholeRow
}

const DEFECT_TYPES: SurfaceDefectType[] = [
  'pothole', 'alligator_crack', 'linear_crack',
  'edge_failure', 'subsidence', 'rutting', 'surface_deterioration',
]

const STATUSES: PotholeStatus[] = [
  'reported', 'verified', 'assigned', 'in_repair', 'repaired', 'closed', 'recurring',
]

const SEVERITIES: WorkOrderSeverity[] = ['critical', 'high', 'medium', 'low']

const DEFECT_LABELS: Record<SurfaceDefectType, string> = {
  pothole:               'Pothole',
  alligator_crack:       'Alligator Crack',
  linear_crack:          'Linear Crack',
  edge_failure:          'Edge Failure',
  subsidence:            'Subsidence',
  rutting:               'Rutting',
  surface_deterioration: 'Surface Deterioration',
}

export function PotholeForm({ orgId, userId, members, initial }: PotholeFormProps) {
  const t = useT()
  const router = useRouter()
  const supabase = createClient()
  const photoInputRef = useRef<HTMLInputElement>(null)

  const isEdit = !!initial

  const [title, setTitle] = useState(initial?.title ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [defectType, setDefectType] = useState<SurfaceDefectType>(initial?.defect_type ?? 'pothole')
  const [status, setStatus] = useState<PotholeStatus>(initial?.status ?? 'reported')
  const [severity, setSeverity] = useState<WorkOrderSeverity>(initial?.severity ?? 'medium')
  const [pciScore, setPciScore] = useState<string>(initial?.pci_score?.toString() ?? '')
  const [address, setAddress] = useState(initial?.address ?? '')
  const [latitude, setLatitude] = useState(initial?.latitude?.toString() ?? '')
  const [longitude, setLongitude] = useState(initial?.longitude?.toString() ?? '')
  const [assignedTo, setAssignedTo] = useState(initial?.assigned_to ?? '')
  const [repairCost, setRepairCost] = useState(initial?.repair_cost?.toString() ?? '0')
  const [pendingPhotos, setPendingPhotos] = useState<File[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function uploadPhotos(reportId: string) {
    for (const file of pendingPhotos) {
      const ext = file.name.split('.').pop()
      const path = `${orgId}/potholes/${reportId}/${Date.now()}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('attachments')
        .upload(path, file, { upsert: false })

      if (uploadError) {
        console.error('upload error', uploadError)
        continue
      }

      await supabase.from('attachments').insert({
        org_id:       orgId,
        storage_path: path,
        file_name:    file.name,
        file_type:    file.type,
        file_size:    file.size,
        related_id:   reportId,
        related_table: 'pothole_reports',
        uploaded_by:  userId,
      } as Database['public']['Tables']['attachments']['Insert'])
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    setError(null)

    const payload = {
      org_id:       orgId,
      title:        title.trim(),
      description:  description.trim() || null,
      defect_type:  defectType,
      status,
      severity,
      pci_score:    pciScore !== '' ? parseInt(pciScore, 10) : null,
      address:      address.trim() || null,
      latitude:     latitude !== '' ? parseFloat(latitude) : null,
      longitude:    longitude !== '' ? parseFloat(longitude) : null,
      assigned_to:  assignedTo || null,
      reported_by:  userId,
      repair_cost:  parseFloat(repairCost) || 0,
    } as Database['public']['Tables']['pothole_reports']['Insert']

    if (isEdit && initial) {
      const { error: updateError } = await supabase
        .from('pothole_reports')
        .update(payload as Database['public']['Tables']['pothole_reports']['Update'])
        .eq('id', initial.id)

      if (updateError) { setError(updateError.message); setSaving(false); return }
      if (pendingPhotos.length > 0) await uploadPhotos(initial.id)
      router.push(`/dashboard/potholes/${initial.id}`)
    } else {
      const { data: created, error: insertError } = await supabase
        .from('pothole_reports')
        .insert(payload)
        .select('id')
        .single()

      if (insertError || !created) { setError(insertError?.message ?? 'Unknown error'); setSaving(false); return }
      if (pendingPhotos.length > 0) await uploadPhotos(created.id as string)
      router.push(`/dashboard/potholes/${created.id}`)
    }
  }

  const inputClass = 'w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500'
  const labelClass = 'block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1'
  const sectionClass = 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-4'

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-2xl">
      {/* Back + Title */}
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/potholes"
          className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors"
        >
          <ArrowLeft size={18} />
        </Link>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-white">
          {isEdit ? t('ph.form.saveBtn') : t('ph.newBtn')}
        </h1>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Report info */}
      <div className={sectionClass}>
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white uppercase tracking-wider">{t('ph.form.sectionInfo')}</h2>

        <div>
          <label className={labelClass}>{t('ph.form.title')} *</label>
          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('ph.form.titlePlaceholder')}
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass}>{t('ph.form.description')}</label>
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('ph.form.descPlaceholder')}
            className={inputClass}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>{t('ph.form.defectType')}</label>
            <select value={defectType} onChange={(e) => setDefectType(e.target.value as SurfaceDefectType)} className={inputClass}>
              {DEFECT_TYPES.map((d) => (
                <option key={d} value={d}>{DEFECT_LABELS[d]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>{t('ph.form.severity')}</label>
            <select value={severity} onChange={(e) => setSeverity(e.target.value as WorkOrderSeverity)} className={inputClass}>
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>{t('ph.form.status')}</label>
            <select value={status} onChange={(e) => setStatus(e.target.value as PotholeStatus)} className={inputClass}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>{t('ph.form.pciScore')}</label>
            <input
              type="number"
              min={0}
              max={100}
              value={pciScore}
              onChange={(e) => setPciScore(e.target.value)}
              placeholder="0–100"
              className={inputClass}
            />
            <p className="mt-1 text-xs text-slate-400">{t('ph.form.pciHint')}</p>
          </div>
        </div>
      </div>

      {/* Location */}
      <div className={sectionClass}>
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white uppercase tracking-wider">{t('ph.form.sectionLocation')}</h2>
        <LocationField
          lat={latitude}
          lng={longitude}
          onChangeLat={setLatitude}
          onChangeLng={setLongitude}
          label={t('ph.form.address')}
          inputClass={inputClass}
          labelClass={labelClass}
          showAddressField
          address={address}
          onChangeAddress={setAddress}
          addressPlaceholder={t('ph.form.addressPlaceholder')}
        />
        <p className="text-xs text-slate-400">{t('ph.form.gpsHint')}</p>
      </div>

      {/* Assignment */}
      <div className={sectionClass}>
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white uppercase tracking-wider">{t('ph.form.sectionAssignment')}</h2>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>{t('ph.form.assignedTo')}</label>
            <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} className={inputClass}>
              <option value="">{t('ph.form.unassigned')}</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.full_name ?? m.id}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>{t('ph.form.repairCost')}</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={repairCost}
              onChange={(e) => setRepairCost(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
      </div>

      {/* Photos */}
      <div className={sectionClass}>
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white uppercase tracking-wider">{t('ph.form.sectionPhotos')}</h2>
        <p className="text-xs text-slate-400">{t('ph.form.photosHint')}</p>

        <input
          ref={photoInputRef}
          type="file"
          multiple
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? [])
            setPendingPhotos((prev) => [...prev, ...files])
          }}
        />
        <label
          onClick={() => photoInputRef.current?.click()}
          className="flex flex-col items-center justify-center gap-2 px-4 py-8 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-lg cursor-pointer hover:border-blue-400 transition-colors text-slate-400 hover:text-blue-500"
        >
          <Camera size={24} />
          <span className="text-sm">{t('ph.form.photosClick')}</span>
          <span className="text-xs">{t('ph.form.photosFormat')}</span>
        </label>

        {pendingPhotos.length > 0 && (
          <div className="space-y-1">
            {pendingPhotos.map((f, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 rounded text-xs text-blue-700 dark:text-blue-300">
                <span className="truncate max-w-xs">{f.name}</span>
                <button
                  type="button"
                  onClick={() => setPendingPhotos((prev) => prev.filter((_, j) => j !== i))}
                  className="ml-2 text-blue-400 hover:text-red-500"
                >×</button>
              </div>
            ))}
            <p className="text-xs text-slate-400">{pendingPhotos.length} {t('ph.form.photosQueued')}</p>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving || !title.trim()}
          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {saving ? t('common.saving') : isEdit ? t('ph.form.saveBtn') : t('ph.form.createBtn')}
        </button>
        <Link
          href="/dashboard/potholes"
          className="px-5 py-2.5 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors"
        >
          {t('common.cancel')}
        </Link>
      </div>
    </form>
  )
}
