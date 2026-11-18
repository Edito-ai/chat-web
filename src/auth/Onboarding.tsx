'use client'

import clsx from 'clsx'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, Check, Gift, Loader2, PartyPopper } from 'lucide-react'
import { useT, type MessageKey } from '@/i18n'
import { useAccount } from '@/account/accountStore'
import { Button, InlineError } from '@/components/ui'
import { TERMS_URL } from '@/lib/links'
import { AuthShell } from './AuthShell'
import { secondsLeft, useAuth, type OnboardingCredit } from './authStore'
import { useTour } from '@/tour/tourStore'
import { Confetti } from './Confetti'
import { fetchLegalVersions, type LegalVersions } from './legal'
import {
  CONTENT_TYPES, COUNTRY_CODES, EMPTY_FORM, PLATFORMS, ROLES, SOURCES, stepProblem, toPayload, toggle, type OnboardingForm,
  type StepProblem,
} from './onboardingForm'

type Step = 1 | 2 | 3
const TITLE: Record<Step, MessageKey> = { 1: 'onb.step1.title', 2: 'onb.step2.title', 3: 'onb.step3.title' }
const SUB: Record<Step, MessageKey> = { 1: 'onb.step1.sub', 2: 'onb.step2.sub', 3: 'onb.step3.sub' }
const PROBLEM: Record<StepProblem, MessageKey> = {
  name: 'onb.err.name', empty: 'onb.err.phoneEmpty', chars: 'onb.err.phoneChars', short: 'onb.err.phoneShort', long: 'onb.err.phoneLong',
  indian: 'onb.err.phoneIndian', followers: 'onb.err.followers',
}

/**
 * The first-time screen. Two ways in: a NEW person (the address was confirmed by a code or Google, no account exists yet; finishing
 * creates it) and an account that already exists but has never done this (it was made before the screen, or without a phone).
 * Three short steps: about you (name + the phone number, the one required answer), your content, your reach. Finishing grants the
 * $1 starter credit (the server says what happened to it) and shows the party popup.
 */
