import { useMemo, useState } from 'react'
import { ArrowLeftIcon, PlusIcon, RefreshCwIcon } from 'lucide-react'

import { useNavigation } from '@/app/router'
import { AssignAssignmentDialog } from '@/components/assign-dialog'
import { AssignmentCard } from '@/components/assignment-card'
import { StatCard } from '@/components/stat-card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { assignmentViews } from '@/data/selectors'
import { useStore } from '@/data/store'
import { formatDate } from '@/lib/dates'
import type { CurrentComplianceStatus } from '@/lib/types'

const TAB_ORDER: Array<{ key: string; label: string; statuses: CurrentComplianceStatus[] }> = [
  { key: 'all', label: 'Todos', statuses: ['compliant', 'non_compliant', 'pending', 'inactive'] },
  { key: 'non_compliant', label: 'No cumple', statuses: ['non_compliant'] },
  { key: 'compliant', label: 'Cumple', statuses: ['compliant'] },
  { key: 'pending', label: 'En revisión', statuses: ['pending'] },
  { key: 'inactive', label: 'No exigible', statuses: ['inactive'] },
]

export function EmployeeDetailPage({ employeeId }: { employeeId: number }) {
  const { data, asOf, runRecalculation, recalculating } = useStore()
  const { navigate } = useNavigation()
  const [tab, setTab] = useState('all')
  const [assignOpen, setAssignOpen] = useState(false)

  const employee = data.employees.find((e) => e.id === employeeId)
  const views = useMemo(
    () => assignmentViews(data).filter((v) => v.employee.id === employeeId),
    [data, employeeId]
  )

  if (!employee) {
    return <p className="text-sm text-muted-foreground">Empleado no encontrado.</p>
  }

  const counts = views.reduce<Record<CurrentComplianceStatus, number>>(
    (acc, view) => {
      if (view.compliance) acc[view.compliance.status] += 1
      return acc
    },
    { compliant: 0, non_compliant: 0, pending: 0, inactive: 0 }
  )
  const gapDays = views.reduce((sum, v) => sum + v.gapDays, 0)
  const periodsWithGaps = views.reduce(
    (sum, v) => sum + v.periods.filter((p) => p.status !== 'compliant' && p.status !== 'pending').length,
    0
  )

  const activeTab = TAB_ORDER.find((t) => t.key === tab) ?? TAB_ORDER[0]
  const visible = views
    .filter((v) => v.compliance && activeTab.statuses.includes(v.compliance.status))
    .sort(
      (a, b) =>
        rank(a.compliance?.status) - rank(b.compliance?.status) ||
        b.gapDays - a.gapDays ||
        a.requirement.currentVersion.name.localeCompare(b.requirement.currentVersion.name)
    )

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 mb-1 text-muted-foreground"
            onClick={() => navigate({ name: 'dashboard' })}
          >
            <ArrowLeftIcon data-icon="inline-start" />
            Volver al tablero
          </Button>
          <h1 className="font-heading text-xl font-medium">{employee.full_name}</h1>
          <p className="text-sm text-muted-foreground">
            {employee.job_title ?? 'Sin cargo'} · {employee.national_id ?? 'sin RUT'} ·{' '}
            {employee.status === 'active' ? 'activo' : 'inactivo'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={recalculating}
            onClick={() => runRecalculation({ employeeIds: [employeeId] }, 'Empleado recalculado')}
          >
            <RefreshCwIcon data-icon="inline-start" />
            Recalcular
          </Button>
          <Button onClick={() => setAssignOpen(true)}>
            <PlusIcon data-icon="inline-start" />
            Asignar requisito
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Cumple hoy" value={counts.compliant} tone="positive" />
        <StatCard
          label="No cumple hoy"
          value={counts.non_compliant}
          hint={counts.pending > 0 ? `+ ${counts.pending} en revisión` : undefined}
          tone={counts.non_compliant > 0 ? 'negative' : 'neutral'}
        />
        <StatCard
          label="Días sin cumplimiento"
          value={gapDays}
          hint={`en ${periodsWithGaps} períodos`}
          tone={gapDays > 0 ? 'warning' : 'positive'}
        />
        <StatCard
          label="Requisitos asignados"
          value={views.length}
          hint={`evaluado al ${formatDate(asOf)}`}
        />
      </div>

      <Tabs value={tab} onValueChange={(value) => setTab(String(value))}>
        <TabsList>
          {TAB_ORDER.map((t) => (
            <TabsTrigger key={t.key} value={t.key}>
              {t.label}
              {t.key !== 'all' && (
                <span className="ml-1.5 text-xs text-muted-foreground tabular-nums">
                  {t.statuses.reduce((sum, s) => sum + counts[s], 0)}
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        {TAB_ORDER.map((t) => (
          <TabsContent key={t.key} value={t.key} className="mt-4 space-y-2">
            {visible.map((view) => (
              <AssignmentCard
                key={view.assignment.id}
                view={view}
                defaultOpen={visible.length <= 2 || view.compliance?.status === 'non_compliant'}
              />
            ))}
            {visible.length === 0 && (
              <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                Nada en esta categoría.
              </p>
            )}
          </TabsContent>
        ))}
      </Tabs>

      <AssignAssignmentDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        lockedEmployeeId={employeeId}
      />
    </div>
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
