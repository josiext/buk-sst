import { supabase } from '@/lib/supabase'
import type {
  Assignment,
  ComplianceGap,
  CurrentCompliance,
  Employee,
  Evidence,
  EvidenceFile,
  ISODate,
  PeriodEvidenceCoverage,
  Requirement,
  RequirementPeriod,
  RequirementVersion,
} from '@/lib/types'

function unwrap<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message)
  return data as T
}

// ---------------------------------------------------------------------------
// Catálogo
// ---------------------------------------------------------------------------

export async function fetchEmployees(): Promise<Employee[]> {
  return unwrap(
    await supabase
      .from('employees')
      .select('id, full_name, national_id, job_title, status')
      .order('full_name')
  )
}

export async function fetchRequirements(): Promise<Requirement[]> {
  return unwrap(await supabase.from('requirements').select('id, code, is_active').order('code'))
}

export async function fetchRequirementVersions(): Promise<RequirementVersion[]> {
  return unwrap(
    await supabase
      .from('requirement_versions')
      .select(
        'id, requirement_id, version_number, name, description, recurrence_unit, recurrence_interval, period_alignment, anchor_date, evidence_effective_policy, effective_from, effective_until'
      )
      .order('requirement_id')
      .order('version_number')
  )
}

export async function fetchAssignments(): Promise<Assignment[]> {
  return unwrap(
    await supabase
      .from('employee_requirement_assignments')
      .select('id, employee_id, requirement_id, applies_from, applies_until, status, assignment_source')
      .order('id')
  )
}

export async function fetchEvidences(): Promise<Evidence[]> {
  return unwrap(
    await supabase
      .from('evidences')
      .select(
        'id, assignment_id, requirement_version_id, status, valid_from, valid_until, submitted_at, approved_at, rejected_at, rejection_reason'
      )
      .order('submitted_at', { ascending: false })
  )
}

export async function fetchEvidenceFiles(): Promise<EvidenceFile[]> {
  return unwrap(
    await supabase
      .from('evidence_files')
      .select('id, evidence_id, storage_key, original_filename, content_type, size_bytes')
  )
}

// ---------------------------------------------------------------------------
// Tablas derivadas: son las que la UI consulta para responder las preguntas.
// ---------------------------------------------------------------------------

export async function fetchCurrentCompliance(): Promise<CurrentCompliance[]> {
  return unwrap(
    await supabase
      .from('current_compliance')
      .select(
        'assignment_id, employee_id, requirement_id, current_period_id, effective_evidence_id, status, compliant_since, covered_until, calculated_at'
      )
  )
}

export async function fetchPeriods(): Promise<RequirementPeriod[]> {
  return unwrap(
    await supabase
      .from('requirement_periods')
      .select(
        'id, assignment_id, requirement_version_id, period_start, period_end, status, last_evaluated_at'
      )
      .order('period_start')
  )
}

export async function fetchCoverages(): Promise<PeriodEvidenceCoverage[]> {
  return unwrap(
    await supabase
      .from('period_evidence_coverages')
      .select('id, period_id, evidence_id, coverage_start, coverage_end')
      .order('coverage_start')
  )
}

export async function fetchGaps(): Promise<ComplianceGap[]> {
  return unwrap(
    await supabase
      .from('compliance_gaps')
      .select('id, employee_id, requirement_id, assignment_id, period_id, gap_start, gap_end')
      .order('gap_start', { ascending: false })
  )
}

// ---------------------------------------------------------------------------
// Escrituras
// ---------------------------------------------------------------------------

export interface NewRequirementInput {
  code: string
  name: string
  description: string | null
  recurrence_unit: RequirementVersion['recurrence_unit']
  recurrence_interval: number
  period_alignment: RequirementVersion['period_alignment']
  anchor_date: ISODate | null
  evidence_effective_policy: RequirementVersion['evidence_effective_policy']
  effective_from: ISODate
}

export async function createRequirement(input: NewRequirementInput): Promise<Requirement> {
  const requirement = unwrap<Requirement>(
    await supabase
      .from('requirements')
      .insert({ code: input.code, is_active: true })
      .select('id, code, is_active')
      .single()
  )

  const { code: _code, ...version } = input
  const { error } = await supabase.from('requirement_versions').insert({
    ...version,
    requirement_id: requirement.id,
    version_number: 1,
    effective_until: null,
  })
  if (error) {
    await supabase.from('requirements').delete().eq('id', requirement.id)
    throw new Error(error.message)
  }
  return requirement
}

/**
 * Cambiar la periodicidad NO edita la versión existente: cierra la vigente y
 * abre una nueva. Así los períodos históricos siguen respondiendo con la regla
 * que estaba en vigor cuando ocurrieron, que es lo que revisa un fiscalizador.
 */
