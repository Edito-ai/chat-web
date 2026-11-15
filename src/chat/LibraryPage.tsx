'use client'

import clsx from 'clsx'
import { useEffect, useState } from 'react'
import { Check, Film } from 'lucide-react'
import { Button } from '@/components/ui'
import { useT } from '@/i18n'
import { fetchLibrary, type LibraryVideo } from './chatApi'

const clock = (sec: number): string => {
  const s = Math.max(0, Math.round(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/**
 * The person's library as a full page in the main area (opened from the sidebar): every video they uploaded, across
 * chats, as a grid. Pick some and add them to the chat without uploading again. Videos of one chat can be combined;
 * `lockProjectId` (a chat that already has footage) limits the choice to its own.
 */
export function LibraryPage({
  onPick,
  lockProjectId,
}: {
  onPick: (items: LibraryVideo[]) => void
  lockProjectId: string | null
}) {
  const { t } = useT()
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [items, setItems] = useState<LibraryVideo[]>([])
  const [picked, setPicked] = useState<string[]>([])
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const ctl = new AbortController()
    setState('loading')
    fetchLibrary(ctl.signal)
      .then((r) => {
        setItems(r.items)
        setState('ready')
      })
      .catch(() => !ctl.signal.aborted && setState('error'))
    return () => ctl.abort()
  }, [attempt])

  const pickedProject = items.find((i) => i.id === picked[0])?.projectId ?? lockProjectId
  const blocked = (i: LibraryVideo): boolean => pickedProject !== null && i.projectId !== pickedProject
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))

  return (
    <div data-testid="chat-library-page" className="flex min-h-0 flex-1 flex-col">
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl px-4 pb-8 pt-2 sm:px-8 sm:pt-6">
          <h2 className="font-display text-display font-semibold tracking-[-0.01em] text-ink-0">{t('nav.library')}</h2>
          <p className="mt-1.5 text-body text-ink-3">{t('chat.library.sub')}</p>

          {state === 'loading' && (
            <ul aria-hidden className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
              {[0, 1, 2, 3, 4, 5].map((n) => (
                <li key={n} className="aspect-[4/3] animate-pulse rounded-2xl bg-white/[0.04]" />
              ))}
            </ul>
          )}
          {state === 'loading' && <p role="status" className="sr-only">{t('chat.library.loading')}</p>}
          {state === 'error' && (
            <div role="alert" className="mt-10 flex flex-col items-center gap-3 text-center">
              <p className="text-body text-danger">{t('chat.library.error')}</p>
              <Button variant="ghost" onClick={() => setAttempt((a) => a + 1)}>
                {t('common.retry')}
              </Button>
            </div>
          )}
          {state === 'ready' && items.length === 0 && (
            <div className="mt-16 flex flex-col items-center gap-3 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-white/[0.05] text-ink-3">
                <Film size={22} aria-hidden />
              </span>
              <p className="max-w-sm text-body text-ink-3">{t('chat.library.empty')}</p>
            </div>
          )}
          {state === 'ready' && items.length > 0 && (
            <ul className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
              {items.map((i) => {
                const on = picked.includes(i.id)
                const off = blocked(i)
                return (
                  <li key={i.id}>
                    <button
                      type="button"
                      data-testid={`library-item-${i.id}`}
                      aria-pressed={on}
                      disabled={off}
                      title={off ? t('chat.library.oneChat') : undefined}
                      onClick={() => toggle(i.id)}
                      className={clsx(
                        'group flex w-full flex-col overflow-hidden rounded-2xl border text-left transition-all disabled:cursor-not-allowed disabled:opacity-35',
                        on
                          ? 'border-accent-line bg-accent-soft ring-1 ring-accent-line'
                          : 'border-white/[0.08] bg-white/[0.03] hover:-translate-y-px hover:border-white/20 hover:bg-white/[0.06]',
                      )}
                    >
                      <span className="relative grid aspect-video w-full place-items-center bg-gradient-to-br from-white/[0.07] to-white/[0.01]">
                        <Film size={26} strokeWidth={1.5} aria-hidden className="text-ink-3 transition-colors group-hover:text-ink-1" />
                        <span className="absolute bottom-2 right-2 rounded-md bg-black/60 px-1.5 py-0.5 font-mono text-caption tabular-nums text-ink-0">
                          {clock(i.durationSec)}
                        </span>
                        <span
                          aria-hidden
                          className={clsx(
                            'absolute left-2 top-2 grid h-6 w-6 place-items-center rounded-full border transition-colors',
                            on ? 'border-accent bg-accent text-surface-0' : 'border-white/30 bg-black/30 text-transparent group-hover:border-white/60',
                          )}
                        >
                          <Check size={13} strokeWidth={3} />
                        </span>
                      </span>
                      <span className="block min-w-0 px-3 py-2.5">
                        <span className="block truncate text-body font-medium text-ink-0">{i.name}</span>
                        <span className="block text-caption text-ink-4">{new Date(i.createdAt).toLocaleDateString()}</span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>

      {picked.length > 0 && (
        <div className="shrink-0 border-t border-white/[0.08] bg-surface-0/80 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md">
          <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 sm:px-4">
            <button type="button" onClick={() => setPicked([])} className="text-label text-ink-3 transition-colors hover:text-ink-0">
              {t('common.clear')}
            </button>
            <Button variant="primary" className="h-11" onClick={() => onPick(items.filter((i) => picked.includes(i.id)))} data-testid="library-add">
              {t('chat.library.add', { n: picked.length })}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
