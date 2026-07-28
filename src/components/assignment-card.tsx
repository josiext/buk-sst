import { useMemo, useState } from 'react'
import {
  CheckIcon,
  ChevronDownIcon,
  FileIcon,
  Trash2Icon,
  UploadIcon,
  XIcon,
} from 'lucide-react'

import {
  ComplianceBadge,
  EvidenceBadge,
  POLICY_LABEL,
  PeriodBadge,
  alignmentLabel,
  recurrenceLabel,
} from '@/components/labels'
import { PeriodBar, type PeriodBarSegment } from '@/components/period-bar'
import { UploadEvidenceDialog } from '@/components/upload-evidence-dialog'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { deleteEvidence, reviewEvidence, setAssignmentStatus } from '@/data/repo'
import type { AssignmentView } from '@/data/selectors'
import { coveragesByPeriod, filesByEvidence, gapsByPeriod, versionById } from '@/data/selectors'
import { useStore } from '@/data/store'
import { formatDate, inclusiveDays, timestampToISO, today } from '@/lib/dates'
import type { RequirementVersion } from '@/lib/types'
import { cn } from '@/lib/utils'

/**
 * Tarjeta de una asignación: estado de hoy arriba, y al expandir el detalle
 * auditable — cada período con su cobertura, sus gaps y las evidencias que lo
 * sustentan. Es la vista que uno le muestra a un fiscalizador.
 */
