import { useMemo, useState } from 'react'
import { AlertTriangleIcon, ArrowRightIcon, ClockIcon, SearchIcon } from 'lucide-react'

import { useNavigation } from '@/app/router'
import { ComplianceBadge, recurrenceLabel } from '@/components/labels'
import { StatCard } from '@/components/stat-card'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { dashboardStats, employeeSummaries, requirementSummaries } from '@/data/selectors'
import { useStore } from '@/data/store'
import { formatDate, formatDuration } from '@/lib/dates'
import { cn } from '@/lib/utils'

export function DashboardPage() {
  const { data, asOf } = useStore()
  const { navigate } = useNavigation()
  const [query, setQuery] = useState('')

  const stats = useMemo(() => dashboardStats(data, asOf), [data, asOf])
  const summaries = useMemo(() => employeeSummaries(data), [data])
  const requirements = useMemo(() => requirementSummaries(data), [data])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const rows = needle
      ? summaries.filter(
          (s) =>
            s.employee.full_name.toLowerCase().includes(needle) ||
            (s.employee.job_title ?? '').toLowerCase().includes(needle) ||
            (s.employee.national_id ?? '').includes(needle)
        )
      : summaries
    // Primero quien más incumple: es el orden en que un encargado SST trabaja.
    return rows
      .slice()
      .sort(
        (a, b) =>
          b.counts.non_compliant - a.counts.non_compliant ||
          b.gapDays - a.gapDays ||
          a.employee.full_name.localeCompare(b.employee.full_name)
      )
  }, [summaries, query])

  const worstRequirements = useMemo(
    () =>
      requirements
        .filter((r) => r.counts.non_compliant > 0)
        .sort((a, b) => b.counts.non_compliant - a.counts.non_compliant)
        .slice(0, 5),
    [requirements]
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-xl font-medium">Tablero de cumplimiento</h1>
        <p className="text-sm text-muted-foreground">
          Estado al {formatDate(asOf)}. Todo lo que se muestra sale de las tablas derivadas
          (<code className="text-xs">current_compliance</code> y{' '}
          <code className="text-xs">compliance_gaps</code>), no de recalcular al vuelo.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Requisitos cumplidos hoy"
          value={stats.counts.compliant}
          hint={`de ${stats.counts.compliant + stats.counts.non_compliant + stats.counts.pending} exigibles`}
          tone="positive"
        />
        <StatCard
          label="Requisitos incumplidos hoy"
          value={stats.counts.non_compliant}
          hint={
            stats.counts.pending > 0
              ? `+ ${stats.counts.pending} con evidencia en revisión`
              : 'sin evidencia vigente'
          }
          tone="negative"
        />
        <StatCard
          label="Empleados 100% al día"
          value={stats.employeesFullyCompliant}
          hint={`de ${stats.activeEmployees} activos`}
          tone={stats.employeesFullyCompliant === stats.activeEmployees ? 'positive' : 'neutral'}
        />
        <StatCard
          label="Días con incumplimiento histórico"
          value={stats.totalGapDays}
          hint={`${stats.employeesWithGaps} empleados afectados`}
          tone={stats.totalGapDays > 0 ? 'warning' : 'positive'}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Empleados</CardTitle>
            <CardDescription>
              Preguntas 1 y 2: qué requisitos cumple y qué requisitos no cumple cada empleado.
            </CardDescription>
            <div className="relative mt-2">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por nombre, cargo o RUT"
                className="pl-8"
              />
            </div>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empleado</TableHead>
                  <TableHead className="text-right">Cumple</TableHead>
                  <TableHead className="text-right">No cumple</TableHead>
                  <TableHead className="text-right">Revisión</TableHead>
                  <TableHead className="text-right">Días sin cumplir</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((summary) => (
                  <TableRow
                    key={summary.employee.id}
                    className="cursor-pointer"
                    onClick={() => navigate({ name: 'employee', id: summary.employee.id })}
                  >
                    <TableCell>
                      <div className="font-medium">{summary.employee.full_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {summary.employee.job_title ?? 'Sin cargo'}
                        {summary.employee.status === 'inactive' && ' · inactivo'}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {summary.counts.compliant}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right tabular-nums',
                        summary.counts.non_compliant > 0 && 'font-medium text-red-600 dark:text-red-400'
                      )}
                    >
                      {summary.counts.non_compliant}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {summary.counts.pending || '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {summary.gapDays > 0 ? (
                        <span className="text-amber-700 dark:text-amber-400">{summary.gapDays}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="w-8 text-muted-foreground">
                      <ArrowRightIcon className="size-3.5" />
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                      Sin empleados que coincidan.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangleIcon className="size-4 text-red-600 dark:text-red-400" />
                Requisitos más incumplidos
              </CardTitle>
              <CardDescription>Dónde conviene poner el esfuerzo primero.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {worstRequirements.map((summary) => (
                <button
                  key={summary.requirement.requirement.id}
                  onClick={() =>
                    navigate({ name: 'requirement', id: summary.requirement.requirement.id })
                  }
                  className="flex w-full items-center justify-between gap-3 rounded-lg border p-2.5 text-left transition-colors hover:bg-muted/60"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {summary.requirement.currentVersion.name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {summary.requirement.requirement.code} ·{' '}
                      {recurrenceLabel(summary.requirement.currentVersion)}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-sm font-medium tabular-nums text-red-600 dark:text-red-400">
                      {summary.counts.non_compliant}
                    </div>
                    <div className="text-xs text-muted-foreground">de {summary.applicable}</div>
                  </div>
                </button>
              ))}
              {worstRequirements.length === 0 && (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  Ningún requisito con incumplimientos.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClockIcon className="size-4 text-amber-600 dark:text-amber-400" />
                Vence en los próximos 30 días
              </CardTitle>
              <CardDescription>
                Se obtiene de <code className="text-xs">current_compliance.covered_until</code>: en
                producción es el mismo índice que dispara el recálculo diario.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {stats.expiringSoon.slice(0, 6).map(({ view, daysLeft }) => (
                <button
                  key={view.assignment.id}
                  onClick={() => navigate({ name: 'employee', id: view.employee.id })}
                  className="flex w-full items-center justify-between gap-3 rounded-lg border p-2.5 text-left transition-colors hover:bg-muted/60"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{view.employee.full_name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {view.requirement.currentVersion.name}
                    </div>
                  </div>
                  <div className="shrink-0 text-xs text-amber-700 dark:text-amber-400">
                    {daysLeft === 0 ? 'hoy' : `en ${formatDuration(daysLeft)}`}
                  </div>
                </button>
              ))}
              {stats.expiringSoon.length === 0 && (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  Nada por vencer en 30 días.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Pregunta 3</CardTitle>
              <CardDescription>
                {stats.employeesWithGaps === 0
                  ? 'Ningún empleado registra períodos sin cumplimiento.'
                  : `${stats.employeesWithGaps} empleados tuvieron al menos un período sin cumplimiento, ${stats.totalGapDays} días en total.`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" className="w-full" onClick={() => navigate({ name: 'gaps' })}>
                Ver historial de incumplimientos
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
