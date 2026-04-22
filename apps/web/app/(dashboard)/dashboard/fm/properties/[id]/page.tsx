'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  MapPin,
  Loader2,
  AlertTriangle,
  Plus,
  X,
} from 'lucide-react'

interface FmFloor {
  id: string
  name: string
}

interface FmAssetSummary {
  id: string
  name: string
  code: string
  category: string
  condition: string
  location: string | null
  updated_at: string
}

interface FmInspectionSummary {
  id: string
  status: string
  score: number | null
  started_at: string | null
  completed_at: string | null
  fm_inspection_templates: { name: string } | null
}

interface FmProperty {
  id: string
  name: string
  code: string
  address: string | null
  status: string
  risk_level: string | null
  latitude: number | null
  longitude: number | null
  fm_floors?: FmFloor[]
  fm_assets?: FmAssetSummary[]
  fm_inspections?: FmInspectionSummary[]
}

interface FmWorkOrderSummary {
  id: string
  title: string
  status: string
  priority: string
  due_date: string | null
}

type SubTab = 'assets' | 'inspections' | 'work-orders'

const STATUS_BADGE: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-700',
  MAINTENANCE: 'bg-yellow-100 text-yellow-700',
  INACTIVE: 'bg-red-100 text-red-700',
}

const CONDITION_BADGE: Record<string, string> = {
  GOOD: 'bg-green-100 text-green-700',
  FAIR: 'bg-yellow-100 text-yellow-700',
  POOR: 'bg-red-100 text-red-700',
}

const INSPECTION_STATUS_BADGE: Record<string, string> = {
  COMPLETED: 'bg-green-100 text-green-700',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-700',
  PENDING_APPROVAL: 'bg-orange-100 text-orange-700',
  DRAFT: 'bg-slate-100 text-slate-600',
}

const WO_PRIORITY_BADGE: Record<string, string> = {
  HIGH: 'bg-red-100 text-red-700',
  MEDIUM: 'bg-yellow-100 text-yellow-700',
  LOW: 'bg-green-100 text-green-700',
}

