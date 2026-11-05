'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/auth/authStore'
import { setAccountApi, type AccountApi } from '@/account/accountApi'
import { ApiError } from '@/lib/apiClient'
import type { FreeCreditStatus } from '@/account/types'
import { useAccount, type AccountDialog } from '@/account/accountStore'
import { accountFixtureApi, isAccountScenario } from './accountFixtures'
import { setChatApi } from '@/chat/chatApi'
import { stopPolling, useChat } from '@/chat/chatStore'
import { ChatScreen } from '@/chat/ChatScreen'
import { markFreshStartDone } from '@/chat/freshStart'
import { setHistoryApi } from '@/chat/history'
import type { ChatJobWire } from '@/chat/chatApi'
import type { ActivityEvent, ChatAssistantMessage, ChatMessage } from '@/chat/chatTypes'

const MIN = 60_000
const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString()

const jobs: ChatJobWire[] = [
  { id: 'p-run', state: 'rendering', title: 'Make a punchy 45-second reel with bold captions', createdAt: iso(4 * MIN), updatedAt: iso(5_000) },
  { id: 'p-done', state: 'complete', title: 'Cut the pauses and filler words', createdAt: iso(3 * 60 * MIN), updatedAt: iso(2 * 60 * MIN) },
  { id: 'p-fail', state: 'failed', title: 'Hinglish captions with highlighted keywords', createdAt: iso(26 * 60 * MIN), updatedAt: iso(25 * 60 * MIN) },
  { id: 'p-w1', state: 'complete', title: 'Best moments of the podcast as a 30 second highlight', createdAt: iso(3 * 24 * 60 * MIN), updatedAt: iso(3 * 24 * 60 * MIN) },
  { id: 'p-w2', state: 'complete', title: 'Travel vlog intro with a cinematic grade', createdAt: iso(5 * 24 * 60 * MIN), updatedAt: iso(5 * 24 * 60 * MIN) },
  { id: 'p-o1', state: 'complete', title: 'Product demo with zoom-ins', createdAt: iso(20 * 24 * 60 * MIN), updatedAt: iso(20 * 24 * 60 * MIN) },
]

const t0 = Date.now() - 6 * MIN - 12_000
const timings = [
  { state: 'analyzing', stage: 'understanding', at: t0 },
  { state: 'planning', stage: 'director', at: t0 + 2 * MIN + 41_000 },
  { state: 'assembling', stage: 'save', at: t0 + 4 * MIN + 5_000 },
  { state: 'rendering', stage: 'render', at: t0 + 4 * MIN + 20_000 },
]

const user = (id: string, text: string): ChatMessage => ({ id, role: 'user', text, attachments: id === 'u1' ? ['interview_cam_a.mp4'] : [] })
const asst = (over: Partial<ChatAssistantMessage>): ChatAssistantMessage => ({
  id: 'a1', role: 'assistant', jobId: 'p-run', turn: 1, status: 'running', stage: 'rendering', progress: 0.82,
  message: 'Rendering your video', reply: null, result: null, error: null, timings, startedAt: t0, ...over,
})
const sample = 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4'

const act = (id: string, kind: ActivityEvent['kind'], title: string, startSec: number, endSec: number | null, over: Partial<ActivityEvent> = {}): ActivityEvent => ({
  id, kind, title, detail: null, state: endSec === null ? 'running' : 'done', at: t0 + startSec * 1000, endedAt: endSec === null ? null : t0 + endSec * 1000, ...over,
})
const finishedActivity: ActivityEvent[] = [
  act('thought:review', 'thought', 'Reviewing your footage and your request', 0, 0),
  act('say:reading', 'say', 'I am reading your 2 videos first, then I will plan the edit from your request.', 1, 1),
  act('tool:understanding:1', 'tool', 'Reading your footage (1/2)', 1, 70),
  act('tool:understanding:2', 'tool', 'Reading your footage (2/2)', 70, 161),
  act('say:planning', 'say', 'I have read your 2 videos and I am planning the edit now.', 161, 161),
  act('thought:plan', 'thought', 'Planning the edit', 162, 162),
  act('tool:step:director', 'tool', 'Choosing the moments to keep', 162, 240),
  act('tool:step:captions', 'tool', 'Writing the captions', 240, 285),
  act('tool:step:look', 'tool', 'Grading the colour', 285, 300, { detail: 'Warm, lifted shadows' }),
  act('say:plan-ready', 'say', 'The plan came together in 6 steps. Next I will get your video ready.', 300, 300),
  act('tool:save', 'tool', 'Getting your video ready', 301, 312),
  act('tool:render', 'tool', 'Rendering your video', 313, 1050, { detail: '1080p' }),
  act('say:rendered', 'say', 'The video rendered in 737 s at 1080p. This draft does not include background music.', 1050, 1050),
]
const runningActivity: ActivityEvent[] = [
  act('thought:change', 'thought', 'Working out what to change', 0, 0),
  act('tool:followup', 'tool', 'Applying your change', 1, 9),
  act('say:followup', 'say', 'Applying your change. Made the captions bigger.', 9, 9),
  act('tool:save', 'tool', 'Getting your video ready', 10, 15),
  act('tool:render', 'tool', 'Rendering your video', 16, null, { detail: '1080p' }),
]

