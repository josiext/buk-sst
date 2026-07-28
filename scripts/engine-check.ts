import { evaluateAssignment, generatePeriods } from '@/domain/compliance'
import { merge, subtract } from '@/lib/intervals'
import { addUnits } from '@/lib/dates'
import type { Assignment, Employee, Evidence, RequirementVersion } from '@/lib/types'

let failures = 0
let total = 0
function check(name: string, actual: unknown, expected: unknown) {
  total++
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a !== e) {
    failures++
    console.log(`FAIL  ${name}\n  esperado: ${e}\n  obtenido: ${a}`)
  } else {
    console.log(`ok    ${name}`)
  }
}

const ACTIVE: Pick<Employee, 'status'> = { status: 'active' }

// --- Aritmética de fechas -------------------------------------------------
check('31 ene + 1 mes → fin de feb', addUnits('2026-01-31', 'month', 1), '2026-02-28')
check('29 feb bisiesto', addUnits('2024-01-31', 'month', 1), '2024-02-29')
check('anual', addUnits('2025-03-14', 'year', 1), '2026-03-14')
check('trimestral', addUnits('2026-01-01', 'month', 3), '2026-04-01')

// --- Álgebra de intervalos ------------------------------------------------
check(
  'merge contiguo (31 dic / 1 ene) no deja hueco',
  merge([
    { start: '2025-01-01', end: '2025-12-31' },
    { start: '2026-01-01', end: '2026-06-30' },
  ]),
  [{ start: '2025-01-01', end: '2026-06-30' }]
)
check(
  'merge respeta hueco real de 1 día',
  merge([
    { start: '2025-01-01', end: '2025-12-30' },
    { start: '2026-01-01', end: '2026-06-30' },
  ]),
  [
    { start: '2025-01-01', end: '2025-12-30' },
    { start: '2026-01-01', end: '2026-06-30' },
  ]
)
check(
  'subtract deja gap central',
  subtract({ start: '2026-01-01', end: '2026-12-31' }, [{ start: '2026-03-01', end: '2026-09-30' }]),
  [
    { start: '2026-01-01', end: '2026-02-28' },
    { start: '2026-10-01', end: '2026-12-31' },
  ]
)
check(
  'subtract con cobertura infinita',
  subtract({ start: '2026-01-01', end: '2026-12-31' }, [{ start: '2026-03-01', end: null }]),
  [{ start: '2026-01-01', end: '2026-02-28' }]
)
check(
  'subtract sin cobertura',
  subtract({ start: '2026-01-01', end: '2026-01-31' }, []),
  [{ start: '2026-01-01', end: '2026-01-31' }]
)

// --- Generación de períodos ----------------------------------------------
const anual: RequirementVersion = {
  id: 1,
  requirement_id: 1,
  version_number: 1,
  name: 'Licencia',
  description: null,
  recurrence_unit: 'year',
  recurrence_interval: 1,
  period_alignment: 'assignment_start',
  anchor_date: null,
  evidence_effective_policy: 'document_validity',
  effective_from: '2015-01-01',
  effective_until: null,
}

const asig: Assignment = {
  id: 1,
  employee_id: 1,
  requirement_id: 1,
  applies_from: '2024-03-10',
  applies_until: null,
  status: 'active',
  assignment_source: null,
}

check(
  'anual desde la asignación: 3 períodos al 2026-07-27',
  generatePeriods(asig, [anual], '2026-07-27').map((p) => [p.period.start, p.period.end]),
  [
    ['2024-03-10', '2025-03-09'],
    ['2025-03-10', '2026-03-09'],
    ['2026-03-10', '2027-03-09'],
  ]
)

const trimestralCalendario: RequirementVersion = {
  ...anual,
  id: 2,
  recurrence_unit: 'month',
  recurrence_interval: 3,
  period_alignment: 'fixed_anchor',
  anchor_date: '2015-01-01',
}

check(
  'trimestral alineado a calendario, recortado al inicio de la asignación',
  generatePeriods(
    { ...asig, applies_from: '2026-05-20' },
    [trimestralCalendario],
    '2026-07-27'
  ).map((p) => [p.period.start, p.period.end]),
  [
    ['2026-05-20', '2026-06-30'],
    ['2026-07-01', '2026-09-30'],
  ]
)

