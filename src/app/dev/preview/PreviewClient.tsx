'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/auth/authStore'
import { setAccountApi } from '@/account/accountApi'
import { useAccount, type AccountDialog } from '@/account/accountStore'
import { accountFixtureApi, isAccountScenario } from './accountFixtures'
import { setChatApi } from '@/chat/chatApi'
import { stopPolling, useChat } from '@/chat/chatStore'
import { ChatScreen } from '@/chat/ChatScreen'
import { setHistoryApi } from '@/chat/history'
import type { ChatJobWire } from '@/chat/chatApi'
import type { ChatAssistantMessage, ChatMessage } from '@/chat/chatTypes'

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

function seed(s: string) {
  const base = { projectId: 'proj', jobId: 'p-run', canFollowUp: false, videoIds: ['v'], attachments: [], busy: false, actionError: null, pollLostJobId: null }
  const prompt = 'Make a punchy 45-second reel with bold captions and fast cuts.'
  const done = asst({
    status: 'complete', stage: null, progress: 1, durationSec: 1056, finishedAt: t0 + 1_056_000,
    reply: 'Your video is ready. This draft does not include background music, sound effects and some graphics.',
    result: { videoUrl: sample, downloadUrl: sample, fileName: 'Punchy reel.mp4' },
  })
  if (s === 'empty') return { ...base, messages: [], jobId: null, projectId: null }
  if (s === 'done') return { ...base, messages: [user('u1', prompt), done], canFollowUp: true }
  if (s === 'failed')
    return {
      ...base,
      messages: [user('u1', prompt), asst({ status: 'failed', stage: null, progress: 0.4, timings: timings.slice(0, 2), finishedAt: t0 + 3 * MIN, error: 'The render worker ran out of memory on the 4K clip. Try a shorter video.' })],
    }
  return { ...base, messages: [user('u1', prompt), asst({})] }
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
    setAccountApi(acct ? accountFixtureApi(scenario) : null)
    useAccount.getState().reset()
    useAuth.setState({ status: 'authenticated', user: { id: 'preview', email: 'preview@example.com', name: 'Preview', isAdmin: acct } })
    useChat.setState({ ...seed(acct ? 'done' : scenario), userId: 'preview', history: [], historyState: 'idle' })
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