export async function createRequirementVersion(
  requirementId: number,
  currentVersionNumber: number,
  input: Omit<NewRequirementInput, 'code'>
): Promise<void> {
  const { error: closeError } = await supabase
    .from('requirement_versions')
    .update({ effective_until: previousDay(input.effective_from) })
    .eq('requirement_id', requirementId)
    .eq('version_number', currentVersionNumber)
  if (closeError) throw new Error(closeError.message)

  const { error } = await supabase.from('requirement_versions').insert({
    ...input,
    requirement_id: requirementId,
    version_number: currentVersionNumber + 1,
    effective_until: null,
  })
  if (error) throw new Error(error.message)
}

function previousDay(date: ISODate): ISODate {
  const d = new Date(date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

export async function setRequirementActive(id: number, isActive: boolean): Promise<void> {
  const { error } = await supabase
    .from('requirements')
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

export async function createAssignment(input: {
  employee_id: number
  requirement_id: number
  applies_from: ISODate
  applies_until: ISODate | null
  assignment_source: string | null
}): Promise<void> {
  const { error } = await supabase.from('employee_requirement_assignments').insert({
    ...input,
    status: 'active',
    assigned_by_user_id: SUPER_ADMIN_USER_ID,
  })
  if (error) throw new Error(error.message)
}

export async function createAssignmentsBulk(
  requirementId: number,
  employeeIds: number[],
  appliesFrom: ISODate,
  source: string
): Promise<void> {
  if (employeeIds.length === 0) return
  const { error } = await supabase.from('employee_requirement_assignments').insert(
    employeeIds.map((employee_id) => ({
      employee_id,
      requirement_id: requirementId,
      applies_from: appliesFrom,
      applies_until: null,
      status: 'active',
      assignment_source: source,
      assigned_by_user_id: SUPER_ADMIN_USER_ID,
    }))
  )
  if (error) throw new Error(error.message)
}

export async function setAssignmentStatus(
  id: number,
  status: Assignment['status'],
  appliesUntil: ISODate | null
): Promise<void> {
  const { error } = await supabase
    .from('employee_requirement_assignments')
    .update({ status, applies_until: appliesUntil, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

/** El prototipo no implementa login: todo se atribuye a un único super admin. */
export const SUPER_ADMIN_USER_ID = 99

export interface UploadEvidenceInput {
  assignment_id: number
  requirement_version_id: number
  valid_from: ISODate
  valid_until: ISODate | null
  filename: string
  autoApprove: boolean
}

/**
 * Carga de evidencia SIMULADA: no se sube nada a Storage. Se registra la
 * metadata del archivo con una `storage_key` ficticia, que es exactamente el
 * contrato que tendría la versión real (subir a Storage y guardar la key).
 */
export async function uploadEvidence(input: UploadEvidenceInput): Promise<number> {
  const now = new Date().toISOString()
  const evidence = unwrap<{ id: number }>(
    await supabase
      .from('evidences')
      .insert({
        assignment_id: input.assignment_id,
        requirement_version_id: input.requirement_version_id,
        status: input.autoApprove ? 'approved' : 'pending',
        valid_from: input.valid_from,
        valid_until: input.valid_until,
        submitted_at: now,
        approved_at: input.autoApprove ? now : null,
        uploaded_by_user_id: SUPER_ADMIN_USER_ID,
        reviewed_by_user_id: input.autoApprove ? SUPER_ADMIN_USER_ID : null,
      })
      .select('id')
      .single()
  )

  const { error } = await supabase.from('evidence_files').insert({
    evidence_id: evidence.id,
    storage_key: `sst/simulado/${input.assignment_id}/${evidence.id}-${slug(input.filename)}`,
    original_filename: input.filename,
    content_type: guessContentType(input.filename),
    size_bytes: 100_000 + Math.floor(Math.random() * 900_000),
  })
  if (error) throw new Error(error.message)

  return evidence.id
}

export async function reviewEvidence(
  id: number,
  decision: 'approved' | 'rejected',
  reason?: string
): Promise<void> {
  const now = new Date().toISOString()
  const { error } = await supabase
    .from('evidences')
    .update({
      status: decision,
      approved_at: decision === 'approved' ? now : null,
      rejected_at: decision === 'rejected' ? now : null,
      rejection_reason: decision === 'rejected' ? (reason ?? 'Sin motivo indicado') : null,
      reviewed_by_user_id: SUPER_ADMIN_USER_ID,
      updated_at: now,
    })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

export async function deleteEvidence(id: number): Promise<void> {
  const { error } = await supabase.from('evidences').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

function slug(filename: string): string {
  return filename
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9.]+/g, '-')
    .replace(/^-|-$/g, '')
}

function guessContentType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase()
  if (ext === 'pdf') return 'application/pdf'
  if (ext === 'png') return 'image/png'
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  return 'application/octet-stream'
}
