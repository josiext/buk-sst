import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { toast } from 'sonner'

import { today } from '@/lib/dates'
import { isConfigured } from '@/lib/supabase'
import type {
  Assignment,
  ComplianceGap,
  CurrentCompliance,
  Employee,
  Evidence,
  EvidenceFile,
  PeriodEvidenceCoverage,
  Requirement,
  RequirementPeriod,
  RequirementVersion,
} from '@/lib/types'
import * as repo from './repo'
import { recalculate, type RecalculationResult, type RecalculationScope } from './recalculate'

/**
 * El prototipo carga el dataset completo una vez y deriva las vistas en
 * memoria. Con 5.000 empleados × 300 requisitos eso no se sostiene: la versión
 * real pagina y filtra en el servidor sobre `current_compliance`, que ya está
 * indexada por (employee_id, status) y (requirement_id, status) justamente para
 * que el tablero sea una query y no un recorrido.
 */
export interface Dataset {
  employees: Employee[]
  requirements: Requirement[]
  versions: RequirementVersion[]
  assignments: Assignment[]
  evidences: Evidence[]
  evidenceFiles: EvidenceFile[]
  compliance: CurrentCompliance[]
  periods: RequirementPeriod[]
  coverages: PeriodEvidenceCoverage[]
  gaps: ComplianceGap[]
}

const EMPTY: Dataset = {
  employees: [],
  requirements: [],
  versions: [],
  assignments: [],
  evidences: [],
  evidenceFiles: [],
  compliance: [],
  periods: [],
  coverages: [],
  gaps: [],
}

interface StoreValue {
  data: Dataset
  loading: boolean
  error: string | null
  asOf: string
  recalculating: boolean
  lastRecalculation: RecalculationResult | null
  reload: () => Promise<void>
  runRecalculation: (scope?: RecalculationScope, label?: string) => Promise<void>
  /** Ejecuta una escritura y refresca el cumplimiento afectado. */
  mutate: (
    action: () => Promise<void>,
    scope: RecalculationScope,
    successMessage: string
  ) => Promise<void>
}

const StoreContext = createContext<StoreValue | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Dataset>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [recalculating, setRecalculating] = useState(false)
  const [lastRecalculation, setLastRecalculation] = useState<RecalculationResult | null>(null)
  const asOf = useMemo(() => today(), [])

  const load = useCallback(async (): Promise<Dataset> => {
    const [
      employees,
      requirements,
      versions,
      assignments,
      evidences,
      evidenceFiles,
      compliance,
      periods,
      coverages,
      gaps,
    ] = await Promise.all([
      repo.fetchEmployees(),
      repo.fetchRequirements(),
      repo.fetchRequirementVersions(),
      repo.fetchAssignments(),
      repo.fetchEvidences(),
      repo.fetchEvidenceFiles(),
      repo.fetchCurrentCompliance(),
      repo.fetchPeriods(),
      repo.fetchCoverages(),
      repo.fetchGaps(),
    ])
    const next: Dataset = {
      employees,
      requirements,
      versions,
      assignments,
      evidences,
      evidenceFiles,
      compliance,
      periods,
      coverages,
      gaps,
    }
    setData(next)
    return next
  }, [])

  const reload = useCallback(async () => {
    setError(null)
    try {
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [load])

  const runRecalculation = useCallback(
    async (scope: RecalculationScope = {}, label?: string) => {
      setRecalculating(true)
      try {
        const result = await recalculate(scope, today())
        setLastRecalculation(result)
        await load()
        toast.success(label ?? 'Cumplimiento recalculado', {
          description: `${result.assignments} asignaciones · ${result.periods} períodos · ${result.gaps} gaps · ${result.elapsedMs} ms`,
        })
      } catch (e) {
        toast.error('Falló el recálculo', {
          description: e instanceof Error ? e.message : String(e),
        })
      } finally {
        setRecalculating(false)
      }
    },
    [load]
  )

  const mutate = useCallback(
    async (action: () => Promise<void>, scope: RecalculationScope, successMessage: string) => {
      setRecalculating(true)
      try {
        await action()
        const result = await recalculate(scope, today())
        setLastRecalculation(result)
        await load()
        toast.success(successMessage, {
          description: `Cumplimiento recalculado para ${result.assignments} asignación(es) en ${result.elapsedMs} ms`,
        })
      } catch (e) {
        toast.error('No se pudo completar la operación', {
          description: e instanceof Error ? e.message : String(e),
        })
        await reload()
      } finally {
        setRecalculating(false)
      }
    },
    [load, reload]
  )

  useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      if (!isConfigured) {
        setError(
          'Falta configuración de Supabase. Copia .env.example a .env y define VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.'
        )
        setLoading(false)
        return
      }
      try {
        const loaded = await load()
        if (cancelled) return
        // Si las tablas derivadas están vacías (seed recién cargado), se corre
        // el recálculo una vez para que el tablero tenga algo que mostrar.
        if (loaded.compliance.length === 0 && loaded.assignments.length > 0) {
          const result = await recalculate({}, today())
          if (cancelled) return
          setLastRecalculation(result)
          await load()
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void bootstrap()
    return () => {
      cancelled = true
    }
  }, [load])

  const value = useMemo<StoreValue>(
    () => ({
      data,
      loading,
      error,
      asOf,
      recalculating,
      lastRecalculation,
      reload,
      runRecalculation,
      mutate,
    }),
    [data, loading, error, asOf, recalculating, lastRecalculation, reload, runRecalculation, mutate]
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore debe usarse dentro de StoreProvider')
  return ctx
}
