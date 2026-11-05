import { useEffect, useRef, useState, type DragEvent } from 'react'
import clsx from 'clsx'
import { useRouter } from 'next/navigation'
import { Menu, PanelLeftOpen, SquarePen, X } from 'lucide-react'
import { useT, useLocale, type MessageKey } from '@/i18n'
import { Button, IconButton, InlineError, Logo } from '@/components/ui'
import { useAuth } from '@/auth/authStore'
import { useChat, type ChatSendProblem } from './chatStore'
import { activeAssistant, lastCompleted } from './chatState'
import { Bubble } from './Messages'
import { Composer } from './Composer'
import { Sidebar } from './Sidebar'
import { useNow } from './ActivityPanel'
import { FreeCreditBanner } from './FreeCreditBanner'
import { TID } from './testIds'
import { useAccount } from '@/account/accountStore'
import { isSubscriptionRequired } from '@/account/lib/freeCredit'

const VIDEO_ACCEPT = 'video/*,.mp4,.mov,.avi,.mkv,.webm,.m4v'

const PROBLEM_KEY: Record<ChatSendProblem, MessageKey> = {
  noVideo: 'chat.problem.noVideo',
  noPrompt: 'chat.problem.noPrompt',
  uploading: 'chat.problem.uploading',
  uploadFailed: 'chat.problem.uploadFailed',
}

const EXAMPLES = [1, 2, 3, 4] as const

