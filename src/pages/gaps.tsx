import { useMemo, useState } from 'react'
import { SearchIcon } from 'lucide-react'

import { useNavigation } from '@/app/router'
import { StatCard } from '@/components/stat-card'
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
import { assignmentViews, groupBy } from '@/data/selectors'
import { useStore } from '@/data/store'
import { formatDate, inclusiveDays } from '@/lib/dates'

/**
 * Pregunta 3 del enunciado, en su forma más directa: el listado de tramos en que
 * un empleado NO cumplía un requisito. Es una lectura de `compliance_gaps`, que
 * está indexada por (employee_id, gap_start, gap_end) y por requirement — no se
 * recalcula nada para responder.
 */
export function GapsPage() {
  const { data } = useStore()
  const { navigate } = useNavigation()
  const [query, setQuery] = useState('')

  const views = useMemo(() => assignmentViews(data), [data])
  const viewByAssignment = useMemo(() => new Map(views.map((v) => [v.assignment.id, v])), [views])

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return data.gaps
      .map((gap) => ({ gap, view: viewByAssignment.get(gap.assignment_id) }))
      .filter((row) => row.view !== undefined)
      .filter((row) => {
        if (!needle) return true
        const v = row.view!
        return (
          v.employee.full_name.toLowerCase().includes(needle) ||
          v.requirement.currentVersion.name.toLowerCase().includes(needle) ||
          v.requirement.requirement.code.toLowerCase().includes(needle)
        )
      })
      .sort((a, b) => (a.gap.gap_start < b.gap.gap_start ? 1 : -1))
  }, [data.gaps, viewByAssignment, query])

  const totalDays = rows.reduce(
    (sum, { gap }) => sum + (gap.gap_end ? inclusiveDays(gap.gap_start, gap.gap_end) : 0),
    0
  )
  const affectedEmployees = groupBy(rows, (r) => r.view!.employee.id).size
  const affectedRequirements = groupBy(rows, (r) => r.view!.requirement.requirement.id).size

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-xl font-medium">Historial de incumplimientos</h1>
        <p className="text-sm text-muted-foreground">
          Períodos en que un empleado no tenía evidencia vigente, incluso si hoy sí la tiene. Es lo
          primero que revisa una fiscalización cuando ya ocurrió un accidente.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Tramos sin cumplimiento" value={rows.length} tone="warning" />
        <StatCard label="Días acumulados" value={totalDays} tone="warning" />
        <StatCard label="Empleados afectados" value={affectedEmployees} />
        <StatCard label="Requisitos involucrados" value={affectedRequirements} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tramos detectados</CardTitle>
          <CardDescription>
            Un tramo se cierra en la fecha de evaluación: si sigue abierto, el incumplimiento es
            actual.
          </CardDescription>
          <div className="relative mt-2">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por empleado o requisito"
              className="pl-8"
            />
          </div>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empleado</TableHead>
                <TableHead>Requisito</TableHead>
                <TableHead>Desde</TableHead>
                <TableHead>Hasta</TableHead>
                <TableHead className="text-right">Días</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ gap, view }) => (
                <TableRow key={gap.id}>
                  <TableCell>
                    <button
                      className="text-left font-medium hover:underline"
                      onClick={() => navigate({ name: 'employee', id: view!.employee.id })}
                    >
                      {view!.employee.full_name}
                    </button>
                    <div className="text-xs text-muted-foreground">{view!.employee.job_title}</div>
                  </TableCell>
                  <TableCell>
                    <button
                      className="text-left hover:underline"
                      onClick={() =>
                        navigate({ name: 'requirement', id: view!.requirement.requirement.id })
                      }
                    >
                      {view!.requirement.currentVersion.name}
                    </button>
                    <div className="font-mono text-xs text-muted-foreground">
                      {view!.requirement.requirement.code}
                    </div>
                  </TableCell>
                  <TableCell className="tabular-nums">{formatDate(gap.gap_start)}</TableCell>
                  <TableCell className="tabular-nums">{formatDate(gap.gap_end)}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums text-amber-700 dark:text-amber-400">
                    {gap.gap_end ? inclusiveDays(gap.gap_start, gap.gap_end) : '—'}
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    Sin tramos de incumplimiento.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
