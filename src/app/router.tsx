import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

export type Route =
  | { name: 'dashboard' }
  | { name: 'employees' }
  | { name: 'employee'; id: number }
  | { name: 'requirements' }
  | { name: 'requirement'; id: number }
  | { name: 'evidences' }
  | { name: 'gaps' }

interface NavigationValue {
  route: Route
  navigate: (route: Route) => void
}

const NavigationContext = createContext<NavigationValue | null>(null)

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [route, setRoute] = useState<Route>({ name: 'dashboard' })

  const value = useMemo<NavigationValue>(
    () => ({
      route,
      navigate: (next) => {
        setRoute(next)
        window.scrollTo({ top: 0 })
      },
    }),
    [route]
  )

  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>
}

export function useNavigation(): NavigationValue {
  const ctx = useContext(NavigationContext)
  if (!ctx) throw new Error('useNavigation debe usarse dentro de NavigationProvider')
  return ctx
}
