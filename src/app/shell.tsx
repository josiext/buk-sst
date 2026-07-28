import { useState } from 'react'
import {
  AlertTriangleIcon,
  BellIcon,
  CalendarDaysIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  FileStackIcon,
  HardHatIcon,
  HelpCircleIcon,
  LayoutDashboardIcon,
  MenuIcon,
  MegaphoneIcon,
  RefreshCwIcon,
  SearchIcon,
  SettingsIcon,
  ShieldCheckIcon,
  UserRoundIcon,
  UsersIcon,
  XIcon,
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
      label: 'Panel de Control',
      icon: LayoutDashboardIcon,
      match: ['dashboard', 'employees', 'employee'],
    },
    {
      route: { name: 'requirements' },
      label: 'Requisitos SST',
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
  const [menuOpen, setMenuOpen] = useState(false)

  const go = (next: Route) => {
    navigate(next)
    setMenuOpen(false)
  }

  return (
    <div className="min-h-dvh bg-background">
      <header className="buk-topbar">
        <button
          className="buk-icon-button md:hidden"
          onClick={() => setMenuOpen((open) => !open)}
          aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
        >
          {menuOpen ? <XIcon /> : <MenuIcon />}
        </button>
        <button className="buk-icon-button hidden md:flex" aria-label="Menú principal">
          <MenuIcon />
        </button>
        <button className="buk-icon-button hidden sm:flex" aria-label="Calendario">
          <CalendarDaysIcon />
        </button>

        <label className="buk-search">
          <span className="sr-only">Buscar colaboradores</span>
          <input placeholder="Buscar Colaboradores (Ctrl+B)" />
          <SearchIcon />
        </label>

        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <button className="buk-icon-button hidden lg:flex" aria-label="Colaboradores">
            <UsersIcon />
          </button>
          <button className="buk-icon-button hidden sm:flex" aria-label="Configuración">
            <SettingsIcon />
          </button>
          <button className="buk-icon-button" aria-label="Notificaciones">
            <BellIcon />
          </button>
          <button className="buk-icon-button hidden sm:flex" aria-label="Novedades">
            <MegaphoneIcon />
          </button>
          <button className="buk-icon-button hidden sm:flex" aria-label="Ayuda">
            <HelpCircleIcon />
          </button>
          <div className="buk-user">
            <span><UserRoundIcon /></span>
            <strong>Jury</strong>
          </div>
        </div>
      </header>

      <aside className={cn('buk-sidebar', menuOpen && 'is-open')}>
        <button className="buk-logo" onClick={() => go({ name: 'dashboard' })} aria-label="Buk inicio">
          <span>·</span>buk<span>·</span>
        </button>

        <div className="buk-company">
          <span>Buk</span>
          <ChevronDownIcon />
        </div>

        <nav className="buk-nav" aria-label="Navegación principal">
          <div className="buk-nav-section">
            <button onClick={() => go({ name: 'dashboard' })}>
              <LayoutDashboardIcon />
              Panel de Control
            </button>
            <button>
              <UserRoundIcon />
              Jury
            </button>
            <button>
              <UsersIcon />
              Directorio
            </button>
          </div>

          <div className="buk-module">
            <button className="buk-module-title">
              Administrativo <ChevronDownIcon />
            </button>
          </div>
          <div className="buk-module buk-module-open">
            <button className="buk-module-title">
              Talento <ChevronDownIcon />
            </button>
            {NAV.map((item) => {
              const active = item.match.includes(route.name)
              return (
                <button
                  key={item.label}
                  onClick={() => go(item.route)}
                  className={cn('buk-nav-link', active && 'is-active')}
                >
                  <item.icon />
                  <span>{item.label}</span>
                  {active && <ChevronRightIcon className="ml-auto" />}
                </button>
              )
            })}
          </div>
          <div className="buk-module">
            <button className="buk-module-title">
              Cultura <ChevronDownIcon />
            </button>
          </div>
          <div className="buk-module">
            <button className="buk-module-title">
              Información <ChevronDownIcon />
            </button>
          </div>
        </nav>

        <div className="buk-sidebar-note">
          <HardHatIcon />
          <div>
            <strong>Seguridad y Salud</strong>
            <span>Portal de cumplimiento</span>
          </div>
        </div>
      </aside>

      {menuOpen && (
        <button
          className="fixed inset-0 z-40 bg-slate-950/35 md:hidden"
          onClick={() => setMenuOpen(false)}
          aria-label="Cerrar menú"
        />
      )}

      <div className="buk-workspace">
        <div className="buk-pagebar">
          <div>
            <span className="buk-breadcrumb">Buk / Talento / Seguridad y Salud</span>
            <div className="text-xs text-muted-foreground">
              Evaluado al {formatDate(asOf)}
              {lastRecalculation && ` · ${lastRecalculation.assignments} asignaciones`}
            </div>
          </div>
          <Button
            size="sm"
            disabled={recalculating}
            onClick={() => runRecalculation({}, 'Cumplimiento recalculado (toda la empresa)')}
          >
            <RefreshCwIcon
              data-icon="inline-start"
              className={cn(recalculating && 'animate-spin')}
            />
            {recalculating ? 'Recalculando…' : 'Recalcular todo'}
          </Button>
        </div>

        <main className="buk-content">{children}</main>

        <footer className="buk-footer">
          Portal Buk · Módulo de Seguridad y Salud en el Trabajo
        </footer>
      </div>
    </div>
  )
}
