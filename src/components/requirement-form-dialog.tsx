import { useState } from 'react'
import { PlusIcon } from 'lucide-react'

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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { createRequirement, createRequirementVersion } from '@/data/repo'
import type { RequirementView } from '@/data/selectors'
import { useStore } from '@/data/store'
import { today } from '@/lib/dates'
import type {
  EvidenceEffectivePolicy,
  PeriodAlignment,
  RecurrenceUnit,
} from '@/lib/types'

/** Presets: cubren los casos del enunciado sin obligar a pensar en unidad+intervalo. */
const PRESETS: Array<{
  key: string
  label: string
  unit: RecurrenceUnit
  interval: number
}> = [
  { key: 'once', label: 'Una sola vez', unit: 'once', interval: 1 },
  { key: 'monthly', label: 'Mensual', unit: 'month', interval: 1 },
  { key: 'quarterly', label: 'Trimestral', unit: 'month', interval: 3 },
  { key: 'semiannual', label: 'Semestral', unit: 'month', interval: 6 },
  { key: 'annual', label: 'Anual', unit: 'year', interval: 1 },
  { key: 'biannual', label: 'Cada 2 años', unit: 'year', interval: 2 },
]

const ALIGNMENT_ITEMS: Record<PeriodAlignment, string> = {
  assignment_start: 'Desde que aplica al empleado',
  fixed_anchor: 'Alineado a un calendario común',
}

export function RequirementFormDialog({
  open,
  onOpenChange,
  existing,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Si viene, el formulario crea una VERSIÓN nueva en vez de un requisito nuevo. */
  existing?: RequirementView
}) {
  const { mutate, recalculating } = useStore()
  const base = existing?.currentVersion

  const [code, setCode] = useState('')
  const [name, setName] = useState(base?.name ?? '')
  const [description, setDescription] = useState(base?.description ?? '')
  const [preset, setPreset] = useState(
    base ? (matchPreset(base.recurrence_unit, base.recurrence_interval) ?? 'annual') : 'annual'
  )
  const [alignment, setAlignment] = useState<PeriodAlignment>(
    base?.period_alignment ?? 'assignment_start'
  )
  const [anchorDate, setAnchorDate] = useState(base?.anchor_date ?? '2015-01-01')
  const [policy, setPolicy] = useState<EvidenceEffectivePolicy>(
    base?.evidence_effective_policy ?? 'document_validity'
  )
  const [effectiveFrom, setEffectiveFrom] = useState(today())

  const chosen = PRESETS.find((p) => p.key === preset) ?? PRESETS[4]
  const isOnce = chosen.unit === 'once'

  async function submit() {
    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      recurrence_unit: chosen.unit,
      recurrence_interval: chosen.interval,
      period_alignment: isOnce ? ('assignment_start' as PeriodAlignment) : alignment,
      anchor_date: !isOnce && alignment === 'fixed_anchor' ? anchorDate : null,
      evidence_effective_policy: policy,
      effective_from: effectiveFrom,
    }

    if (existing) {
      await mutate(
        () =>
          createRequirementVersion(
            existing.requirement.id,
            existing.currentVersion.version_number,
            payload
          ),
        { requirementIds: [existing.requirement.id] },
        `Versión v${existing.currentVersion.version_number + 1} creada`
      )
    } else {
      await mutate(
        async () => {
          await createRequirement({ code: code.trim().toUpperCase(), ...payload })
        },
        { requirementIds: [] },
        'Requisito creado'
      )
    }
    onOpenChange(false)
  }

  const canSubmit = name.trim().length > 0 && (existing !== undefined || code.trim().length > 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {existing ? `Nueva versión de ${existing.requirement.code}` : 'Nuevo requisito'}
          </DialogTitle>
          <DialogDescription>
            {existing
              ? 'La versión vigente se cierra el día anterior a la fecha indicada. Los períodos ya evaluados conservan su periodicidad original.'
              : 'La periodicidad define cada cuánto el fiscalizador exige evidencia vigente.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!existing && (
            <div className="space-y-1.5">
              <Label htmlFor="code">Código</Label>
              <Input
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="EXA-VIS"
                className="font-mono"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="name">Nombre</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Examen visual"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Descripción</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Qué documento se exige y por qué"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Periodicidad</Label>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <Button
                  key={p.key}
                  size="sm"
                  variant={preset === p.key ? 'default' : 'outline'}
                  onClick={() => setPreset(p.key)}
                >
                  {p.label}
                </Button>
              ))}
            </div>
          </div>

          {!isOnce && (
            <div className="space-y-1.5">
              <Label>Cómo se cuentan los períodos</Label>
              <Select
                items={ALIGNMENT_ITEMS}
                value={alignment}
                onValueChange={(v) => setAlignment(v as PeriodAlignment)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="assignment_start">Desde que aplica al empleado</SelectItem>
                  <SelectItem value="fixed_anchor">Alineado a un calendario común</SelectItem>
                </SelectContent>
              </Select>
              {alignment === 'fixed_anchor' && (
                <div className="pt-1.5">
                  <Label htmlFor="anchor" className="text-xs text-muted-foreground">
                    Fecha ancla del calendario
                  </Label>
                  <Input
                    id="anchor"
                    type="date"
                    value={anchorDate}
                    onChange={(e) => setAnchorDate(e.target.value)}
                    className="mt-1"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Todos los empleados comparten los mismos bordes de período, sin importar cuándo
                    ingresaron.
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label>La evidencia acredita desde</Label>
            <div className="space-y-1.5">
              {(Object.keys(POLICY_LABEL) as EvidenceEffectivePolicy[]).map((key) => (
                <label
                  key={key}
                  className="flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-sm has-checked:border-primary/40 has-checked:bg-muted/60"
                >
                  <input
                    type="radio"
                    name="policy"
                    className="mt-0.5 size-3.5 accent-primary"
                    checked={policy === key}
                    onChange={() => setPolicy(key)}
                  />
                  <span>
                    {POLICY_LABEL[key]}
                    <span className="block text-xs text-muted-foreground">{POLICY_HELP[key]}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="effective-from">
              {existing ? 'La nueva versión rige desde' : 'Vigente desde'}
            </Label>
            <Input
              id="effective-from"
              type="date"
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={!canSubmit || recalculating}>
            <PlusIcon data-icon="inline-start" />
            {existing ? 'Crear versión' : 'Crear requisito'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function matchPreset(unit: RecurrenceUnit, interval: number): string | null {
  return PRESETS.find((p) => p.unit === unit && p.interval === interval)?.key ?? null
}
