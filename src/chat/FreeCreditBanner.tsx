'use client'

import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { AlertCircle, Check, Gift, Loader2, X } from 'lucide-react'
import { useT, type MessageKey } from '@/i18n'
import { Button, IconButton } from '@/components/ui'
import { useAccount } from '@/account/accountStore'
import { formatTokens } from '@/account/lib/usage'
import { claimErrorKind, shouldShowCreditBanner, validatePhone, type PhoneProblem } from '@/account/lib/freeCredit'
import { TID } from './testIds'

const PROBLEM_KEY: Record<PhoneProblem, MessageKey> = {
  empty: 'credit.err.empty',
  chars: 'credit.err.chars',
  short: 'credit.err.short',
  long: 'credit.err.long',
}
const DONE_MS = 5000

/** "$2", "$1.50": tokens use the Usage dialog's formatTokens; dollars drop trailing zeros on whole amounts. */
const formatUsd = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2))

/**
 * Free starter credit offer at the top of the chat column. Shows only for an enabled, unclaimed offer; while loading
 * or after any fetch error it renders nothing, so it can never block the chat. `nudge` (a 402 from the chat) shows it
 * even if it was dismissed, with the "you need credits" wording.
 */
export function FreeCreditBanner({ nudge = false }: { nudge?: boolean }) {
  const { t } = useT()
  const credit = useAccount((s) => s.credit)
  const load = useAccount((s) => s.creditLoad)
  const dismissed = useAccount((s) => s.creditDismissed)
  const dismiss = useAccount((s) => s.dismissCredit)
  const claim = useAccount((s) => s.claimFreeCredit)
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<number | null>(null)
  const inputId = useId()
  const errId = useId()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (done === null) return
    const id = window.setTimeout(() => setDone(null), DONE_MS)
    return () => window.clearTimeout(id)
  }, [done])

  const show = shouldShowCreditBanner(credit, load, dismissed, nudge)
  if (done !== null) {
    return (
      <div className="shrink-0">
        <div
          role="region"
          aria-label={t('credit.region')}
          data-testid={TID.credit}
          className="border-b border-success/30 bg-gradient-to-r from-success/25 via-success/10 to-transparent px-3 py-2.5 sm:px-4"
        >
          <div className="mx-auto flex w-full max-w-5xl items-center gap-2.5 text-body font-medium text-ink-0">
            <span aria-hidden className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-success/25 text-success ring-1 ring-success/40">
              <Check size={15} strokeWidth={2.25} />
            </span>
            <p role="status" aria-live="polite" data-testid={TID.creditDone}>
              {t('credit.done', { amount: formatTokens(done) })}
            </p>
          </div>
        </div>
      </div>
    )
  }
  if (!show || !credit) return null

  const amounts = { usd: formatUsd(credit.usd), amount: formatTokens(credit.tokens) }

  const submit = async (e?: FormEvent) => {
    e?.preventDefault()
    if (busy) return
    const v = validatePhone(phone)
    if (!v.ok) {
      setError(t(PROBLEM_KEY[v.problem]))
      inputRef.current?.focus()
      return
    }
    setError(null)
    setBusy(true)
    try {
      const res = await claim(v.phone)
      setDone(res.tokens || credit.tokens)
    } catch (err) {
      const k = claimErrorKind(err)
      setError(
        k.kind === 'invalid'
          ? t('credit.err.invalid')
          : k.kind === 'used'
            ? t('credit.err.used')
            : k.kind === 'notVerified'
              ? t('credit.err.notVerified')
              : k.message,
      )
      inputRef.current?.focus()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="shrink-0">
      <section
        role="region"
        aria-label={t('credit.region')}
        data-testid={TID.credit}
        className="relative overflow-hidden border-b border-accent-line bg-gradient-to-r from-accent/45 via-accent/15 to-warning/40 px-3 py-2.5 animate-rise motion-reduce:animate-none sm:px-4"
      >
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-4 gap-y-2">
          <span
            aria-hidden
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent/25 text-accent ring-1 ring-accent-line"
          >
            <Gift size={18} strokeWidth={1.9} />
          </span>
          <div className="min-w-0 flex-1 basis-56">
            <p className="flex flex-wrap items-center gap-2 text-body font-semibold text-ink-0">
              <span className="rounded-full bg-warning px-2 py-px text-caption font-bold uppercase tracking-wide text-surface-0">
                {t('credit.badge')}
              </span>
              {t(nudge ? 'credit.need' : 'credit.offer', amounts)}
            </p>
            <p className="mt-0.5 text-caption text-ink-2">{t('credit.sub')}</p>
          </div>
          <form onSubmit={(e) => void submit(e)} className="flex min-w-0 flex-1 basis-72 items-center gap-2 sm:max-w-md" noValidate>
            <label htmlFor={inputId} className="sr-only">
              {t('credit.phone')}
            </label>
            <input
              ref={inputRef}
              id={inputId}
              data-testid={TID.creditPhone}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              maxLength={40}
              value={phone}
              disabled={busy}
              placeholder={t('credit.placeholder')}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errId : undefined}
              onChange={(e) => {
                setPhone(e.target.value)
                if (error) setError(null)
              }}
              className="h-9 min-w-0 flex-1 rounded-lg border border-accent-line bg-surface-0/70 px-3 text-body text-ink-0 placeholder:text-ink-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-60"
            />
            <Button
              type="submit"
              variant="primary"
              data-testid={TID.creditClaim}
              disabled={busy}
              aria-busy={busy}
              className="shrink-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {busy && <Loader2 size={14} className="animate-spin motion-reduce:animate-none" aria-hidden />}
              {t(busy ? 'credit.claiming' : 'credit.claim')}
            </Button>
          </form>
          <IconButton
            size="sm"
            icon={X}
            data-testid={TID.creditDismiss}
            aria-label={t('credit.dismiss')}
            onClick={dismiss}
            className="shrink-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          />
        </div>
        <div aria-live="polite" className="mx-auto w-full max-w-5xl">
          {error && (
            <p id={errId} role="alert" data-testid={TID.creditError} className="mt-2 flex items-start gap-1.5 text-label text-danger">
              <AlertCircle size={12} className="mt-0.5 shrink-0" aria-hidden /> {error}
            </p>
          )}
        </div>
      </section>
    </div>
  )
}
