'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { startOfWeek, addDays, format, differenceInCalendarDays, parseISO } from 'date-fns'
import { Loader2, ChevronLeft, ChevronRight, AlertTriangle, Users, CalendarDays } from 'lucide-react'

// ── Types (mirror /api/fm/schedule) ─────────────────────────────────────────
interface PropertyRef { id: string; name: string }
interface ScheduleItem {
  id: string
  type: 'inspection' | 'work_order' | 'project_task'
  title: string
  properties: PropertyRef[]
  propertyLabel: string
  assigneeId: string | null
  assigneeName: string | null
  start: string
  end: string | null
  allDay: boolean
  status: string
  priority: string | null
  isOverdue: boolean
  href: string
}
interface ScheduleData {
  items: ScheduleItem[]
  properties: PropertyRef[]
  assignees: PropertyRef[]
  counts: { total: number; overdue: number; unassigned: number; inspections: number; workOrders: number; projectTasks: number }
}

const TYPE_LABEL: Record<string, string> = { inspection: 'Inspection', work_order: 'Work order', project_task: 'Repair plan' }

function colorFor(it: ScheduleItem): { bg: string; fg: string; bar: string } {
  if (it.type === 'project_task') return it.isOverdue ? { bg: '#FCEBEB', fg: '#791F1F', bar: '#E24B4A' } : { bg: '#EEEDFE', fg: '#3C3489', bar: '#7F77DD' }
  if (it.isOverdue) return { bg: '#FCEBEB', fg: '#791F1F', bar: '#E24B4A' }
  if (it.type === 'inspection') return { bg: '#EAF3DE', fg: '#27500A', bar: '#639922' }
  if (it.status === 'IN_PROGRESS') return { bg: '#FAEEDA', fg: '#633806', bar: '#BA7517' }
  if (it.status === 'COMPLETED') return { bg: '#E1F5EE', fg: '#085041', bar: '#1D9E75' }
  return { bg: '#E6F1FB', fg: '#0C447C', bar: '#378ADD' }
}

const dayKey = (iso: string) => iso.slice(0, 10)

// ── Component ────────────────────────────────────────────────────────────────
export default function ScheduleClient() {
  const router = useRouter()
  const [data, setData] = useState<ScheduleData | null>(null)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'resource' | 'week'>('resource')
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }))
  const [fType, setFType] = useState('')
  const [fProp, setFProp] = useState('')
  const [fAsg, setFAsg] = useState('')
  const [overdueOnly, setOverdueOnly] = useState(false)

  useEffect(() => {
    fetch('/api/fm/schedule')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: ScheduleData) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [])

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart])
  const wkStartYMD = format(weekStart, 'yyyy-MM-dd')
  const wkEndYMD = format(addDays(weekStart, 6), 'yyyy-MM-dd')

  const filtered = useMemo(() => {
    if (!data) return []
    return data.items.filter((it) => {
      if (fType && it.type !== fType) return false
      if (fAsg && it.assigneeId !== fAsg) return false
      if (fProp && !it.properties.some((p) => p.id === fProp)) return false
      if (overdueOnly && !it.isOverdue) return false
      const s = dayKey(it.start)
      const e = dayKey(it.end ?? it.start)
      return s <= wkEndYMD && e >= wkStartYMD
    })
  }, [data, fType, fAsg, fProp, overdueOnly, wkStartYMD, wkEndYMD])

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem', color: 'var(--muted, #64748b)' }}><Loader2 size={22} style={{ animation: 'spin 1s linear infinite' }} /></div>
  }

  const counts = data?.counts
  const chip = (extra: React.CSSProperties = {}): React.CSSProperties => ({ height: 32, padding: '0 8px', fontSize: 12, borderRadius: 8, border: '0.5px solid var(--border, #e2e8f0)', background: 'var(--card-b, #f8fafc)', color: 'var(--fg, #0f172a)', cursor: 'pointer', ...extra })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: 'var(--fg, #0f172a)' }}>Schedule</h1>
          <p style={{ fontSize: 13, color: 'var(--muted, #64748b)', margin: '2px 0 0' }}>Inspections, work orders, and repair plans in one place</p>
        </div>
        <div style={{ display: 'flex', background: 'var(--card-b, #f8fafc)', borderRadius: 8, padding: 2, border: '0.5px solid var(--border, #e2e8f0)' }}>
          {([['resource', 'Resource', Users], ['week', 'Week', CalendarDays]] as const).map(([v, label, Icon]) => (
            <button key={v} onClick={() => setView(v)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700, background: view === v ? 'var(--primary, #3b82f6)' : 'transparent', color: view === v ? '#fff' : 'var(--muted, #64748b)' }}>
              <Icon size={14} />{label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI band */}
      {counts && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {[['Overdue', counts.overdue, '#A32D2D'], ['Unassigned', counts.unassigned, '#854F0B'], ['Inspections', counts.inspections, 'var(--fg, #0f172a)'], ['Repair plans', counts.projectTasks, '#534AB7']].map(([l, v, c]) => (
            <div key={String(l)} style={{ background: 'var(--card-b, #f8fafc)', borderRadius: 8, padding: '8px 12px' }}>
              <div style={{ fontSize: 11, color: 'var(--muted, #64748b)' }}>{l}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: c as string }}>{v}</div>
            </div>
          ))}
        </div>
      )}

      {/* Command bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={() => setWeekStart(addDays(weekStart, -7))} style={chip({})} aria-label="Previous week"><ChevronLeft size={14} /></button>
        <button onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))} style={chip({})}>Today</button>
        <button onClick={() => setWeekStart(addDays(weekStart, 7))} style={chip({})} aria-label="Next week"><ChevronRight size={14} /></button>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg, #0f172a)', minWidth: 150 }}>{format(weekStart, 'MMM d')} – {format(addDays(weekStart, 6), 'MMM d, yyyy')}</span>
        <span style={{ flex: 1 }} />
        <button onClick={() => setOverdueOnly((v) => !v)} style={{ ...chip({}), display: 'inline-flex', alignItems: 'center', gap: 5, ...(overdueOnly ? { background: '#FCEBEB', borderColor: '#F09595', color: '#791F1F' } : {}) }}><AlertTriangle size={13} />Overdue{counts ? ` ${counts.overdue}` : ''}</button>
        <select value={fType} onChange={(e) => setFType(e.target.value)} style={chip({})}><option value="">All types</option><option value="inspection">Inspections</option><option value="work_order">Work orders</option><option value="project_task">Repair plans</option></select>
        <select value={fProp} onChange={(e) => setFProp(e.target.value)} style={chip({})}><option value="">All properties</option>{data?.properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <select value={fAsg} onChange={(e) => setFAsg(e.target.value)} style={chip({})}><option value="">All assignees</option>{data?.assignees.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
      </div>

      {/* Body */}
      {!data || data.items.length === 0 ? (
        <Empty />
      ) : view === 'week' ? (
        <WeekView items={filtered} days={days} weekStart={weekStart} router={router} />
      ) : (
        <ResourceView items={filtered} days={days} weekStart={weekStart} assignees={data.assignees} router={router} />
      )}

      <Legend />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

