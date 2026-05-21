'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useAppMode } from '@/lib/app-mode'
import { Plus, ChevronDown, ChevronRight, Link as LinkIcon, Wrench, X } from 'lucide-react'

// ── Constants ──────────────────────────────────────────────────────────────

const ROW_HEIGHT    = 44
const DAY_WIDTH     = 36
const LEFT_WIDTH    = 300
const HEADER_HEIGHT = 64

// ── Types ──────────────────────────────────────────────────────────────────

interface ProjectTask {
  id:               string
  project_id:       string
  name:             string
  description?:     string | null
  start_date:       string
  end_date:         string
  status:           'not_started' | 'in_progress' | 'completed' | 'blocked'
  assignee_id?:     string | null
  assignee_name?:   string | null
  depends_on_id?:   string | null
  work_order_id?:   string | null
  work_order_table?: string | null
  sort_order:       number
}

interface ProjectMilestone {
  id:         string
  project_id: string
  name:       string
  date:       string
}

interface Project {
  id:               string
  name:             string
  status:           string
  module:           string
  fm_property_id?:  string | null
  start_date?:      string | null
  planned_end_date?: string | null
  end_date?:        string | null
  tasks:            ProjectTask[]
  milestones:       ProjectMilestone[]
}

interface FmProperty {
  id:       string
  name:     string
  projects: Project[]
}

type GanttRow =
  | { type: 'property';  id: string; name: string; projectCount: number; taskCount: number }
  | { type: 'project';   id: string; name: string; status: string; startDate: string | null; endDate: string | null; propertyId: string }
  | { type: 'task';      id: string; name: string; status: string; startDate: string; endDate: string; projectId: string; assigneeName?: string | null; dependsOnId?: string | null; hasWorkOrder: boolean }
  | { type: 'milestone'; id: string; name: string; date: string; projectId: string }

// ── Color maps ─────────────────────────────────────────────────────────────

const PROJECT_STATUS_COLOR: Record<string, string> = {
  planning:  '#6366f1',
  active:    '#22c55e',
  on_hold:   '#f59e0b',
  completed: '#64748b',
  cancelled: '#ef4444',
}

const PROJECT_STATUS_BADGE: Record<string, { bg: string; color: string }> = {
  planning:  { bg: '#ede9fe', color: '#7c3aed' },
  active:    { bg: '#dcfce7', color: '#16a34a' },
  on_hold:   { bg: '#fef9c3', color: '#854d0e' },
  completed: { bg: '#f1f5f9', color: '#475569' },
  cancelled: { bg: '#fee2e2', color: '#dc2626' },
}

const TASK_STATUS_COLOR: Record<string, string> = {
  not_started: '#94a3b8',
  in_progress: '#3b82f6',
  completed:   '#22c55e',
  blocked:     '#ef4444',
}

// ── Date helpers ───────────────────────────────────────────────────────────