export function Onboarding() {
  const { t } = useT()
  const pending = useAuth((s) => s.pendingSignup)
  const user = useAuth((s) => s.user)
  const celebration = useAuth((s) => s.celebration)
  const loading = useAuth((s) => s.loading)
  const error = useAuth((s) => s.error)
  const isNew = pending !== null
  const email = pending?.email ?? user?.email ?? ''

  const [step, setStep] = useState<Step>(1)
  const [form, setForm] = useState<OnboardingForm>({ ...EMPTY_FORM, name: pending?.name ?? user?.name ?? '' })
  const [problem, setProblem] = useState<StepProblem | null>(null)
  const [agreed, setAgreed] = useState(false)
  const [legal, setLegal] = useState<LegalVersions | null>(null)
  const set = (patch: Partial<OnboardingForm>) => {
    setProblem(null)
    useAuth.getState().clearError()
    setForm((f) => ({ ...f, ...patch }))
  }

  // A sign-up proof that ran out while the screen was open: back to the sign-in screen.
  useEffect(() => {
    if (pending && secondsLeft(pending.signupToken) < 15) useAuth.getState().cancelSignup()
  }, [pending])

  useEffect(() => {
    if (!isNew) return
    const ctl = new AbortController()
    fetchLegalVersions(ctl.signal).then(setLegal).catch(() => undefined)
    return () => ctl.abort()
  }, [isNew])

  if (celebration) return <Celebration credit={celebration} />

  const consentNeeded = isNew && legal !== null
  const next = async (e?: FormEvent) => {
    e?.preventDefault()
    const p = stepProblem(step, form)
    if (p) return setProblem(p)
    if (step < 3) {
      setStep((s) => (s + 1) as Step)
      return
    }
    if (consentNeeded && !agreed) return
    try {
      const payload = toPayload(form)
      if (isNew) await useAuth.getState().completeSignup(payload, legal && agreed ? legal : undefined)
      else await useAuth.getState().submitOnboarding(payload)
    } catch {
      // The store holds the reason. A refused number is fixed on the first step.
      if (/phone|mobile|number/i.test(useAuth.getState().error ?? '')) setStep(1)
    }
  }

  const canNext = !loading && (step < 3 || !consentNeeded || agreed)

  return (
    <AuthShell wide>
      <form onSubmit={(e) => void next(e)} className="space-y-5" noValidate data-testid="onboarding">
        <div
          data-testid="onboarding-banner"
          className="flex items-center gap-3 rounded-2xl border border-accent-line bg-accent/10 px-3.5 py-2.5"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#D8264A] to-[#FF7A5C] text-white shadow-[0_8px_22px_-10px_rgb(255_90_80/0.8)]">
            <Gift size={17} aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block text-body font-semibold text-ink-0">{t('onb.banner.title')}</span>
            <span className="block text-caption text-ink-3">{t('onb.banner.sub')}</span>
          </span>
        </div>

        <div>
          <div className="flex gap-1.5" role="progressbar" aria-valuemin={1} aria-valuemax={3} aria-valuenow={step} aria-label={t('onb.progress', { n: step })}>
            {[1, 2, 3].map((n) => (
              <span key={n} className={clsx('h-1 flex-1 rounded-full transition-colors duration-300', n <= step ? 'bg-gradient-to-r from-[#D8264A] to-[#FF7A5C]' : 'bg-white/10')} />
            ))}
          </div>
          <p className="mt-2 text-caption text-ink-3">{t('onb.progress', { n: step })}</p>
        </div>

        <div key={step} className="animate-rise space-y-4">
          <div className="space-y-1">
            <h1 data-testid="onboarding-title" className="font-display text-[1.35rem] font-bold leading-tight tracking-[-0.02em] text-ink-0">
              {t(TITLE[step])}
            </h1>
            <p className="text-body text-ink-3">{t(SUB[step])}</p>
          </div>

          {step === 1 && (
            <div className="space-y-3">
              <Field label={t('onb.name')}>
                <input className="field" name="name" autoComplete="name" autoFocus value={form.name} onChange={(e) => set({ name: e.target.value })} />
              </Field>
              <Field label={t('onb.email')}>
                <input className="field cursor-not-allowed opacity-70" name="email" value={email} readOnly tabIndex={-1} />
              </Field>
              <Field label={t('onb.phone')} hint={t('onb.phone.hint')}>
                <div className="flex gap-2">
                  <select
                    aria-label={t('onb.countryCode')}
                    name="cc"
                    className="field w-[5.5rem] shrink-0 px-2"
                    value={form.cc}
                    onChange={(e) => set({ cc: e.target.value })}
                  >
                    {COUNTRY_CODES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <input
                    className="field"
                    name="phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel-national"
                    placeholder="98765 43210"
                    value={form.phone}
                    onChange={(e) => set({ phone: e.target.value })}
                  />
                </div>
              </Field>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <Group label={t('onb.content')}>
                {CONTENT_TYPES.map((c) => (
                  <Chip key={c} on={form.contentTypes.includes(c)} onClick={() => set({ contentTypes: toggle(form.contentTypes, c) })}>
                    {c}
                  </Chip>
                ))}
              </Group>
              <input
                className="field"
                name="contentOther"
                placeholder={t('onb.contentOther')}
                maxLength={60}
                value={form.contentOther}
                onChange={(e) => set({ contentOther: e.target.value })}
              />
              <Group label={t('onb.role')}>
                {ROLES.map((r) => (
                  <Chip key={r} on={form.role === r} onClick={() => set({ role: form.role === r ? null : r })}>
                    {r}
                  </Chip>
                ))}
              </Group>
              <Group label={t('onb.source')}>
                {SOURCES.map((s) => (
                  <Chip key={s} on={form.source === s} onClick={() => set({ source: form.source === s ? null : s })}>
                    {s}
                  </Chip>
                ))}
              </Group>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <Group label={t('onb.platforms')}>
                {PLATFORMS.map((p) => (
                  <Chip key={p} on={form.platforms.includes(p)} onClick={() => set({ platforms: toggle(form.platforms, p) })}>
                    {p}
                  </Chip>
                ))}
              </Group>
              <Field label={t('onb.handle')}>
                <input
                  className="field"
                  name="handle"
                  autoComplete="off"
                  placeholder="@yourchannel"
                  maxLength={150}
                  value={form.handle}
                  onChange={(e) => set({ handle: e.target.value })}
                />
              </Field>
              <Field label={t('onb.followers')} hint={t('onb.followers.hint')}>
                <input
                  className="field"
                  name="followers"
                  inputMode="text"
                  autoComplete="off"
                  placeholder="12k"
                  value={form.followers}
                  onChange={(e) => set({ followers: e.target.value })}
                />
              </Field>
              {consentNeeded && (
                <label className="flex items-start gap-2 text-label text-ink-2">
                  <input type="checkbox" name="agree" className="mt-0.5 h-4 w-4 accent-[#FF7A5C]" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
                  <span>
                    {t('auth.consent')}{' '}
                    <a href={TERMS_URL} target="_blank" rel="noopener noreferrer" className="underline decoration-white/30 underline-offset-2 hover:text-ink-0">
                      {t('auth.consent.read')}
                    </a>
                  </span>
                </label>
              )}
            </div>
          )}
        </div>

        {problem && (
          <p role="alert" data-testid="onboarding-problem" className="text-label text-danger">
            {t(PROBLEM[problem])}
          </p>
        )}
        {error && <InlineError message={error} />}

        <div className="flex items-center gap-2">
          {step > 1 && (
            <Button type="button" variant="ghost" className="h-11 px-3" onClick={() => setStep((s) => (s - 1) as Step)} aria-label={t('onb.back')} data-testid="onboarding-back">
              <ArrowLeft size={16} aria-hidden />
            </Button>
          )}
          <Button type="submit" variant="primary" className="h-11 flex-1" disabled={!canNext} data-testid="onboarding-next">
            {loading ? <Loader2 size={14} className="animate-spin" aria-hidden /> : null}
            {step < 3 ? t('onb.continue') : t('onb.finish')}
            {!loading && step < 3 && <ArrowRight size={15} aria-hidden />}
          </Button>
        </div>

        {isNew && (
          <button
            type="button"
            className="mx-auto block rounded px-1 text-caption text-ink-4 underline-offset-2 hover:text-ink-2 hover:underline"
            onClick={() => useAuth.getState().cancelSignup()}
          >
            {t('onb.otherEmail')}
          </button>
        )}
      </form>
    </AuthShell>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-label text-ink-2">{label}</span>
      {children}
      {hint && <span className="block text-caption text-ink-4">{hint}</span>}
    </label>
  )
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="space-y-2">
      <p className="text-label text-ink-2">{label}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  )
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={clsx(
        'inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-3.5 text-label font-medium transition-all active:scale-[0.97]',
        on ? 'border-accent-line bg-accent/20 text-ink-0' : 'border-white/15 bg-white/[0.04] text-ink-2 hover:border-white/30 hover:text-ink-0',
      )}
    >
      {on && <Check size={12} aria-hidden />}
      {children}
    </button>
  )
}

