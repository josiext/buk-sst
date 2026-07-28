import { daysBetween, formatDate, inclusiveDays } from '@/lib/dates'
import type { ISODate } from '@/lib/types'
import { cn } from '@/lib/utils'

interface Segment {
  start: ISODate
  end: ISODate | null
  kind: 'covered' | 'gap'
  label: string
}

/**
 * Barra que dibuja un período con sus tramos cubiertos y descubiertos.
 * Es la respuesta visual a la pregunta 3: los tramos rojos son días en que el
 * empleado no cumplía el requisito, aunque hoy sí lo cumpla.
 */
export function PeriodBar({
  start,
  end,
  segments,
  asOf,
  className,
}: {
  start: ISODate
  end: ISODate | null
  segments: Segment[]
  asOf: ISODate
  className?: string
}) {
  const visualEnd = resolveVisualEnd(start, end, segments, asOf)
  const span = Math.max(1, inclusiveDays(start, visualEnd))

  const pct = (from: ISODate, to: ISODate | null) => {
    const clampedTo = to === null || to > visualEnd ? visualEnd : to
    const offset = Math.max(0, daysBetween(start, from))
    const width = Math.max(0, inclusiveDays(from > start ? from : start, clampedTo))
    return { left: (offset / span) * 100, width: (width / span) * 100 }
  }

  const todayPct = asOf >= start && asOf <= visualEnd ? (daysBetween(start, asOf) / span) * 100 : null

  return (
    <div className={cn('relative h-6 w-full overflow-hidden rounded-md bg-muted', className)}>
      {segments.map((segment, index) => {
        const { left, width } = pct(segment.start, segment.end)
        if (width <= 0) return null
        return (
          <div
            key={`${segment.kind}-${segment.start}-${index}`}
            title={segment.label}
            className={cn(
              'absolute inset-y-0 min-w-[2px]',
              segment.kind === 'covered'
                ? 'bg-emerald-500/70 dark:bg-emerald-500/60'
                : 'bg-red-500/70 dark:bg-red-500/60'
            )}
            style={{ left: `${left}%`, width: `${width}%` }}
          />
        )
      })}
      {todayPct !== null && (
        <div
          title={`Hoy · ${formatDate(asOf)}`}
          className="absolute inset-y-0 w-0.5 bg-foreground/70"
          style={{ left: `calc(${todayPct}% - 1px)` }}
        />
      )}
    </div>
  )
}

function resolveVisualEnd(
  start: ISODate,
  end: ISODate | null,
  segments: Segment[],
  asOf: ISODate
): ISODate {
  if (end !== null) return end > start ? end : start
  // Período abierto ("una sola vez"): se dibuja hasta hoy o hasta donde llegue
  // la cobertura, lo que sea más lejano.
  let furthest = asOf > start ? asOf : start
  for (const segment of segments) {
    if (segment.end && segment.end > furthest) furthest = segment.end
  }
  return furthest
}

export type { Segment as PeriodBarSegment }
