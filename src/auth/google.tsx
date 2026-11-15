'use client'

import { useEffect, useRef, useState } from 'react'
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

/**
 * Google's own "Continue with Google" button (it must be Google's: that is what hands over a signed ID token). Shows nothing when
 * no client id is set or the script cannot load, so the email code is always there as the way in.
 */
export function GoogleButton({ onCredential, width = 300, disabled = false }: { onCredential: (idToken: string) => void; width?: number; disabled?: boolean }) {
  const box = useRef<HTMLDivElement | null>(null)
  const [ready, setReady] = useState(false)
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
        setReady(true)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [width])

  if (!GOOGLE_CLIENT_ID) return null
  return (
    <div
      data-testid="auth-google"
      aria-hidden={!ready}
      className={`flex justify-center transition-opacity ${ready ? 'opacity-100' : 'h-0 opacity-0'} ${disabled ? 'pointer-events-none opacity-50' : ''}`}
    >
      <div ref={box} />
    </div>
  )
}
