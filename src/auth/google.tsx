'use client'

import { useEffect, useRef, useState } from 'react'
import { useT } from '@/i18n'
import { GOOGLE_CLIENT_ID } from '@/lib/env'

/** The slice of Google Identity Services this app uses (https://accounts.google.com/gsi/client). */
interface GoogleId {
  initialize: (cfg: { client_id: string; callback: (r: { credential?: string }) => void; use_fedcm_for_prompt?: boolean }) => void
  renderButton: (el: HTMLElement, opts: Record<string, unknown>) => void
}
declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } }
  }
}

const SRC = 'https://accounts.google.com/gsi/client'
let loading: Promise<void> | null = null

/** Loads Google's script once. Rejects when it is blocked or offline: the button then simply does not show. */
export function loadGoogleScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'))
  if (window.google?.accounts?.id) return Promise.resolve()
  loading ??= new Promise<void>((resolve, reject) => {
    const el = document.createElement('script')
    el.src = SRC
    el.async = true
    el.defer = true
    el.onload = () => resolve()
    el.onerror = () => {
      loading = null
      el.remove()
      reject(new Error('Google could not be loaded'))
    }
    document.head.appendChild(el)
  })
  return loading
}

function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z" />
    </svg>
  )
}

/**
 * "Continue with Google". With a client id it is Google's own button (it must be Google's: that is what hands over a signed ID
 * token). Without one, or when Google's script cannot load, the same-looking button is still there and says why it does not work,
 * instead of leaving a gap: the email code below it is always the way in.
 */
export function GoogleButton({ onCredential, width = 300, disabled = false }: { onCredential: (idToken: string) => void; width?: number; disabled?: boolean }) {
  const { t } = useT()
  const box = useRef<HTMLDivElement | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [said, setSaid] = useState<string | null>(null)
  const cb = useRef(onCredential)
  cb.current = onCredential

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return
    let alive = true
    loadGoogleScript()
      .then(() => {
        const id = window.google?.accounts?.id
        if (!alive || !id || !box.current) return
        id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: (r) => r.credential && cb.current(r.credential) })
        id.renderButton(box.current, { type: 'standard', theme: 'filled_black', size: 'large', shape: 'pill', text: 'continue_with', logo_alignment: 'left', width })
        setState('ready')
      })
      .catch(() => alive && setState('failed'))
    return () => {
      alive = false
    }
  }, [width])

  const real = GOOGLE_CLIENT_ID !== ''
  return (
    <div data-testid="auth-google" className="space-y-2">
      {real && (
        <div className={`flex justify-center transition-opacity ${state === 'ready' ? 'opacity-100' : 'hidden'} ${disabled ? 'pointer-events-none opacity-50' : ''}`}>
          <div ref={box} />
        </div>
      )}
      {(!real || state !== 'ready') && (
        <>
          <button
            type="button"
            data-testid="auth-google-button"
            disabled={disabled}
            aria-busy={real && state === 'loading'}
            onClick={() => setSaid(t(real && state === 'failed' ? 'auth.google.blocked' : 'auth.google.notSetUp'))}
            className="inline-flex h-11 w-full items-center justify-center gap-3 rounded-full border border-white/15 bg-white/[0.06] px-4 text-body font-semibold text-ink-0 transition-colors hover:bg-white/[0.11] disabled:opacity-50"
          >
            <GoogleLogo />
            {t('auth.google')}
          </button>
          {said && (
            <p role="status" data-testid="auth-google-note" className="text-center text-label text-ink-3">
              {said}
            </p>
          )}
        </>
      )}
    </div>
  )
}