function addDays(date: Date, n: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

function diffDays(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}

function parseDate(s: string): Date {
  // Parse YYYY-MM-DD without timezone shift
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function isWeekend(d: Date): boolean {
  return d.getDay() === 0 || d.getDay() === 6
}

function formatMonth(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

// ── Subcomponents ──────────────────────────────────────────────────────────

interface ModalBackdropProps {
  onClose: () => void
  children: React.ReactNode
}
function ModalBackdrop({ onClose, children }: ModalBackdropProps) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}

interface ModalBoxProps {
  title: string
  onClose: () => void
  children: React.ReactNode
  onSubmit: () => void
  submitLabel?: string
  submitting?: boolean
}
function ModalBox({ title, onClose, children, onSubmit, submitLabel = 'Create', submitting = false }: ModalBoxProps) {
  return (
    <div style={{
      background: 'var(--card-b)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      width: 480,
      maxWidth: '95vw',
      padding: 24,
      boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--fg)' }}>{title}</h2>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4 }}>
          <X size={18} />
        </button>
      </div>
      {children}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
        <button
          onClick={onClose}
          style={{
            padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)',
            background: 'transparent', color: 'var(--muted)', cursor: 'pointer', fontSize: 13,
          }}
        >
          Cancel
        </button>
        <button
          onClick={onSubmit}
          disabled={submitting}
          style={{
            padding: '8px 16px', borderRadius: 8, border: 'none',
            background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontSize: 13,
            opacity: submitting ? 0.6 : 1,
          }}
        >
          {submitting ? 'Saving…' : submitLabel}
        </button>
      </div>
    </div>
  )
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'var(--card)',
  color: 'var(--fg)',
  fontSize: 13,
  boxSizing: 'border-box',
}

// ── Main Component ─────────────────────────────────────────────────────────

export function ProjectsGanttPage() {
  const { appMode } = useAppMode()

  // Data
  const [projects, setProjects]         = useState<Project[]>([])
  const [properties, setProperties]     = useState<FmProperty[]>([])
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState<string | null>(null)

  // Collapse state
  const [collapsedProperties, setCollapsedProperties] = useState<Set<string>>(new Set())
  const [collapsedProjects, setCollapsedProjects]     = useState<Set<string>>(new Set())

  // Hover state for showing + Task button
  const [hoveredProjectId, setHoveredProjectId] = useState<string | null>(null)

  // Modals
  const [showAddProject, setShowAddProject] = useState(false)
  const [addTaskProjectId, setAddTaskProjectId] = useState<string | null>(null)
  const [editTask, setEditTask]             = useState<ProjectTask | null>(null)

  // Add Project form
  const [newProjName, setNewProjName]         = useState('')
  const [newProjDesc, setNewProjDesc]         = useState('')
  const [newProjStart, setNewProjStart]       = useState('')
  const [newProjEnd, setNewProjEnd]           = useState('')
  const [newProjStatus, setNewProjStatus]     = useState('planning')
  const [addProjSubmitting, setAddProjSubmitting] = useState(false)

  // Add Task form
  const [newTaskName, setNewTaskName]         = useState('')
  const [newTaskDesc, setNewTaskDesc]         = useState('')
  const [newTaskStart, setNewTaskStart]       = useState('')
  const [newTaskEnd, setNewTaskEnd]           = useState('')
  const [newTaskAssignee, setNewTaskAssignee] = useState('')
  const [newTaskDepsOn, setNewTaskDepsOn]     = useState('')
  const [addTaskSubmitting, setAddTaskSubmitting] = useState(false)

  // Edit Task form
  const [editTaskName, setEditTaskName]       = useState('')
  const [editTaskStart, setEditTaskStart]     = useState('')
  const [editTaskEnd, setEditTaskEnd]         = useState('')
  const [editTaskStatus, setEditTaskStatus]   = useState<ProjectTask['status']>('not_started')
  const [editTaskSubmitting, setEditTaskSubmitting] = useState(false)
  const [genWOSubmitting, setGenWOSubmitting] = useState(false)

  // Scroll container ref for auto-scroll to today
  const scrollRef = useRef<HTMLDivElement>(null)

  // ── Fetch data ────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects?module=${appMode}`)
      if (!res.ok) throw new Error('Failed to load projects')
      const json = await res.json() as {
        projects: Project[]
        properties?: FmProperty[]
      }
      setProjects(json.projects ?? [])
      setProperties(json.properties ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [appMode])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Compute date range ────────────────────────────────────────────────────

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const allDates: Date[] = []
  for (const p of projects) {
    if (p.start_date)       allDates.push(parseDate(p.start_date))
    if (p.planned_end_date) allDates.push(parseDate(p.planned_end_date))
    if (p.end_date)         allDates.push(parseDate(p.end_date))
    for (const t of p.tasks) {
      allDates.push(parseDate(t.start_date))
      allDates.push(parseDate(t.end_date))
    }
    for (const m of p.milestones) {
      allDates.push(parseDate(m.date))
    }
  }
  allDates.push(today)

  const minDate = allDates.length > 0
    ? addDays(new Date(Math.min(...allDates.map((d) => d.getTime()))), -14)
    : addDays(today, -30)
  const maxDate = allDates.length > 0
    ? addDays(new Date(Math.max(...allDates.map((d) => d.getTime()))), 30)
    : addDays(today, 90)

  const viewStart = minDate
  const totalDays = diffDays(viewStart, maxDate) + 1

  // Build days array
  const days: Date[] = []
  for (let i = 0; i < totalDays; i++) {
    days.push(addDays(viewStart, i))
  }

  // Today offset
  const todayOffset = diffDays(viewStart, today)

  // ── Auto-scroll to today ──────────────────────────────────────────────────

  useEffect(() => {
    if (!loading && scrollRef.current) {
      const scrollX = Math.max(0, todayOffset * DAY_WIDTH - 200)
      scrollRef.current.scrollLeft = scrollX
    }
  }, [loading, todayOffset])

  // ── Build flat rows ───────────────────────────────────────────────────────

  function buildRows(): GanttRow[] {
    const rows: GanttRow[] = []

    if (appMode === 'fm' && properties.length > 0) {
      for (const prop of properties) {
        const taskCount = prop.projects.reduce((s, p) => s + p.tasks.length, 0)
        rows.push({ type: 'property', id: prop.id, name: prop.name, projectCount: prop.projects.length, taskCount })

        if (collapsedProperties.has(prop.id)) continue

        for (const project of prop.projects) {
          const projStart = project.start_date ?? project.planned_end_date ?? null
          const projEnd   = project.planned_end_date ?? project.end_date ?? null
          rows.push({ type: 'project', id: project.id, name: project.name, status: project.status, startDate: projStart, endDate: projEnd, propertyId: prop.id })

          if (collapsedProjects.has(project.id)) continue

          for (const task of project.tasks) {
            rows.push({
              type: 'task',
              id: task.id,
              name: task.name,
              status: task.status,
              startDate: task.start_date,
              endDate: task.end_date,
              projectId: project.id,
              assigneeName: task.assignee_name,
              dependsOnId: task.depends_on_id,
              hasWorkOrder: !!task.work_order_id,
            })
          }
          for (const ms of project.milestones) {
            rows.push({ type: 'milestone', id: ms.id, name: ms.name, date: ms.date, projectId: project.id })
          }
        }
      }
    } else {
      // PW flat list — group by a synthetic "all projects" property
      rows.push({
        type: 'property',
        id: '__pw__',
        name: 'Projects',
        projectCount: projects.length,
        taskCount: projects.reduce((s, p) => s + p.tasks.length, 0),
      })

      if (!collapsedProperties.has('__pw__')) {
        for (const project of projects) {
          const projStart = project.start_date ?? project.planned_end_date ?? null
          const projEnd   = project.planned_end_date ?? project.end_date ?? null
          rows.push({ type: 'project', id: project.id, name: project.name, status: project.status, startDate: projStart, endDate: projEnd, propertyId: '__pw__' })

          if (collapsedProjects.has(project.id)) continue

          for (const task of project.tasks) {
            rows.push({
              type: 'task',
              id: task.id,
              name: task.name,
              status: task.status,
              startDate: task.start_date,
              endDate: task.end_date,
              projectId: project.id,
              assigneeName: task.assignee_name,
              dependsOnId: task.depends_on_id,
              hasWorkOrder: !!task.work_order_id,
            })
          }
          for (const ms of project.milestones) {
            rows.push({ type: 'milestone', id: ms.id, name: ms.name, date: ms.date, projectId: project.id })
          }
        }
      }
    }

    return rows
  }

  const rows = buildRows()

  // ── Month groups for header ───────────────────────────────────────────────

  interface MonthGroup {
    label:  string
    start:  number
    count:  number
  }

  const monthGroups: MonthGroup[] = []
  let currentMonth = ''
  let currentStart = 0
  let currentCount = 0

  for (let i = 0; i < days.length; i++) {
    const label = formatMonth(days[i])
    if (label !== currentMonth) {
      if (currentMonth) monthGroups.push({ label: currentMonth, start: currentStart, count: currentCount })
      currentMonth = label
      currentStart = i
      currentCount = 1
    } else {
      currentCount++
    }
  }
  if (currentMonth) monthGroups.push({ label: currentMonth, start: currentStart, count: currentCount })

  // ── Bar rendering helper ──────────────────────────────────────────────────

  function renderBar(row: GanttRow): React.ReactNode {
    // Shared weekend + today line background
    const bg = (
      <>
        {days.map((d, i) => isWeekend(d) ? (
          <div key={i} style={{
            position: 'absolute', left: i * DAY_WIDTH, top: 0,
            width: DAY_WIDTH, height: ROW_HEIGHT,
            background: 'rgba(0,0,0,0.04)',
            pointerEvents: 'none',
          }} />
        ) : null)}
        {/* Today line */}
        <div style={{
          position: 'absolute',
          left: todayOffset * DAY_WIDTH + DAY_WIDTH / 2 - 1,
          top: 0, width: 2, height: ROW_HEIGHT,
          background: '#ef4444', zIndex: 5, pointerEvents: 'none',
        }} />
      </>
    )

    if (row.type === 'property') {
      // Find date range across all projects in this property
      const propProjects = appMode === 'fm'
        ? (properties.find((p) => p.id === row.id)?.projects ?? [])
        : projects

      const propDates: Date[] = []
      for (const p of propProjects) {
        if (p.start_date)       propDates.push(parseDate(p.start_date))
        if (p.planned_end_date) propDates.push(parseDate(p.planned_end_date))
        if (p.end_date)         propDates.push(parseDate(p.end_date))
      }

      if (propDates.length < 2) return <div style={{ position: 'relative', width: totalDays * DAY_WIDTH, height: ROW_HEIGHT }}>{bg}</div>

      const minD = new Date(Math.min(...propDates.map((d) => d.getTime())))
      const maxD = new Date(Math.max(...propDates.map((d) => d.getTime())))
      const left  = diffDays(viewStart, minD) * DAY_WIDTH
      const width = Math.max(DAY_WIDTH, diffDays(minD, maxD) * DAY_WIDTH)

      return (
        <div style={{ position: 'relative', width: totalDays * DAY_WIDTH, height: ROW_HEIGHT, flexShrink: 0 }}>
          {bg}
          <div style={{
            position: 'absolute',
            left, top: ROW_HEIGHT / 2 - 3,
            width, height: 6,
            background: '#94a3b8',
            borderRadius: 3,
            zIndex: 6,
          }} />
        </div>
      )
    }

    if (row.type === 'project') {
      if (!row.startDate || !row.endDate) {
        return <div style={{ position: 'relative', width: totalDays * DAY_WIDTH, height: ROW_HEIGHT }}>{bg}</div>
      }
      const left  = diffDays(viewStart, parseDate(row.startDate)) * DAY_WIDTH
      const width = Math.max(DAY_WIDTH, (diffDays(parseDate(row.startDate), parseDate(row.endDate)) + 1) * DAY_WIDTH)
      const color = PROJECT_STATUS_COLOR[row.status] ?? '#6366f1'

      return (
        <div style={{ position: 'relative', width: totalDays * DAY_WIDTH, height: ROW_HEIGHT, flexShrink: 0 }}>
          {bg}
          <div style={{
            position: 'absolute',
            left, top: ROW_HEIGHT / 2 - 4,
            width, height: 8,
            background: color,
            borderRadius: 4,
            zIndex: 6,
            opacity: 0.85,
          }} />
        </div>
      )
    }

    if (row.type === 'task') {
      const startD  = parseDate(row.startDate)
      const endD    = parseDate(row.endDate)
      const left    = diffDays(viewStart, startD) * DAY_WIDTH
      const width   = Math.max(DAY_WIDTH, (diffDays(startD, endD) + 1) * DAY_WIDTH)
      const color   = TASK_STATUS_COLOR[row.status] ?? '#94a3b8'
      const wide    = width > 60

      return (
        <div style={{ position: 'relative', width: totalDays * DAY_WIDTH, height: ROW_HEIGHT, flexShrink: 0 }}>
          {bg}
          <div
            title={row.name}
            style={{
              position: 'absolute',
              left, top: ROW_HEIGHT / 2 - 10,
              width, height: 20,
              background: color,
              borderRadius: 4,
              zIndex: 6,
              display: 'flex', alignItems: 'center',
              paddingLeft: 6,
              overflow: 'hidden',
              cursor: 'pointer',
            }}
            onClick={() => openEditTask(row.id)}
          >
            {wide && (
              <span style={{ fontSize: 11, color: '#fff', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
                {row.name}
              </span>
            )}
            {row.dependsOnId && (
              <LinkIcon size={10} style={{ color: '#fff', flexShrink: 0, marginRight: 3, opacity: 0.8 }} />
            )}
            {row.hasWorkOrder && (
              <Wrench size={10} style={{ color: '#fff', flexShrink: 0, marginRight: 4, opacity: 0.8 }} />
            )}
          </div>
        </div>
      )
    }

    if (row.type === 'milestone') {
      const offset = diffDays(viewStart, parseDate(row.date)) * DAY_WIDTH + DAY_WIDTH / 2

      return (
        <div style={{ position: 'relative', width: totalDays * DAY_WIDTH, height: ROW_HEIGHT, flexShrink: 0 }}>
          {bg}
          <div
            title={row.name}
            style={{
              position: 'absolute',
              left: offset - 6,
              top: ROW_HEIGHT / 2 - 6,
              width: 12, height: 12,
              background: '#f59e0b',
              transform: 'rotate(45deg)',
              zIndex: 6,
            }}
          />
        </div>
      )
    }

    return null
  }

  // ── Left cell rendering ───────────────────────────────────────────────────

  function renderLeftCell(row: GanttRow, idx: number): React.ReactNode {
    const isEven = idx % 2 === 0

    const cellBase: React.CSSProperties = {
      width: LEFT_WIDTH,
      minWidth: LEFT_WIDTH,
      height: ROW_HEIGHT,
      display: 'flex',
      alignItems: 'center',
      position: 'sticky',
      left: 0,
      zIndex: 10,
      background: isEven ? 'var(--card-b)' : 'var(--card)',
      borderBottom: '1px solid var(--border)',
      borderRight: '1px solid var(--border)',
      boxSizing: 'border-box',
      overflow: 'hidden',
    }

    if (row.type === 'property') {
      const collapsed = collapsedProperties.has(row.id)
      return (
        <div style={{ ...cellBase, background: 'var(--card)', paddingLeft: 8, gap: 6 }}>
          <button
            onClick={() => toggleProperty(row.id)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 2, display: 'flex', alignItems: 'center' }}
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          </button>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {row.name}
          </span>
          <span style={{ fontSize: 11, color: 'var(--faint)', whiteSpace: 'nowrap', paddingRight: 8 }}>
            {row.projectCount}p · {row.taskCount}t
          </span>
        </div>
      )
    }

    if (row.type === 'project') {
      const collapsed = collapsedProjects.has(row.id)
      const badge = PROJECT_STATUS_BADGE[row.status] ?? PROJECT_STATUS_BADGE.planning

      return (
        <div
          style={{ ...cellBase, paddingLeft: 20, gap: 6 }}
          onMouseEnter={() => setHoveredProjectId(row.id)}
          onMouseLeave={() => setHoveredProjectId(null)}
        >
          <button
            onClick={() => toggleProject(row.id)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 2, display: 'flex', alignItems: 'center' }}
          >
            {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
          </button>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {row.name}
          </span>
          <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 99, background: badge.bg, color: badge.color, whiteSpace: 'nowrap', flexShrink: 0 }}>
            {row.status}
          </span>
          {hoveredProjectId === row.id && (
            <button
              onClick={(e) => { e.stopPropagation(); openAddTask(row.id) }}
              style={{
                background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 6,
                padding: '2px 7px', fontSize: 11, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 3,
              }}
            >
              <Plus size={10} /> Task
            </button>
          )}
        </div>
      )
    }

    if (row.type === 'task') {
      const taskColor = TASK_STATUS_COLOR[row.status] ?? '#94a3b8'
      return (
        <div
          style={{ ...cellBase, paddingLeft: 36, gap: 6, cursor: 'pointer' }}
          onClick={() => openEditTask(row.id)}
        >
          <div style={{ width: 8, height: 8, borderRadius: 2, background: taskColor, flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: 'var(--fg)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {row.name}
          </span>
          {row.assigneeName && (
            <span style={{ fontSize: 11, color: 'var(--faint)', flexShrink: 0, paddingRight: 8, overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 80 }}>
              {row.assigneeName}
            </span>
          )}
        </div>
      )
    }

    if (row.type === 'milestone') {
      return (
        <div style={{ ...cellBase, paddingLeft: 36, gap: 6 }}>
          <div style={{ width: 10, height: 10, background: '#f59e0b', transform: 'rotate(45deg)', flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {row.name}
          </span>
        </div>
      )
    }

    return null
  }

  // ── Collapse handlers ─────────────────────────────────────────────────────

  function toggleProperty(id: string) {
    setCollapsedProperties((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function toggleProject(id: string) {
    setCollapsedProjects((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  // ── Modal helpers ─────────────────────────────────────────────────────────

  function openAddTask(projectId: string) {
    setAddTaskProjectId(projectId)
    setNewTaskName('')
    setNewTaskDesc('')
    setNewTaskStart('')
    setNewTaskEnd('')
    setNewTaskAssignee('')
    setNewTaskDepsOn('')
  }

  function openEditTask(taskId: string) {
    const task = projects.flatMap((p) => p.tasks).find((t) => t.id === taskId)
    if (!task) return
    setEditTask(task)
    setEditTaskName(task.name)
    setEditTaskStart(task.start_date)
    setEditTaskEnd(task.end_date)
    setEditTaskStatus(task.status)
  }

  // ── Submit handlers ───────────────────────────────────────────────────────

  async function handleAddProject() {
    if (!newProjName.trim()) return
    setAddProjSubmitting(true)
    try {
      const body: Record<string, unknown> = {
        name:   newProjName.trim(),
        module: appMode,
        status: newProjStatus,
      }
      if (newProjDesc)  body.description      = newProjDesc
      if (newProjStart) body.start_date        = newProjStart
      if (newProjEnd)   body.planned_end_date  = newProjEnd

      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Failed to create project')
      setShowAddProject(false)
      await fetchData()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error')
    } finally {
      setAddProjSubmitting(false)
    }
  }

  async function handleAddTask() {
    if (!addTaskProjectId || !newTaskName.trim() || !newTaskStart || !newTaskEnd) return
    setAddTaskSubmitting(true)
    try {
      const body: Record<string, unknown> = {
        name:       newTaskName.trim(),
        start_date: newTaskStart,
        end_date:   newTaskEnd,
      }
      if (newTaskDesc)    body.description = newTaskDesc
      if (newTaskAssignee) body.assignee_id = newTaskAssignee
      if (newTaskDepsOn)  body.depends_on_id = newTaskDepsOn

      const res = await fetch(`/api/projects/${addTaskProjectId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Failed to create task')
      setAddTaskProjectId(null)
      await fetchData()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error')
    } finally {
      setAddTaskSubmitting(false)
    }
  }

  async function handleEditTask() {
    if (!editTask) return
    setEditTaskSubmitting(true)
    try {
      const body: Record<string, unknown> = {
        name:       editTaskName,
        start_date: editTaskStart,
        end_date:   editTaskEnd,
        status:     editTaskStatus,
      }
      const res = await fetch(`/api/projects/${editTask.project_id}/tasks/${editTask.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Failed to update task')
      setEditTask(null)
      await fetchData()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error')
    } finally {
      setEditTaskSubmitting(false)
    }
  }

  async function handleGenerateWO() {
    if (!editTask) return
    setGenWOSubmitting(true)
    try {
      const res = await fetch(`/api/projects/${editTask.project_id}/tasks/${editTask.id}/work-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ module: appMode }),
      })
      if (!res.ok) throw new Error('Failed to generate work order')
      setEditTask(null)
      await fetchData()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error')
    } finally {
      setGenWOSubmitting(false)
    }
  }

  // ── Helper: get tasks for a project ──────────────────────────────────────

  function getProjectTasks(projectId: string): ProjectTask[] {
    return projects.find((p) => p.id === projectId)?.tasks ?? []
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: 'var(--muted)' }}>
        Loading projects…
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: '#ef4444' }}>
        {error}
      </div>
    )
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* ── Toolbar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 20px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--card-b)',
        flexShrink: 0,
      }}>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--fg)' }}>
          Projects {appMode === 'fm' ? '— Facilities' : '— Public Works'}
        </h1>
        <button
          onClick={() => setShowAddProject(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', borderRadius: 8, border: 'none',
            background: 'var(--primary)', color: '#fff',
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}
        >
          <Plus size={15} /> New Project
        </button>
      </div>

      {/* ── Gantt area ── */}
      <div
        ref={scrollRef}
        style={{ overflow: 'auto', flex: 1 }}
      >
        <div style={{ minWidth: LEFT_WIDTH + totalDays * DAY_WIDTH, position: 'relative' }}>

          {/* Date header */}
          <div style={{
            position: 'sticky', top: 0, zIndex: 20,
            display: 'flex', flexDirection: 'column',
            background: 'var(--card-b)',
            borderBottom: '2px solid var(--border)',
            height: HEADER_HEIGHT,
          }}>
            <div style={{ display: 'flex', flex: 1 }}>
              {/* Left header */}
              <div style={{
                width: LEFT_WIDTH,
                minWidth: LEFT_WIDTH,
                position: 'sticky', left: 0, zIndex: 21,
                background: 'var(--card-b)',
                borderRight: '1px solid var(--border)',
                display: 'flex', alignItems: 'center',
                padding: '0 16px',
                fontSize: 12, fontWeight: 700, color: 'var(--muted)',
              }}>
                Task / Milestone
              </div>

              {/* Month row */}
              <div style={{ display: 'flex', position: 'relative', overflow: 'hidden' }}>
                {monthGroups.map((mg) => (
                  <div
                    key={mg.label + mg.start}
                    style={{
                      width: mg.count * DAY_WIDTH,
                      flexShrink: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      borderRight: '1px solid var(--border)',
                    }}
                  >
                    <div style={{
                      padding: '4px 6px',
                      fontSize: 11, fontWeight: 700,
                      color: 'var(--muted)',
                      borderBottom: '1px solid var(--border)',
                      height: 24,
                      display: 'flex', alignItems: 'center',
                    }}>
                      {mg.label}
                    </div>
                    <div style={{ display: 'flex', flex: 1 }}>
                      {days.slice(mg.start, mg.start + mg.count).map((d, i) => {
                        const isToday = diffDays(today, d) === 0
                        return (
                          <div
                            key={i}
                            style={{
                              width: DAY_WIDTH,
                              flexShrink: 0,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 10,
                              fontWeight: isToday ? 700 : 400,
                              color: isToday ? '#ef4444' : (isWeekend(d) ? 'var(--faint)' : 'var(--muted)'),
                              background: isWeekend(d) ? 'rgba(0,0,0,0.03)' : 'transparent',
                              borderRight: '1px solid var(--border)',
                            }}
                          >
                            {d.getDate()}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Rows */}
          {rows.map((row, idx) => {
            const isEven = idx % 2 === 0
            return (
              <div
                key={row.type + row.id}
                style={{ display: 'flex', height: ROW_HEIGHT, background: isEven ? 'var(--card-b)' : 'var(--card)' }}
              >
                {renderLeftCell(row, idx)}
                {renderBar(row)}
              </div>
            )
          })}

          {rows.length === 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              height: 200, color: 'var(--muted)', fontSize: 14,
            }}>
              No projects yet. Create one to get started.
            </div>
          )}
        </div>
      </div>

      {/* ── Add Project Modal ── */}
      {showAddProject && (
        <ModalBackdrop onClose={() => setShowAddProject(false)}>
          <ModalBox
            title="New Project"
            onClose={() => setShowAddProject(false)}
            onSubmit={handleAddProject}
            submitLabel="Create Project"
            submitting={addProjSubmitting}
          >
            <FieldGroup label="Name *">
              <input
                style={inputStyle}
                value={newProjName}
                onChange={(e) => setNewProjName(e.target.value)}
                placeholder="Project name"
                autoFocus
              />
            </FieldGroup>
            <FieldGroup label="Description">
              <textarea
                style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }}
                value={newProjDesc}
                onChange={(e) => setNewProjDesc(e.target.value)}
                placeholder="Optional description"
              />
            </FieldGroup>
            <FieldGroup label="Status">
              <select style={inputStyle} value={newProjStatus} onChange={(e) => setNewProjStatus(e.target.value)}>
                <option value="planning">Planning</option>
                <option value="active">Active</option>
                <option value="on_hold">On Hold</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </FieldGroup>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <FieldGroup label="Start Date">
                <input type="date" style={inputStyle} value={newProjStart} onChange={(e) => setNewProjStart(e.target.value)} />
              </FieldGroup>
              <FieldGroup label="End Date">
                <input type="date" style={inputStyle} value={newProjEnd} onChange={(e) => setNewProjEnd(e.target.value)} />
              </FieldGroup>
            </div>
          </ModalBox>
        </ModalBackdrop>
      )}

      {/* ── Add Task Modal ── */}
      {addTaskProjectId !== null && (
        <ModalBackdrop onClose={() => setAddTaskProjectId(null)}>
          <ModalBox
            title="Add Task"
            onClose={() => setAddTaskProjectId(null)}
            onSubmit={handleAddTask}
            submitLabel="Add Task"
            submitting={addTaskSubmitting}
          >
            <FieldGroup label="Name *">
              <input
                style={inputStyle}
                value={newTaskName}
                onChange={(e) => setNewTaskName(e.target.value)}
                placeholder="Task name"
                autoFocus
              />
            </FieldGroup>
            <FieldGroup label="Description">
              <textarea
                style={{ ...inputStyle, minHeight: 50, resize: 'vertical' }}
                value={newTaskDesc}
                onChange={(e) => setNewTaskDesc(e.target.value)}
              />
            </FieldGroup>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <FieldGroup label="Start Date *">
                <input type="date" style={inputStyle} value={newTaskStart} onChange={(e) => setNewTaskStart(e.target.value)} />
              </FieldGroup>
              <FieldGroup label="End Date *">
                <input type="date" style={inputStyle} value={newTaskEnd} onChange={(e) => setNewTaskEnd(e.target.value)} />
              </FieldGroup>
            </div>
            <FieldGroup label="Depends On">
              <select style={inputStyle} value={newTaskDepsOn} onChange={(e) => setNewTaskDepsOn(e.target.value)}>
                <option value="">None</option>
                {getProjectTasks(addTaskProjectId).map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </FieldGroup>
          </ModalBox>
        </ModalBackdrop>
      )}

      {/* ── Edit Task Modal ── */}
      {editTask !== null && (
        <ModalBackdrop onClose={() => setEditTask(null)}>
          <ModalBox
            title="Edit Task"
            onClose={() => setEditTask(null)}
            onSubmit={handleEditTask}
            submitLabel="Save"
            submitting={editTaskSubmitting}
          >
            <FieldGroup label="Name">
              <input
                style={inputStyle}
                value={editTaskName}
                onChange={(e) => setEditTaskName(e.target.value)}
                autoFocus
              />
            </FieldGroup>
            <FieldGroup label="Status">
              <select style={inputStyle} value={editTaskStatus} onChange={(e) => setEditTaskStatus(e.target.value as ProjectTask['status'])}>
                <option value="not_started">Not Started</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="blocked">Blocked</option>
              </select>
            </FieldGroup>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <FieldGroup label="Start Date">
                <input type="date" style={inputStyle} value={editTaskStart} onChange={(e) => setEditTaskStart(e.target.value)} />
              </FieldGroup>
              <FieldGroup label="End Date">
                <input type="date" style={inputStyle} value={editTaskEnd} onChange={(e) => setEditTaskEnd(e.target.value)} />
              </FieldGroup>
            </div>
            {!editTask.work_order_id && (
              <div style={{ marginTop: 8, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                <button
                  onClick={handleGenerateWO}
                  disabled={genWOSubmitting}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '7px 12px', borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'transparent', color: 'var(--muted)',
                    fontSize: 12, cursor: 'pointer',
                    opacity: genWOSubmitting ? 0.6 : 1,
                  }}
                >
                  <Wrench size={13} />
                  {genWOSubmitting ? 'Generating…' : 'Generate Work Order'}
                </button>
              </div>
            )}
            {editTask.work_order_id && (
              <div style={{ marginTop: 8, paddingTop: 12, borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Wrench size={13} />
                Linked to work order
              </div>
            )}
          </ModalBox>
        </ModalBackdrop>
      )}
    </div>
  )
}
