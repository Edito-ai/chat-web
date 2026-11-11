import { useEffect, useRef, useState, type DragEvent } from 'react'
import clsx from 'clsx'
import { useRouter } from 'next/navigation'
import { BrandTile } from '@/components/BrandTile'
import { ArrowUpRight, Menu, PanelLeftOpen, SquarePen, X } from 'lucide-react'
import { useT, type MessageKey } from '@/i18n'
import { Button, IconButton, InlineError, Logo } from '@/components/ui'
import { useAuth } from '@/auth/authStore'
import { useAccount } from '@/account/accountStore'
import { AccountDialogs } from '@/account/components/AccountDialogs'
import { useChat, type ChatSendProblem } from './chatStore'
import type { ChatSuggestion } from './chatTypes'
import { activeAssistant, lastCompleted } from './chatState'
import { Bubble } from './Messages'
import { Composer } from './Composer'
import { useStyles } from './styles'
import { LibraryDialog } from './LibraryDialog'
import { Sidebar } from './Sidebar'
import { useNow } from './ActivityPanel'
import { FreeCreditBanner } from './FreeCreditBanner'
import { takeFreshStart } from './freshStart'
import { TID } from './testIds'
import { isSubscriptionRequired } from '@/account/lib/freeCredit'

const VIDEO_ACCEPT = 'video/*,.mp4,.mov,.avi,.mkv,.webm,.m4v'

const PROBLEM_KEY: Record<ChatSendProblem, MessageKey> = {
  noVideo: 'chat.problem.noVideo',
  noPrompt: 'chat.problem.noPrompt',
  uploading: 'chat.problem.uploading',
  uploadFailed: 'chat.problem.uploadFailed',
  twoReferences: 'chat.problem.twoReferences',
}

const EXAMPLES = [1, 2, 3, 4] as const

