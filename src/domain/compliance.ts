import { addDays, addUnits, timestampToISO } from '@/lib/dates'
import { contains, intersect, merge, runContaining, subtract, type Interval } from '@/lib/intervals'
import type {
  Assignment,
  CurrentComplianceStatus,
  Employee,
  Evidence,
  ISODate,
  RequirementPeriodStatus,
  RequirementVersion,
} from '@/lib/types'

/**
 * ============================================================================
 * MOTOR DE CUMPLIMIENTO
 * ============================================================================
 * Función pura: recibe la asignación, las versiones del requisito, las
 * evidencias y la fecha de evaluación, y devuelve todo lo que las tablas
 * derivadas necesitan (períodos, coberturas, estado actual y gaps).
 *
 * Está aislado de la base de datos a propósito: es el único lugar donde vive la
 * regla de negocio, se puede testear sin infraestructura, y en producción el
 * mismo algoritmo se puede portar a una función SQL o a un job en background
 * sin tocar la UI.
 *
 * El cálculo tiene tres pasos independientes:
 *   1. Generar los PERÍODOS que el fiscalizador va a revisar (periodicidad).
 *   2. Proyectar cada evidencia a su intervalo EFECTIVO (vigencia + política).
 *   3. Cruzar ambos: cobertura, estado por período, gaps y estado de hoy.
 */

export interface ComputedCoverage {
  evidenceId: number
  coverage: Interval
}

export interface ComputedPeriod {
  requirementVersionId: number
  period: Interval
  status: RequirementPeriodStatus
  coverages: ComputedCoverage[]
  gaps: Interval[]
  /** Hasta dónde se evaluó: min(fin de período, hoy). Null si el período es futuro. */
  evaluatedUntil: ISODate | null
}

export interface ComputedCompliance {
  status: CurrentComplianceStatus
  currentPeriodIndex: number | null
  effectiveEvidenceId: number | null
  compliantSince: ISODate | null
  coveredUntil: ISODate | null
}

export interface ComputedAssignment {
  periods: ComputedPeriod[]
  compliance: ComputedCompliance
  /** Total de días sin cumplimiento ya transcurridos, sumando todos los períodos. */
  totalGapDays: number
}

// ---------------------------------------------------------------------------
// Paso 1 — Períodos
// ---------------------------------------------------------------------------

/**
 * Ventana en la que el requisito aplica al empleado, acotada por la vigencia de
 * la versión: si la empresa cambió la periodicidad a mitad de camino, cada
 * tramo se recorta con su propia versión y conserva su periodicidad histórica.
 */
function versionWindow(assignment: Assignment, version: RequirementVersion): Interval | null {
  return intersect(
    { start: assignment.applies_from, end: assignment.applies_until },
    { start: version.effective_from, end: version.effective_until }
  )
}

/**
 * Alinea el cursor al inicio del período natural que contiene a `from`.
 *
 * Con `assignment_start` el ancla es la fecha en que el requisito empezó a
 * aplicar, así que el primer período parte exactamente ahí. Con `fixed_anchor`
 * el ancla es un calendario común (trimestres civiles, años), por lo que hay
 * que retroceder o avanzar hasta el borde real del período.
 */
function alignToPeriodStart(
  anchor: ISODate,
  from: ISODate,
  version: RequirementVersion
): ISODate {
  const { recurrence_unit: unit, recurrence_interval: interval } = version
  let cursor = anchor
  let guard = 0

  while (cursor > from && guard++ < 5000) {
    cursor = addUnits(cursor, unit, -interval)
  }
  while (guard++ < 5000) {
    const next = addUnits(cursor, unit, interval)
    if (next > from) break
    cursor = next
  }
  return cursor
}

/**
 * Genera los períodos de la asignación hasta el que contiene a `asOf`.
 * No se generan períodos futuros: nadie incumple algo que todavía no empieza,
 * y así la tabla no crece con filas que no se pueden evaluar.
 */
