import { inclusiveDays } from '@/lib/dates'
import type {
  Assignment,
  ComplianceGap,
  CurrentCompliance,
  CurrentComplianceStatus,
  Employee,
  Evidence,
  EvidenceFile,
  ISODate,
  PeriodEvidenceCoverage,
  Requirement,
  RequirementPeriod,
  RequirementVersion,
} from '@/lib/types'
import type { Dataset } from './store'

/**
 * Vistas derivadas para la UI. En el prototipo se calculan en memoria; cada una
 * corresponde a una query indexada en la versión real (el comentario indica
 * cuál).
 */

export interface RequirementView {
  requirement: Requirement
  versions: RequirementVersion[]
  currentVersion: RequirementVersion
}

export function requirementViews(data: Dataset): RequirementView[] {
  return data.requirements
    .map((requirement) => {
      const versions = data.versions
        .filter((v) => v.requirement_id === requirement.id)
        .sort((a, b) => a.version_number - b.version_number)
      const currentVersion = versions[versions.length - 1]
      return currentVersion ? { requirement, versions, currentVersion } : null
    })
    .filter((v): v is RequirementView => v !== null)
}

export function requirementViewMap(data: Dataset): Map<number, RequirementView> {
  return new Map(requirementViews(data).map((v) => [v.requirement.id, v]))
}

export interface AssignmentView {
  assignment: Assignment
  employee: Employee
  requirement: RequirementView
  compliance: CurrentCompliance | null
  periods: RequirementPeriod[]
  evidences: Evidence[]
  gaps: ComplianceGap[]
  gapDays: number
}

export function assignmentViews(data: Dataset): AssignmentView[] {
  const employeeById = new Map(data.employees.map((e) => [e.id, e]))
  const requirementById = requirementViewMap(data)
  const complianceByAssignment = new Map(data.compliance.map((c) => [c.assignment_id, c]))
  const periodsByAssignment = groupBy(data.periods, (p) => p.assignment_id)
  const evidencesByAssignment = groupBy(data.evidences, (e) => e.assignment_id)
  const gapsByAssignment = groupBy(data.gaps, (g) => g.assignment_id)

  return data.assignments
    .map((assignment) => {
      const employee = employeeById.get(assignment.employee_id)
      const requirement = requirementById.get(assignment.requirement_id)
      if (!employee || !requirement) return null

      const gaps = gapsByAssignment.get(assignment.id) ?? []
      return {
        assignment,
        employee,
        requirement,
        compliance: complianceByAssignment.get(assignment.id) ?? null,
        periods: (periodsByAssignment.get(assignment.id) ?? [])
          .slice()
          .sort((a, b) => (a.period_start < b.period_start ? 1 : -1)),
        evidences: (evidencesByAssignment.get(assignment.id) ?? [])
          .slice()
          .sort((a, b) => (a.submitted_at < b.submitted_at ? 1 : -1)),
        gaps,
        gapDays: totalGapDays(gaps),
      }
    })
    .filter((v): v is AssignmentView => v !== null)
}

export function totalGapDays(gaps: ComplianceGap[]): number {
  return gaps.reduce((sum, g) => sum + (g.gap_end ? inclusiveDays(g.gap_start, g.gap_end) : 0), 0)
}

// ---------------------------------------------------------------------------
// Pregunta 1 y 2: qué cumple y qué no cumple cada empleado.
// Query real: select status, count(*) from current_compliance group by ...
//             / where employee_id = $1
// ---------------------------------------------------------------------------

export interface EmployeeSummary {
  employee: Employee
  counts: Record<CurrentComplianceStatus, number>
  applicable: number
  gapDays: number
  hasHistoricGaps: boolean
  /** % de requisitos exigibles hoy que están cumplidos. */
  complianceRate: number
}

export function employeeSummaries(data: Dataset): EmployeeSummary[] {
  const views = assignmentViews(data)
  const byEmployee = groupBy(views, (v) => v.employee.id)

  return data.employees.map((employee) => {
    const own = byEmployee.get(employee.id) ?? []
    const counts: Record<CurrentComplianceStatus, number> = {
      compliant: 0,
      non_compliant: 0,
      pending: 0,
      inactive: 0,
    }
    let gapDays = 0
    for (const view of own) {
      if (view.compliance) counts[view.compliance.status] += 1
      gapDays += view.gapDays
    }
    const applicable = counts.compliant + counts.non_compliant + counts.pending
    return {
      employee,
      counts,
      applicable,
      gapDays,
      hasHistoricGaps: gapDays > 0,
      complianceRate: applicable === 0 ? 1 : counts.compliant / applicable,
    }
  })
}

