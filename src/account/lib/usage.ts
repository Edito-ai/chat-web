/** Pure formatting for the usage meter. */

export function formatTokens(n: number): string {
  if (!Number.isFinite(n)) return '0'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`
  return String(Math.round(n))
}

/** Bar width 0..100; any spend shows at least a sliver, and a full ledger never overflows the track. */
export function barPercent(used: number, percentageUsed: number): number {
  const p = Number.isFinite(percentageUsed) ? percentageUsed : 0
  return Math.min(100, Math.max(p, used > 0 ? 2 : 0))
}

export type MeterTone = 'ok' | 'warn' | 'danger'

export function meterTone(percentageUsed: number, exceeded: boolean): MeterTone {
  if (exceeded || percentageUsed >= 100) return 'danger'
  return percentageUsed >= 80 ? 'warn' : 'ok'
}

export function formatHours(h: number): string {
  return (Math.round(h * 10) / 10).toString()
}

export function formatMoney(amount: number, currency: string, locale?: string): string {
  try {
    return new Intl.NumberFormat(locale ?? (currency === 'INR' ? 'en-IN' : 'en-US'), { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount)
  } catch {
    return `${amount} ${currency}`
  }
}
