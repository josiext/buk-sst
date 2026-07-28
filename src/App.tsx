import { NavigationProvider, useNavigation } from '@/app/router'
import { Shell } from '@/app/shell'
import { Skeleton } from '@/components/ui/skeleton'
import { Toaster } from '@/components/ui/sonner'
import { StoreProvider, useStore } from '@/data/store'
import { DashboardPage } from '@/pages/dashboard'
import { EmployeeDetailPage } from '@/pages/employee-detail'
import { EvidencesPage } from '@/pages/evidences'
import { GapsPage } from '@/pages/gaps'
import { RequirementDetailPage } from '@/pages/requirement-detail'
import { RequirementsPage } from '@/pages/requirements'

function Routes() {
  const { route } = useNavigation()
  const { loading, error } = useStore()

  if (error) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6">
        <h2 className="font-heading font-medium">No se pudo cargar la información</h2>
        <p className="mt-1 text-sm text-muted-foreground">{error}</p>
        <p className="mt-3 text-xs text-muted-foreground">
          Revisa que hayas ejecutado <code>supabase/migrations/0001_sst_schema.sql</code> y{' '}
          <code>supabase/seed.sql</code> en el SQL Editor del proyecto.
        </p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    )
  }

  switch (route.name) {
    case 'employee':
      return <EmployeeDetailPage employeeId={route.id} />
    case 'requirements':
      return <RequirementsPage />
    case 'requirement':
      return <RequirementDetailPage requirementId={route.id} />
    case 'evidences':
      return <EvidencesPage />
    case 'gaps':
      return <GapsPage />
    default:
      return <DashboardPage />
  }
}

export default function App() {
  return (
    <StoreProvider>
      <NavigationProvider>
        <Shell>
          <Routes />
        </Shell>
        <Toaster position="bottom-right" />
      </NavigationProvider>
    </StoreProvider>
  )
}
