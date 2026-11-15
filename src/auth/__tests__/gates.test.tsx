// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const replace = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, push: vi.fn() }) }))
vi.mock('@/chat/ChatScreen', () => ({ ChatScreen: () => <div data-testid="chat-screen" /> }))
vi.mock('../useSession', () => ({ useSession: () => useAuth.getState().status }))

import { HomeGate } from '@/app/HomeGate'
import { LoginGate } from '@/app/LoginGate'
import { useAccess } from '../access'
import { useAuth } from '../authStore'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root
const $ = (id: string) => host.querySelector(`[data-testid="${id}"]`)
const PENDING = { signupToken: 'a.' + btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3000 })) + '.b', email: 'n@u.com', name: null, via: 'email' as const }
const SIGNED_IN = { status: 'authenticated' as const, accessToken: 't', refreshToken: 'r', pendingSignup: null, celebration: null }

beforeEach(() => {
  replace.mockClear()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  useAccess.setState({ status: 'approved', checked: true })
  vi.stubGlobal('fetch', async () => new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } }))
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

describe('HomeGate', () => {
  it('shows the chat to a signed-in person who has done the onboarding', async () => {
    useAuth.setState({ ...SIGNED_IN, user: { id: 'u', email: 'a@b.c', name: 'A', needsOnboarding: false } })
    await act(async () => root.render(<HomeGate />))
    expect($('chat-screen')).not.toBeNull()
    expect($('onboarding')).toBeNull()
  })

  it('shows the onboarding first to an account that never did it (before the access check, so finishing can approve it)', async () => {
    useAccess.setState({ status: 'pending', checked: true })
    useAuth.setState({ ...SIGNED_IN, user: { id: 'u', email: 'a@b.c', name: 'A', needsOnboarding: true } })
    await act(async () => root.render(<HomeGate />))
    expect($('onboarding')).not.toBeNull()
    expect($('chat-screen')).toBeNull()
  })

  it('keeps the party popup on screen after onboarding, even though the account no longer needs it', async () => {
    useAuth.setState({ ...SIGNED_IN, user: { id: 'u', email: 'a@b.c', name: 'A', needsOnboarding: false }, celebration: { status: 'granted', usd: 1, tokens: 750000 } })
    await act(async () => root.render(<HomeGate />))
    expect($('onboarding-done')).not.toBeNull()
    expect($('chat-screen')).toBeNull()
    await act(async () => void useAuth.getState().dismissCelebration())
    expect($('chat-screen')).not.toBeNull()
  })

  it('a visitor who is not signed in still sees the chat', async () => {
    useAuth.setState({ status: 'unauthenticated', user: null, accessToken: null, refreshToken: null, pendingSignup: null, celebration: null })
    await act(async () => root.render(<HomeGate />))
    expect($('chat-screen')).not.toBeNull()
  })
})

describe('LoginGate', () => {
  it('a confirmed address with no account goes to the onboarding, not back to the chat', async () => {
    useAuth.setState({ status: 'unauthenticated', user: null, accessToken: null, refreshToken: null, pendingSignup: PENDING, celebration: null })
    await act(async () => root.render(<LoginGate />))
    expect($('onboarding')).not.toBeNull()
    expect(replace).not.toHaveBeenCalled()
  })

  it('a session goes back to the chat at / , but only after the popup was closed', async () => {
    useAuth.setState({ ...SIGNED_IN, user: { id: 'u', email: 'a@b.c', name: 'A' }, celebration: { status: 'off', usd: 0, tokens: 0 } })
    await act(async () => root.render(<LoginGate />))
    expect($('onboarding-done')).not.toBeNull()
    expect(replace).not.toHaveBeenCalled()
    await act(async () => void useAuth.getState().dismissCelebration())
    expect(replace).toHaveBeenCalledWith('/')
  })

  it('signed out with nothing pending shows the sign-in screen', async () => {
    useAuth.setState({ status: 'unauthenticated', user: null, accessToken: null, refreshToken: null, pendingSignup: null, celebration: null })
    await act(async () => root.render(<LoginGate />))
    expect($('auth-title')).not.toBeNull()
  })
})
