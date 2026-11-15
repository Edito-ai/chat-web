'use client'

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowLeft, Loader2, MailCheck } from 'lucide-react'
import { TERMS_URL } from '@/lib/links'
import { useT } from '@/i18n'
import { Button, InlineError } from '@/components/ui'
import { BrandTile } from '@/components/BrandTile'
import { GOOGLE_CLIENT_ID } from '@/lib/env'
import { AuthShell } from './AuthShell'
import { useAuth } from './authStore'
import { GoogleButton } from './google'
import { clearPendingCode, loadPendingCode, savePendingCode } from './pendingCode'

type Mode = 'start' | 'code'

/** A new code for the same address is not sent sooner than this (the server holds the same line). */
export const RESEND_SECONDS = 45
const CODE_LENGTH = 6

/**
 * Sign in or sign up, one screen: "Continue with Google", or an email address and the 6-digit code mailed to it. There is no
 * password. A person nobody knows yet is taken to the onboarding screen (see `Onboarding`) once the code / Google is confirmed;
 * the account is created when they finish it.
 */
export function AuthScreen({ initialMode = 'login' }: { initialMode?: 'login' | 'signup' }) {
  const { t } = useT()
  const { loginWithCode, loginWithGoogle, requestLoginCode, clearError } = useAuth.getState()
  const loading = useAuth((s) => s.loading)
  const error = useAuth((s) => s.error)

  const [mode, setMode] = useState<Mode>('start')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [resendIn, setResendIn] = useState(0)
  const verifying = useRef(false)

  // Back from the mail app (on a phone the tab is often reloaded meanwhile): the code step, not an empty form.
  useEffect(() => {
    const pending = loadPendingCode()
    if (pending) {
      setEmail(pending)
      setCode('')
      setMode('code')
    }
  }, [])

  useEffect(() => {
    if (resendIn <= 0) return
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000)
    return () => clearTimeout(timer)
  }, [resendIn])

  const sendCode = async (e?: FormEvent) => {
    e?.preventDefault()
    setNotice(null)
    try {
      await requestLoginCode(email.trim())
      savePendingCode(email.trim()) // a code is on its way: survive a reload while they read their mail
      setCode('')
      setMode('code')
      setResendIn(RESEND_SECONDS)
    } catch {
      // the store holds the message
    }
  }

  const verify = useCallback(
    async (value: string) => {
      if (verifying.current) return
      verifying.current = true
      setNotice(null)
      try {
        await loginWithCode(email.trim(), value)
        clearPendingCode()
      } catch {
        setCode('') // a wrong code is typed again from the start
      } finally {
        verifying.current = false
      }
    },
    [email, loginWithCode],
  )

  const resend = async () => {
    if (resendIn > 0) return
    setNotice(null)
    try {
      await requestLoginCode(email.trim())
      savePendingCode(email.trim())
      setNotice(t('auth.resent'))
      setResendIn(RESEND_SECONDS)
    } catch {
      // the store holds the message
    }
  }

  const onGoogle = useCallback(
    async (idToken: string) => {
      setNotice(null)
      try {
        await loginWithGoogle(idToken)
        clearPendingCode()
      } catch {
        // the store holds the message
      }
    },
    [loginWithGoogle],
  )

  const back = () => {
    clearPendingCode() // leaving the code step on purpose: do not bring it back on the next visit
    clearError()
    setNotice(null)
    setCode('')
    setMode('start')
  }

  const onCode = (v: string) => {
    const digits = v.replace(/\D/g, '').slice(0, CODE_LENGTH)
    setCode(digits)
    if (error) clearError()
    if (digits.length === CODE_LENGTH) void verify(digits)
  }

  const emailOk = /^\S+@\S+\.\S+$/.test(email.trim())
  const title = mode === 'code' ? t('auth.title.code') : t(`auth.title.${initialMode}`)
  const sub = mode === 'code' ? t('auth.sub.code', { email: email.trim() }) : t(`auth.sub.${initialMode}`)

  return (
    <AuthShell>
      <div className="space-y-6">
        <BrandTile size={60} className="mx-auto" />
        <div className="space-y-1.5 text-center">
          <h1 data-testid="auth-title" className="font-display text-[1.45rem] font-bold leading-tight tracking-[-0.02em] text-ink-0">
            {title}
          </h1>
          <p className="text-body text-ink-3">{sub}</p>
        </div>

        {mode === 'start' ? (
          <div className="space-y-4">
            {GOOGLE_CLIENT_ID && (
              <>
                <GoogleButton onCredential={(tok) => void onGoogle(tok)} disabled={loading} />
                <div className="flex items-center gap-3 text-caption uppercase tracking-[0.14em] text-ink-4">
                  <span className="h-px flex-1 bg-white/10" />
                  {t('auth.or')}
                  <span className="h-px flex-1 bg-white/10" />
                </div>
              </>
            )}
            <form onSubmit={(e) => void sendCode(e)} className="space-y-3" noValidate>
              <label className="block space-y-1">
                <span className="text-label text-ink-2">{t('auth.email')}</span>
                <input
                  className="field"
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoFocus
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    if (error) clearError()
                  }}
                />
              </label>
              {error && <InlineError message={error} />}
              <Button type="submit" variant="primary" className="h-11 w-full" disabled={loading || !emailOk} data-testid="auth-submit">
                {loading && <Loader2 size={14} className="animate-spin" aria-hidden />}
                {t('auth.sendCode')}
              </Button>
            </form>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (code.length === CODE_LENGTH) void verify(code)
            }}
            className="space-y-4"
            noValidate
          >
            <div className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-accent/15 text-accent">
              <MailCheck size={20} aria-hidden />
            </div>
            <label className="block space-y-1">
              <span className="sr-only">{t('auth.code')}</span>
              <input
                className="field h-14 text-center font-mono text-[1.6rem] tracking-[0.55em]"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                maxLength={CODE_LENGTH}
                placeholder="······"
                aria-label={t('auth.code')}
                value={code}
                onChange={(e) => onCode(e.target.value)}
              />
            </label>
            {error && <InlineError message={error} />}
            {notice && (
              <p role="status" className="text-center text-label text-success">
                {notice}
              </p>
            )}
            <Button type="submit" variant="primary" className="h-11 w-full" disabled={loading || code.length !== CODE_LENGTH} data-testid="auth-submit">
              {loading && <Loader2 size={14} className="animate-spin" aria-hidden />}
              {t('auth.verify')}
            </Button>
            <div className="flex flex-col items-center gap-1 text-label">
              <button
                type="button"
                data-testid="auth-resend"
                disabled={resendIn > 0 || loading}
                className="rounded px-1 py-1 text-ink-1 underline-offset-2 enabled:hover:underline disabled:text-ink-4"
                onClick={() => void resend()}
              >
                {resendIn > 0 ? t('auth.resendIn', { s: resendIn }) : t('auth.resend')}
              </button>
              <button type="button" className="inline-flex items-center gap-1 rounded px-1 py-1 text-ink-3 underline-offset-2 hover:text-ink-1 hover:underline" onClick={back}>
                <ArrowLeft size={12} aria-hidden /> {t('auth.back')}
              </button>
            </div>
          </form>
        )}

        <p className="text-center text-caption leading-relaxed text-ink-4">
          {t('auth.terms.pre')}{' '}
          <a href={TERMS_URL} target="_blank" rel="noopener noreferrer" data-testid="auth-terms-link" className="underline decoration-white/30 underline-offset-2 hover:text-ink-1">
            {t('auth.consent.read')}
          </a>
        </p>
      </div>
    </AuthShell>
  )
}
