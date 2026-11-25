import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import clsx from 'clsx'
import { useRouter } from 'next/navigation'
import { Menu, PanelLeftOpen, SquarePen, X } from 'lucide-react'
import { useT, type MessageKey } from '@/i18n'
import { Button, IconButton, InlineError, Logo } from '@/components/ui'
import { useAuth } from '@/auth/authStore'
import { AccountDialogs } from '@/account/components/AccountDialogs'
import { openQuestion, useChat, type ChatSendProblem } from './chatStore'
import type { ChatSuggestion } from './chatTypes'
import { activeAssistant, lastCompleted } from './chatState'
import { Bubble } from './Messages'
import { ArtifactPanel } from './ArtifactPanel'
import { useArtifactPanel } from './artifactStore'
import { listArtifacts, opensByItself } from './artifacts'
import { Composer } from './Composer'
import { LibraryPage } from './LibraryPage'
import { Sidebar } from './Sidebar'
import { useNow } from './ActivityPanel'
import { NeedPlanNotice } from './NeedPlanNotice'
import { takeFreshStart } from './freshStart'
import { TID } from './testIds'
import { isSubscriptionRequired } from '@/account/lib/freeCredit'
import { ProductTour } from '@/tour/ProductTour'
import { PluginAnnouncement } from '@/announce/PluginAnnouncement'
import { useAutoStartTour } from '@/tour/useAutoStartTour'
import { useTour, useTourWants } from '@/tour/tourStore'

const VIDEO_ACCEPT = 'video/*,.mp4,.mov,.avi,.mkv,.webm,.m4v'
/** A logo or photo to place in the video (see the picture placement in backend2). */
const PICTURE_ACCEPT = 'image/*,.jpg,.jpeg,.png,.webp'

const PROBLEM_KEY: Record<ChatSendProblem, MessageKey> = {
  noVideo: 'chat.problem.noVideo',
  noPrompt: 'chat.problem.noPrompt',
  uploading: 'chat.problem.uploading',
  uploadFailed: 'chat.problem.uploadFailed',
}

const EXAMPLES = [1, 2, 3, 4] as const

/**
 * Chat-style edit screen: a left sidebar with recent chats, and the conversation. Add footage, describe the edit,
 * watch what it is doing, get the video back with a player and Download, then send follow-ups. No timeline.
 */
