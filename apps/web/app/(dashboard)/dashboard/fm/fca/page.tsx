'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus, ClipboardList, ChevronRight, Loader2, AlertTriangle, Calendar,
} from 'lucide-react'
import {
  FmCard, FmBadge, FmButton, FmModal, FmModalFooter,
  FmSectionLabel, statusVariant, FmSelect,
} from '@/components/fm'
import { useFmT } from '@/lib/locale'

const FCA_TEMPLATE_ID = '20000000-0000-0000-0000-000000000001'

// ── Types ──────────────────────────────────────────────────────────────────

interface FmProperty { id: string; name: string }

interface FmInspection {
  id: string
  status: string
  template_id: string
  created_at: string
  updated_at: string
  scheduled_for: string | null
  fm_properties: { name: string } | null
  fm_templates:  { name: string } | null
  inspector:     { full_name: string } | null
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

function statusLabel(status: string) {
  const map: Record<string, string> = {
    DRAFT: 'Draft', IN_PROGRESS: 'In Progress',
    PENDING_APPROVAL: 'Pending Review', COMPLETED: 'Completed',
  }
  return map[status] ?? status
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function FCAListPage() {
  const router   = useRouter()
  const t        = useFmT()

  const [inspections, setInspections] = useState<FmInspection[]>([])
  const [properties, setProperties]   = useState<FmProperty[]>([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)
  const [showModal, setShowModal]     = useState(false)
  const [propertyId, setPropertyId]   = useState('')
  const [saving, setSaving]           = useState(false)
  const [formError, setFormError]     = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [inspRes, propRes] = await Promise.all([
        fetch('/api/fm/inspections?type=fca').then(r => r.json() as Promise<FmInspection[]>),
        fetch('/api/fm/properties').then(r => r.json() as Promise<FmProperty[]>),
      ])
      setInspections(Array.isArray(inspRes) ? inspRes : [])
      setProperties(Array.isArray(propRes) ? propRes : [])
    } catch {
      setError('Failed to load assessments')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function startFCA() {
    if (!propertyId) { setFormError('Select a property'); return }
    setSaving(true)
    setFormError(null)
    try {
      const res = await fetch('/api/fm/inspections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template_id: FCA_TEMPLATE_ID, property_id: propertyId }),
      })
      if (!res.ok) {
        const body = await res.json() as { error?: string }
        throw new Error(body.error ?? 'Failed to create assessment')
      }
      const insp = await res.json() as { id: string }
      router.push(`/dashboard/fm/fca/${insp.id}`)
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Error')
      setSaving(false)
    }
  }

  const fcaInspections = inspections

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: 'var(--fg)' }}>
            Facility Condition Assessments
          </h1>
          <p style={{ margin: '0.35rem 0 0', fontSize: '0.875rem', color: 'var(--muted)' }}>
            Comprehensive structural and systems assessment for owned facilities
          </p>
        </div>
        <FmButton icon={<Plus size={16} />} onClick={() => { setShowModal(true); setPropertyId(''); setFormError(null) }}>
          New Assessment
        </FmButton>
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--muted)', padding: '3rem 0' }}>
          <Loader2 size={20} className="animate-spin" />
          <span>Loading assessments…</span>
        </div>
      ) : error ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--red)', padding: '2rem 0' }}>
          <AlertTriangle size={18} />
          <span>{error}</span>
        </div>
      ) : fcaInspections.length === 0 ? (
        <FmCard>
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted)' }}>
            <ClipboardList size={40} style={{ margin: '0 auto 1rem', opacity: 0.4 }} />
            <p style={{ fontWeight: 600, color: 'var(--fg)', marginBottom: '0.5rem' }}>No assessments yet</p>
            <p style={{ fontSize: '0.875rem', marginBottom: '1.5rem' }}>
              Start a new Facility Condition Assessment to document building systems, identify deficiencies, and estimate deferred maintenance costs.
            </p>
            <FmButton icon={<Plus size={16} />} onClick={() => { setShowModal(true); setPropertyId(''); setFormError(null) }}>
              Start First Assessment
            </FmButton>
          </div>
        </FmCard>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {fcaInspections.map(insp => (
            <FmCard
              key={insp.id}
              onClick={() => router.push(`/dashboard/fm/fca/${insp.id}`)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.25rem' }}>
                <div style={{
                  flexShrink: 0, width: 40, height: 40, borderRadius: 8,
                  background: 'var(--card-b)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <ClipboardList size={18} style={{ color: 'var(--primary)' }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: 'var(--fg)', marginBottom: '0.2rem' }}>
                    {insp.fm_properties?.name ?? 'Unknown Property'}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <Calendar size={12} />
                      {formatDate(insp.updated_at)}
                    </span>
                    {insp.inspector && (
                      <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                        {insp.inspector.full_name}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
                  <FmBadge variant={statusVariant(insp.status)}>
                    {statusLabel(insp.status)}
                  </FmBadge>
                  <ChevronRight size={16} style={{ color: 'var(--muted)' }} />
                </div>
              </div>
            </FmCard>
          ))}
        </div>
      )}

      {/* Start New FCA Modal */}
      <FmModal
        open={showModal}
        onClose={() => setShowModal(false)}
        title="New Facility Condition Assessment"
        subtitle="Select the property to assess. The full FCA questionnaire will open after creation."
      >
        <FmSectionLabel>Property</FmSectionLabel>
        <FmSelect
          value={propertyId}
          onChange={e => { setPropertyId(e.target.value); setFormError(null) }}
          style={{ marginBottom: '0.25rem' }}
        >
          <option value="">Select a property…</option>
          {properties.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </FmSelect>

        {formError && (
          <p style={{ color: 'var(--red)', fontSize: '0.8rem', marginTop: '0.5rem' }}>{formError}</p>
        )}

        <FmModalFooter>
          <FmButton variant="secondary" onClick={() => setShowModal(false)}>Cancel</FmButton>
          <FmButton loading={saving} onClick={startFCA}>Start Assessment</FmButton>
        </FmModalFooter>
      </FmModal>
    </div>
  )
}