function seed(s: string) {
  const base = { projectId: 'proj', jobId: 'p-run', canFollowUp: false, videoIds: ['v'], attachments: [], busy: false, actionError: null, pollLostJobId: null }
  const prompt = 'Make a punchy 45-second reel with bold captions and fast cuts.'
  const done = asst({
    status: 'complete', stage: null, progress: 1, durationSec: 1056, finishedAt: t0 + 1_056_000,
    reply: 'Your video is ready. This draft does not include background music, sound effects and some graphics.',
    result: { videoUrl: sample, downloadUrl: sample, fileName: 'Punchy reel.mp4' },
  })
  if (s === 'transcript') {
    const now = Date.now()
    const follow = asst({
      id: 'a2', turn: 2, jobId: 'p-run', stage: 'rendering', startedAt: now - 30_000, timings: undefined, progress: 0.7,
      activity: runningActivity.map((e) => ({ ...e, at: now - 30_000 + (e.at - t0), endedAt: e.endedAt === null ? null : now - 30_000 + (e.endedAt - t0) })),
    })
    return { ...base, messages: [user('u1', prompt), { ...done, activity: finishedActivity }, user('u2', 'Make the captions bigger.'), follow] }
  }
  if (s === 'empty') return { ...base, messages: [], jobId: null, projectId: null }
  if (s === 'done') return { ...base, messages: [user('u1', prompt), done], canFollowUp: true }
  if (s === 'failed')
    return {
      ...base,
      messages: [user('u1', prompt), asst({ status: 'failed', stage: null, progress: 0.4, timings: timings.slice(0, 2), finishedAt: t0 + 3 * MIN, error: 'The render worker ran out of memory on the 4K clip. Try a shorter video.' })],
    }
  return { ...base, messages: [user('u1', prompt), asst({})] }
}

/** Free-credit banner scenarios; the claim call is faked per scenario (type +91 98765 43210, press Claim). */
const CREDIT_SCENARIOS = ['credit-unclaimed', 'credit-claiming', 'credit-error', 'credit-success', 'credit-402']
const offer: FreeCreditStatus = { enabled: true, claimed: false, tokens: 1_500_000, usd: 2, phoneMasked: null }

function creditApi(s: string): Partial<AccountApi> {
  return {
    entitlement: async () => null,
    freeCredit: async () => offer,
    claimFreeCredit: async () => {
      if (s === 'credit-claiming') return new Promise<FreeCreditStatus>(() => undefined)
      if (s === 'credit-error') throw new ApiError(409, '409 This phone number already received the free credit. Email hello@trybroll.com if this is a mistake.')
      return { ...offer, claimed: true, phoneMasked: '+91 98xxxxxx10' }
    },
  }
}

/** Seeds the chat store + fake APIs so the logged-in screens can be looked at. Dev only. */
export function PreviewClient({ scenario, open }: { scenario: string; open?: string }) {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    stopPolling()
    setChatApi({
      createJob: async () => { throw new Error('preview') },
      followUp: async () => { throw new Error('preview') },
      getJob: () => new Promise(() => undefined),
      cancelJob: async () => { throw new Error('preview') },
    })
    setHistoryApi({ list: async () => jobs, get: async () => { throw new Error('preview') } })
    const acct = isAccountScenario(scenario)
    const credit = CREDIT_SCENARIOS.includes(scenario)
    setAccountApi(acct ? accountFixtureApi(scenario) : credit ? creditApi(scenario) : null)
    useAccount.getState().reset()
    markFreshStartDone() // the seeded chat is the point of the preview
    useAuth.setState({ status: 'authenticated', user: { id: 'preview', email: 'preview@example.com', name: 'Preview', isAdmin: acct } })
    useChat.setState({ ...seed(acct ? 'done' : credit ? 'empty' : scenario), userId: 'preview', history: [], historyState: 'idle' })
    if (scenario === 'credit-402') {
      useChat.setState({ actionError: new ApiError(402, '402 An active subscription or Weekly Pass is required to use AI features.', { reason: 'subscription_required' }) })
    }
    if (acct && ['usage', 'billing', 'help', 'legal'].includes(open ?? '')) useAccount.getState().openDialog(open as AccountDialog)
    setReady(true)
    const clean = () => {
      try {
        localStorage.removeItem('edito.chat-web.auth.v1')
        localStorage.removeItem('edito.chat-web.chat.v1')
      } catch {
        // nothing to clean
      }
    }
    window.addEventListener('pagehide', clean)
    return () => {
      window.removeEventListener('pagehide', clean)
      clean()
      stopPolling()
      setChatApi(null)
      setHistoryApi(null)
      setAccountApi(null)
      useAccount.getState().reset()
    }
  }, [scenario, open])
  return ready ? <ChatScreen /> : null
}