export function ChatScreen() {
  const { t } = useT()
  const messages = useChat((s) => s.messages)
  const attachments = useChat((s) => s.attachments)
  const pictures = useChat((s) => s.pictures)
  const placementJobId = useChat((s) => s.placementJobId)
  const busy = useChat((s) => s.busy)
  const actionError = useChat((s) => s.actionError)
  const lostJobId = useChat((s) => s.pollLostJobId)
  const history = useChat((s) => s.history)
  const historyState = useChat((s) => s.historyState)
  const currentJobId = useChat((s) => s.jobId)
  const remote = useChat((s) => s.remote)
  const queued = useChat((s) => s.queue)
  const projectId = useChat((s) => s.projectId)
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
  const { attach, removeAttachment, removePicture, send, cancel, startFresh, newChat, clearActionError, loadHistory, openJob, pinChat, deleteChat } =
    useChat.getState()
  const [text, setText] = useState('')
  const [problem, setProblem] = useState<ChatSendProblem | null>(null)
  const [dragging, setDragging] = useState(false)
  /** The main area shows the chat, or the Library page opened from the sidebar. */
  const [view, setView] = useState<'chat' | 'library'>('chat')
  /** Mobile drawer / desktop collapse. */
  const [drawer, setDrawer] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const now = useNow(history.length > 0, 60_000)

  // First-run product tour: it may open the drawer (phones) or the collapsed sidebar (desktop) to point at what is in it.
  useAutoStartTour()
  const touring = useTour((s) => s.active)
  const tourIndex = useTour((s) => s.index)
  const tourDrawer = useTourWants('drawer')
  const tourSidebar = useTourWants('sidebar')
  const railHidden = collapsed && !tourSidebar
  // The tour starts from a clean screen: the chat, with the drawer shut (it may be replayed from the account menu in the drawer).
  useEffect(() => {
    if (!touring) return
    setDrawer(false)
  }, [touring])
  // Every step starts on the chat (the person may have opened the Library from the tour's Library step).
  useEffect(() => {
    if (touring) setView('chat')
  }, [touring, tourIndex])
  // While a tour step wants the drawer it stays open, even if something in it closes it (New chat, a chat row).
  const drawerOpen = drawer || tourDrawer

  // (the "typing" bubble shown while a message is being sent has no job yet: nothing is running)
  const active = activeAssistant(messages)
  const running = active !== null && active.jobId !== ''
  // What the chat made lives in the side panel; the chat keeps a small button for each.
  const artifacts = useMemo(() => listArtifacts(messages), [messages])
  const artifactById = useMemo(() => new Map(artifacts.map((a) => [a.id, a])), [artifacts])
  const openId = useArtifactPanel((s) => s.openId)
  const latest = artifacts[artifacts.length - 1] ?? null
  const latestKey = latest ? `${latest.id}:${latest.kind}` : ''
  const seenKey = useRef<{ job: string | null; key: string }>({ job: null, key: '' })
  // A new thing (a finished video, a look or frames waiting for a choice) opens by itself. Switching to another chat does not
  // open its old things, and closes the panel.
  useEffect(() => {
    const prev = seenKey.current
    seenKey.current = { job: currentJobId, key: latestKey }
    if (prev.job !== currentJobId) {
      useArtifactPanel.getState().close()
      return
    }
    if (latest && latestKey !== prev.key && opensByItself(latest.kind)) useArtifactPanel.getState().open(latest.id)
  }, [currentJobId, latestKey, latest])
  // the open thing went away (a new chat, a delete): shut the panel
  useEffect(() => {
    if (openId && !artifactById.has(openId)) useArtifactPanel.getState().close()
  }, [openId, artifactById])
  const empty = messages.length === 0
  const library = view === 'library'
  const hasVideo = lastCompleted(messages) !== null
  const uploading = attachments.some((a) => a.state === 'uploading') || pictures.some((p) => p.state === 'uploading')
  // While the job asks where a picture goes, or the backend asks a question, the box takes the answer (the job is still running, but not blocked)
  const asking = !remote && openQuestion(messages) !== null
  const sendBlocked = running && placementJobId === null && !asking
  // While nothing is happening the empty box types example prompts: first the starter ideas, then follow-up changes.
  const hints = (messages.length === 0 ? EXAMPLES.map((n) => t(`chat.example.${n}.prompt` as MessageKey)) : ([1, 2, 3, 4] as const).map((n) => t(`chat.nudge.${n}` as MessageKey)))

  // Opening the app always starts a NEW chat. The previous one (even a job still running) stays in the sidebar:
  // open it from there. Once per page load, so a re-render or a sign-in later in the session never wipes a chat.
  useEffect(() => {
    if (!signedIn) return
    if (takeFreshStart()) startFresh()
    void loadHistory()
  }, [startFresh, loadHistory, signedIn])

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

  // Follow the newest message only while the person is already at the bottom (or has just sent something). Reading back up
  // the chat is not yanked down every time a step updates.
  const logRef = useRef<HTMLDivElement | null>(null)
  const atBottom = useRef(true)
  const onLogScroll = () => {
    const el = logRef.current
    if (el) atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 160
  }
  useEffect(() => {
    const last = messages[messages.length - 1]
    const sentNow = last?.role === 'user'
    if (sentNow) atBottom.current = true
    if ((messages.length > 0 || attachments.length > 0) && (atBottom.current || sentNow)) {
      endRef.current?.scrollIntoView?.({ block: 'end' })
    }
  }, [messages, attachments.length])

  useEffect(() => {
    if (!drawer) return
    const onKey = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && setDrawer(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawer])

  /** `whenBusy`: while a turn runs, queue the message or stop the turn and send it instead. */
  const submit = async (whenBusy?: 'queue' | 'interrupt') => {
    if (busy || !requireAuth()) return
    if (sendBlocked && !whenBusy) return
    const prompt = text
    // the box empties at once, like any chat; the words come back if the message could not be sent
    if (prompt.trim()) setText('')
    const p = await send(prompt, sendBlocked ? whenBusy : undefined)
    setProblem(p)
    if ((p !== null || useChat.getState().actionError !== null) && prompt.trim()) setText((cur) => cur || prompt)
  }
  const { editMessage, retryTurn, removeQueued } = useChat.getState()
  const lastUserId = [...messages].reverse().find((m) => m.role === 'user')?.id
  const lastAssistantId = [...messages].reverse().find((m) => m.role === 'assistant')?.id

  /** A quick reply under an assistant message: open the picker, open the library, or send its words. */
  const onSuggest = (chip: ChatSuggestion) => {
    if (running || busy || !requireAuth()) return
    if (chip.action === 'upload') fileRef.current?.click()
    else if (chip.action === 'library') setView('library')
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
    setView('chat')
    setText('')
    setProblem(null)
    void newChat().then(() => textareaRef.current?.focus())
  }
  const open = (jobId: string) => {
    setDrawer(false)
    setView('chat')
    setProblem(null)
    void openJob(jobId)
  }

  const sendDisabled = busy || sendBlocked || uploading
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
      onLibrary={() => {
        setDrawer(false)
        if (requireAuth()) setView('library')
      }}
      libraryActive={view === 'library'}
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
      <aside className={clsx('hidden w-[17.5rem] shrink-0 border-r border-white/[0.06] bg-[#050505] md:block', railHidden && 'md:hidden')}>
        {renderSidebar(false)}
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
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
            className="absolute inset-y-0 left-0 w-[min(21rem,88vw)] animate-drawer-in overflow-hidden rounded-r-3xl border-r border-white/15 bg-surface-1 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] shadow-[0_0_80px_rgb(0_0_0/0.75)]"
          >
            {renderSidebar(true)}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <NeedPlanNotice show={needCredit} />

        <header className="flex h-14 shrink-0 items-center gap-1 border-b border-white/[0.06] px-3 sm:gap-2 sm:px-5">
          <IconButton
            data-testid="chat-menu"
            icon={Menu}
            aria-label={t('nav.open')}
            onClick={() => setDrawer(true)}
            className="md:hidden"
          />
          {railHidden && (
            <IconButton
              data-testid="chat-expand"
              icon={PanelLeftOpen}
              aria-label={t('nav.expand')}
              onClick={() => setCollapsedPersist(false)}
              className="hidden md:inline-flex"
            />
          )}
          <div className={clsx('hidden', railHidden && 'md:block')}>
            <Logo />
          </div>
          <span className="md:hidden">
            <Logo size={24} />
          </span>
          <h1 className="hidden min-w-0 flex-1 truncate text-body font-medium text-ink-2 md:block md:pl-1">{t(library ? 'nav.library' : 'chat.title')}</h1>
          <Button
            data-testid="chat-new"
            variant="ghost"
            icon={SquarePen}
            disabled={busy}
            onClick={startNew}
            className={clsx(!railHidden && 'md:hidden')}
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

        {library && (
          <LibraryPage
            // a chat's earlier footage does not lock the library: only what is picked for the next message does
            lockProjectId={attachments.length > 0 ? (projectId ?? null) : null}
            onPick={(items) => {
              useChat.getState().attachFromLibrary(items)
              setView('chat')
              requestAnimationFrame(() => textareaRef.current?.focus())
            }}
          />
        )}

        {!library && !empty && (
          <div ref={logRef} onScroll={onLogScroll} className="scroll-thin min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto min-h-full w-full max-w-4xl px-4 py-6 sm:px-6">
              <ol data-testid="chat-log" role="log" aria-label={t('chat.log.aria')} className="space-y-6 pb-4">
                {messages.map((m, i) => (
                  <Bubble
                    key={m.id}
                    msg={m}
                    artifact={artifactById.get(m.id) ?? null}
                    chips={i === messages.length - 1 && !running}
                    onSuggest={onSuggest}
                    onEdit={m.id === lastUserId && !remote && signedIn ? (v) => editMessage(m.id, v) : undefined}
                    onRetry={m.id === lastAssistantId && !running && !remote && !busy && signedIn ? () => void retryTurn(m.id) : undefined}
                  />
                ))}
              </ol>
              <div ref={endRef} />
            </div>
          </div>
        )}

        {/* New chat: only the box, in the middle of the screen. After the first message it sits at the bottom. */}
        <div
          data-testid="chat-composer-dock"
          data-centered={empty}
          className={clsx(
            'px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 sm:px-4',
            library ? 'hidden' : empty ? 'flex flex-1 flex-col justify-center pb-[14vh]' : 'shrink-0',
          )}
        >
          <div className="mx-auto w-full max-w-4xl space-y-2">
            {empty && (
              <div className="animate-rise pb-6 text-center">
                <h2 className="bg-gradient-to-b from-white to-white/55 bg-clip-text font-display text-[clamp(1.6rem,4vw,2.75rem)] font-semibold leading-tight tracking-tight text-transparent">
                  {t('chat.empty.title')}
                </h2>
                <p className="mx-auto mt-3 max-w-xl text-prose text-ink-3">{t('chat.empty.sub')}</p>
              </div>
            )}
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
              accept={`${VIDEO_ACCEPT},${PICTURE_ACCEPT}`}
              hidden
              onChange={(e) => {
                if (e.target.files && requireAuth()) void attach(Array.from(e.target.files))
                e.target.value = ''
              }}
            />
            {remote && !running && (
              <p className="mx-auto mb-2 max-w-6xl rounded-lg border border-white/10 px-3 py-2 text-xs opacity-80" role="note">
                {t('chat.remote', { server: remote })}
              </p>
            )}
            <Composer
              text={text}
              onText={(v) => {
                setText(v)
                if (problem) setProblem(null)
              }}
              textareaRef={textareaRef}
              placeholder={t(asking ? 'chat.question.placeholder' : hasVideo ? 'chat.composer.placeholderFollowUp' : 'chat.composer.placeholder')}
              hints={hints}
              attachments={attachments}
              onRemoveAttachment={removeAttachment}
              pictures={pictures}
              onRemovePicture={removePicture}
              onAttachClick={() => (requireAuth() ? fileRef.current?.click() : undefined)}
              attachDisabled={busy || sendBlocked}
              running={sendBlocked}
              sendDisabled={sendDisabled}
              onSend={() => void submit()}
              onStop={() => void cancel()}
              onQueue={() => void submit('queue')}
              onInterrupt={() => void submit('interrupt')}
              queued={queued}
              onRemoveQueued={removeQueued}
            />
            {/* Disclaimer under the box: hidden for now. Bring it back with the link pointing at TERMS_URL (the website).
            <p data-testid="chat-disclaimer" className="px-3 pt-0.5 text-center text-caption leading-snug text-ink-4">
              {t('chat.disclaimer.pre')}
              <a data-testid="chat-terms-link" href={TERMS_URL} target="_blank" rel="noopener noreferrer" className="rounded underline decoration-white/25 underline-offset-2 transition-colors hover:text-ink-2 hover:decoration-white/50">
                {t('chat.disclaimer.link')}
              </a>
              {t('chat.disclaimer.post')}
            </p>
            */}
          </div>
        </div>
      </div>

      <ArtifactPanel artifacts={artifacts} />

      {/* Signed-in users get the dialogs from the profile menu. */}
      {!user && <AccountDialogs />}

      <ProductTour />
      <PluginAnnouncement />

      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-50 grid place-items-center bg-surface-0/80 font-display text-heading text-ink-0 backdrop-blur-sm">
          {t('chat.dropHint')}
        </div>
      )}
    </div>
  )
}
