'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Plus, Trash2, Loader2, ArrowLeft, GripVertical, Save } from 'lucide-react'

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
  { value: 'YES_NO', label: 'Sí / No' },
  { value: 'PASS_FAIL', label: 'Aprobado / Reprobado' },
  { value: 'TEXT', label: 'Texto' },
  { value: 'NUMBER', label: 'Número' },
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
        if (!r.ok) throw new Error('Plantilla no encontrada')
        return r.json() as Promise<FmTemplate>
      })
      .then((tmpl) => {
        setName(tmpl.name)
        setDescription(tmpl.description ?? '')
        const parsed = parseSchema(tmpl.json_schema)
        setFields(parsed.length > 0 ? parsed : [emptyField()])
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Error desconocido'))
      .finally(() => setLoading(false))
  }, [rawId, isNew])

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
    if (!name.trim()) { setSaveError('El nombre de la plantilla es obligatorio'); return }
    if (fields.some((f) => !f.label.trim())) {
      setSaveError('Todos los campos deben tener una etiqueta')
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
        throw new Error(body.error ?? 'Error al guardar la plantilla')
      }
      router.push('/dashboard/fm/templates')
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : 'Error desconocido')
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
          Volver a plantillas
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
            {isNew ? 'Crear Plantilla' : 'Editar Plantilla'}
          </h1>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          {saving ? 'Guardando...' : 'Guardar Plantilla'}
        </button>
      </div>

      {saveError && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-2">{saveError}</p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Left: Meta */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-4">
          <h2 className="font-semibold text-slate-900 dark:text-white">Información de la Plantilla</h2>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Nombre <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Inspección Mensual de Seguridad"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Descripción
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="Utilizada para recorridos mensuales de seguridad en instalaciones..."
            />
          </div>

          <div className="pt-1 text-sm text-slate-500">
            <span className="font-semibold text-slate-700 dark:text-slate-300">{fields.length}</span>{' '}
            {fields.length === 1 ? 'campo' : 'campos'} configurado{fields.length === 1 ? '' : 's'}
          </div>
        </div>

        {/* Right: Fields */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-900 dark:text-white">Campos de la Lista de Verificación</h2>
            <button
              onClick={addField}
              className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium"
            >
              <Plus size={14} />
              Agregar campo
            </button>
          </div>

          {fields.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-400">
              Aún no hay campos.{' '}
              <button onClick={addField} className="text-blue-600 hover:underline">Agregar uno</button>
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
                      placeholder={`Etiqueta del campo ${idx + 1}...`}
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
            Agregar campo
          </button>
        </div>
      </div>
    </div>
  )
}
