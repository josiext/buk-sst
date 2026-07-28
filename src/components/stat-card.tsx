import { cn } from '@/lib/utils'

const TONE: Record<string, string> = {
  positive: 'text-emerald-700 dark:text-emerald-400',
  negative: 'text-red-700 dark:text-red-400',
  warning: 'text-amber-700 dark:text-amber-400',
  neutral: 'text-foreground',
}

export function StatCard({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: string
  value: number | string
  hint?: string
  tone?: 'positive' | 'negative' | 'warning' | 'neutral'
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className={cn('mt-1.5 font-heading text-2xl font-medium tabular-nums', TONE[tone])}>
        {value}
      </div>
      {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
    </div>
  )
}