// Mini add asset modal
function AddAssetModal({
  propertyId,
  onClose,
  onSaved,
}: {
  propertyId: string
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({ name: '', code: '', category: 'OTHER', condition: 'GOOD' })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || !form.code.trim()) { setErr('Name and code are required'); return }
    setSaving(true)
    const res = await fetch('/api/fm/assets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, code: form.code.toUpperCase(), property_id: propertyId }),
    })
    setSaving(false)
    if (res.ok) { onSaved(); onClose() }
    else { const b = await res.json() as { error?: string }; setErr(b.error ?? 'Failed') }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <h3 className="font-semibold text-slate-900 dark:text-white">Add Asset</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-3">
          {err && <p className="text-xs text-red-600 bg-red-50 rounded px-2 py-1">{err}</p>}
          <input type="text" placeholder="Name *" value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
            className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <input type="text" placeholder="Code *" value={form.code} onChange={(e) => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
            className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <select value={form.category} onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))}
            className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            {['ELECTRICAL','PLUMBING','HVAC','STRUCTURAL','FIRE_SAFETY','OTHER'].map(c => <option key={c} value={c}>{c.replace(/_/g,' ')}</option>)}
          </select>
          <select value={form.condition} onChange={(e) => setForm(f => ({ ...f, condition: e.target.value }))}
            className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            {['GOOD','FAIR','POOR'].map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg disabled:opacity-60 inline-flex items-center justify-center gap-1">
              {saving && <Loader2 size={12} className="animate-spin" />} Save
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function FMPropertyDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = Array.isArray(params.id) ? params.id[0] : (params.id as string)

  const [property, setProperty] = useState<FmProperty | null>(null)
  const [workOrders, setWorkOrders] = useState<FmWorkOrderSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<SubTab>('assets')
  const [showAddAsset, setShowAddAsset] = useState(false)

  function load() {
    setLoading(true)
    Promise.all([
      fetch(`/api/fm/properties/${id}`).then((r) => {
        if (!r.ok) throw new Error('Property not found')
        return r.json() as Promise<FmProperty>
      }),
      fetch(`/api/fm/work-orders?propertyId=${id}`).then((r) =>
        r.ok ? (r.json() as Promise<FmWorkOrderSummary[]>) : Promise.resolve([])
      ),
    ])
      .then(([prop, wos]) => { setProperty(prop); setWorkOrders(wos) })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Unknown error'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [id])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={28} className="animate-spin text-slate-400" />
      </div>
    )
  }

  if (error || !property) {
    return (
      <div className="py-16 text-center text-red-500">
        <AlertTriangle size={28} className="mx-auto mb-2" />
        <p>{error ?? 'Property not found'}</p>
        <button onClick={() => router.push('/dashboard/fm/properties')} className="mt-4 text-sm text-blue-600 hover:underline">
          Back to properties
        </button>
      </div>
    )
  }

  const TABS: { value: SubTab; label: string; count: number }[] = [
    { value: 'assets', label: 'Assets', count: (property.fm_assets ?? []).length },
    { value: 'inspections', label: 'Inspections', count: (property.fm_inspections ?? []).length },
    { value: 'work-orders', label: 'Work Orders', count: workOrders.length },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button
          onClick={() => router.push('/dashboard/fm/properties')}
          className="mt-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-semibold text-slate-900 dark:text-white">{property.name}</h1>
            <span className="text-xs font-mono uppercase tracking-wider bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
              {property.code}
            </span>
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_BADGE[property.status] ?? 'bg-slate-100 text-slate-600'}`}
            >
              {property.status}
            </span>
          </div>
          {property.address && (
            <div className="flex items-center gap-1 mt-1 text-sm text-slate-500">
              <MapPin size={13} />
              <span>{property.address}</span>
            </div>
          )}
        </div>
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {property.latitude != null && property.longitude != null && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
            <p className="text-xs text-slate-500 mb-1">GPS</p>
            <p className="font-mono text-sm text-slate-700 dark:text-slate-300">
              {property.latitude.toFixed(5)}, {property.longitude.toFixed(5)}
            </p>
          </div>
        )}
        {property.risk_level && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
            <p className="text-xs text-slate-500 mb-1">Risk Level</p>
            <p className="font-semibold text-slate-900 dark:text-white">{property.risk_level}</p>
          </div>
        )}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
          <p className="text-xs text-slate-500 mb-1">Assets</p>
          <p className="font-semibold text-2xl text-slate-900 dark:text-white">{(property.fm_assets ?? []).length}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
          <p className="text-xs text-slate-500 mb-1">Inspections</p>
          <p className="font-semibold text-2xl text-slate-900 dark:text-white">{(property.fm_inspections ?? []).length}</p>
        </div>
      </div>

      {/* Sub tabs */}
      <div className="flex items-center justify-between gap-3 flex-wrap border-b border-slate-200 dark:border-slate-700">
        <div className="flex gap-1">
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
              <span className="ml-1.5 text-xs text-slate-400">({tab.count})</span>
            </button>
          ))}
        </div>
        <div className="pb-1">
          {activeTab === 'assets' && (
            <button
              onClick={() => setShowAddAsset(true)}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              <Plus size={13} /> Add Asset
            </button>
          )}
          {activeTab === 'inspections' && (
            <Link
              href={`/dashboard/fm/inspections`}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              <Plus size={13} /> Start Inspection
            </Link>
          )}
        </div>
      </div>

      {/* Tab content */}
      {activeTab === 'assets' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
          {(property.fm_assets ?? []).length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-400">No assets registered for this property</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/60">
                  <tr>
                    <th className="text-left px-5 py-3 font-medium text-slate-500">Asset</th>
                    <th className="text-left px-5 py-3 font-medium text-slate-500 hidden md:table-cell">Category</th>
                    <th className="text-left px-5 py-3 font-medium text-slate-500 hidden md:table-cell">Location</th>
                    <th className="text-left px-5 py-3 font-medium text-slate-500">Condition</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {(property.fm_assets ?? []).map((asset) => (
                    <tr
                      key={asset.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer transition-colors"
                      onClick={() => router.push(`/dashboard/fm/assets/${asset.id}`)}
                    >
                      <td className="px-5 py-3">
                        <p className="font-medium text-slate-900 dark:text-white">{asset.name}</p>
                        <p className="text-xs font-mono text-slate-500">{asset.code}</p>
                      </td>
                      <td className="px-5 py-3 text-slate-500 hidden md:table-cell">{asset.category.replace(/_/g, ' ')}</td>
                      <td className="px-5 py-3 text-slate-500 hidden md:table-cell">{asset.location ?? '—'}</td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${CONDITION_BADGE[asset.condition] ?? 'bg-slate-100 text-slate-600'}`}>
                          {asset.condition}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'inspections' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
          {(property.fm_inspections ?? []).length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-400">No inspections for this property</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/60">
                  <tr>
                    <th className="text-left px-5 py-3 font-medium text-slate-500">Template</th>
                    <th className="text-left px-5 py-3 font-medium text-slate-500">Status</th>
                    <th className="text-left px-5 py-3 font-medium text-slate-500 hidden md:table-cell">Score</th>
                    <th className="text-left px-5 py-3 font-medium text-slate-500 hidden md:table-cell">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {(property.fm_inspections ?? []).map((insp) => (
                    <tr
                      key={insp.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer transition-colors"
                      onClick={() => router.push(`/dashboard/fm/inspections/${insp.id}`)}
                    >
                      <td className="px-5 py-3 text-slate-700 dark:text-slate-300">
                        {insp.fm_inspection_templates?.name ?? '—'}
                      </td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${INSPECTION_STATUS_BADGE[insp.status] ?? 'bg-slate-100 text-slate-600'}`}>
                          {insp.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-slate-500 hidden md:table-cell">
                        {insp.score != null ? `${insp.score}%` : '—'}
                      </td>
                      <td className="px-5 py-3 text-slate-500 hidden md:table-cell">
                        {insp.started_at ? new Date(insp.started_at).toLocaleDateString() : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'work-orders' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
          {workOrders.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-400">No work orders for this property</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/60">
                  <tr>
                    <th className="text-left px-5 py-3 font-medium text-slate-500">Title</th>
                    <th className="text-left px-5 py-3 font-medium text-slate-500">Priority</th>
                    <th className="text-left px-5 py-3 font-medium text-slate-500">Status</th>
                    <th className="text-left px-5 py-3 font-medium text-slate-500 hidden md:table-cell">Due</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {workOrders.map((wo) => (
                    <tr key={wo.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="px-5 py-3 font-medium text-slate-900 dark:text-white">{wo.title}</td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${WO_PRIORITY_BADGE[wo.priority] ?? 'bg-slate-100 text-slate-600'}`}>
                          {wo.priority}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-slate-600 dark:text-slate-400">{wo.status.replace(/_/g, ' ')}</td>
                      <td className="px-5 py-3 text-slate-500 hidden md:table-cell">
                        {wo.due_date ? new Date(wo.due_date).toLocaleDateString() : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {showAddAsset && (
        <AddAssetModal
          propertyId={property.id}
          onClose={() => setShowAddAsset(false)}
          onSaved={load}
        />
      )}
    </div>
  )
}