/** The party popup: confetti, what happened to the $1, and the way into the chat. */
function Celebration({ credit }: { credit: OnboardingCredit }) {
  const { t } = useT()
  // The credit is on the account now: the plan badge and the Usage dialog read it fresh from here on.
  useEffect(() => {
    void useAccount.getState().refresh()
  }, [])
  const granted = credit.status === 'granted'
  const body: Record<OnboardingCredit['status'], MessageKey> = {
    granted: 'onb.done.granted', already_claimed: 'onb.done.already', phone_in_use: 'onb.done.phoneUsed', off: 'onb.done.off',
  }
  return (
    <AuthShell wide>
      <Confetti />
      <div data-testid="onboarding-done" className="animate-rise space-y-5 py-2 text-center">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-[#D8264A] to-[#FF7A5C] text-white shadow-[0_18px_40px_-14px_rgb(255_90_80/0.9)]">
          <PartyPopper size={30} aria-hidden />
        </span>
        <div className="space-y-2">
          <h1 className="font-display text-[1.5rem] font-bold leading-tight tracking-[-0.02em] text-ink-0">
            {granted ? t('onb.done.title.granted', { usd: credit.usd }) : t('onb.done.title')}
          </h1>
          <p className="text-body text-ink-3">{t(body[credit.status], { usd: credit.usd })}</p>
        </div>
        <Button
          autoFocus
          variant="primary"
          className="h-11 w-full"
          data-testid="onboarding-start"
          onClick={() => {
            // First time in: the chat opens straight into the product tour.
            useTour.getState().queue()
            useAuth.getState().dismissCelebration()
          }}
        >
          {t('onb.done.start')}
        </Button>
      </div>
    </AuthShell>
  )
}
