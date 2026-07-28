import { cn } from '@/lib/utils'
import type {
  CurrentComplianceStatus,
  EvidenceEffectivePolicy,
  EvidenceStatus,
  RequirementPeriodStatus,
  RequirementVersion,
} from '@/lib/types'

const COMPLIANCE_LABEL: Record<CurrentComplianceStatus, string> = {
  compliant: 'Cumple',
  non_compliant: 'No cumple',
  pending: 'En revisión',
  inactive: 'No exigible',
}

const COMPLIANCE_CLASS: Record<CurrentComplianceStatus, string> = {
  compliant: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400',
  non_compliant: 'bg-red-500/12 text-red-700 dark:text-red-400',
  pending: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  inactive: 'bg-muted text-muted-foreground',
}

const COMPLIANCE_DOT: Record<CurrentComplianceStatus, string> = {
  compliant: 'bg-emerald-500',
  non_compliant: 'bg-red-500',
  pending: 'bg-amber-500',
  inactive: 'bg-muted-foreground/40',
}

export function ComplianceBadge({
  status,
  className,
}: {
  status: CurrentComplianceStatus
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full px-2 text-xs font-medium',
        COMPLIANCE_CLASS[status],
        className
      )}
    >
      <span className={cn('size-1.5 rounded-full', COMPLIANCE_DOT[status])} />
      {COMPLIANCE_LABEL[status]}
    </span>
  )
}

export function complianceLabel(status: CurrentComplianceStatus): string {
  return COMPLIANCE_LABEL[status]
}

export function complianceDotClass(status: CurrentComplianceStatus): string {
  return COMPLIANCE_DOT[status]
}

const PERIOD_LABEL: Record<RequirementPeriodStatus, string> = {
  compliant: 'Cumplido',
  partially_compliant: 'Parcial',
  non_compliant: 'Incumplido',
  pending: 'Por iniciar',
}

const PERIOD_CLASS: Record<RequirementPeriodStatus, string> = {
  compliant: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400',
  partially_compliant: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  non_compliant: 'bg-red-500/12 text-red-700 dark:text-red-400',
  pending: 'bg-muted text-muted-foreground',
}

export function PeriodBadge({ status }: { status: RequirementPeriodStatus }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 shrink-0 items-center rounded-full px-2 text-xs font-medium',
        PERIOD_CLASS[status]
      )}
    >
      {PERIOD_LABEL[status]}
    </span>
  )
}

const EVIDENCE_LABEL: Record<EvidenceStatus, string> = {
  approved: 'Aprobada',
  pending: 'En revisión',
  rejected: 'Rechazada',
  superseded: 'Reemplazada',
}

const EVIDENCE_CLASS: Record<EvidenceStatus, string> = {
  approved: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400',
  pending: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  rejected: 'bg-red-500/12 text-red-700 dark:text-red-400',
  superseded: 'bg-muted text-muted-foreground',
}

export function EvidenceBadge({ status }: { status: EvidenceStatus }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 shrink-0 items-center rounded-full px-2 text-xs font-medium',
        EVIDENCE_CLASS[status]
      )}
    >
      {EVIDENCE_LABEL[status]}
    </span>
  )
}

/** "cada 3 meses", "anual", "una sola vez"… */
export function recurrenceLabel(version: RequirementVersion): string {
  const { recurrence_unit: unit, recurrence_interval: n } = version
  if (unit === 'once') return 'Una sola vez'
  if (unit === 'day') return n === 1 ? 'Diario' : `Cada ${n} días`
  if (unit === 'week') return n === 1 ? 'Semanal' : `Cada ${n} semanas`
  if (unit === 'month') {
    if (n === 1) return 'Mensual'
    if (n === 3) return 'Trimestral'
    if (n === 6) return 'Semestral'
    return `Cada ${n} meses`
  }
  return n === 1 ? 'Anual' : `Cada ${n} años`
}

export function alignmentLabel(version: RequirementVersion): string {
  if (version.recurrence_unit === 'once') return 'Sin renovación'
  return version.period_alignment === 'fixed_anchor'
    ? 'Alineado a calendario'
    : 'Desde la asignación'
}

export const POLICY_LABEL: Record<EvidenceEffectivePolicy, string> = {
  document_validity: 'Vigencia del documento',
  submitted_at: 'Fecha de carga',
  approved_at: 'Fecha de aprobación',
}

export const POLICY_HELP: Record<EvidenceEffectivePolicy, string> = {
  document_validity: 'La evidencia acredita desde la fecha que declara el documento.',
  submitted_at:
    'La evidencia acredita solo desde que se cargó al sistema: subirla tarde deja días sin cumplimiento.',
  approved_at: 'La evidencia acredita solo desde que un revisor la aprobó.',
}
