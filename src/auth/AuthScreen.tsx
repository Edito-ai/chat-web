import { useEffect, useState, type FormEvent } from 'react'
import { Loader2 } from 'lucide-react'
import { useT } from '@/i18n'
import { Button, InlineError, LogoMark, Wordmark } from '@/components/ui'
import { BrandTile } from '@/components/BrandTile'
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

export function AuthScreen({ initialMode = 'login' }: { initialMode?: 'login' | 'signup' }) {
  const { t } = useT()
  const { login, signup, loginWithCode, requestLoginCode, clearError } = useAuth.getState()
  const loading = useAuth((s) => s.loading)
  const error = useAuth((s) => s.error)
  const verificationEmail = useAuth((s) => s.verificationEmail)

  const [mode, setMode] = useState<Mode>(initialMode)
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
    <main className="relative isolate flex min-h-full w-full flex-col overflow-hidden bg-[linear-gradient(to_top_right,#0e1020_0%,#2b3a5e_24%,#8a1c3a_44%,#c0202f_56%,#e4776d_76%,#ffc4ae_100%)] text-ink-1">
      <div aria-hidden className="absolute -right-32 -top-32 -z-10 h-[34rem] w-[34rem] rounded-full bg-[radial-gradient(closest-side,rgb(255_226_210/0.5),transparent)] blur-2xl" />
      <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(120%_90%_at_0%_100%,rgb(5_6_14/0.5),transparent_60%)]" />
      <div aria-hidden className="pointer-events-none absolute -bottom-24 -left-16 -z-10 hidden animate-orb-idle opacity-[0.10] lg:block">
        <LogoMark size={520} className="bg-white" />
      </div>

      <header className="relative flex items-center justify-between px-5 py-5 sm:px-8 sm:py-6">
        <span className="text-white">
          <Wordmark height={20} />
        </span>
      </header>

      <div className="relative flex flex-1 flex-col items-center justify-center px-5 pb-8">
        <div className="w-full max-w-sm space-y-6 rounded-3xl border border-white/15 bg-[#090c1a]/80 p-6 shadow-[0_40px_100px_-30px_rgb(0_0_0/0.9)] backdrop-blur-xl sm:p-8">
          <BrandTile size={60} className="mx-auto" />
          <div className="space-y-1.5 text-center">
            <h1 data-testid="auth-title" className="font-display text-[1.45rem] font-bold leading-tight tracking-[-0.02em] text-ink-0">{t(`auth.title.${mode}`)}</h1>
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
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#FF7A5C]" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
              <span>{t('auth.consent')}</span>
            </label>
          )}

          {error && <InlineError message={error} />}
          {notice && <p role="status" className="text-label text-success">{notice}</p>}

          <Button type="submit" variant="primary" className="h-11 w-full" disabled={!canSubmit} data-testid="auth-submit">
            {loading && <Loader2 size={14} className="animate-spin" aria-hidden />}
            {t(mode === 'login' ? 'auth.login' : mode === 'signup' ? 'auth.signup' : 'auth.verify')}
          </Button>
        </form>

        <div className="flex flex-col items-center gap-1 text-label">
          {mode === 'code' && (
            <button type="button" className="self-center rounded px-1 py-1 text-ink-1 underline-offset-2 hover:underline" onClick={() => void resend()}>
              {t('auth.resend')}
            </button>
          )}
          {mode === 'login' && (
            <button type="button" className="self-center rounded px-1 py-1 text-ink-1 underline-offset-2 hover:underline" onClick={() => go('signup')}>
              {t('auth.toSignup')}
            </button>
          )}
          {mode !== 'login' && (
            <button type="button" className="self-center rounded px-1 py-1 text-ink-3 underline-offset-2 hover:text-ink-1 hover:underline" onClick={() => go('login')}>
              {mode === 'code' ? t('auth.back') : t('auth.toLogin')}
            </button>
          )}
        </div>
        </div>
        <p className="mt-6 max-w-sm text-center font-display text-caption font-medium leading-relaxed text-white/85">{t('chat.empty.title')}</p>
      </div>
    </main>
  )
}