check(
  '"una sola vez" genera un único período abierto',
  generatePeriods(
    asig,
    [{ ...anual, id: 3, recurrence_unit: 'once' }],
    '2026-07-27'
  ).map((p) => [p.period.start, p.period.end]),
  [['2024-03-10', null]]
)

// Versionado: anual hasta 2025-12-31, semestral desde 2026-01-01
const v1: RequirementVersion = {
  ...anual,
  id: 10,
  period_alignment: 'fixed_anchor',
  anchor_date: '2015-01-01',
  effective_from: '2015-01-01',
  effective_until: '2025-12-31',
}
const v2: RequirementVersion = {
  ...anual,
  id: 11,
  version_number: 2,
  recurrence_unit: 'month',
  recurrence_interval: 6,
  period_alignment: 'fixed_anchor',
  anchor_date: '2015-01-01',
  effective_from: '2026-01-01',
  effective_until: null,
}

check(
  'cada tramo conserva la periodicidad de su versión',
  generatePeriods({ ...asig, applies_from: '2024-05-18' }, [v1, v2], '2026-07-27').map((p) => [
    p.requirementVersionId,
    p.period.start,
    p.period.end,
  ]),
  [
    [10, '2024-05-18', '2024-12-31'],
    [10, '2025-01-01', '2025-12-31'],
    [11, '2026-01-01', '2026-06-30'],
    [11, '2026-07-01', '2026-12-31'],
  ]
)

// --- Caso del enunciado: semestral con evidencia de 12 meses -------------
const evidencia12m: Evidence = {
  id: 100,
  assignment_id: 1,
  requirement_version_id: 11,
  status: 'approved',
  valid_from: '2026-04-18',
  valid_until: '2027-04-17',
  submitted_at: '2026-04-20T10:00:00Z',
  approved_at: '2026-04-23T10:00:00Z',
  rejected_at: null,
  rejection_reason: null,
}

const enunciado = evaluateAssignment(
  { ...asig, applies_from: '2026-01-01' },
  [v2],
  [evidencia12m],
  ACTIVE,
  '2026-07-27'
)

check(
  'una evidencia de 12 meses cubre 2 períodos semestrales',
  enunciado.periods.map((p) => [p.period.start, p.status, p.coverages.length]),
  [
    ['2026-01-01', 'partially_compliant', 1],
    ['2026-07-01', 'compliant', 1],
  ]
)
check('el semestre 1 queda con gap antes del examen', enunciado.periods[0].gaps, [
  { start: '2026-01-01', end: '2026-04-17' },
])
check('hoy cumple', enunciado.compliance.status, 'compliant')
check('cubierto hasta la vigencia real del documento', enunciado.compliance.coveredUntil, '2027-04-17')

// --- Política submitted_at: subió tarde ---------------------------------
const mensualCarga: RequirementVersion = {
  ...anual,
  id: 20,
  recurrence_unit: 'month',
  recurrence_interval: 1,
  evidence_effective_policy: 'submitted_at',
}
const actaTarde: Evidence = {
  ...evidencia12m,
  id: 200,
  requirement_version_id: 20,
  valid_from: '2026-07-01',
  valid_until: '2026-07-31',
  submitted_at: '2026-07-16T09:00:00Z',
  approved_at: '2026-07-16T12:00:00Z',
}

const tarde = evaluateAssignment(
  { ...asig, applies_from: '2026-07-01' },
  [mensualCarga],
  [actaTarde],
  ACTIVE,
  '2026-07-27'
)
check(
  'la evidencia acredita desde la carga, no desde la fecha del documento',
  tarde.periods[0].coverages[0].coverage,
  { start: '2026-07-16', end: '2026-07-31' }
)
check('los días previos a la carga son gap', tarde.periods[0].gaps, [
  { start: '2026-07-01', end: '2026-07-15' },
])
check('15 días sin cumplimiento', tarde.totalGapDays, 15)
check('pero hoy cumple', tarde.compliance.status, 'compliant')

// --- Política approved_at ------------------------------------------------
const capacitacion: RequirementVersion = {
  ...anual,
  id: 30,
  period_alignment: 'fixed_anchor',
  anchor_date: '2015-01-01',
  evidence_effective_policy: 'approved_at',
}
const certificado: Evidence = {
  ...evidencia12m,
  id: 300,
  requirement_version_id: 30,
  valid_from: '2026-01-01',
  valid_until: '2026-12-31',
  submitted_at: '2026-07-13T09:00:00Z',
  approved_at: '2026-07-17T09:00:00Z',
}
const aprobada = evaluateAssignment(
  { ...asig, applies_from: '2026-01-01' },
  [capacitacion],
  [certificado],
  ACTIVE,
  '2026-07-27'
)
check('acredita solo desde la aprobación', aprobada.periods[0].coverages[0].coverage, {
  start: '2026-07-17',
  end: '2026-12-31',
})
check('el resto del año quedó descubierto', aprobada.periods[0].gaps, [
  { start: '2026-01-01', end: '2026-07-16' },
])