export function generatePeriods(
  assignment: Assignment,
  versions: RequirementVersion[],
  asOf: ISODate
): Array<{ requirementVersionId: number; period: Interval }> {
  const out: Array<{ requirementVersionId: number; period: Interval }> = []

  const ordered = versions
    .slice()
    .sort((a, b) => (a.effective_from < b.effective_from ? -1 : 1))

  for (const version of ordered) {
    const window = versionWindow(assignment, version)
    if (!window) continue

    // "Una sola vez": un único período abierto que dura toda la asignación.
    if (version.recurrence_unit === 'once') {
      out.push({ requirementVersionId: version.id, period: { ...window } })
      continue
    }

    const anchor =
      version.period_alignment === 'fixed_anchor' && version.anchor_date
        ? version.anchor_date
        : window.start

    // Solo se generan períodos ya iniciados.
    const lastStartAllowed = window.end && window.end < asOf ? window.end : asOf

    let cursor = alignToPeriodStart(anchor, window.start, version)
    let guard = 0

    while (cursor <= lastStartAllowed && guard++ < 5000) {
      const naturalEnd = addDays(
        addUnits(cursor, version.recurrence_unit, version.recurrence_interval),
        -1
      )
      const clipped = intersect(
        { start: cursor, end: naturalEnd },
        window
      )
      if (clipped) out.push({ requirementVersionId: version.id, period: clipped })
      cursor = addDays(naturalEnd, 1)
    }
  }

  return out
}

// ---------------------------------------------------------------------------
// Paso 2 — Intervalo efectivo de una evidencia
// ---------------------------------------------------------------------------

/**
 * Traduce una evidencia al intervalo de tiempo que realmente acredita.
 *
 * Aquí es donde se separa la vigencia del documento de la periodicidad del
 * requisito, y donde la política decide desde cuándo cuenta:
 *  - `document_validity`: desde que el documento dice ser válido.
 *  - `submitted_at`: desde que se cargó al sistema. Si el encargado sube el
 *    acta con retraso, los días previos NO acreditan (es el caso "subió tarde"
 *    del enunciado).
 *  - `approved_at`: desde que un revisor la aprobó.
 *
 * Solo las evidencias `approved` generan cobertura. `pending` / `rejected` /
 * `superseded` devuelven null: existen en el sistema pero no acreditan nada.
 */
export function effectiveInterval(
  evidence: Evidence,
  policy: RequirementVersion['evidence_effective_policy']
): Interval | null {
  if (evidence.status !== 'approved') return null

  let start: ISODate
  switch (policy) {
    case 'submitted_at':
      start = timestampToISO(evidence.submitted_at)
      break
    case 'approved_at':
      start = evidence.approved_at
        ? timestampToISO(evidence.approved_at)
        : timestampToISO(evidence.submitted_at)
      break
    default:
      start = evidence.valid_from
  }

  const result: Interval = { start, end: evidence.valid_until }
  return result.end !== null && result.end < result.start ? null : result
}

/** Igual que `effectiveInterval` pero para una evidencia aún en revisión. */
export function projectedInterval(
  evidence: Evidence,
  policy: RequirementVersion['evidence_effective_policy']
): Interval | null {
  if (evidence.status !== 'pending') return null
  const start =
    policy === 'submitted_at' || policy === 'approved_at'
      ? timestampToISO(evidence.submitted_at)
      : evidence.valid_from
  const result: Interval = { start, end: evidence.valid_until }
  return result.end !== null && result.end < result.start ? null : result
}

// ---------------------------------------------------------------------------
// Paso 3 — Cruce
// ---------------------------------------------------------------------------

/**
 * Estado de un período.
 *
 * Un período solo se juzga hasta hoy: el futuro no se puede incumplir. Por eso
 * `evaluatedUntil = min(fin de período, hoy)`, y un período que aún no empieza
 * queda en `pending`.
 */
function periodStatus(
  period: Interval,
  coverages: Interval[],
  asOf: ISODate
): { status: RequirementPeriodStatus; gaps: Interval[]; evaluatedUntil: ISODate | null } {
  if (period.start > asOf) {
    return { status: 'pending', gaps: [], evaluatedUntil: null }
  }

  const evaluatedUntil = period.end && period.end < asOf ? period.end : asOf
  const evaluable: Interval = { start: period.start, end: evaluatedUntil }

  const gaps = subtract(evaluable, coverages)
  const hasCoverage = coverages.some((c) => intersect(evaluable, c) !== null)

  if (gaps.length === 0) return { status: 'compliant', gaps, evaluatedUntil }
  if (!hasCoverage) return { status: 'non_compliant', gaps, evaluatedUntil }
  return { status: 'partially_compliant', gaps, evaluatedUntil }
}

