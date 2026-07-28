import { evaluateAssignment, type ComputedPeriod } from '@/domain/compliance'
import { today } from '@/lib/dates'
import { supabase } from '@/lib/supabase'
import type {
  Assignment,
  Employee,
  Evidence,
  ISODate,
  RequirementVersion,
} from '@/lib/types'

/**
 * ============================================================================
 * RECALCULADOR
 * ============================================================================
 * Materializa las cuatro tablas derivadas a partir del motor de cumplimiento.
 *
 * En producción esto NO es un botón: corre como job en background disparado por
 * (a) cambios en evidencias/asignaciones/versiones y (b) un tick diario que
 * recalcula solo las asignaciones cuya cobertura vence hoy —
 * `evidences (status, valid_until)` está indexado justamente para eso.
 * En el prototipo se expone como acción explícita para que el efecto sea
 * visible en la demo.
 *
 * Lo importante del diseño es que el recálculo es SCOPEABLE: se puede pedir
 * para una asignación, un empleado o un requisito. Nunca hace falta recorrer
 * las 1.500.000 filas de una empresa de 5.000 empleados × 300 requisitos para
 * reflejar que alguien subió un PDF.
 */

export interface RecalculationScope {
  assignmentIds?: number[]
  employeeIds?: number[]
  requirementIds?: number[]
}

export interface RecalculationResult {
  assignments: number
  periods: number
  coverages: number
  gaps: number
  asOf: ISODate
  elapsedMs: number
}

export async function recalculate(
  scope: RecalculationScope = {},
  asOf: ISODate = today()
): Promise<RecalculationResult> {
  const startedAt = performance.now()

  const targets = await resolveScope(scope)
  if (targets.length === 0) {
    return { assignments: 0, periods: 0, coverages: 0, gaps: 0, asOf, elapsedMs: 0 }
  }
  const assignmentIds = targets.map((a) => a.id)

  const [employees, versions, evidences] = await Promise.all([
    loadEmployees(targets.map((a) => a.employee_id)),
    loadVersions(targets.map((a) => a.requirement_id)),
    loadEvidences(assignmentIds),
  ])

  const employeeById = new Map(employees.map((e) => [e.id, e]))
  const versionsByRequirement = groupBy(versions, (v) => v.requirement_id)
  const evidencesByAssignment = groupBy(evidences, (e) => e.assignment_id)

  // Se borra y reescribe el tramo derivado de las asignaciones en scope. Es
  // idempotente: correrlo dos veces deja exactamente el mismo resultado.
  await deleteDerived(assignmentIds)

  const calculatedAt = new Date().toISOString()
  const periodRows: Array<Record<string, unknown>> = []
  const evaluated: Array<{
    assignment: Assignment
    periods: ComputedPeriod[]
    compliance: ReturnType<typeof evaluateAssignment>['compliance']
  }> = []

  for (const assignment of targets) {
    const employee = employeeById.get(assignment.employee_id)
    const requirementVersions = versionsByRequirement.get(assignment.requirement_id) ?? []
    if (!employee || requirementVersions.length === 0) continue

    const result = evaluateAssignment(
      assignment,
      requirementVersions,
      evidencesByAssignment.get(assignment.id) ?? [],
      employee,
      asOf
    )
    evaluated.push({ assignment, periods: result.periods, compliance: result.compliance })

    for (const period of result.periods) {
      periodRows.push({
        assignment_id: assignment.id,
        requirement_version_id: period.requirementVersionId,
        period_start: period.period.start,
        period_end: period.period.end,
        status: period.status,
        last_evaluated_at: calculatedAt,
      })
    }
  }

  // Los períodos se insertan primero porque coberturas y gaps necesitan su id.
  const insertedPeriods = await insertReturning<{
    id: number
    assignment_id: number
    period_start: ISODate
  }>('requirement_periods', periodRows, 'id, assignment_id, period_start')

  const periodIdByKey = new Map(
    insertedPeriods.map((p) => [`${p.assignment_id}|${p.period_start}`, p.id])
  )

  const coverageRows: Array<Record<string, unknown>> = []
  const gapRows: Array<Record<string, unknown>> = []
  const complianceRows: Array<Record<string, unknown>> = []

  for (const { assignment, periods, compliance } of evaluated) {
    for (const period of periods) {
      const periodId = periodIdByKey.get(`${assignment.id}|${period.period.start}`)
      if (!periodId) continue

      for (const { evidenceId, coverage } of period.coverages) {
        coverageRows.push({
          period_id: periodId,
          evidence_id: evidenceId,
          coverage_start: coverage.start,
          coverage_end: coverage.end,
          calculated_at: calculatedAt,
        })
      }
      for (const gap of period.gaps) {
        gapRows.push({
          employee_id: assignment.employee_id,
          requirement_id: assignment.requirement_id,
          assignment_id: assignment.id,
          period_id: periodId,
          gap_start: gap.start,
          // Un gap abierto se cierra en la fecha de evaluación: hasta ahí
          // podemos afirmar que no hubo cumplimiento. El futuro no es un gap.
          gap_end: gap.end ?? period.evaluatedUntil ?? asOf,
          calculated_at: calculatedAt,
        })
      }
    }

    const currentPeriod =
      compliance.currentPeriodIndex !== null ? periods[compliance.currentPeriodIndex] : null

    complianceRows.push({
      assignment_id: assignment.id,
      employee_id: assignment.employee_id,
      requirement_id: assignment.requirement_id,
      current_period_id: currentPeriod
        ? (periodIdByKey.get(`${assignment.id}|${currentPeriod.period.start}`) ?? null)
        : null,
      effective_evidence_id: compliance.effectiveEvidenceId,
      status: compliance.status,
      compliant_since: compliance.compliantSince,
      covered_until: compliance.coveredUntil,
      calculated_at: calculatedAt,
    })
  }

  await Promise.all([
    insertChunked('period_evidence_coverages', coverageRows),
    insertChunked('compliance_gaps', gapRows),
    insertChunked('current_compliance', complianceRows),
  ])

  return {
    assignments: evaluated.length,
    periods: insertedPeriods.length,
    coverages: coverageRows.length,
    gaps: gapRows.length,
    asOf,
    elapsedMs: Math.round(performance.now() - startedAt),
  }
}

