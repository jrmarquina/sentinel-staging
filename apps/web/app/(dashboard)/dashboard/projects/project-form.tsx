'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Camera, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useT } from '@/lib/locale'
import { LocationField } from '@/components/ui/LocationField'
import type { Database, ProjectStatus } from '@sentinel/db'

type Profile = Database['public']['Tables']['profiles']['Row']
type ProjectRow = Database['public']['Tables']['projects']['Row']

interface ProjectFormProps {
  orgId: string
  userId: string
  members: Profile[]
  initial?: ProjectRow
}

const STATUSES: ProjectStatus[] = ['planning', 'active', 'on_hold', 'completed', 'cancelled']

const STATUS_LABELS: Record<ProjectStatus, string> = {
  planning:  'Planning',
  active:    'Active',
  on_hold:   'On Hold',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

export function ProjectForm({ orgId, userId, members, initial }: ProjectFormProps) {
  const t = useT()
  const router = useRouter()
  const supabase = createClient()
  const coverInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)

  const isEdit = !!initial

  const [name, setName] = useState(initial?.name ?? '')
  const [code, setCode] = useState(initial?.code ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [status, setStatus] = useState<ProjectStatus>(initial?.status ?? 'planning')
  const [manager, setManager] = useState(initial?.project_manager ?? '')
  const [address, setAddress] = useState(initial?.address ?? '')
  const [latitude, setLatitude] = useState(initial?.latitude?.toString() ?? '')
  const [longitude, setLongitude] = useState(initial?.longitude?.toString() ?? '')
  const [startDate, setStartDate] = useState(initial?.start_date ?? '')
  const [plannedEnd, setPlannedEnd] = useState(initial?.planned_end_date ?? '')
  const [actualEnd, setActualEnd] = useState(initial?.end_date ?? '')
  const [budget, setBudget] = useState(initial?.budget?.toString() ?? '')
  const [actualCost, setActualCost] = useState(initial?.actual_cost?.toString() ?? '0')
  const [pendingCover, setPendingCover] = useState<File | null>(null)
  const [pendingPhotos, setPendingPhotos] = useState<File[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function uploadCoverImage(projectId: string): Promise<string | null> {
    if (!pendingCover) return null
    const ext = pendingCover.name.split('.').pop()
    const path = `${orgId}/projects/${projectId}/cover.${ext}`

    const { error: upErr } = await supabase.storage
      .from('attachments')
      .upload(path, pendingCover, { upsert: true })

    if (upErr) { console.error(upErr); return null }

    const { data: att } = await supabase.from('attachments').insert({
      org_id: orgId,
      storage_path: path,
      file_name: pendingCover.name,
      file_type: pendingCover.type,
      file_size: pendingCover.size,
      related_id: projectId,
      related_table: 'projects',
      uploaded_by: userId,
    } as Database['public']['Tables']['attachments']['Insert']).select('id').single()

    return att?.id ?? null
  }

  async function uploadGallery(projectId: string) {
    for (const file of pendingPhotos) {
      const ext = file.name.split('.').pop()
      const path = `${orgId}/projects/${projectId}/${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('attachments').upload(path, file, { upsert: false })
      if (upErr) { console.error(upErr); continue }
      await supabase.from('attachments').insert({
        org_id: orgId,
        storage_path: path,
        file_name: file.name,
        file_type: file.type,
        file_size: file.size,
        related_id: projectId,
        related_table: 'projects',
        uploaded_by: userId,
      } as Database['public']['Tables']['attachments']['Insert'])
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !code.trim()) return
    setSaving(true)
    setError(null)

    const base = {
      org_id:           orgId,
      name:             name.trim(),
      code:             code.trim().toUpperCase(),
      description:      description.trim() || null,
      status,
      project_manager:  manager || null,
      address:          address.trim() || null,
      latitude:         latitude !== '' ? parseFloat(latitude) : null,
      longitude:        longitude !== '' ? parseFloat(longitude) : null,
      start_date:       startDate || null,
      planned_end_date: plannedEnd || null,
      end_date:         actualEnd || null,
      budget:           budget !== '' ? parseFloat(budget) : null,
      actual_cost:      parseFloat(actualCost) || 0,
    }

    if (isEdit && initial) {
      const { error: updateError } = await supabase
        .from('projects')
        .update(base as Database['public']['Tables']['projects']['Update'])
        .eq('id', initial.id)

      if (updateError) { setError(updateError.message); setSaving(false); return }

      if (pendingCover) {
        const coverId = await uploadCoverImage(initial.id)
        if (coverId) {
          await supabase.from('projects').update({ cover_image_id: coverId }).eq('id', initial.id)
        }
      }
      if (pendingPhotos.length > 0) await uploadGallery(initial.id)
      router.push(`/dashboard/projects/${initial.id}`)
    } else {
      const { data: created, error: insertError } = await supabase
        .from('projects')
        .insert({ ...base, created_by: userId } as Database['public']['Tables']['projects']['Insert'])
        .select('id')
        .single()

      if (insertError || !created) { setError(insertError?.message ?? 'Unknown error'); setSaving(false); return }

      const projectId = created.id as string
      if (pendingCover) {
        const coverId = await uploadCoverImage(projectId)
        if (coverId) {
          await supabase.from('projects').update({ cover_image_id: coverId }).eq('id', projectId)
        }
      }
      if (pendingPhotos.length > 0) await uploadGallery(projectId)
      router.push(`/dashboard/projects/${projectId}`)
    }
  }

  const inputClass = 'w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500'
  const labelClass = 'block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1'
  const sectionClass = 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-4'

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/projects" className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-white">
          {isEdit ? t('proj.form.saveBtn') : t('proj.newBtn')}
        </h1>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300">
          <AlertCircle size={16} />{error}
        </div>
      )}

      {/* Info */}
      <div className={sectionClass}>
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white uppercase tracking-wider">{t('proj.form.sectionInfo')}</h2>

        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2">
            <label className={labelClass}>{t('proj.form.name')} *</label>
            <input type="text" required value={name} onChange={(e) => setName(e.target.value)} placeholder={t('proj.form.namePlaceholder')} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>{t('proj.form.code')} *</label>
            <input type="text" required value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder={t('proj.form.codePlaceholder')} className={inputClass} />
          </div>
        </div>

        <div>
          <label className={labelClass}>{t('proj.form.description')}</label>
          <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('proj.form.descPlaceholder')} className={inputClass} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>{t('proj.form.status')}</label>
            <select value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus)} className={inputClass}>
              {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>{t('proj.form.manager')}</label>
            <select value={manager} onChange={(e) => setManager(e.target.value)} className={inputClass}>
              <option value="">{t('proj.form.noManager')}</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.full_name ?? m.id}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Dates */}
      <div className={sectionClass}>
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white uppercase tracking-wider">{t('proj.form.sectionDates')}</h2>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className={labelClass}>{t('proj.form.startDate')}</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>{t('proj.form.plannedEnd')}</label>
            <input type="date" value={plannedEnd} onChange={(e) => setPlannedEnd(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>{t('proj.form.actualEnd')}</label>
            <input type="date" value={actualEnd} onChange={(e) => setActualEnd(e.target.value)} className={inputClass} />
          </div>
        </div>
      </div>

      {/* Budget */}
      <div className={sectionClass}>
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white uppercase tracking-wider">{t('proj.form.sectionBudget')}</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>{t('proj.form.budget')}</label>
            <input type="number" min={0} step="0.01" value={budget} onChange={(e) => setBudget(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>{t('proj.form.actualCost')}</label>
            <input type="number" min={0} step="0.01" value={actualCost} onChange={(e) => setActualCost(e.target.value)} className={inputClass} />
          </div>
        </div>
      </div>

      {/* Location */}
      <div className={sectionClass}>
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white uppercase tracking-wider">{t('proj.form.sectionLocation')}</h2>
        <LocationField
          lat={latitude}
          lng={longitude}
          onChangeLat={setLatitude}
          onChangeLng={setLongitude}
          label={t('proj.form.address')}
          inputClass={inputClass}
          labelClass={labelClass}
          showAddressField
          address={address}
          onChangeAddress={setAddress}
          addressPlaceholder={t('proj.form.addressPlaceholder')}
        />
      </div>

      {/* Cover image */}
      <div className={sectionClass}>
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white uppercase tracking-wider">{t('proj.form.coverImage')}</h2>
        <p className="text-xs text-slate-400">{t('proj.form.coverHint')}</p>
        <input ref={coverInputRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => setPendingCover(e.target.files?.[0] ?? null)} />
        <label onClick={() => coverInputRef.current?.click()}
          className="flex flex-col items-center justify-center gap-2 px-4 py-6 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-lg cursor-pointer hover:border-blue-400 transition-colors text-slate-400 hover:text-blue-500">
          <Camera size={20} />
          {pendingCover ? (
            <span className="text-sm text-blue-600">{pendingCover.name}</span>
          ) : (
            <span className="text-sm">{t('ph.form.photosClick')}</span>
          )}
        </label>

        <div className="mt-2">
          <p className="text-xs font-medium text-slate-500 mb-2">Additional site photos</p>
          <input ref={galleryInputRef} type="file" multiple accept="image/*" className="hidden"
            onChange={(e) => setPendingPhotos((prev) => [...prev, ...Array.from(e.target.files ?? [])])} />
          <button type="button" onClick={() => galleryInputRef.current?.click()}
            className="text-xs text-blue-600 hover:underline">+ Add gallery photos</button>
          {pendingPhotos.length > 0 && (
            <p className="mt-1 text-xs text-slate-400">{pendingPhotos.length} photo(s) queued</p>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={saving || !name.trim() || !code.trim()}
          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
          {saving ? t('common.saving') : isEdit ? t('proj.form.saveBtn') : t('proj.form.createBtn')}
        </button>
        <Link href="/dashboard/projects" className="px-5 py-2.5 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors">
          {t('common.cancel')}
        </Link>
      </div>
    </form>
  )
}