function EmptyState({ onPick }: { onPick: (prompt: string) => void }) {
  const { t } = useT()
  return (
    <div className="mx-auto flex min-h-full max-w-2xl flex-col items-center justify-center px-1 py-10 text-center">
      <h2 className="animate-rise font-serif text-display text-ink-0 sm:text-hero">{t('chat.empty.title')}</h2>
      <p className="mt-4 max-w-md animate-rise text-prose text-ink-3 [animation-delay:60ms]">{t('chat.empty.sub')}</p>
      <div className="mt-9 w-full animate-rise [animation-delay:120ms]">
        <p className="mb-3 text-caption font-medium uppercase tracking-[0.1em] text-ink-4">{t('chat.example.heading')}</p>
        <ul className="grid gap-2.5 sm:grid-cols-2">
          {EXAMPLES.map((n) => (
            <li key={n}>
              <button
                type="button"
                data-testid={`chat-example-${n}`}
                onClick={() => onPick(t(`chat.example.${n}.prompt` as MessageKey))}
                className="group flex h-full min-h-[76px] w-full flex-col items-start gap-1 rounded-2xl border border-line bg-surface-1/70 px-4 py-3 text-left transition-all hover:-translate-y-px hover:border-line-strong hover:bg-surface-2"
              >
                <span className="text-body font-medium text-ink-0">{t(`chat.example.${n}.title` as MessageKey)}</span>
                <span className="line-clamp-2 text-label text-ink-3 group-hover:text-ink-2">
                  {t(`chat.example.${n}.prompt` as MessageKey)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

/**
 * Chat-style edit screen: a left sidebar with recent chats, and the conversation. Add footage, describe the edit,
 * watch what it is doing, get the video back with a player and Download, then send follow-ups. No timeline.
 */
export function ChatScreen() {
  const { t, locale } = useT()
  const setLocale = useLocale((s) => s.setLocale)
  const messages = useChat((s) => s.messages)
  const attachments = useChat((s) => s.attachments)
  const busy = useChat((s) => s.busy)
  const actionError = useChat((s) => s.actionError)
  const lostJobId = useChat((s) => s.pollLostJobId)
  const history = useChat((s) => s.history)
  const historyState = useChat((s) => s.historyState)
  const currentJobId = useChat((s) => s.jobId)
  const user = useAuth((s) => s.user)
  const signOut = () => {
    useChat.getState().reset()
    useAuth.getState().logout()
  }
  const authStatus = useAuth((s) => s.status)
  const router = useRouter()
  const signedIn = authStatus === 'authenticated'
  /** Everyone sees the chat; doing anything with it needs an account, so send a visitor to log in. */
  const requireAuth = (): boolean => {
    if (signedIn) return true
    if (authStatus !== 'restoring') router.push('/login')
    return false
  }
  const { attach, removeAttachment, send, cancel, resume, newChat, clearActionError, loadHistory, openJob } = useChat.getState()
  const [text, setText] = useState('')
  const [problem, setProblem] = useState<ChatSendProblem | null>(null)
  const [dragging, setDragging] = useState(false)
  /** Mobile drawer / desktop collapse. */
  const [drawer, setDrawer] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const now = useNow(history.length > 0, 60_000)

  const running = activeAssistant(messages) !== null
  const hasVideo = lastCompleted(messages) !== null
  const uploading = attachments.some((a) => a.state === 'uploading')

  // Re-attach to a job that was running when the tab was closed, and fill the sidebar.
  useEffect(() => {
    if (signedIn) {
      void resume()
      void loadHistory()
    }
  }, [resume, loadHistory, signedIn])

  // The starter-credit offer: asked once per login, never polled; any failure just hides the banner.
  const loadFreeCredit = useAccount((s) => s.loadFreeCredit)
  const creditLoad = useAccount((s) => s.creditLoad)
  useEffect(() => {
    if (signedIn && creditLoad === 'idle') void loadFreeCredit()
  }, [signedIn, creditLoad, loadFreeCredit])

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem('edito.chat-web.sidebar') === 'closed')
    } catch {
      // storage blocked: stay open
    }
  }, [])
  const setCollapsedPersist = (v: boolean) => {
    setCollapsed(v)
    try {
      localStorage.setItem('edito.chat-web.sidebar', v ? 'closed' : 'open')
    } catch {
      // not persisted
    }
  }

  useEffect(() => {
    if (messages.length > 0 || attachments.length > 0) endRef.current?.scrollIntoView?.({ block: 'end' })
  }, [messages, attachments.length])

  useEffect(() => {
    if (!drawer) return
    const onKey = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && setDrawer(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawer])

  const submit = async () => {
    if (running || busy || !requireAuth()) return
    const prompt = text
    const p = await send(prompt)
    setProblem(p)
    if (p === null && prompt.trim()) setText('')
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    if (running || !requireAuth()) return
    void attach(Array.from(e.dataTransfer.files))
  }

  const startNew = () => {
    setDrawer(false)
    setText('')
    setProblem(null)
    void newChat().then(() => textareaRef.current?.focus())
  }
  const open = (jobId: string) => {
    setDrawer(false)
    setProblem(null)
    void openJob(jobId)
  }

  const sendDisabled = busy || running || uploading
  const needCredit = actionError !== null && isSubscriptionRequired(actionError)
  const showTopError = actionError !== null && lostJobId === null

  const sidebar = (
    <Sidebar
      items={history}
      loadState={historyState}
      signedIn={signedIn}
      restoring={authStatus === 'restoring'}
      activeJobId={currentJobId}
      now={now}
      disabled={busy}
      onNew={startNew}
      onOpen={open}
      onRetry={() => void loadHistory()}
      onClose={() => (drawer ? setDrawer(false) : setCollapsedPersist(true))}
      user={user ? { name: user.name, email: user.email, isAdmin: user.isAdmin === true } : null}
      onSignOut={signOut}
    />
  )

  return (
    <div
      data-testid="chat-screen"
      className="app-shell relative flex h-full w-full overflow-hidden text-ink-1"
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false)
      }}
      onDrop={onDrop}
    >
      {/* Desktop rail */}
      <aside className={clsx('hidden w-[17.5rem] shrink-0 border-r border-line bg-surface-1/60 md:block', collapsed && 'md:hidden')}>
        {sidebar}
      </aside>

      {/* Mobile drawer */}
      {drawer && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label={t('nav.close')}
            className="absolute inset-0 animate-rise bg-black/60 backdrop-blur-[2px]"
            onClick={() => setDrawer(false)}
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label={t('nav.aria')}
            className="absolute inset-y-0 left-0 w-[min(20rem,86vw)] animate-rise border-r border-line bg-surface-1 shadow-lift"
          >
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <FreeCreditBanner nudge={needCredit} />

        <header className="flex h-14 shrink-0 items-center gap-1 px-3 sm:gap-2 sm:px-4">
          <IconButton
            data-testid="chat-menu"
            icon={Menu}
            aria-label={t('nav.open')}
            onClick={() => setDrawer(true)}
            className="md:hidden"
          />
          {collapsed && (
            <IconButton
              data-testid="chat-expand"
              icon={PanelLeftOpen}
              aria-label={t('nav.expand')}
              onClick={() => setCollapsedPersist(false)}
              className="hidden md:inline-flex"
            />
          )}
          <div className={clsx('hidden', collapsed && 'md:block')}>
            <Logo />
          </div>
          <h1 className="min-w-0 flex-1 truncate font-serif text-heading text-ink-0 md:pl-1">{t('chat.title')}</h1>
          <Button
            data-testid="chat-new"
            variant="ghost"
            icon={SquarePen}
            disabled={busy}
            onClick={startNew}
            className={clsx(!collapsed && 'md:hidden')}
          >
            <span className="hidden sm:inline">{t('chat.new')}</span>
            <span className="sr-only sm:hidden">{t('chat.new')}</span>
          </Button>
          <select
            aria-label={t('lang.switch')}
            value={locale}
            onChange={(e) => setLocale(e.target.value === 'hi' ? 'hi' : 'en')}
            className="h-9 rounded-lg border border-line bg-surface-2 px-2 text-label text-ink-1"
          >
            <option value="en">EN</option>
            <option value="hi">हिं</option>
          </select>
          {signedIn ? null : authStatus === 'unauthenticated' ? (
            <>
              <Button data-testid="chat-login" variant="ghost" onClick={() => router.push('/login')}>
                {t('auth.loginShort')}
              </Button>
              <Button data-testid="chat-register" variant="primary" onClick={() => router.push('/register')}>
                {t('auth.register')}
              </Button>
            </>
          ) : null}
        </header>

        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto min-h-full w-full max-w-3xl px-4 py-4">
            {messages.length === 0 ? (
              <EmptyState
                onPick={(prompt) => {
                  setText(prompt)
                  setProblem(null)
                  textareaRef.current?.focus()
                }}
              />
            ) : (
              <ol data-testid="chat-log" role="log" aria-label={t('chat.log.aria')} className="space-y-6 pb-4">
                {messages.map((m) => (
                  <Bubble key={m.id} msg={m} />
                ))}
              </ol>
            )}
            <div ref={endRef} />
          </div>
        </div>

        <div className="shrink-0 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 sm:px-4">
          <div className="mx-auto w-full max-w-3xl space-y-2">
            {showTopError && (
              <div className="flex items-start justify-between gap-2">
                {needCredit ? (
                  <p role="alert" data-testid={TID.needCredit} className="text-label text-danger">
                    {t('chat.needCredit')}
                  </p>
                ) : (
                  <InlineError error={actionError} />
                )}
                <IconButton size="sm" icon={X} aria-label={t('common.close')} onClick={clearActionError} />
              </div>
            )}
            {problem && <InlineError message={t(PROBLEM_KEY[problem])} />}
            <input
              ref={fileRef}
              data-testid="chat-file-input"
              type="file"
              multiple
              accept={VIDEO_ACCEPT}
              hidden
              onChange={(e) => {
                if (e.target.files && requireAuth()) void attach(Array.from(e.target.files))
                e.target.value = ''
              }}
            />
            <Composer
              text={text}
              onText={(v) => {
                setText(v)
                if (problem) setProblem(null)
              }}
              textareaRef={textareaRef}
              placeholder={t(hasVideo ? 'chat.composer.placeholderFollowUp' : 'chat.composer.placeholder')}
              attachments={attachments}
              onRemoveAttachment={removeAttachment}
              onAttachClick={() => (requireAuth() ? fileRef.current?.click() : undefined)}
              attachDisabled={busy || running}
              running={running}
              sendDisabled={sendDisabled}
              onSend={() => void submit()}
              onStop={() => void cancel()}
            />
          </div>
        </div>
      </div>

      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-50 grid place-items-center bg-surface-0/80 font-serif text-display text-ink-0 backdrop-blur-sm">
          {t('chat.dropHint')}
        </div>
      )}
    </div>
  )
}
