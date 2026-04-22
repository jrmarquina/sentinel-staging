'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import {
  Plus,
  Search,
  MapPin,
  ChevronRight,
  Loader2,
  AlertTriangle,
  X,
} from 'lucide-react'

interface FmProperty {
  id: string
  name: string
  code: string
  address: string | null
  status: string
  latitude: number | null
  longitude: number | null
  fm_assets?: Array<{ id: string }>
  fm_inspections?: Array<{ id: string }>
}

const STATUS_BADGE: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-700',
  MAINTENANCE: 'bg-yellow-100 text-yellow-700',
  INACTIVE: 'bg-red-100 text-red-700',
}

interface NewPropertyForm {
  name: string
  code: string
  address: string
  coordinates: string
}

const EMPTY_FORM: NewPropertyForm = { name: '', code: '', address: '', coordinates: '' }

export default function FMPropertiesPage() {
  const [properties, setProperties] = useState<FmProperty[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState<NewPropertyForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  function load() {
    setLoading(true)
    fetch('/api/fm/properties')
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load properties')
        return r.json() as Promise<FmProperty[]>
      })
      .then(setProperties)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Unknown error'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    if (showModal) setTimeout(() => nameRef.current?.focus(), 50)
  }, [showModal])

  const filtered = properties.filter((p) => {
    const q = search.toLowerCase()
    return (
      !q ||
      p.name.toLowerCase().includes(q) ||
      p.code.toLowerCase().includes(q) ||
      (p.address ?? '').toLowerCase().includes(q)
    )
  })

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    if (!form.name.trim()) { setFormError('Name is required'); return }
    if (!form.code.trim()) { setFormError('Code is required'); return }

    let latitude: number | null = null
    let longitude: number | null = null
    if (form.coordinates.trim()) {
      const parts = form.coordinates.split(',').map((s) => s.trim())
      if (parts.length !== 2 || isNaN(Number(parts[0])) || isNaN(Number(parts[1]))) {
        setFormError('Coordinates must be in "lat, lng" format')
        return
      }
      latitude = Number(parts[0])
      longitude = Number(parts[1])
    }

    setSaving(true)
    try {
      const res = await fetch('/api/fm/properties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          code: form.code.trim().toUpperCase(),
          address: form.address.trim() || null,
          latitude,
          longitude,
        }),
      })
      if (!res.ok) {
        const body = await res.json() as { error?: string }
        throw new Error(body.error ?? 'Failed to create property')
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

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Properties</h1>
          <p className="text-sm text-slate-500 mt-0.5">{properties.length} managed facilities</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus size={16} />
          New Property
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Search properties..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
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
          <p>No properties found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((prop) => (
            <div
              key={prop.id}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 flex flex-col gap-3 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-900 dark:text-white truncate">{prop.name}</p>
                  <p className="text-xs font-mono uppercase tracking-wider text-blue-600 mt-0.5">
                    {prop.code}
                  </p>
                </div>
                <span
                  className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[prop.status] ?? 'bg-slate-100 text-slate-600'}`}
                >
                  {prop.status}
                </span>
              </div>

              {prop.address && (
                <div className="flex items-start gap-1.5 text-sm text-slate-500">
                  <MapPin size={14} className="mt-0.5 shrink-0" />
                  <span className="line-clamp-2">{prop.address}</span>
                </div>
              )}

              <div className="flex items-center gap-3 pt-1">
                <span className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded-full">
                  {(prop.fm_assets ?? []).length} assets
                </span>
                <span className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded-full">
                  {(prop.fm_inspections ?? []).length} inspections
                </span>
              </div>

              <Link
                href={`/dashboard/fm/properties/${prop.id}`}
                className="mt-auto flex items-center justify-between text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                View details
                <ChevronRight size={16} />
              </Link>
            </div>
          ))}
        </div>
      )}

      {/* Create modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
              <h2 className="font-semibold text-slate-900 dark:text-white">New Property</h2>
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
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  ref={nameRef}
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Guaynabo Municipal Hall"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Code <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.code}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="GMH-001"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Address
                </label>
                <input
                  type="text"
                  value={form.address}
                  onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="123 Calle Principal, Guaynabo, PR"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  GPS Coordinates{' '}
                  <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={form.coordinates}
                  onChange={(e) => setForm((f) => ({ ...f, coordinates: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="18.3830, -66.0858"
                />
                <p className="text-xs text-slate-400 mt-1">Paste directly from Google Maps</p>
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
                  {saving ? 'Creating...' : 'Create Property'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
