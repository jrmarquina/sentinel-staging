import { cn } from '@/lib/utils'
import { useT } from '@/lib/locale'
import type { TranslationKey } from '@/lib/translations/en'

type PCIBand = {
  min: number
  max: number
  labelKey: TranslationKey
  color: string
}

const PCI_BANDS: PCIBand[] = [
  { min: 85, max: 100, labelKey: 'ph.pci.good',        color: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
  { min: 70, max: 84,  labelKey: 'ph.pci.satisfactory', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  { min: 55, max: 69,  labelKey: 'ph.pci.fair',         color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300' },
  { min: 40, max: 54,  labelKey: 'ph.pci.poor',         color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300' },
  { min: 25, max: 39,  labelKey: 'ph.pci.veryPoor',     color: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300' },
  { min: 10, max: 24,  labelKey: 'ph.pci.serious',      color: 'bg-red-200 text-red-700 dark:bg-red-900/60 dark:text-red-200' },
  { min: 0,  max: 9,   labelKey: 'ph.pci.failed',       color: 'bg-red-900 text-white dark:bg-red-950 dark:text-red-100' },
]

function getBand(score: number): PCIBand {
  return PCI_BANDS.find((b) => score >= b.min && score <= b.max) ?? PCI_BANDS[4]
}

export function PCIBadge({ score, className }: { score: number | null; className?: string }) {
  const t = useT()

  if (score == null) {
    return (
      <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500', className)}>
        {t('ph.pci.notScored')}
      </span>
    )
  }

  const band = getBand(score)
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium', band.color, className)}>
      <span className="font-mono font-bold">{score}</span>
      <span className="opacity-75">· {t(band.labelKey)}</span>
    </span>
  )
}

/** Compact version — just the number with color, no label */
export function PCIScore({ score, className }: { score: number | null; className?: string }) {
  if (score == null) return <span className="text-slate-300 dark:text-slate-600 font-mono text-xs">—</span>
  const band = getBand(score)
  return (
    <span className={cn('inline-flex items-center px-1.5 py-0.5 rounded text-xs font-mono font-bold', band.color, className)}>
      {score}
    </span>
  )
}
