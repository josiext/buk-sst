import { useMemo, useState } from 'react'
import { ArrowLeftIcon, LayersIcon, RefreshCwIcon, UserPlusIcon } from 'lucide-react'

import { useNavigation } from '@/app/router'
import { AssignAssignmentDialog } from '@/components/assign-dialog'
import { AssignmentCard } from '@/components/assignment-card'
import {
  ComplianceBadge,
  POLICY_HELP,
  POLICY_LABEL,
  alignmentLabel,
  recurrenceLabel,
} from '@/components/labels'
import { RequirementFormDialog } from '@/components/requirement-form-dialog'
import { StatCard } from '@/components/stat-card'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { setRequirementActive } from '@/data/repo'
import { assignmentViews, requirementViewMap } from '@/data/selectors'
import { useStore } from '@/data/store'
import { formatDate } from '@/lib/dates'
import type { CurrentComplianceStatus } from '@/lib/types'

/**
 * Vista de fiscalización: el fiscalizador no pregunta "cómo está Juan", pregunta
 * "muéstrame la licencia de conducir de todos tus choferes". Esta pantalla es la
 * misma tabla `current_compliance` leída por el otro índice.
 */
export function RequirementDetailPage({ requirementId }: { requirementId: number }) {
  const { data, mutate, runRecalculation, recalculating } = useStore()
  const { navigate } = useNavigation()
  const [assignOpen, setAssignOpen] = useState(false)
  const [versionOpen, setVersionOpen] = useState(false)
  const [filter, setFilter] = useState<CurrentComplianceStatus | 'all'>('all')

  const requirement = useMemo(() => requirementViewMap(data).get(requirementId), [data, requirementId])
  const views = useMemo(
    () => assignmentViews(data).filter((v) => v.requirement.requirement.id === requirementId),
    [data, requirementId]
  )

  if (!requirement) {
    return <p className="text-sm text-muted-foreground">Requisito no encontrado.</p>
  }

  const counts = views.reduce<Record<CurrentComplianceStatus, number>>(
    (acc, view) => {
      if (view.compliance) acc[view.compliance.status] += 1
      return acc
    },
    { compliant: 0, non_compliant: 0, pending: 0, inactive: 0 }
  )

  const visible = views
    .filter((v) => filter === 'all' || v.compliance?.status === filter)
    .sort(
      (a, b) =>
        rank(a.compliance?.status) - rank(b.compliance?.status) ||
        b.gapDays - a.gapDays ||
        a.employee.full_name.localeCompare(b.employee.full_name)
    )

  const version = requirement.currentVersion
  const gapDays = views.reduce((sum, v) => sum + v.gapDays, 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 mb-1 text-muted-foreground"
            onClick={() => navigate({ name: 'requirements' })}
          >
            <ArrowLeftIcon data-icon="inline-start" />
            Volver a requisitos
          </Button>
          <h1 className="font-heading text-xl font-medium">{version.name}</h1>
          <p className="text-sm text-muted-foreground">
            <span className="font-mono">{requirement.requirement.code}</span> ·{' '}
            {recurrenceLabel(version)} · {alignmentLabel(version)}
            {!requirement.requirement.is_active && ' · inactivo'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={recalculating}
            onClick={() =>
              runRecalculation({ requirementIds: [requirementId] }, 'Requisito recalculado')
            }
          >
            <RefreshCwIcon data-icon="inline-start" />
            Recalcular
          </Button>
          <Button variant="outline" onClick={() => setVersionOpen(true)}>
            <LayersIcon data-icon="inline-start" />
            Nueva versión
          </Button>
          <Button onClick={() => setAssignOpen(true)}>
            <UserPlusIcon data-icon="inline-start" />
            Asignar empleados
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Cumplen hoy" value={counts.compliant} tone="positive" />
        <StatCard
          label="No cumplen hoy"
          value={counts.non_compliant}
          tone={counts.non_compliant > 0 ? 'negative' : 'neutral'}
        />
        <StatCard
          label="En revisión"
          value={counts.pending}
          hint="evidencia cargada, sin aprobar"
          tone={counts.pending > 0 ? 'warning' : 'neutral'}
        />
        <StatCard
          label="Días sin cumplimiento"
          value={gapDays}
          hint="acumulado de todos los empleados"
          tone={gapDays > 0 ? 'warning' : 'positive'}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Definición vigente</CardTitle>
          <CardDescription>{version.description ?? 'Sin descripción.'}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <div className="text-xs text-muted-foreground">Periodicidad</div>
            <div className="font-medium">{recurrenceLabel(version)}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              {version.period_alignment === 'fixed_anchor' && version.anchor_date
                ? `Períodos alineados al calendario que arranca el ${formatDate(version.anchor_date)}: todos los empleados comparten los mismos bordes.`
                : version.recurrence_unit === 'once'
                  ? 'No se renueva: un único período abierto desde que aplica al empleado.'
                  : 'Los períodos se cuentan desde la fecha en que el requisito empezó a aplicar a cada empleado.'}
            </p>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Acredita desde</div>
            <div className="font-medium">{POLICY_LABEL[version.evidence_effective_policy]}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              {POLICY_HELP[version.evidence_effective_policy]}
            </p>
          </div>

          {requirement.versions.length > 1 && (
            <div className="sm:col-span-2">
              <div className="mb-1.5 text-xs text-muted-foreground">Historial de versiones</div>
              <div className="space-y-1">
                {requirement.versions
                  .slice()
                  .reverse()
                  .map((v) => (
                    <div
                      key={v.id}
                      className="flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-lg border p-2 text-xs"
                    >
                      <span className="font-medium">v{v.version_number}</span>
                      <span>{recurrenceLabel(v)}</span>
                      <span className="text-muted-foreground">
                        {POLICY_LABEL[v.evidence_effective_policy].toLowerCase()}
                      </span>
                      <span className="ml-auto tabular-nums text-muted-foreground">
                        {formatDate(v.effective_from)} →{' '}
                        {v.effective_until ? formatDate(v.effective_until) : 'vigente'}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          <div className="sm:col-span-2">
            <Button
              size="sm"
              variant="ghost"
              className="-ml-2 text-muted-foreground"
              disabled={recalculating}
              onClick={() =>
                mutate(
                  () =>
                    setRequirementActive(
                      requirement.requirement.id,
                      !requirement.requirement.is_active
                    ),
                  { requirementIds: [requirement.requirement.id] },
                  requirement.requirement.is_active ? 'Requisito desactivado' : 'Requisito activado'
                )
              }
            >
              {requirement.requirement.is_active ? 'Desactivar requisito' : 'Activar requisito'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div>
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>
            Todos ({views.length})
          </FilterChip>
          {(['non_compliant', 'compliant', 'pending', 'inactive'] as CurrentComplianceStatus[]).map(
            (status) => (
              <FilterChip
                key={status}
                active={filter === status}
                onClick={() => setFilter(status)}
              >
                <ComplianceBadge status={status} />
                <span className="tabular-nums">{counts[status]}</span>
              </FilterChip>
            )
          )}
        </div>

        <div className="space-y-2">
          {visible.map((view) => (
            <AssignmentCard key={view.assignment.id} view={view} showEmployee />
          ))}
          {visible.length === 0 && (
            <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              {views.length === 0
                ? 'Este requisito no está asignado a nadie todavía.'
                : 'Ningún empleado en esta categoría.'}
            </p>
          )}
        </div>
      </div>

      <AssignAssignmentDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        lockedRequirementId={requirementId}
      />
      <RequirementFormDialog
        open={versionOpen}
        onOpenChange={setVersionOpen}
        existing={requirement}
      />
    </div>
  )
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ' +
        (active ? 'border-primary/40 bg-muted' : 'hover:bg-muted/60')
      }
    >
      {children}
    </button>
  )
}

function rank(status: CurrentComplianceStatus | undefined): number {
  switch (status) {
    case 'non_compliant':
      return 0
    case 'pending':
      return 1
    case 'compliant':
      return 2
    default:
      return 3
  }
}
