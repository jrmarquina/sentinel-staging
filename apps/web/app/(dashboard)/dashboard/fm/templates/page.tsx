'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, Search, Edit2, Trash2, Loader2, AlertTriangle, LayoutList } from 'lucide-react'
import { useFmT } from '@/lib/locale'

interface FmTemplate {
  id: string
  name: string
  description: string | null
  json_schema: unknown
  created_at: string
}

function fieldCount(schema: unknown): number {
  if (
    schema !== null &&
    typeof schema === 'object' &&
    'fields' in schema &&
    Array.isArray((schema as { fields: unknown }).fields)
  ) {
    return (schema as { fields: unknown[] }).fields.length
  }
  return 0
}

export default function FMTemplatesPage() {
  const router = useRouter()
  const t = useFmT()
  const [templates, setTemplates] = useState<FmTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  function load() {
    setLoading(true)
    fetch('/api/fm/templates')
      .then((r) => {
        if (!r.ok) throw new Error(t('tmpl.error'))
        return r.json() as Promise<FmTemplate[]>
      })
      .then(setTemplates)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : t('error.generic')))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const filtered = templates.filter((tmpl) => {
    const q = search.toLowerCase()
    return (
      !q ||
      tmpl.name.toLowerCase().includes(q) ||
      (tmpl.description ?? '').toLowerCase().includes(q)
    )
  })

  async function handleDelete(id: string) {
    setDeleting(id)
    try {
      const res = await fetch(`/api/fm/templates/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setTemplates((prev) => prev.filter((tmpl) => tmpl.id !== id))
      }
    } finally {
      setDeleting(null)
      setConfirmDelete(null)
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">{t('tmpl.title')}</h1>
          <p className="text-sm text-slate-500 mt-0.5">{templates.length} {templates.length === 1 ? t('tmpl.field') : t('tmpl.fields')}</p>
        </div>
        <button
          onClick={() => router.push('/dashboard/fm/templates/new/builder')}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus size={16} />
          {t('tmpl.newBtn')}
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder={t('tmpl.search')}
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
          <LayoutList size={32} className="mx-auto mb-3 opacity-40" />
          <p>{t('tmpl.empty')}</p>
          <button
            onClick={() => router.push('/dashboard/fm/templates/new/builder')}
            className="mt-3 inline-block text-sm text-blue-600 hover:underline"
          >
            {t('tmpl.emptyCreate')}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((tmpl) => {
            const fields = fieldCount(tmpl.json_schema)
            return (
              <div
                key={tmpl.id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 flex flex-col gap-3 hover:shadow-md transition-shadow"
              >
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white">{tmpl.name}</p>
                  {tmpl.description && (
                    <p className="text-sm text-slate-500 mt-1 line-clamp-2">
                      {tmpl.description.slice(0, 100)}{tmpl.description.length > 100 ? '…' : ''}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-3 text-xs text-slate-500">
                  <span className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                    {fields} {fields === 1 ? t('tmpl.field') : t('tmpl.fields')}
                  </span>
                  <span>
                    Created {new Date(tmpl.created_at).toLocaleDateString()}
                  </span>
                </div>

                <div className="flex items-center gap-2 mt-auto pt-1">
                  <Link
                    href={`/dashboard/fm/templates/${tmpl.id}/builder`}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    <Edit2 size={14} />
                    {t('tmpl.edit')}
                  </Link>

                  {confirmDelete === tmpl.id ? (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleDelete(tmpl.id)}
                        disabled={deleting === tmpl.id}
                        className="text-xs text-red-600 font-medium hover:text-red-700"
                      >
                        {deleting === tmpl.id ? t('deleting') : t('confirm')}
                      </button>
                      <button
                        onClick={() => setConfirmDelete(null)}
                        className="text-xs text-slate-500"
                      >
                        {t('cancel')}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(tmpl.id)}
                      className="px-3 py-1.5 text-slate-400 hover:text-red-500 transition-colors border border-slate-200 dark:border-slate-700 rounded-lg"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