// ── Week view ────────────────────────────────────────────────────────────────
function WeekView({ items, days, weekStart, router }: { items: ScheduleItem[]; days: Date[]; weekStart: Date; router: ReturnType<typeof useRouter> }) {
  const tasks = items.filter((i) => i.type === 'project_task')
  const points = items.filter((i) => i.type !== 'project_task')
  const todayYMD = format(new Date(), 'yyyy-MM-dd')
  return (
    <div style={{ overflowX: 'auto', border: '0.5px solid var(--border, #e2e8f0)', borderRadius: 12, background: 'var(--card, #fff)' }}>
      <div style={{ minWidth: 720, padding: 10 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
          {days.map((d) => {
            const td = format(d, 'yyyy-MM-dd') === todayYMD
            return <div key={d.toISOString()} style={{ textAlign: 'center', padding: '6px 0', borderRadius: 8, background: td ? '#E6F1FB' : 'transparent' }}><div style={{ fontSize: 10, color: 'var(--muted, #64748b)' }}>{format(d, 'EEE')}</div><div style={{ fontSize: 16, fontWeight: 700, color: td ? '#185FA5' : 'var(--fg, #0f172a)' }}>{format(d, 'd')}</div></div>
          })}
        </div>
        {tasks.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, margin: '6px 0' }}>
            {tasks.map((tk) => {
              const s = Math.max(0, differenceInCalendarDays(parseISO(dayKey(tk.start)), weekStart))
              const e = Math.min(6, differenceInCalendarDays(parseISO(dayKey(tk.end ?? tk.start)), weekStart))
              const c = colorFor(tk)
              return <div key={tk.id} style={{ gridColumn: `${s + 1} / span ${Math.max(1, e - s + 1)}` }}><div onClick={() => router.push(tk.href)} title={`${tk.title} · ${tk.propertyLabel}`} style={{ background: c.bar, color: '#fff', borderRadius: 5, padding: '3px 7px', fontSize: 11, cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tk.title}</div></div>
            })}
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, marginTop: 4 }}>
          {days.map((d) => {
            const ymd = format(d, 'yyyy-MM-dd')
            const dayEvs = points.filter((i) => dayKey(i.start) === ymd)
            return <div key={ymd} style={{ minHeight: 100, display: 'flex', flexDirection: 'column', gap: 4 }}>{dayEvs.map((ev) => { const c = colorFor(ev); return <div key={ev.id} onClick={() => router.push(ev.href)} title={`${ev.title} · ${ev.propertyLabel}${ev.assigneeName ? ' · ' + ev.assigneeName : ''}`} style={{ background: c.bg, color: c.fg, borderRadius: 5, padding: '3px 6px', fontSize: 11, cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', boxShadow: ev.isOverdue ? 'inset 3px 0 0 #E24B4A' : 'none' }}>{ev.title}</div> })}</div>
          })}
        </div>
      </div>
    </div>
  )
}

// ── Resource view ────────────────────────────────────────────────────────────
function ResourceView({ items, days, weekStart, assignees, router }: { items: ScheduleItem[]; days: Date[]; weekStart: Date; assignees: PropertyRef[]; router: ReturnType<typeof useRouter> }) {
  const rows: PropertyRef[] = [{ id: '__none__', name: 'Unassigned' }, ...assignees.filter((a) => items.some((it) => it.assigneeId === a.id))]
  const todayYMD = format(new Date(), 'yyyy-MM-dd')
  return (
    <div style={{ overflowX: 'auto', border: '0.5px solid var(--border, #e2e8f0)', borderRadius: 12, background: 'var(--card, #fff)' }}>
      <div style={{ minWidth: 760 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '130px repeat(7, 1fr)', borderBottom: '0.5px solid var(--border, #e2e8f0)' }}>
          <div style={{ padding: '8px 10px', fontSize: 10, color: 'var(--muted, #64748b)' }}>Assignee · load</div>
          {days.map((d) => { const td = format(d, 'yyyy-MM-dd') === todayYMD; return <div key={d.toISOString()} style={{ padding: '8px 4px', textAlign: 'center', fontSize: 10, color: td ? '#185FA5' : 'var(--muted, #64748b)', fontWeight: td ? 700 : 400 }}>{format(d, 'EEE d')}</div> })}
        </div>
        {rows.map((row) => {
          const mine = items.filter((it) => (row.id === '__none__' ? !it.assigneeId : it.assigneeId === row.id))
          if (row.id === '__none__' && mine.length === 0) return null
          const load = Math.min(100, mine.length * 20)
          const over = mine.length >= 5
          return (
            <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '130px repeat(7, 1fr)', borderBottom: '0.5px solid var(--border, #e2e8f0)', minHeight: 50 }}>
              <div style={{ padding: '6px 10px' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg, #0f172a)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.name}</div>
                <div style={{ height: 4, borderRadius: 99, background: 'var(--card-b, #f1f5f9)', marginTop: 5, overflow: 'hidden' }}><div style={{ height: '100%', width: `${load}%`, background: over ? '#E24B4A' : '#378ADD' }} /></div>
                <div style={{ fontSize: 10, color: over ? '#A32D2D' : 'var(--muted, #64748b)', marginTop: 2 }}>{mine.length} {mine.length === 1 ? 'job' : 'jobs'}{row.id === '__none__' ? ' · needs assign' : ''}</div>
              </div>
              {days.map((d) => {
                const ymd = format(d, 'yyyy-MM-dd')
                const cell = mine.filter((it) => { const s = dayKey(it.start); const e = dayKey(it.end ?? it.start); return ymd >= s && ymd <= e })
                return <div key={ymd} style={{ padding: '4px 3px', borderLeft: '0.5px solid var(--border, #e2e8f0)', display: 'flex', flexDirection: 'column', gap: 3 }}>{cell.map((it) => { const c = colorFor(it); return <div key={it.id} onClick={() => router.push(it.href)} title={`${it.title} · ${it.propertyLabel} · ${TYPE_LABEL[it.type]}`} style={{ background: c.bg, color: c.fg, borderRadius: 4, padding: '2px 5px', fontSize: 10, cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.title}</div> })}</div>
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Empty() {
  return <div style={{ textAlign: 'center', padding: '3rem 1rem', border: '0.5px dashed var(--border, #e2e8f0)', borderRadius: 12, color: 'var(--muted, #64748b)' }}><p style={{ fontWeight: 600, margin: 0, color: 'var(--fg, #0f172a)' }}>Nothing scheduled</p><p style={{ fontSize: 13, margin: '4px 0 0' }}>Inspections, work orders with a due date, and repair-plan tasks will appear here.</p></div>
}

function Legend() {
  const items: [string, string][] = [['#639922', 'Inspection'], ['#378ADD', 'Work order'], ['#BA7517', 'In progress'], ['#E24B4A', 'Overdue'], ['#7F77DD', 'Repair plan']]
  return <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 11, color: 'var(--muted, #64748b)' }}>{items.map(([c, l]) => <span key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: c }} />{l}</span>)}</div>
}
