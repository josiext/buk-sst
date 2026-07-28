import { useMemo, useState } from 'react'
import { PlusIcon } from 'lucide-react'

import { recurrenceLabel } from '@/components/labels'
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
import { createAssignment, createAssignmentsBulk } from '@/data/repo'
import { requirementViews } from '@/data/selectors'
import { useStore } from '@/data/store'
import { today } from '@/lib/dates'

/**
 * Asignar un requisito a un empleado (o a varios de golpe). La asignación es la
 * pieza que permite que "no todos los requisitos apliquen a todos": nada se
 * exige sin una fila acá, y `applies_from` fija desde cuándo se empieza a
 * evaluar — no se inventan períodos anteriores a la asignación.
 */
export function AssignAssignmentDialog({
  open,
  onOpenChange,
  lockedEmployeeId,
  lockedRequirementId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  lockedEmployeeId?: number
  lockedRequirementId?: number
}) {
  const { data, mutate, recalculating } = useStore()
  const requirements = useMemo(() => requirementViews(data), [data])

  const [employeeId, setEmployeeId] = useState<string>(lockedEmployeeId?.toString() ?? '')
  const [requirementId, setRequirementId] = useState<string>(lockedRequirementId?.toString() ?? '')
  const [appliesFrom, setAppliesFrom] = useState(today())
  const [selectedEmployees, setSelectedEmployees] = useState<number[]>([])

  const bulkMode = lockedRequirementId !== undefined

  const existing = useMemo(() => {
    const pairs = new Set(
      data.assignments
        .filter((a) => a.status === 'active')
        .map((a) => `${a.employee_id}|${a.requirement_id}`)
    )
    return pairs
  }, [data.assignments])

  const assignableEmployees = useMemo(() => {
    if (!bulkMode) return data.employees
    return data.employees.filter(
      (e) => e.status === 'active' && !existing.has(`${e.id}|${lockedRequirementId}`)
    )
  }, [bulkMode, data.employees, existing, lockedRequirementId])

  const employeeItems = useMemo(
    () =>
      Object.fromEntries(
        data.employees.map((e) => [
          e.id.toString(),
          `${e.full_name}${e.job_title ? ` · ${e.job_title}` : ''}`,
        ])
      ),
    [data.employees]
  )

  const requirementItems = useMemo(
    () =>
      Object.fromEntries(
        requirements
          .filter((r) => r.requirement.is_active)
          .map((r) => [
            r.requirement.id.toString(),
            `${r.currentVersion.name} · ${recurrenceLabel(r.currentVersion)}`,
          ])
      ),
    [requirements]
  )

  const alreadyAssigned =
    !bulkMode &&
    employeeId !== '' &&
    requirementId !== '' &&
    existing.has(`${employeeId}|${requirementId}`)

  async function submit() {
    if (bulkMode) {
      await mutate(
        () =>
          createAssignmentsBulk(
            lockedRequirementId,
            selectedEmployees,
            appliesFrom,
            'asignación masiva'
          ),
        { requirementIds: [lockedRequirementId] },
        `${selectedEmployees.length} asignaciones creadas`
      )
    } else {
      await mutate(
        () =>
          createAssignment({
            employee_id: Number(employeeId),
            requirement_id: Number(requirementId),
            applies_from: appliesFrom,
            applies_until: null,
            assignment_source: 'manual',
          }),
        { employeeIds: [Number(employeeId)] },
        'Requisito asignado'
      )
    }
    setSelectedEmployees([])
    onOpenChange(false)
  }

  const canSubmit = bulkMode
    ? selectedEmployees.length > 0
    : employeeId !== '' && requirementId !== '' && !alreadyAssigned

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{bulkMode ? 'Asignar a empleados' : 'Asignar requisito'}</DialogTitle>
          <DialogDescription>
            El requisito se empieza a exigir desde la fecha indicada. No se evalúan períodos
            anteriores a esa fecha.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!bulkMode && (
            <>
              <div className="space-y-1.5">
                <Label>Empleado</Label>
                <Select
                  items={employeeItems}
                  value={employeeId}
                  onValueChange={(v) => setEmployeeId(String(v ?? ''))}
                  disabled={lockedEmployeeId !== undefined}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Seleccionar empleado" />
                  </SelectTrigger>
                  <SelectContent>
                    {data.employees.map((e) => (
                      <SelectItem key={e.id} value={e.id.toString()}>
                        {e.full_name}
                        {e.job_title ? ` · ${e.job_title}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Requisito</Label>
                <Select
                  items={requirementItems}
                  value={requirementId}
                  onValueChange={(v) => setRequirementId(String(v ?? ''))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Seleccionar requisito" />
                  </SelectTrigger>
                  <SelectContent>
                    {requirements
                      .filter((r) => r.requirement.is_active)
                      .map((r) => (
                        <SelectItem key={r.requirement.id} value={r.requirement.id.toString()}>
                          {r.currentVersion.name} · {recurrenceLabel(r.currentVersion)}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {alreadyAssigned && (
                  <p className="text-xs text-red-600 dark:text-red-400">
                    Ese requisito ya está asignado y activo para este empleado.
                  </p>
                )}
              </div>
            </>
          )}

          {bulkMode && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Empleados sin este requisito</Label>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() =>
                    setSelectedEmployees(
                      selectedEmployees.length === assignableEmployees.length
                        ? []
                        : assignableEmployees.map((e) => e.id)
                    )
                  }
                >
                  {selectedEmployees.length === assignableEmployees.length
                    ? 'Ninguno'
                    : 'Todos'}
                </Button>
              </div>
              <div className="max-h-56 space-y-0.5 overflow-y-auto rounded-lg border p-1.5">
                {assignableEmployees.map((employee) => (
                  <label
                    key={employee.id}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                  >
                    <input
                      type="checkbox"
                      className="size-3.5 accent-primary"
                      checked={selectedEmployees.includes(employee.id)}
                      onChange={(e) =>
                        setSelectedEmployees((prev) =>
                          e.target.checked
                            ? [...prev, employee.id]
                            : prev.filter((id) => id !== employee.id)
                        )
                      }
                    />
                    <span className="flex-1">{employee.full_name}</span>
                    <span className="text-xs text-muted-foreground">{employee.job_title}</span>
                  </label>
                ))}
                {assignableEmployees.length === 0 && (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    Todos los empleados activos ya tienen este requisito.
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="applies-from">Aplica desde</Label>
            <Input
              id="applies-from"
              type="date"
              value={appliesFrom}
              onChange={(e) => setAppliesFrom(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={!canSubmit || recalculating}>
            <PlusIcon data-icon="inline-start" />
            {bulkMode ? `Asignar a ${selectedEmployees.length}` : 'Asignar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
