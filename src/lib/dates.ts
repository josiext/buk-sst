import type { ISODate, RecurrenceUnit } from './types'

/**
 * Todo el cálculo de cumplimiento se hace sobre strings `YYYY-MM-DD` en UTC.
 * Evita por completo la clase de bugs de zona horaria: dos empleados en husos
 * distintos no pueden obtener estados distintos para el mismo día, y `<`/`>`
 * sobre el string ya ordena cronológicamente.
 */

export function parseISO(date: ISODate): Date {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

export function toISO(date: Date): ISODate {
  return date.toISOString().slice(0, 10)
}

/** Convierte un `timestamptz` de Postgres al día calendario UTC que le corresponde. */
export function timestampToISO(ts: string): ISODate {
  return new Date(ts).toISOString().slice(0, 10)
}

export function today(): ISODate {
  return new Date().toISOString().slice(0, 10)
}

export function addDays(date: ISODate, days: number): ISODate {
  const d = parseISO(date)
  d.setUTCDate(d.getUTCDate() + days)
  return toISO(d)
}

/**
 * Suma `n` unidades de recurrencia. Para meses y años se ancla al último día
 * del mes cuando el día de origen no existe en el mes destino (31 ene + 1 mes
 * → 28/29 feb), que es el comportamiento que espera un fiscalizador.
 */
export function addUnits(date: ISODate, unit: RecurrenceUnit, n: number): ISODate {
  if (unit === 'once') return date
  if (unit === 'day') return addDays(date, n)
  if (unit === 'week') return addDays(date, n * 7)

  const d = parseISO(date)
  const day = d.getUTCDate()
  const months = unit === 'year' ? n * 12 : n

  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + months)
  const lastDayOfTarget = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)
  ).getUTCDate()
  d.setUTCDate(Math.min(day, lastDayOfTarget))
  return toISO(d)
}

export function daysBetween(from: ISODate, to: ISODate): number {
  return Math.round((parseISO(to).getTime() - parseISO(from).getTime()) / 86_400_000)
}

/** Días inclusivos entre dos fechas: [a, a] es 1 día. */
export function inclusiveDays(from: ISODate, to: ISODate): number {
  return daysBetween(from, to) + 1
}

export function formatDate(date: ISODate | null, fallback = '—'): string {
  if (!date) return fallback
  const [y, m, d] = date.split('-')
  return `${d}-${m}-${y}`
}

export function formatDateShort(date: ISODate): string {
  const [y, m, d] = date.split('-')
  return `${d}/${m}/${y.slice(2)}`
}

export function formatDuration(days: number): string {
  if (days === 1) return '1 día'
  if (days < 60) return `${days} días`
  const months = Math.round(days / 30)
  if (months < 24) return `${months} meses`
  return `${(days / 365).toFixed(1)} años`
}
