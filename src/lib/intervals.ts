import { addDays } from './dates'
import type { ISODate } from './types'

/**
 * Intervalo de fechas cerrado por ambos extremos e inclusivo.
 * `end: null` significa "sin fecha de término" (vigencia indefinida).
 *
 * Toda la lógica de cumplimiento se reduce a álgebra sobre estos intervalos:
 * un período es un intervalo, cada evidencia aporta un intervalo de cobertura,
 * y un gap es lo que queda del período al restarle la cobertura.
 */
export interface Interval {
  start: ISODate
  end: ISODate | null
}

const isBefore = (a: ISODate, b: ISODate) => a < b

function maxStart(a: ISODate, b: ISODate): ISODate {
  return isBefore(a, b) ? b : a
}

/** `null` actúa como +infinito. */
function minEnd(a: ISODate | null, b: ISODate | null): ISODate | null {
  if (a === null) return b
  if (b === null) return a
  return isBefore(a, b) ? a : b
}

export function isEmpty(i: Interval): boolean {
  return i.end !== null && isBefore(i.end, i.start)
}

export function contains(i: Interval, date: ISODate): boolean {
  return !isBefore(date, i.start) && (i.end === null || !isBefore(i.end, date))
}

export function intersect(a: Interval, b: Interval): Interval | null {
  const result = { start: maxStart(a.start, b.start), end: minEnd(a.end, b.end) }
  return isEmpty(result) ? null : result
}

/**
 * Une intervalos solapados o contiguos. Dos intervalos que se tocan por un día
 * (termina el 31, empieza el 1) cuentan como cobertura continua: si no se
 * fusionaran, cada renovación generaría un gap falso de cero días.
 */
export function merge(intervals: Interval[]): Interval[] {
  const sorted = intervals
    .filter((i) => !isEmpty(i))
    .slice()
    .sort((a, b) => (a.start === b.start ? 0 : isBefore(a.start, b.start) ? -1 : 1))

  const out: Interval[] = []
  for (const current of sorted) {
    const last = out[out.length - 1]
    if (!last) {
      out.push({ ...current })
      continue
    }
    if (last.end === null) break // ya cubre hasta el infinito
    if (!isBefore(addDays(last.end, 1), current.start)) {
      last.end = maxEnd(last.end, current.end)
    } else {
      out.push({ ...current })
    }
  }
  return out
}

function maxEnd(a: ISODate | null, b: ISODate | null): ISODate | null {
  if (a === null || b === null) return null
  return isBefore(a, b) ? b : a
}

/** `base` menos la unión de `covers`. Devuelve los tramos descubiertos. */
export function subtract(base: Interval, covers: Interval[]): Interval[] {
  if (isEmpty(base)) return []

  const clipped = covers
    .map((c) => intersect(base, c))
    .filter((c): c is Interval => c !== null)
  const merged = merge(clipped)

  const gaps: Interval[] = []
  let cursor: ISODate = base.start

  for (const cover of merged) {
    if (isBefore(cursor, cover.start)) {
      gaps.push({ start: cursor, end: addDays(cover.start, -1) })
    }
    if (cover.end === null) return gaps
    const next = addDays(cover.end, 1)
    if (isBefore(cursor, next)) cursor = next
  }

  if (base.end === null || !isBefore(base.end, cursor)) {
    gaps.push({ start: cursor, end: base.end })
  }
  return gaps
}

/** Devuelve el tramo continuo de `intervals` que contiene a `date`, si existe. */
export function runContaining(intervals: Interval[], date: ISODate): Interval | null {
  return merge(intervals).find((i) => contains(i, date)) ?? null
}
