'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, Loader2, AlertTriangle, X, ChevronRight } from 'lucide-react'

interface FmProperty { id: string; name: string }
interface FmTemplate { id: string; name: string }
interface FmAsset { id: string; name: string; property_id: string | null }

interface FmInspection {
  id: string
  status: string
  score: number | null
  created_at: string
  scheduled_for: string | null
  fm_properties: { name: string } | null
  fm_templates: { name: string } | null
  inspector: { full_name: string } | null
}

type TabValue = 'ALL' | 'IN_PROGRESS' | 'PENDING_APPROVAL' | 'COMPLETED' | 'DRAFT'

const STATUS_BADGE: Record<string, string> = {
  COMPLETED: 'bg-green-100 text-green-700',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-700',
  PENDING_APPROVAL: 'bg-orange-100 text-orange-700',
  DRAFT: 'bg-slate-100 text-slate-600',
}

const TABS: { value: TabValue; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'PENDING_APPROVAL', label: 'Pending Approval' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'DRAFT', label: 'Draft' },
]

interface StartForm {
  property_id: string
  template_id: string
  asset_id: string
  scheduled_for: string
}

const EMPTY_FORM: StartForm = { property_id: '', template_id: '', asset_id: '', scheduled_for: '' }

export default function FMInspectionsPage() {
  const router = useRouter()
  const [inspections, setInspections] = useState<FmInspection[]>([])
  const [properties, setProperties] = useState<FmProperty[]>([])
  const [templates, setTemplates] = useState<FmTemplate[]>([])
  const [assets, setAssets] = useState<FmAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TabValue>('ALL')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState<StartForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  function load() {
    setLoading(true)
    Promise.all([
      fetch('/api/fm/inspections').then((r) => r.json() as Promise<FmInspection[]>),
      fetch('/api/fm/properties').then((r) => r.json() as Promise<FmProperty[]>),
      fetch('/api/fm/templates').then((r) => r.json() as Promise<FmTemplate[]>),
      fetch('/api/fm/assets').then((r) => r.json() as Promise<FmAsset[]>),
    ])
      .then(([insp, props, tmpl, asst]) => {
        setInspections(insp)
        setProperties(props)
        setTemplates(tmpl)
        setAssets(asst)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Unknown error'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const filtered = inspections.filter((i) =>
    activeTab === 'ALL' ? true : i.status === activeTab
  )

  const filteredAssets = assets.filter(
    (a) => !form.property_id || a.property_id === form.property_id
  )

  async function handleStart(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    if (!form.property_id) { setFormError('Property is required'); return }
    if (!form.template_id) { setFormError('Template is required'); return }

    setSaving(true)
    try {
      const res = await fetch('/api/fm/inspections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_id: form.property_id,
          template_id: form.template_id,
          asset_id: form.asset_id || undefined,
          scheduled_for: form.scheduled_for || undefined,
        }),
      })
      if (!res.ok) {
        const body = await res.json() as { error?: string }
        throw new Error(body.error ?? 'Failed to start inspection')
      }
      const data = await res.json() as { id: string }
      setShowModal(false)
      setForm(EMPTY_FORM)
      router.push(`/dashboard/fm/inspections/${data.id}/run`)
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Inspections</h1>
          <p className="text-sm text-slate-500 mt-0.5">{inspections.length} total inspections</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus size={16} />
          Start Inspection
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={[
              'px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap',
              activeTab === tab.value
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white',
            ].join(' ')}
          >
            {tab.label}
            <span className="ml-1.5 text-xs text-slate-400">
              ({inspections.filter((i) => tab.value === 'ALL' || i.status === tab.value).length})
            </span>
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={28} className="animate-spin text-slate-400" />
        </div>
      ) : error ? (
        <div className="py-16 text-center text-red-500">
          <AlertTriangle size={28} className="mx-auto mb-2" />
          <p>{error}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center text-slate-400">
          <p>No inspections found</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr>
                  <th className="text-left px-5 py-3 font-medium text-slate-500">Property</th>
                  <th className="text-left px-5 py-3 font-medium text-slate-500 hidden md:table-cell">Template</th>
                  <th className="text-left px-5 py-3 font-medium text-slate-500 hidden lg:table-cell">Inspector</th>
                  <th className="text-left px-5 py-3 font-medium text-slate-500">Status</th>
                  <th className="text-left px-5 py-3 font-medium text-slate-500 hidden sm:table-cell">Score</th>
                  <th className="text-left px-5 py-3 font-medium text-slate-500 hidden lg:table-cell">Date</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.map((insp) => {
                  const isRunnable = insp.status === 'DRAFT' || insp.status === 'IN_PROGRESS'
                  return (
                    <tr key={insp.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="px-5 py-3 font-medium text-slate-900 dark:text-white">
                        {insp.fm_properties?.name ?? '—'}
                      </td>
                      <td className="px-5 py-3 text-slate-500 hidden md:table-cell">
                        {insp.fm_templates?.name ?? '—'}
                      </td>
                      <td className="px-5 py-3 text-slate-500 hidden lg:table-cell">
                        {insp.inspector?.full_name ?? '—'}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[insp.status] ?? 'bg-slate-100 text-slate-600'}`}
                        >
                          {insp.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-slate-700 dark:text-slate-300 hidden sm:table-cell">
                        {insp.score != null ? `${insp.score}%` : '—'}
                      </td>
                      <td className="px-5 py-3 text-slate-500 hidden lg:table-cell">
                        {new Date(insp.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Link
                          href={
                            isRunnable
                              ? `/dashboard/fm/inspections/${insp.id}/run`
                              : `/dashboard/fm/inspections/${insp.id}`
                          }
                          className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
                        >
                          {isRunnable ? 'Continue' : 'View'}
                          <ChevronRight size={14} />
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Start inspection modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 sticky top-0 bg-white dark:bg-slate-900">
              <h2 className="font-semibold text-slate-900 dark:text-white">Start Inspection</h2>
              <button
                onClick={() => { setShowModal(false); setForm(EMPTY_FORM); setFormError(null) }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleStart} className="p-6 space-y-4">
              {formError && (
                <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{formError}</p>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Property <span className="text-red-500">*</span>
                </label>
                <select
                  value={form.property_id}
                  onChange={(e) => setForm((f) => ({ ...f, property_id: e.target.value, asset_id: '' }))}
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
                  Asset <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <select
                  value={form.asset_id}
                  onChange={(e) => setForm((f) => ({ ...f, asset_id: e.target.value }))}
                  disabled={!form.property_id}
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  <option value="">— None (whole property) —</option>
                  {filteredAssets.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Scheduled For <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <input
                  type="date"
                  value={form.scheduled_for}
                  onChange={(e) => setForm((f) => ({ ...f, scheduled_for: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  {saving ? 'Starting...' : 'Start Inspection'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
