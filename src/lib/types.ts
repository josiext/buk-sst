export type EmployeeStatus = 'active' | 'inactive'
export type RecurrenceUnit = 'once' | 'day' | 'week' | 'month' | 'year'
export type PeriodAlignment = 'assignment_start' | 'fixed_anchor'
export type EvidenceEffectivePolicy = 'document_validity' | 'submitted_at' | 'approved_at'
export type AssignmentStatus = 'active' | 'inactive'
export type EvidenceStatus = 'pending' | 'approved' | 'rejected' | 'superseded'
export type RequirementPeriodStatus =
  | 'pending'
  | 'compliant'
  | 'partially_compliant'
  | 'non_compliant'
export type CurrentComplianceStatus = 'pending' | 'compliant' | 'non_compliant' | 'inactive'

/** Fecha en formato ISO `YYYY-MM-DD`. El orden lexicográfico coincide con el cronológico. */
export type ISODate = string

export interface Employee {
  id: number
  full_name: string
  national_id: string | null
  job_title: string | null
  status: EmployeeStatus
}

export interface Requirement {
  id: number
  code: string
  is_active: boolean
}

export interface RequirementVersion {
  id: number
  requirement_id: number
  version_number: number
  name: string
  description: string | null
  recurrence_unit: RecurrenceUnit
  recurrence_interval: number
  period_alignment: PeriodAlignment
  anchor_date: ISODate | null
  evidence_effective_policy: EvidenceEffectivePolicy
  effective_from: ISODate
  effective_until: ISODate | null
}

export interface Assignment {
  id: number
  employee_id: number
  requirement_id: number
  applies_from: ISODate
  applies_until: ISODate | null
  status: AssignmentStatus
  assignment_source: string | null
}

export interface Evidence {
  id: number
  assignment_id: number
  requirement_version_id: number
  status: EvidenceStatus
  valid_from: ISODate
  valid_until: ISODate | null
  submitted_at: string
  approved_at: string | null
  rejected_at: string | null
  rejection_reason: string | null
}

export interface EvidenceFile {
  id: number
  evidence_id: number
  storage_key: string
  original_filename: string
  content_type: string | null
  size_bytes: number | null
}

export interface RequirementPeriod {
  id: number
  assignment_id: number
  requirement_version_id: number
  period_start: ISODate
  period_end: ISODate | null
  status: RequirementPeriodStatus
  last_evaluated_at: string | null
}

export interface PeriodEvidenceCoverage {
  id: number
  period_id: number
  evidence_id: number
  coverage_start: ISODate
  coverage_end: ISODate | null
}

export interface CurrentCompliance {
  assignment_id: number
  employee_id: number
  requirement_id: number
  current_period_id: number | null
  effective_evidence_id: number | null
  status: CurrentComplianceStatus
  compliant_since: ISODate | null
  covered_until: ISODate | null
  calculated_at: string
}

export interface ComplianceGap {
  id: number
  employee_id: number
  requirement_id: number
  assignment_id: number
  period_id: number
  gap_start: ISODate
  gap_end: ISODate | null
}
