import { useMemo, useState } from 'react'
import { ArrowRightIcon, PlusIcon } from 'lucide-react'

import { useNavigation } from '@/app/router'
import { POLICY_LABEL, alignmentLabel, recurrenceLabel } from '@/components/labels'
import { RequirementFormDialog } from '@/components/requirement-form-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { requirementSummaries } from '@/data/selectors'
import { useStore } from '@/data/store'
import { cn } from '@/lib/utils'

export function RequirementsPage() {
  const { data, recalculating } = useStore()
  const { navigate } = useNavigation()
  const [formOpen, setFormOpen] = useState(false)

  const summaries = useMemo(
    () =>
      requirementSummaries(data).sort(
        (a, b) =>
          b.counts.non_compliant - a.counts.non_compliant ||
          a.requirement.requirement.code.localeCompare(b.requirement.requirement.code)
      ),
    [data]
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-xl font-medium">Requisitos</h1>
          <p className="text-sm text-muted-foreground">
            Cada requisito tiene una periodicidad y una política de acreditación. Cambiar cualquiera
            de las dos crea una <strong>versión nueva</strong> en lugar de reescribir la historia.
          </p>
        </div>
        <Button onClick={() => setFormOpen(true)}>
          <PlusIcon data-icon="inline-start" />
          Nuevo requisito
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Catálogo</CardTitle>
          <CardDescription>
            El estado por requisito sale de <code className="text-xs">current_compliance</code>{' '}
            agrupado por <code className="text-xs">requirement_id</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Requisito</TableHead>
                <TableHead>Periodicidad</TableHead>
                <TableHead>Acredita desde</TableHead>
                <TableHead className="text-right">Asignados</TableHead>
                <TableHead className="text-right">Cumple</TableHead>
                <TableHead className="text-right">No cumple</TableHead>
                <TableHead className="text-right">Con historial</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {summaries.map((summary) => {
                const { requirement, currentVersion, versions } = summary.requirement
                return (
                  <TableRow
                    key={requirement.id}
                    className={cn('cursor-pointer', !requirement.is_active && 'opacity-55')}
                    onClick={() => navigate({ name: 'requirement', id: requirement.id })}
                  >
                    <TableCell>
                      <div className="font-medium">{currentVersion.name}</div>
                      <div className="text-xs text-muted-foreground">
                        <span className="font-mono">{requirement.code}</span>
                        {versions.length > 1 && ` · v${currentVersion.version_number} de ${versions.length}`}
                        {!requirement.is_active && ' · inactivo'}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {recurrenceLabel(currentVersion)}
                      <div className="text-xs text-muted-foreground">
                        {alignmentLabel(currentVersion)}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {POLICY_LABEL[currentVersion.evidence_effective_policy]}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{summary.applicable}</TableCell>
                    <TableCell className="text-right tabular-nums text-emerald-700 dark:text-emerald-400">
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
                      {summary.employeesWithGaps || '—'}
                    </TableCell>
                    <TableCell className="w-8 text-muted-foreground">
                      <ArrowRightIcon className="size-3.5" />
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Para desactivar un requisito sin perder su historia, entra al requisito y usa{' '}
        <em>Desactivar</em>: deja de aparecer para asignaciones nuevas pero los períodos ya
        evaluados se conservan.{' '}
        {recalculating && <span>Recalculando…</span>}
      </p>

      <RequirementFormDialog open={formOpen} onOpenChange={setFormOpen} />
    </div>
  )
}
