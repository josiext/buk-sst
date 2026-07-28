import { useMemo, useState } from 'react'
import { CheckIcon, SearchIcon, XIcon } from 'lucide-react'

import { useNavigation } from '@/app/router'
import { EvidenceBadge, POLICY_LABEL } from '@/components/labels'
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
import { reviewEvidence } from '@/data/repo'
import { assignmentViews, filesByEvidence, versionById } from '@/data/selectors'
import { useStore } from '@/data/store'
import { formatDate, timestampToISO } from '@/lib/dates'
import type { EvidenceStatus } from '@/lib/types'

const STATUS_ORDER: Array<EvidenceStatus | 'all'> = [
  'all',
  'pending',
  'approved',
  'rejected',
  'superseded',
]

const STATUS_LABEL: Record<EvidenceStatus | 'all', string> = {
  all: 'Todas',
  pending: 'En revisión',
  approved: 'Aprobadas',
  rejected: 'Rechazadas',
  superseded: 'Reemplazadas',
}

export function EvidencesPage() {
  const { data, mutate, recalculating } = useStore()
  const { navigate } = useNavigation()
  const [status, setStatus] = useState<EvidenceStatus | 'all'>('all')
  const [query, setQuery] = useState('')

  const views = useMemo(() => assignmentViews(data), [data])
  const viewByAssignment = useMemo(
    () => new Map(views.map((v) => [v.assignment.id, v])),
    [views]
  )
  const files = useMemo(() => filesByEvidence(data), [data])
  const versions = useMemo(() => versionById(data), [data])

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return data.evidences
      .map((evidence) => ({ evidence, view: viewByAssignment.get(evidence.assignment_id) }))
      .filter((row) => row.view !== undefined)
      .filter((row) => status === 'all' || row.evidence.status === status)
      .filter((row) => {
        if (!needle) return true
        const v = row.view!
        return (
          v.employee.full_name.toLowerCase().includes(needle) ||
          v.requirement.currentVersion.name.toLowerCase().includes(needle) ||
          v.requirement.requirement.code.toLowerCase().includes(needle)
        )
      })
  }, [data.evidences, viewByAssignment, status, query])

  const counts = useMemo(() => {
    const acc: Record<string, number> = { all: data.evidences.length }
    for (const evidence of data.evidences) {
      acc[evidence.status] = (acc[evidence.status] ?? 0) + 1
    }
    return acc
  }, [data.evidences])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-xl font-medium">Evidencias</h1>
        <p className="text-sm text-muted-foreground">
          Cada evidencia tiene su propia vigencia, que no tiene por qué coincidir con la
          periodicidad del requisito. La columna <em>acredita desde</em> muestra qué fecha usa el
          motor según la política del requisito.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Bandeja</CardTitle>
          <CardDescription>
            Aprobar o rechazar una evidencia recalcula el cumplimiento de su asignación al instante.
          </CardDescription>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-56">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por empleado o requisito"
                className="pl-8"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {STATUS_ORDER.map((key) => (
                <Button
                  key={key}
                  size="sm"
                  variant={status === key ? 'default' : 'outline'}
                  onClick={() => setStatus(key)}
                >
                  {STATUS_LABEL[key]}
                  <span className="ml-1 text-xs opacity-70 tabular-nums">{counts[key] ?? 0}</span>
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empleado / requisito</TableHead>
                <TableHead>Archivo</TableHead>
                <TableHead>Vigencia del documento</TableHead>
                <TableHead>Acredita desde</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ evidence, view }) => {
                const version = versions.get(evidence.requirement_version_id)
                const file = files.get(evidence.id)?.[0]
                return (
                  <TableRow key={evidence.id}>
                    <TableCell>
                      <button
                        className="text-left font-medium hover:underline"
                        onClick={() => navigate({ name: 'employee', id: view!.employee.id })}
                      >
                        {view!.employee.full_name}
                      </button>
                      <div className="text-xs text-muted-foreground">
                        {view!.requirement.currentVersion.name}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">
                      {file?.original_filename ?? '—'}
                      <div className="text-muted-foreground">
                        cargada {formatDate(timestampToISO(evidence.submitted_at))}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs tabular-nums">
                      {formatDate(evidence.valid_from)} →{' '}
                      {evidence.valid_until ? formatDate(evidence.valid_until) : 'sin término'}
                    </TableCell>
                    <TableCell className="text-xs">
                      {version ? accreditationDate(evidence, version.evidence_effective_policy) : '—'}
                      <div className="text-muted-foreground">
                        {version ? POLICY_LABEL[version.evidence_effective_policy] : ''}
                      </div>
                    </TableCell>
                    <TableCell>
                      <EvidenceBadge status={evidence.status} />
                      {evidence.rejection_reason && (
                        <div className="mt-0.5 max-w-48 text-xs text-red-700 dark:text-red-400">
                          {evidence.rejection_reason}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {evidence.status === 'pending' && (
                        <div className="flex gap-1">
                          <Button
                            size="icon-xs"
                            variant="outline"
                            title="Aprobar"
                            disabled={recalculating}
                            onClick={() =>
                              mutate(
                                () => reviewEvidence(evidence.id, 'approved'),
                                { assignmentIds: [evidence.assignment_id] },
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
                                    'Rechazada desde la bandeja'
                                  ),
                                { assignmentIds: [evidence.assignment_id] },
                                'Evidencia rechazada'
                              )
                            }
                          >
                            <XIcon />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    Sin evidencias que coincidan.
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

function accreditationDate(
  evidence: { valid_from: string; submitted_at: string; approved_at: string | null },
  policy: 'document_validity' | 'submitted_at' | 'approved_at'
): string {
  if (policy === 'submitted_at') return formatDate(timestampToISO(evidence.submitted_at))
  if (policy === 'approved_at') {
    return evidence.approved_at ? formatDate(timestampToISO(evidence.approved_at)) : 'sin aprobar'
  }
  return formatDate(evidence.valid_from)
}
