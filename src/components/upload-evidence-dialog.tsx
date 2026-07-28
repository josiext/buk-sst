import { useState } from 'react'
import { FileTextIcon, UploadIcon } from 'lucide-react'

import { POLICY_HELP, POLICY_LABEL } from '@/components/labels'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { uploadEvidence } from '@/data/repo'
import type { AssignmentView } from '@/data/selectors'
import { useStore } from '@/data/store'
import { addUnits, today } from '@/lib/dates'

/**
 * Carga de evidencia SIMULADA. No hay subida real de archivo: se pide un nombre
 * y se registra la metadata. Lo que sí es real es todo lo demás — vigencia del
 * documento, versión del requisito bajo la que se carga, y el recálculo
 * inmediato del cumplimiento.
 */
export function UploadEvidenceDialog({
  view,
  open,
  onOpenChange,
}: {
  view: AssignmentView
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { mutate, recalculating } = useStore()
  const version = view.requirement.currentVersion

  const [filename, setFilename] = useState('documento-escaneado.pdf')
  const [validFrom, setValidFrom] = useState(today())
  const [validUntil, setValidUntil] = useState(() => suggestValidUntil(today()))
  const [openEnded, setOpenEnded] = useState(version.recurrence_unit === 'once')
  const [autoApprove, setAutoApprove] = useState(true)

  async function submit() {
    await mutate(
      async () => {
        await uploadEvidence({
          assignment_id: view.assignment.id,
          requirement_version_id: version.id,
          valid_from: validFrom,
          valid_until: openEnded ? null : validUntil,
          filename: filename.trim() || 'evidencia.pdf',
          autoApprove,
        })
      },
      { assignmentIds: [view.assignment.id] },
      autoApprove ? 'Evidencia cargada y aprobada' : 'Evidencia cargada, queda en revisión'
    )
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cargar evidencia</DialogTitle>
          <DialogDescription>
            {view.employee.full_name} · {version.name}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border border-dashed bg-muted/40 p-3">
            <div className="flex items-center gap-2 text-sm">
              <FileTextIcon className="size-4 text-muted-foreground" />
              <Input
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                className="h-7 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Subida simulada: se registra la metadata del archivo, no el contenido.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="valid-from">Vigente desde</Label>
              <Input
                id="valid-from"
                type="date"
                value={validFrom}
                onChange={(e) => {
                  setValidFrom(e.target.value)
                  setValidUntil(suggestValidUntil(e.target.value))
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="valid-until">Vigente hasta</Label>
              <Input
                id="valid-until"
                type="date"
                value={openEnded ? '' : validUntil}
                disabled={openEnded}
                onChange={(e) => setValidUntil(e.target.value)}
              />
            </div>
          </div>

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={openEnded}
              onChange={(e) => setOpenEnded(e.target.checked)}
              className="mt-0.5 size-3.5 accent-primary"
            />
            <span>
              Sin fecha de término
              <span className="block text-xs text-muted-foreground">
                Para documentos que no caducan, como un certificado inicial.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={autoApprove}
              onChange={(e) => setAutoApprove(e.target.checked)}
              className="mt-0.5 size-3.5 accent-primary"
            />
            <span>
              Aprobar de inmediato
              <span className="block text-xs text-muted-foreground">
                Si se deja sin marcar, la evidencia queda <em>en revisión</em> y todavía no
                acredita cumplimiento.
              </span>
            </span>
          </label>

          <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">
              {POLICY_LABEL[version.evidence_effective_policy]}
            </span>{' '}
            — {POLICY_HELP[version.evidence_effective_policy]}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={recalculating || !validFrom}>
            <UploadIcon data-icon="inline-start" />
            Cargar evidencia
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function suggestValidUntil(from: string): string {
  if (!from) return ''
  const d = addUnits(from, 'year', 1)
  const [y, m, day] = d.split('-').map(Number)
  const prev = new Date(Date.UTC(y, m - 1, day - 1))
  return prev.toISOString().slice(0, 10)
}
