'use client'

import { useEffect, useState } from 'react'
import { Plus, Loader2, AlertTriangle, Trash2, Zap, X } from 'lucide-react'

interface FmProperty { id: string; name: string }
interface FmTemplate { id: string; name: string }

interface FmSchedule {
  id: string
  property_id: string
  template_id: string
  frequency: string | null
  type: string | null
  active: boolean
  fm_properties: { name: string } | null
  fm_templates: { name: string } | null
}

interface ScheduleForm {
  property_id: string
  template_id: string
  frequency: string
  type: string
}

const EMPTY_FORM: ScheduleForm = {
  property_id: '',
  template_id: '',
  frequency: 'Monthly',
  type: 'INSPECTION',
}

export default function FMSchedulesPage() {
  const [schedules, setSchedules] = useState<FmSchedule[]>([])
  const [properties, setProperties] = useState<FmProperty[]>([])
  const [templates, setTemplates] = useState<FmTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState<ScheduleForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [triggering, setTriggering] = useState(false)
  const [triggerMsg, setTriggerMsg] = useState<string | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  function load() {
    setLoading(true)
    Promise.all([
      fetch('/api/fm/schedules').then((r) => r.json() as Promise<FmSchedule[]>),
      fetch('/api/fm/properties').then((r) => r.json() as Promise<FmProperty[]>),
      fetch('/api/fm/templates').then((r) => r.json() as Promise<FmTemplate[]>),
    ])
      .then(([s, p, t]) => { setSchedules(s); setProperties(p); setTemplates(t) })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Unknown error'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  async function handleToggle(schedule: FmSchedule) {
    setToggling(schedule.id)
    try {
      const res = await fetch(`/api/fm/schedules/${schedule.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !schedule.active }),
      })
      if (res.ok) {
        setSchedules((prev) =>
          prev.map((s) => (s.id === schedule.id ? { ...s, active: !s.active } : s))
        )
      }
    } finally {
      setToggling(null)
    }
  }

  async function handleDelete(id: string) {
    setDeleting(id)
    try {
      const res = await fetch(`/api/fm/schedules/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setSchedules((prev) => prev.filter((s) => s.id !== id))
      }
    } finally {
      setDeleting(null)
      setConfirmDelete(null)
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    if (!form.property_id) { setFormError('Property is required'); return }
    if (!form.template_id) { setFormError('Template is required'); return }

    setSaving(true)
    try {
      const res = await fetch('/api/fm/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_id: form.property_id,
          template_id: form.template_id,
          frequency: form.frequency.trim() || 'Monthly',
          type: form.type.trim() || 'INSPECTION',
        }),
      })
      if (!res.ok) {
        const body = await res.json() as { error?: string }
        throw new Error(body.error ?? 'Failed to create schedule')
      }
      setForm(EMPTY_FORM)
      setShowModal(false)
      load()
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setSaving(false)
    }
  }

  async function handleTrigger() {
    setTriggering(true)
    setTriggerMsg(null)
    try {
      const res = await fetch('/api/fm/schedules/trigger', { method: 'POST' })
      if (res.ok) {
        setTriggerMsg('Schedules triggered successfully')
      } else {
        setTriggerMsg('Trigger failed')
      }
    } finally {
      setTriggering(false)
      setTimeout(() => setTriggerMsg(null), 4000)
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Inspection Schedules</h1>
          <p className="text-sm text-slate-500 mt-0.5">{schedules.length} configured schedules</p>
        </div>
        <div className="flex items-center gap-2">
          {triggerMsg && (
            <span className="text-xs text-green-600 font-medium">{triggerMsg}</span>
          )}
          <button
            onClick={handleTrigger}
            disabled={triggering}
            className="inline-flex items-center gap-2 px-4 py-2 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-sm font-medium rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            {triggering ? <Loader2 size={15} className="animate-spin" /> : <Zap size={15} />}
            Trigger Now
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus size={16} />
            Add Schedule
          </button>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={28} className="animate-spin text-slate-400" />
        </div>
      ) : error ? (
        <div className="py-16 text-center text-red-500">
          <AlertTriangle size={28} className="mx-auto mb-2" />
          <p>{error}</p>
        </div>
      ) : schedules.length === 0 ? (
        <div className="py-16 text-center text-slate-400">
          <p>No schedules configured</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr>
                  <th className="text-left px-5 py-3 font-medium text-slate-500">Property</th>
                  <th className="text-left px-5 py-3 font-medium text-slate-500">Template</th>
                  <th className="text-left px-5 py-3 font-medium text-slate-500 hidden md:table-cell">Frequency</th>
                  <th className="text-left px-5 py-3 font-medium text-slate-500">Active</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {schedules.map((sched) => (
                  <tr key={sched.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-5 py-3 font-medium text-slate-900 dark:text-white">
                      {sched.fm_properties?.name ?? '—'}
                    </td>
                    <td className="px-5 py-3 text-slate-600 dark:text-slate-400">
                      {sched.fm_templates?.name ?? '—'}
                    </td>
                    <td className="px-5 py-3 text-slate-500 hidden md:table-cell">
                      {sched.frequency ?? '—'}
                    </td>
                    <td className="px-5 py-3">
                      <button
                        role="switch"
                        aria-checked={sched.active}
                        onClick={() => handleToggle(sched)}
                        disabled={toggling === sched.id}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 ${sched.active ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'}`}
                      >
                        <span
                          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${sched.active ? 'translate-x-4' : 'translate-x-1'}`}
                        />
                      </button>
                    </td>
                    <td className="px-5 py-3 text-right">
                      {confirmDelete === sched.id ? (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleDelete(sched.id)}
                            disabled={deleting === sched.id}
                            className="text-xs text-red-600 font-medium hover:text-red-700"
                          >
                            {deleting === sched.id ? 'Deleting...' : 'Confirm'}
                          </button>
                          <button
                            onClick={() => setConfirmDelete(null)}
                            className="text-xs text-slate-500"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDelete(sched.id)}
                          className="text-slate-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add schedule modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
              <h2 className="font-semibold text-slate-900 dark:text-white">Add Schedule</h2>
              <button
                onClick={() => { setShowModal(false); setForm(EMPTY_FORM); setFormError(null) }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreate} className="p-6 space-y-4">
              {formError && (
                <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{formError}</p>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Property <span className="text-red-500">*</span>
                </label>
                <select
                  value={form.property_id}
                  onChange={(e) => setForm((f) => ({ ...f, property_id: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">— Select property —</option>
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Template <span className="text-red-500">*</span>
                </label>
                <select
                  value={form.template_id}
                  onChange={(e) => setForm((f) => ({ ...f, template_id: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">— Select template —</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Frequency
                </label>
                <input
                  type="text"
                  value={form.frequency}
                  onChange={(e) => setForm((f) => ({ ...f, frequency: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Monthly, Quarterly, Weekly..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Type
                </label>
                <input
                  type="text"
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="INSPECTION"
                />
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowModal(false); setForm(EMPTY_FORM); setFormError(null) }}
                  className="flex-1 px-4 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium rounded-lg transition-colors inline-flex items-center justify-center gap-2"
                >
                  {saving && <Loader2 size={14} className="animate-spin" />}
                  {saving ? 'Adding...' : 'Add Schedule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
