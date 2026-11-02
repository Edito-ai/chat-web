import { useEffect, useState, type FormEvent } from 'react'
import { Loader2 } from 'lucide-react'
import { useT, useLocale } from '@/i18n'
import { Button, InlineError, Logo } from '@/components/ui'
import { API_BASE } from '@/lib/env'
import { useAuth } from './authStore'

type Mode = 'login' | 'signup' | 'code'

interface LegalVersions {
  termsVersion: string
  privacyVersion: string
}

/** Public `GET /legal`: the Terms/Privacy versions the consent box refers to. Best effort. */
async function fetchLegalVersions(signal: AbortSignal): Promise<LegalVersions | null> {
  const res = await fetch(`${API_BASE}/legal`, { signal, credentials: 'omit' })
  if (!res.ok) return null
  const body = await res.json()
  const docs: { slug: string; version: string }[] = Array.isArray(body) ? body : (body?.documents ?? [])
  const terms = docs.find((d) => d.slug === 'terms')
  const privacy = docs.find((d) => d.slug === 'privacy')
  return terms && privacy ? { termsVersion: terms.version, privacyVersion: privacy.version } : null
}

export function AuthScreen() {
  const { t, locale } = useT()
  const setLocale = useLocale((s) => s.setLocale)
  const { login, signup, loginWithCode, requestLoginCode, clearError } = useAuth.getState()
  const loading = useAuth((s) => s.loading)
  const error = useAuth((s) => s.error)
  const verificationEmail = useAuth((s) => s.verificationEmail)

  const [mode, setMode] = useState<Mode>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [legal, setLegal] = useState<LegalVersions | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // A correct password on an unverified account: the backend already mailed a code, go straight to entering it.
  useEffect(() => {
    if (verificationEmail) {
      setEmail(verificationEmail)
      setMode('code')
    }
  }, [verificationEmail])

  useEffect(() => {
    if (mode !== 'signup' || legal) return
    const ctl = new AbortController()
    fetchLegalVersions(ctl.signal).then(setLegal).catch(() => undefined)
    return () => ctl.abort()
  }, [mode, legal])

  const go = (m: Mode) => {
    clearError()
    setNotice(null)
    setMode(m)
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setNotice(null)
    try {
      if (mode === 'login') await login(email.trim(), password)
      else if (mode === 'signup') {
        await signup(email.trim(), password, name.trim(), legal && agreed ? legal : undefined)
        setCode('')
        setMode('code')
      } else await loginWithCode(email.trim(), code.trim())
    } catch {
      // the store holds the message
    }
  }

  const resend = async () => {
    try {
      await requestLoginCode(email.trim())
      setNotice(t('auth.resent'))
    } catch {
      // the store holds the message
    }
  }

  const consentNeeded = mode === 'signup' && legal !== null
  const canSubmit =
    !loading &&
    (mode === 'login'
      ? email && password
      : mode === 'signup'
        ? email && password && name.trim() && (!consentNeeded || agreed)
        : email && code.trim().length >= 4)

  return (
    <main className="app-shell flex min-h-full w-full items-center justify-center px-4 py-10 text-ink-1">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex items-center justify-between">
          <Logo size={32} />
          <select
            aria-label={t('lang.switch')}
            value={locale}
            onChange={(e) => setLocale(e.target.value === 'hi' ? 'hi' : 'en')}
            className="h-9 rounded-lg border border-line bg-surface-2 px-2 text-label text-ink-1"
          >
            <option value="en">EN</option>
            <option value="hi">हिं</option>
          </select>
        </div>

        <div className="space-y-1">
          <h1 data-testid="auth-title" className="text-heading font-semibold text-ink-0">{t(`auth.title.${mode}`)}</h1>
          <p className="text-body text-ink-3">{mode === 'code' ? t('auth.sub.code', { email }) : t(`auth.sub.${mode}`)}</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-3" noValidate>
          {mode === 'signup' && (
            <label className="block space-y-1">
              <span className="text-label text-ink-2">{t('auth.name')}</span>
              <input className="field" name="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
          )}
          {mode !== 'code' && (
            <>
              <label className="block space-y-1">
                <span className="text-label text-ink-2">{t('auth.email')}</span>
                <input
                  className="field"
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-label text-ink-2">{t('auth.password')}</span>
                <input
                  className="field"
                  name="password"
                  type="password"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                {mode === 'signup' && <span className="block text-caption text-ink-4">{t('auth.passwordHint')}</span>}
              </label>
            </>
          )}
          {mode === 'code' && (
            <label className="block space-y-1">
              <span className="text-label text-ink-2">{t('auth.code')}</span>
              <input
                className="field tracking-[0.3em]"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={8}
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </label>
          )}
          {consentNeeded && (
            <label className="flex items-start gap-2 text-label text-ink-2">
              <input type="checkbox" className="mt-0.5" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
              <span>{t('auth.consent')}</span>
            </label>
          )}

          {error && <InlineError message={error} />}
          {notice && <p role="status" className="text-label text-success">{notice}</p>}

          <Button type="submit" variant="primary" className="h-10 w-full" disabled={!canSubmit} data-testid="auth-submit">
            {loading && <Loader2 size={14} className="animate-spin" aria-hidden />}
            {t(mode === 'login' ? 'auth.login' : mode === 'signup' ? 'auth.signup' : 'auth.verify')}
          </Button>
        </form>

        <div className="flex flex-col gap-1 text-label">
          {mode === 'code' && (
            <button type="button" className="self-start rounded px-1 py-1 text-ink-1 underline-offset-2 hover:underline" onClick={() => void resend()}>
              {t('auth.resend')}
            </button>
          )}
          {mode === 'login' && (
            <button type="button" className="self-start rounded px-1 py-1 text-ink-1 underline-offset-2 hover:underline" onClick={() => go('signup')}>
              {t('auth.toSignup')}
            </button>
          )}
          {mode !== 'login' && (
            <button type="button" className="self-start rounded px-1 py-1 text-ink-3 underline-offset-2 hover:text-ink-1 hover:underline" onClick={() => go('login')}>
              {mode === 'code' ? t('auth.back') : t('auth.toLogin')}
            </button>
          )}
        </div>
      </div>
    </main>
  )
}