// --- Evidencia en revisión y rechazada ----------------------------------
const enRevision: Evidence = {
  ...evidencia12m,
  id: 400,
  requirement_version_id: 11,
  status: 'pending',
  valid_from: '2026-07-01',
  valid_until: '2027-06-30',
  approved_at: null,
}
const revision = evaluateAssignment(
  { ...asig, applies_from: '2026-01-01' },
  [v2],
  [enRevision],
  ACTIVE,
  '2026-07-27'
)
check('una evidencia pendiente no acredita', revision.periods[1].coverages.length, 0)
check('pero el estado de hoy la distingue', revision.compliance.status, 'pending')

const rechazada = evaluateAssignment(
  { ...asig, applies_from: '2026-01-01' },
  [v2],
  [{ ...enRevision, id: 500, status: 'rejected' }],
  ACTIVE,
  '2026-07-27'
)
check('una evidencia rechazada deja incumplimiento', rechazada.compliance.status, 'non_compliant')

// --- Sin evidencia y empleado inactivo ----------------------------------
const sinNada = evaluateAssignment(
  { ...asig, applies_from: '2026-07-22' },
  [v2],
  [],
  ACTIVE,
  '2026-07-27'
)
check('sin evidencia → incumple', sinNada.compliance.status, 'non_compliant')
check('y acumula los días transcurridos', sinNada.totalGapDays, 6)
check('el período aún abierto se marca incumplido', sinNada.periods[0].status, 'non_compliant')

const inactivo = evaluateAssignment(
  { ...asig, applies_from: '2026-01-01' },
  [v2],
  [],
  { status: 'inactive' },
  '2026-07-27'
)
check('empleado inactivo no es exigible', inactivo.compliance.status, 'inactive')

const cerrada = evaluateAssignment(
  { ...asig, applies_from: '2026-01-01', applies_until: '2026-06-30' },
  [v2],
  [],
  ACTIVE,
  '2026-07-27'
)
check('asignación cerrada no es exigible', cerrada.compliance.status, 'inactive')
check(
  'no se generan períodos después del cierre',
  cerrada.periods.map((p) => [p.period.start, p.period.end]),
  [['2026-01-01', '2026-06-30']]
)

// --- Cobertura continua entre renovaciones ------------------------------
const renovaciones: Evidence[] = [
  {
    ...evidencia12m,
    id: 600,
    requirement_version_id: 11,
    valid_from: '2025-08-01',
    valid_until: '2026-01-31',
  },
  {
    ...evidencia12m,
    id: 601,
    requirement_version_id: 11,
    valid_from: '2026-02-01',
    valid_until: '2026-12-31',
  },
]
const continua = evaluateAssignment(
  { ...asig, applies_from: '2026-01-01' },
  [v2],
  renovaciones,
  ACTIVE,
  '2026-07-27'
)
check('renovación contigua no genera gap falso', continua.totalGapDays, 0)
check('compliant_since se remonta a la primera evidencia del tramo',
  continua.compliance.compliantSince, '2025-08-01')

// --- "once" sin fecha de término ---------------------------------------
const unaVez = evaluateAssignment(
  { ...asig, applies_from: '2024-03-10' },
  [{ ...anual, id: 40, recurrence_unit: 'once' }],
  [
    {
      ...evidencia12m,
      id: 700,
      requirement_version_id: 40,
      valid_from: '2024-03-12',
      valid_until: null,
    },
  ],
  ACTIVE,
  '2026-07-27'
)
check('requisito de una sola vez: gap inicial de 2 días', unaVez.totalGapDays, 2)
check('y luego cumple para siempre', unaVez.compliance.status, 'compliant')
check('sin fecha de término', unaVez.compliance.coveredUntil, null)

console.log(
  failures === 0
    ? `\n✅ todas las comprobaciones pasaron (${total})`
    : `\n❌ ${failures} comprobaciones fallaron`
)
if (failures > 0) process.exit(1)