// ---------------------------------------------------------------------------

async function resolveScope(scope: RecalculationScope): Promise<Assignment[]> {
  let query = supabase
    .from('employee_requirement_assignments')
    .select('id, employee_id, requirement_id, applies_from, applies_until, status, assignment_source')

  if (scope.assignmentIds) query = query.in('id', scope.assignmentIds)
  if (scope.employeeIds) query = query.in('employee_id', scope.employeeIds)
  if (scope.requirementIds) query = query.in('requirement_id', scope.requirementIds)

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return data ?? []
}

async function loadEmployees(ids: number[]): Promise<Employee[]> {
  const { data, error } = await supabase
    .from('employees')
    .select('id, full_name, national_id, job_title, status')
    .in('id', unique(ids))
  if (error) throw new Error(error.message)
  return data ?? []
}

async function loadVersions(requirementIds: number[]): Promise<RequirementVersion[]> {
  const { data, error } = await supabase
    .from('requirement_versions')
    .select(
      'id, requirement_id, version_number, name, description, recurrence_unit, recurrence_interval, period_alignment, anchor_date, evidence_effective_policy, effective_from, effective_until'
    )
    .in('requirement_id', unique(requirementIds))
  if (error) throw new Error(error.message)
  return data ?? []
}

async function loadEvidences(assignmentIds: number[]): Promise<Evidence[]> {
  const { data, error } = await supabase
    .from('evidences')
    .select(
      'id, assignment_id, requirement_version_id, status, valid_from, valid_until, submitted_at, approved_at, rejected_at, rejection_reason'
    )
    .in('assignment_id', assignmentIds)
  if (error) throw new Error(error.message)
  return data ?? []
}

/**
 * `period_evidence_coverages` y `compliance_gaps` caen por `on delete cascade`
 * al borrar los períodos, así que basta con borrar períodos y current_compliance.
 */
async function deleteDerived(assignmentIds: number[]): Promise<void> {
  for (const chunk of chunks(assignmentIds, 200)) {
    const { error: gapsError } = await supabase
      .from('compliance_gaps')
      .delete()
      .in('assignment_id', chunk)
    if (gapsError) throw new Error(gapsError.message)

    const { error: complianceError } = await supabase
      .from('current_compliance')
      .delete()
      .in('assignment_id', chunk)
    if (complianceError) throw new Error(complianceError.message)

    const { error: periodsError } = await supabase
      .from('requirement_periods')
      .delete()
      .in('assignment_id', chunk)
    if (periodsError) throw new Error(periodsError.message)
  }
}

async function insertReturning<T>(
  table: string,
  rows: Array<Record<string, unknown>>,
  select: string
): Promise<T[]> {
  const out: T[] = []
  for (const chunk of chunks(rows, 500)) {
    const { data, error } = await supabase.from(table).insert(chunk).select(select)
    if (error) throw new Error(`${table}: ${error.message}`)
    out.push(...((data ?? []) as T[]))
  }
  return out
}

async function insertChunked(table: string, rows: Array<Record<string, unknown>>): Promise<void> {
  for (const chunk of chunks(rows, 500)) {
    const { error } = await supabase.from(table).insert(chunk)
    if (error) throw new Error(`${table}: ${error.message}`)
  }
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

function unique(ids: number[]): number[] {
  return Array.from(new Set(ids))
}

function groupBy<T, K>(items: T[], key: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>()
  for (const item of items) {
    const k = key(item)
    const bucket = map.get(k)
    if (bucket) bucket.push(item)
    else map.set(k, [item])
  }
  return map
}