function EmptyState({ onPick }: { onPick: (prompt: string) => void }) {
  const { t } = useT()
  return (
    <div className="mx-auto flex min-h-full max-w-2xl flex-col items-center justify-center px-1 py-8 text-center">
      <BrandTile size={56} className="animate-rise" />
      <h2 className="mt-6 animate-rise font-display text-[1.65rem] font-bold leading-[1.18] tracking-[-0.02em] text-ink-0 [animation-delay:40ms] sm:text-[2.2rem]">
        {t('chat.empty.title')}
      </h2>
      <p className="mt-3 max-w-md animate-rise text-prose text-ink-2 [animation-delay:80ms]">{t('chat.empty.sub')}</p>
      <ul className="mt-8 grid w-full animate-rise gap-2.5 text-left [animation-delay:140ms] sm:grid-cols-2">
        {EXAMPLES.map((n) => (
          <li key={n}>
            <button
              type="button"
              data-testid={`chat-example-${n}`}
              aria-label={t(`chat.example.${n}.title` as MessageKey)}
              onClick={() => onPick(t(`chat.example.${n}.prompt` as MessageKey))}
              className="group flex h-full w-full flex-col gap-1 rounded-2xl border border-white/10 text-left bg-surface-1/60 px-4 py-3.5 backdrop-blur transition-all hover:-translate-y-px hover:border-accent-line hover:bg-surface-2/80"
            >
              <span className="flex items-center justify-between gap-2 text-body font-semibold text-ink-0">
                {t(`chat.example.${n}.title` as MessageKey)}
                <ArrowUpRight size={14} aria-hidden className="shrink-0 text-accent opacity-0 transition-opacity group-hover:opacity-100" />
              </span>
              <span className="line-clamp-2 text-label text-ink-3 transition-colors group-hover:text-ink-2">{t(`chat.example.${n}.prompt` as MessageKey)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * Chat-style edit screen: a left sidebar with recent chats, and the conversation. Add footage, describe the edit,
 * watch what it is doing, get the video back with a player and Download, then send follow-ups. No timeline.
 */
export function ChatScreen() {
  const { t } = useT()
  const messages = useChat((s) => s.messages)
  const attachments = useChat((s) => s.attachments)
  const busy = useChat((s) => s.busy)
  const actionError = useChat((s) => s.actionError)
  const lostJobId = useChat((s) => s.pollLostJobId)
  const history = useChat((s) => s.history)
  const historyState = useChat((s) => s.historyState)
  const currentJobId = useChat((s) => s.jobId)
  const videoIds = useChat((s) => s.videoIds)
  const projectId = useChat((s) => s.projectId)
  const user = useAuth((s) => s.user)
  const openDialog = useAccount((s) => s.openDialog)
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
  const { attach, removeAttachment, toggleReference, attachReference, send, cancel, startFresh, newChat, clearActionError, loadHistory, openJob, pinChat, deleteChat } =
    useChat.getState()
  const loadStyles = useStyles((s) => s.load)
  const [text, setText] = useState('')
  const [problem, setProblem] = useState<ChatSendProblem | null>(null)
  const [dragging, setDragging] = useState(false)
  const [libraryOpen, setLibraryOpen] = useState(false)
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
  // While nothing is happening the empty box types example prompts: first the starter ideas, then follow-up changes.
  const hints = (messages.length === 0 ? EXAMPLES.map((n) => t(`chat.example.${n}.prompt` as MessageKey)) : ([1, 2, 3, 4] as const).map((n) => t(`chat.nudge.${n}` as MessageKey)))

  // Opening the app always starts a NEW chat. The previous one (even a job still running) stays in the sidebar:
  // open it from there. Once per page load, so a re-render or a sign-in later in the session never wipes a chat.
  useEffect(() => {
    if (!signedIn) return
    if (takeFreshStart()) startFresh()
    void loadHistory()
    void loadStyles()
  }, [startFresh, loadHistory, loadStyles, signedIn])

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

  /** A quick reply under an assistant message: open the picker, open the library, or send its words. */
  const onSuggest = (chip: ChatSuggestion) => {
    if (running || busy || !requireAuth()) return
    if (chip.action === 'upload') fileRef.current?.click()
    else if (chip.action === 'library') setLibraryOpen(true)
    else if (chip.prompt) void send(chip.prompt).then(setProblem)
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

  const renderSidebar = (inDrawer: boolean) => (
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
      onPin={(id, pinned) => void pinChat(id, pinned)}
      onDelete={(id) => void deleteChat(id)}
      onClose={() => (inDrawer ? setDrawer(false) : setCollapsedPersist(true))}
      drawer={inDrawer}
      user={user ? { name: user.name, email: user.email, isAdmin: user.isAdmin === true } : null}
      onSignOut={signOut}
    />
  )

  // A swipe to the left closes the drawer (Escape is handled above).
  const swipeX = useRef<number | null>(null)

  return (
    <div
      data-testid="chat-screen"
      data-calm={messages.length > 0}
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
      <aside className={clsx('hidden w-[17.5rem] shrink-0 border-r border-white/[0.08] bg-gradient-to-b from-white/[0.02] to-black/25 backdrop-blur-md md:block', collapsed && 'md:hidden')}>
        {renderSidebar(false)}
      </aside>

      {/* Mobile drawer */}
      {drawer && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label={t('nav.close')}
            className="absolute inset-0 animate-fade-in bg-black/65 backdrop-blur-[3px]"
            onClick={() => setDrawer(false)}
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label={t('nav.aria')}
            onTouchStart={(e) => {
              swipeX.current = e.touches[0]?.clientX ?? null
            }}
            onTouchEnd={(e) => {
              const start = swipeX.current
              const end = e.changedTouches[0]?.clientX
              swipeX.current = null
              if (start !== null && end !== undefined && start - end > 70) setDrawer(false)
            }}
            className="absolute inset-y-0 left-0 w-[min(21rem,88vw)] animate-drawer-in overflow-hidden rounded-r-3xl border-r border-white/15 bg-[linear-gradient(to_bottom,#0e0f12,#141519)] pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] shadow-[0_0_80px_rgb(0_0_0/0.75)]"
          >
            {renderSidebar(true)}
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
          <span className="md:hidden">
            <Logo size={24} />
          </span>
          <h1 className="hidden min-w-0 flex-1 truncate text-body font-medium text-ink-2 md:block md:pl-1">{t('chat.title')}</h1>
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
                {messages.map((m, i) => (
                  <Bubble key={m.id} msg={m} chips={i === messages.length - 1 && !running} onSuggest={onSuggest} />
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
              hints={hints}
              attachments={attachments}
              onRemoveAttachment={removeAttachment}
              onToggleReference={toggleReference}
              onAttachReference={(files) => (requireAuth() ? void attachReference(files) : undefined)}
              onAttachClick={() => (requireAuth() ? fileRef.current?.click() : undefined)}
              onLibraryClick={() => (requireAuth() ? setLibraryOpen(true) : undefined)}
              attachDisabled={busy || running}
              running={running}
              sendDisabled={sendDisabled}
              onSend={() => void submit()}
              onStop={() => void cancel()}
            />
            <p data-testid="chat-disclaimer" className="px-3 pt-0.5 text-center text-caption leading-snug text-ink-4">
              {t('chat.disclaimer.pre')}
              <button
                type="button"
                data-testid="chat-terms-link"
                onClick={() => openDialog('legal')}
                className="rounded underline decoration-white/25 underline-offset-2 transition-colors hover:text-ink-2 hover:decoration-white/50"
              >
                {t('chat.disclaimer.link')}
              </button>
              {t('chat.disclaimer.post')}
            </p>
          </div>
        </div>
      </div>

      {libraryOpen && (
        <LibraryDialog
          onClose={() => setLibraryOpen(false)}
          onPick={useChat.getState().attachFromLibrary}
          lockProjectId={videoIds.length > 0 || attachments.length > 0 ? (projectId ?? null) : null}
        />
      )}

      {/* Signed-in users get the dialogs from the profile menu; guests still need Terms to open from the disclaimer. */}
      {!user && <AccountDialogs />}

      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-50 grid place-items-center bg-surface-0/80 font-display text-heading text-ink-0 backdrop-blur-sm">
          {t('chat.dropHint')}
        </div>
      )}
    </div>
  )
}