export function AssignmentCard({
  view,
  defaultOpen = false,
  showEmployee = false,
}: {
  view: AssignmentView
  defaultOpen?: boolean
  showEmployee?: boolean
}) {
  const { data, mutate, recalculating } = useStore()
  const [expanded, setExpanded] = useState(defaultOpen)
  const [uploadOpen, setUploadOpen] = useState(false)
  const asOf = today()

  const coverages = useMemo(() => coveragesByPeriod(data), [data])
  const gaps = useMemo(() => gapsByPeriod(data), [data])
  const files = useMemo(() => filesByEvidence(data), [data])
  const versions = useMemo(() => versionById(data), [data])

  const version = view.requirement.currentVersion
  const status = view.compliance?.status ?? 'non_compliant'

  return (
    <div className="rounded-xl border bg-card">
      <div className="flex flex-wrap items-start gap-3 p-4">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex min-w-0 flex-1 items-start gap-2 text-left"
        >
          <ChevronDownIcon
            className={cn(
              'mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform',
              expanded && 'rotate-180'
            )}
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">
                {showEmployee ? view.employee.full_name : version.name}
              </span>
              <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                {view.requirement.requirement.code}
              </span>
            </div>
            <div className="mt-0.5 truncate text-xs text-muted-foreground">
              {showEmployee ? version.name : recurrenceLabel(version)}
              {' · '}
              {alignmentLabel(version)}
              {' · '}
              acredita por {POLICY_LABEL[version.evidence_effective_policy].toLowerCase()}
            </div>
          </div>
        </button>

        <div className="flex shrink-0 flex-col items-end gap-1">
          <ComplianceBadge status={status} />
          <div className="text-xs text-muted-foreground">
            {view.compliance?.covered_until
              ? `cubierto hasta ${formatDate(view.compliance.covered_until)}`
              : view.compliance?.status === 'compliant'
                ? 'sin fecha de término'
                : view.gapDays > 0
                  ? `${view.gapDays} días sin cumplir`
                  : '—'}
          </div>
        </div>

        <Button size="sm" variant="outline" onClick={() => setUploadOpen(true)}>
          <UploadIcon data-icon="inline-start" />
          Evidencia
        </Button>
      </div>

      {expanded && (
        <>
          <Separator />
          <div className="space-y-4 p-4">
            <div className="grid gap-3 text-xs sm:grid-cols-3">
              <Meta label="Aplica desde">{formatDate(view.assignment.applies_from)}</Meta>
              <Meta label="Aplica hasta">
                {view.assignment.applies_until
                  ? formatDate(view.assignment.applies_until)
                  : 'indefinido'}
              </Meta>
              <Meta label="Origen">{view.assignment.assignment_source ?? 'manual'}</Meta>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-xs font-medium text-muted-foreground uppercase">
                  Períodos evaluados
                </h4>
                <Legend />
              </div>

              <div className="space-y-2">
                {view.periods.map((period) => {
                  const periodCoverages = coverages.get(period.id) ?? []
                  const periodGaps = gaps.get(period.id) ?? []
                  const segments: PeriodBarSegment[] = [
                    ...periodCoverages.map<PeriodBarSegment>((c) => ({
                      start: c.coverage_start,
                      end: c.coverage_end,
                      kind: 'covered',
                      label: `Evidencia #${c.evidence_id}: ${formatDate(c.coverage_start)} → ${formatDate(c.coverage_end)}`,
                    })),
                    ...periodGaps.map<PeriodBarSegment>((g) => ({
                      start: g.gap_start,
                      end: g.gap_end,
                      kind: 'gap',
                      label: `Sin cumplimiento: ${formatDate(g.gap_start)} → ${formatDate(g.gap_end)}`,
                    })),
                  ]
                  const periodVersion = versions.get(period.requirement_version_id)

                  return (
                    <div key={period.id} className="rounded-lg border p-3">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <div className="text-xs">
                          <span className="font-medium tabular-nums">
                            {formatDate(period.period_start)} →{' '}
                            {period.period_end ? formatDate(period.period_end) : 'sin término'}
                          </span>
                          {periodVersion && (
                            <VersionTag version={periodVersion} allVersions={view.requirement.versions.length} />
                          )}
                        </div>
                        <PeriodBadge status={period.status} />
                      </div>

                      <PeriodBar
                        start={period.period_start}
                        end={period.period_end}
                        segments={segments}
                        asOf={asOf}
                      />

                      {periodGaps.length > 0 && (
                        <ul className="mt-2 space-y-0.5 text-xs text-red-700 dark:text-red-400">
                          {periodGaps.map((gap) => (
                            <li key={gap.id}>
                              Sin cumplimiento del {formatDate(gap.gap_start)} al{' '}
                              {formatDate(gap.gap_end)}
                              {gap.gap_end &&
                                ` (${inclusiveDays(gap.gap_start, gap.gap_end)} días)`}
                            </li>
                          ))}
                        </ul>
                      )}

                      {periodCoverages.length > 1 && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          {periodCoverages.length} evidencias aportan cobertura a este período.
                        </p>
                      )}
                    </div>
                  )
                })}
                {view.periods.length === 0 && (
                  <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                    Sin períodos generados. La asignación empieza en el futuro o el requisito no
                    tiene una versión vigente en su ventana.
                  </p>
                )}
              </div>
            </div>

            <div>
              <h4 className="mb-2 text-xs font-medium text-muted-foreground uppercase">
                Evidencias cargadas
              </h4>
              <div className="space-y-1.5">
                {view.evidences.map((evidence) => {
                  const evidenceFiles = files.get(evidence.id) ?? []
                  const evidenceVersion = versions.get(evidence.requirement_version_id)
                  return (
                    <div
                      key={evidence.id}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border p-2.5 text-xs"
                    >
                      <FileIcon className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">
                        {evidenceFiles[0]?.original_filename ?? `evidencia-${evidence.id}`}
                      </span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        vigencia {formatDate(evidence.valid_from)} →{' '}
                        {evidence.valid_until ? formatDate(evidence.valid_until) : '∞'}
                      </span>
                      <span className="shrink-0 text-muted-foreground">
                        cargada {formatDate(timestampToISO(evidence.submitted_at))}
                      </span>
                      <EvidenceBadge status={evidence.status} />

                      {evidence.status === 'pending' && (
                        <div className="flex shrink-0 gap-1">
                          <Button
                            size="icon-xs"
                            variant="outline"
                            title="Aprobar"
                            disabled={recalculating}
                            onClick={() =>
                              mutate(
                                () => reviewEvidence(evidence.id, 'approved'),
                                { assignmentIds: [view.assignment.id] },
                                'Evidencia aprobada'
                              )
                            }
                          >
                            <CheckIcon />
                          </Button>
                          <Button
                            size="icon-xs"
                            variant="outline"
                            title="Rechazar"
                            disabled={recalculating}
                            onClick={() =>
                              mutate(
                                () =>
                                  reviewEvidence(
                                    evidence.id,
                                    'rejected',
                                    'Rechazada desde el prototipo'
                                  ),
                                { assignmentIds: [view.assignment.id] },
                                'Evidencia rechazada'
                              )
                            }
                          >
                            <XIcon />
                          </Button>
                        </div>
                      )}

                      <Button
                        size="icon-xs"
                        variant="ghost"
                        title="Eliminar"
                        disabled={recalculating}
                        onClick={() =>
                          mutate(
                            () => deleteEvidence(evidence.id),
                            { assignmentIds: [view.assignment.id] },
                            'Evidencia eliminada'
                          )
                        }
                      >
                        <Trash2Icon />
                      </Button>

                      {evidence.rejection_reason && (
                        <p className="w-full text-red-700 dark:text-red-400">
                          Motivo: {evidence.rejection_reason}
                        </p>
                      )}
                    </div>
                  )
                })}
                {view.evidences.length === 0 && (
                  <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                    No hay evidencias cargadas para esta asignación.
                  </p>
                )}
              </div>
            </div>

            <div className="flex justify-end">
              {view.assignment.status === 'active' ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground"
                  disabled={recalculating}
                  onClick={() =>
                    mutate(
                      () => setAssignmentStatus(view.assignment.id, 'inactive', today()),
                      { assignmentIds: [view.assignment.id] },
                      'Asignación desactivada'
                    )
                  }
                >
                  Dejar de exigir este requisito
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground"
                  disabled={recalculating}
                  onClick={() =>
                    mutate(
                      () => setAssignmentStatus(view.assignment.id, 'active', null),
                      { assignmentIds: [view.assignment.id] },
                      'Asignación reactivada'
                    )
                  }
                >
                  Volver a exigir este requisito
                </Button>
              )}
            </div>
          </div>
        </>
      )}

      <UploadEvidenceDialog view={view} open={uploadOpen} onOpenChange={setUploadOpen} />
    </div>
  )
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-medium tabular-nums">{children}</div>
    </div>
  )
}

/** Solo se muestra si el requisito tiene historia de versiones. */
function VersionTag({ version, allVersions }: { version: RequirementVersion; allVersions: number }) {
  if (allVersions < 2) return null
  return (
    <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
      v{version.version_number} · {recurrenceLabel(version).toLowerCase()}
    </span>
  )
}

function Legend() {
  return (
    <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
      <span className="flex items-center gap-1">
        <span className="size-2 rounded-sm bg-emerald-500/70" /> cubierto
      </span>
      <span className="flex items-center gap-1">
        <span className="size-2 rounded-sm bg-red-500/70" /> sin cumplir
      </span>
      <span className="flex items-center gap-1">
        <span className="h-2.5 w-0.5 bg-foreground/70" /> hoy
      </span>
    </div>
  )
}