export function evaluateAssignment(
  assignment: Assignment,
  versions: RequirementVersion[],
  evidences: Evidence[],
  employee: Pick<Employee, 'status'>,
  asOf: ISODate
): ComputedAssignment {
  const versionById = new Map(versions.map((v) => [v.id, v]))

  // La política se toma de la versión bajo la que se cargó la evidencia: si el
  // requisito cambia de política, lo ya acreditado no se reinterpreta.
  const effective = evidences
    .map((e) => {
      const version = versionById.get(e.requirement_version_id) ?? versions[versions.length - 1]
      const interval = version ? effectiveInterval(e, version.evidence_effective_policy) : null
      return interval ? { evidenceId: e.id, interval } : null
    })
    .filter((x): x is { evidenceId: number; interval: Interval } => x !== null)

  const periods = generatePeriods(assignment, versions, asOf).map<ComputedPeriod>((p) => {
    const coverages: ComputedCoverage[] = []
    for (const { evidenceId, interval } of effective) {
      const overlap = intersect(p.period, interval)
      if (overlap) coverages.push({ evidenceId, coverage: overlap })
    }
    const { status, gaps, evaluatedUntil } = periodStatus(
      p.period,
      coverages.map((c) => c.coverage),
      asOf
    )
    return { ...p, status, coverages, gaps, evaluatedUntil }
  })

  return {
    periods,
    compliance: currentCompliance(assignment, versions, evidences, employee, periods, effective, asOf),
    totalGapDays: periods.reduce(
      (acc, p) => acc + p.gaps.reduce((sum, g) => sum + gapDays(g, asOf), 0),
      0
    ),
  }
}

function gapDays(gap: Interval, asOf: ISODate): number {
  const end = gap.end && gap.end < asOf ? gap.end : asOf
  const ms = new Date(end + 'T00:00:00Z').getTime() - new Date(gap.start + 'T00:00:00Z').getTime()
  return Math.max(0, Math.round(ms / 86_400_000) + 1)
}

/**
 * Estado de HOY para la asignación. Es la proyección que responde las preguntas
 * 1 y 2 del enunciado con una sola lectura indexada.
 *
 *  - `inactive`: el empleado se fue, la asignación se desactivó o su ventana ya
 *    cerró. No se le puede exigir nada y no debe contaminar los indicadores.
 *  - `compliant`: hoy está dentro de un tramo cubierto por evidencia aprobada.
 *  - `pending`: hoy no está cubierto, pero hay una evidencia cargada esperando
 *    revisión que sí lo cubriría. El incumplimiento es del revisor, no del
 *    encargado, y se distingue en el tablero.
 *  - `non_compliant`: hoy no está cubierto y no hay nada en camino.
 */
function currentCompliance(
  assignment: Assignment,
  versions: RequirementVersion[],
  evidences: Evidence[],
  employee: Pick<Employee, 'status'>,
  periods: ComputedPeriod[],
  effective: Array<{ evidenceId: number; interval: Interval }>,
  asOf: ISODate
): ComputedCompliance {
  const windowClosed = assignment.applies_until !== null && assignment.applies_until < asOf
  const notStarted = assignment.applies_from > asOf

  if (
    employee.status === 'inactive' ||
    assignment.status === 'inactive' ||
    windowClosed ||
    notStarted
  ) {
    return {
      status: 'inactive',
      currentPeriodIndex: null,
      effectiveEvidenceId: null,
      compliantSince: null,
      coveredUntil: null,
    }
  }

  const currentPeriodIndex = periods.findIndex((p) => contains(p.period, asOf))
  const covering = effective.filter((e) => contains(e.interval, asOf))

  if (covering.length > 0) {
    const run = runContaining(
      merge(effective.map((e) => e.interval)),
      asOf
    )
    // Si varias evidencias cubren hoy, la vigente es la de mayor alcance.
    const best = covering.reduce((a, b) =>
      (b.interval.end ?? '9999-12-31') > (a.interval.end ?? '9999-12-31') ? b : a
    )
    return {
      status: 'compliant',
      currentPeriodIndex: currentPeriodIndex === -1 ? null : currentPeriodIndex,
      effectiveEvidenceId: best.evidenceId,
      compliantSince: run?.start ?? best.interval.start,
      coveredUntil: run?.end ?? best.interval.end,
    }
  }

  const versionById = new Map(versions.map((v) => [v.id, v]))
  const inReview = evidences.some((e) => {
    const version = versionById.get(e.requirement_version_id)
    if (!version) return false
    const projected = projectedInterval(e, version.evidence_effective_policy)
    return projected !== null && contains(projected, asOf)
  })

  return {
    status: inReview ? 'pending' : 'non_compliant',
    currentPeriodIndex: currentPeriodIndex === -1 ? null : currentPeriodIndex,
    effectiveEvidenceId: null,
    compliantSince: null,
    coveredUntil: null,
  }
}

export { gapDays }
