import {
  AlertTriangleIcon,
  FileStackIcon,
  HardHatIcon,
  LayoutDashboardIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
} from 'lucide-react'

import { useNavigation, type Route } from '@/app/router'
import { Button } from '@/components/ui/button'
import { useStore } from '@/data/store'
import { formatDate } from '@/lib/dates'
import { cn } from '@/lib/utils'

const NAV: Array<{ route: Route; label: string; icon: typeof LayoutDashboardIcon; match: string[] }> =
  [
    {
      route: { name: 'dashboard' },
      label: 'Tablero',
      icon: LayoutDashboardIcon,
      match: ['dashboard', 'employees', 'employee'],
    },
    {
      route: { name: 'requirements' },
      label: 'Requisitos',
      icon: ShieldCheckIcon,
      match: ['requirements', 'requirement'],
    },
    { route: { name: 'evidences' }, label: 'Evidencias', icon: FileStackIcon, match: ['evidences'] },
    {
      route: { name: 'gaps' },
      label: 'Incumplimientos',
      icon: AlertTriangleIcon,
      match: ['gaps'],
    },
  ]

export function Shell({ children }: { children: React.ReactNode }) {
  const { route, navigate } = useNavigation()
  const { asOf, recalculating, runRecalculation, lastRecalculation } = useStore()

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
          <button
            className="flex items-center gap-2"
            onClick={() => navigate({ name: 'dashboard' })}
          >
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <HardHatIcon className="size-4" />
            </span>
            <span className="font-heading text-sm font-medium">
              SST · Cumplimiento
              <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
                prototipo
              </span>
            </span>
          </button>

          <nav className="flex items-center gap-0.5">
            {NAV.map((item) => {
              const active = item.match.includes(route.name)
              return (
                <button
                  key={item.label}
                  onClick={() => navigate(item.route)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors',
                    active
                      ? 'bg-muted font-medium text-foreground'
                      : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                  )}
                >
                  <item.icon className="size-3.5" />
                  {item.label}
                </button>
              )
            })}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right text-xs text-muted-foreground sm:block">
              <div>Evaluado al {formatDate(asOf)}</div>
              {lastRecalculation && (
                <div>
                  {lastRecalculation.assignments} asignaciones · {lastRecalculation.elapsedMs} ms
                </div>
              )}
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={recalculating}
              onClick={() => runRecalculation({}, 'Cumplimiento recalculado (toda la empresa)')}
              title="Simula el job diario que en producción corre en background"
            >
              <RefreshCwIcon
                data-icon="inline-start"
                className={cn(recalculating && 'animate-spin')}
              />
              {recalculating ? 'Recalculando…' : 'Recalcular todo'}
            </Button>
            <span className="hidden rounded-lg bg-muted px-2 py-1 text-xs text-muted-foreground md:inline">
              super admin
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>

      <footer className="mx-auto max-w-7xl px-4 pb-8 text-xs text-muted-foreground">
        Prototipo del caso técnico SST. La carga de archivos es simulada y el recálculo se dispara a
        mano en lugar de por un job en background.
      </footer>
    </div>
  )
}
