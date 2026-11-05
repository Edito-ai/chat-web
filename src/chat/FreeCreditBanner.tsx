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
      <div className="shrink-0 px-3 sm:px-4">
        <div
          role="region"
          aria-label={t('credit.region')}
          data-testid={TID.credit}
          className="mx-auto flex w-full max-w-3xl items-center gap-2 rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-label text-ink-0"
        >
          <Check size={15} strokeWidth={2} aria-hidden className="shrink-0 text-ink-1" />
          <p role="status" aria-live="polite" data-testid={TID.creditDone}>
            {t('credit.done', { amount: formatTokens(done) })}
          </p>
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
    <div className="shrink-0 px-3 sm:px-4">
      <section
        role="region"
        aria-label={t('credit.region')}
        data-testid={TID.credit}
        className="mx-auto w-full max-w-3xl animate-rise rounded-xl border border-line bg-surface-2 px-3 py-2.5 motion-reduce:animate-none"
      >
        <div className="flex items-start gap-2">
          <Gift size={16} strokeWidth={1.75} aria-hidden className="mt-0.5 shrink-0 text-ink-3" />
          <p className="min-w-0 flex-1 text-label font-medium text-ink-0">{t(nudge ? 'credit.need' : 'credit.offer', amounts)}</p>
          <IconButton
            size="sm"
            icon={X}
            data-testid={TID.creditDismiss}
            aria-label={t('credit.dismiss')}
            onClick={dismiss}
            className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink-2"
          />
        </div>
        <form onSubmit={(e) => void submit(e)} className="mt-2 flex flex-wrap items-center gap-2 pl-6" noValidate>
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
            className="h-9 min-w-0 flex-1 basis-44 rounded-lg border border-line bg-surface-1 px-3 text-body text-ink-0 placeholder:text-ink-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink-2 disabled:opacity-60"
          />
          <Button
            type="submit"
            variant="primary"
            data-testid={TID.creditClaim}
            disabled={busy}
            aria-busy={busy}
            className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-2"
          >
            {busy && <Loader2 size={14} className="animate-spin motion-reduce:animate-none" aria-hidden />}
            {t(busy ? 'credit.claiming' : 'credit.claim')}
          </Button>
        </form>
        <div aria-live="polite" className="pl-6">
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