// ---------------------------------------------------------------------------
// Vista de fiscalización: dado un requisito, quién cumple y quién no.
// Query real: select * from current_compliance where requirement_id = $1
// ---------------------------------------------------------------------------

export interface RequirementSummary {
  requirement: RequirementView
  counts: Record<CurrentComplianceStatus, number>
  applicable: number
  gapDays: number
  employeesWithGaps: number
}

export function requirementSummaries(data: Dataset): RequirementSummary[] {
  const views = assignmentViews(data)
  const byRequirement = groupBy(views, (v) => v.requirement.requirement.id)

  return requirementViews(data).map((requirement) => {
    const own = byRequirement.get(requirement.requirement.id) ?? []
    const counts: Record<CurrentComplianceStatus, number> = {
      compliant: 0,
      non_compliant: 0,
      pending: 0,
      inactive: 0,
    }
    let gapDays = 0
    let employeesWithGaps = 0
    for (const view of own) {
      if (view.compliance) counts[view.compliance.status] += 1
      gapDays += view.gapDays
      if (view.gapDays > 0) employeesWithGaps += 1
    }
    return {
      requirement,
      counts,
      applicable: counts.compliant + counts.non_compliant + counts.pending,
      gapDays,
      employeesWithGaps,
    }
  })
}

// ---------------------------------------------------------------------------
// Indicadores globales del tablero.
// ---------------------------------------------------------------------------

export interface DashboardStats {
  employees: number
  activeEmployees: number
  requirements: number
  assignments: number
  evidences: number
  counts: Record<CurrentComplianceStatus, number>
  employeesFullyCompliant: number
  employeesWithGaps: number
  totalGapDays: number
  expiringSoon: Array<{ view: AssignmentView; daysLeft: number }>
  lastCalculatedAt: string | null
}

export function dashboardStats(data: Dataset, asOf: ISODate): DashboardStats {
  const views = assignmentViews(data)
  const summaries = employeeSummaries(data)

  const counts: Record<CurrentComplianceStatus, number> = {
    compliant: 0,
    non_compliant: 0,
    pending: 0,
    inactive: 0,
  }
  for (const view of views) if (view.compliance) counts[view.compliance.status] += 1

  const expiringSoon = views
    .filter((v) => v.compliance?.status === 'compliant' && v.compliance.covered_until)
    .map((v) => ({ view: v, daysLeft: inclusiveDays(asOf, v.compliance!.covered_until!) - 1 }))
    .filter((x) => x.daysLeft >= 0 && x.daysLeft <= 30)
    .sort((a, b) => a.daysLeft - b.daysLeft)

  const withApplicable = summaries.filter((s) => s.applicable > 0)

  return {
    employees: data.employees.length,
    activeEmployees: data.employees.filter((e) => e.status === 'active').length,
    requirements: data.requirements.filter((r) => r.is_active).length,
    assignments: data.assignments.length,
    evidences: data.evidences.length,
    counts,
    employeesFullyCompliant: withApplicable.filter((s) => s.counts.compliant === s.applicable)
      .length,
    employeesWithGaps: summaries.filter((s) => s.hasHistoricGaps).length,
    totalGapDays: summaries.reduce((sum, s) => sum + s.gapDays, 0),
    expiringSoon,
    lastCalculatedAt:
      data.compliance.reduce<string | null>(
        (latest, c) => (latest === null || c.calculated_at > latest ? c.calculated_at : latest),
        null
      ) ?? null,
  }
}

// ---------------------------------------------------------------------------

export function coveragesByPeriod(data: Dataset): Map<number, PeriodEvidenceCoverage[]> {
  return groupBy(data.coverages, (c) => c.period_id)
}

export function gapsByPeriod(data: Dataset): Map<number, ComplianceGap[]> {
  return groupBy(data.gaps, (g) => g.period_id)
}

export function filesByEvidence(data: Dataset): Map<number, EvidenceFile[]> {
  return groupBy(data.evidenceFiles, (f) => f.evidence_id)
}

export function versionById(data: Dataset): Map<number, RequirementVersion> {
  return new Map(data.versions.map((v) => [v.id, v]))
}

export function groupBy<T, K>(items: T[], key: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>()
  for (const item of items) {
    const k = key(item)
    const bucket = map.get(k)
    if (bucket) bucket.push(item)
    else map.set(k, [item])
  }
  return map
}
