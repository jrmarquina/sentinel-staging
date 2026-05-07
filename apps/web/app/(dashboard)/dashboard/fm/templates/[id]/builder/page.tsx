'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Plus, Trash2, Loader2, ArrowLeft, GripVertical, Save } from 'lucide-react'
import { useFmT } from '@/lib/locale'

type FieldType = 'YES_NO' | 'PASS_FAIL' | 'TEXT' | 'NUMBER'

interface TemplateField {
  id: string
  label: string
  type: FieldType
}

interface FmTemplate {
  id: string
  name: string
  description: string | null
  json_schema: unknown
}

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: 'YES_NO', label: 'Yes / No' },
  { value: 'PASS_FAIL', label: 'Pass / Fail' },
  { value: 'TEXT', label: 'Text' },
  { value: 'NUMBER', label: 'Number' },
]

function generateId(): string {
  return Math.random().toString(36).slice(2, 10)
}

function emptyField(): TemplateField {
  return { id: generateId(), label: '', type: 'PASS_FAIL' }
}

function parseSchema(schema: unknown): TemplateField[] {
  if (
    schema !== null &&
    typeof schema === 'object' &&
    'fields' in schema &&
    Array.isArray((schema as { fields: unknown }).fields)
  ) {
    return ((schema as { fields: unknown[] }).fields as TemplateField[]).map((f) => ({
      id: f.id ?? generateId(),
      label: f.label ?? '',
      type: (f.type ?? 'PASS_FAIL') as FieldType,
    }))
  }
  return []
}

export default function TemplateBuilderPage() {
  const params = useParams()
  const router = useRouter()
  const t = useFmT()
  const rawId = Array.isArray(params.id) ? params.id[0] : (params.id as string)
  const isNew = rawId === 'new'

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [fields, setFields] = useState<TemplateField[]>([emptyField()])
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    if (isNew) return
    fetch(`/api/fm/templates/${rawId}`)
      .then((r) => {
        if (!r.ok) throw new Error(t('tmpl.empty'))
        return r.json() as Promise<FmTemplate>
      })
      .then((tmpl) => {
        setName(tmpl.name)
        setDescription(tmpl.description ?? '')
        const parsed = parseSchema(tmpl.json_schema)
        setFields(parsed.length > 0 ? parsed : [emptyField()])
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : t('error.generic')))
      .finally(() => setLoading(false))
  }, [rawId, isNew, t])

  function addField() {
    setFields((prev) => [...prev, emptyField()])
  }

  function updateField(id: string, patch: Partial<TemplateField>) {
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)))
  }

  function removeField(id: string) {
    setFields((prev) => prev.filter((f) => f.id !== id))
  }

  async function handleSave() {
    setSaveError(null)
    if (!name.trim()) { setSaveError('Template name is required'); return }
    if (fields.some((f) => !f.label.trim())) {
      setSaveError('All fields must have a label')
      return
    }

    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      json_schema: {
        fields: fields.map((f) => ({ id: f.id, label: f.label.trim(), type: f.type })),
      },
    }

    setSaving(true)
    try {
      const res = isNew
        ? await fetch('/api/fm/templates', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await fetch(`/api/fm/templates/${rawId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })

      if (!res.ok) {
        const body = await res.json() as { error?: string }
        throw new Error(body.error ?? t('error.generic'))
      }
      router.push('/dashboard/fm/templates')
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : t('error.generic'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={28} className="animate-spin text-slate-400" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="py-16 text-center text-red-500">
        <p>{error}</p>
        <button onClick={() => router.push('/dashboard/fm/templates')} className="mt-4 text-sm text-blue-600 hover:underline">
          {t('tmpl.builder.back')}
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/dashboard/fm/templates')}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">
            {isNew ? t('tmpl.builder.create') : t('tmpl.builder.edit')}
          </h1>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          {saving ? t('tmpl.builder.saving') : t('tmpl.builder.save')}
        </button>
      </div>

      {saveError && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-2">{saveError}</p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Left: Meta */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-4">
          <h2 className="font-semibold text-slate-900 dark:text-white">{t('tmpl.builder.info')}</h2>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              {t('tmpl.builder.name')} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Monthly Safety Inspection"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              {t('tmpl.builder.desc')}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="Used for monthly safety walkthroughs at facilities..."
            />
          </div>

          <div className="pt-1 text-sm text-slate-500">
            <span className="font-semibold text-slate-700 dark:text-slate-300">{fields.length}</span>{' '}
            {t('tmpl.builder.configured')}
          </div>
        </div>

        {/* Right: Fields */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-900 dark:text-white">{t('tmpl.builder.fields')}</h2>
            <button
              onClick={addField}
              className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium"
            >
              <Plus size={14} />
              {t('tmpl.builder.addField')}
            </button>
          </div>

          {fields.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-400">
              No fields yet.{' '}
              <button onClick={addField} className="text-blue-600 hover:underline">{t('tmpl.builder.addOne')}</button>
            </div>
          ) : (
            <div className="space-y-3">
              {fields.map((field, idx) => (
                <div
                  key={field.id}
                  className="flex items-start gap-2 p-3 border border-slate-200 dark:border-slate-700 rounded-lg"
                >
                  <div className="mt-2 text-slate-300 cursor-grab shrink-0">
                    <GripVertical size={16} />
                  </div>

                  <span className="mt-2.5 text-xs text-slate-400 font-mono w-5 shrink-0">{idx + 1}</span>

                  <div className="flex-1 space-y-2">
                    <input
                      type="text"
                      value={field.label}
                      onChange={(e) => updateField(field.id, { label: e.target.value })}
                      className="w-full px-2.5 py-1.5 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder={`Field label ${idx + 1}...`}
                    />
                    <select
                      value={field.type}
                      onChange={(e) => updateField(field.id, { type: e.target.value as FieldType })}
                      className="w-full px-2.5 py-1.5 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {FIELD_TYPES.map((ft) => (
                        <option key={ft.value} value={ft.value}>{ft.label}</option>
                      ))}
                    </select>
                  </div>

                  <button
                    onClick={() => removeField(field.id)}
                    disabled={fields.length === 1}
                    className="mt-1.5 text-slate-400 hover:text-red-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={addField}
            className="w-full py-2.5 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
          >
            <Plus size={14} className="inline mr-1" />
            {t('tmpl.builder.addField')}
          </button>
        </div>
      </div>
    </div>
  )
}
