'use client'

import clsx from 'clsx'
import { useEffect, useState } from 'react'
import { Check, Film } from 'lucide-react'
import { Dialog } from '@/components/Dialog'
import { Button } from '@/components/ui'
import { useT } from '@/i18n'
import { fetchLibrary, type LibraryVideo } from './chatApi'

const clock = (sec: number): string => {
  const s = Math.max(0, Math.round(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/**
 * The person's library: every video they uploaded, across chats. Pick some to use again without uploading.
 * Videos of one chat can be combined; `lockProjectId` (a chat that already has footage) limits the list to its own.
 */
export function LibraryDialog({
  onClose,
  onPick,
  lockProjectId,
}: {
  onClose: () => void
  onPick: (items: LibraryVideo[]) => void
  lockProjectId: string | null
}) {
  const { t } = useT()
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [items, setItems] = useState<LibraryVideo[]>([])
  const [picked, setPicked] = useState<string[]>([])

  useEffect(() => {
    const ctl = new AbortController()
    fetchLibrary(ctl.signal)
      .then((r) => {
        setItems(r.items)
        setState('ready')
      })
      .catch(() => !ctl.signal.aborted && setState('error'))
    return () => ctl.abort()
  }, [])

  const pickedProject = items.find((i) => i.id === picked[0])?.projectId ?? lockProjectId
  const blocked = (i: LibraryVideo): boolean => pickedProject !== null && i.projectId !== pickedProject
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  const add = () => {
    onPick(items.filter((i) => picked.includes(i.id)))
    onClose()
  }

  return (
    <Dialog title={t('chat.library.title')} onClose={onClose} returnFocusTo='[data-testid="chat-library"]' testId="chat-library-dialog">
      <div className="space-y-3 px-5 pb-5 pt-3">
        <p className="text-label text-ink-3">{t('chat.library.sub')}</p>
        {state === 'loading' && <p role="status" className="py-6 text-center text-label text-ink-3">{t('chat.library.loading')}</p>}
        {state === 'error' && <p role="alert" className="py-6 text-center text-label text-danger">{t('chat.library.error')}</p>}
        {state === 'ready' && items.length === 0 && <p className="py-6 text-center text-label text-ink-3">{t('chat.library.empty')}</p>}
        {state === 'ready' && items.length > 0 && (
          <ul className="scroll-thin max-h-[50vh] space-y-1.5 overflow-y-auto">
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
                      'flex min-h-[52px] w-full items-center gap-3 rounded-xl border px-3 text-left transition-colors disabled:opacity-40',
                      on ? 'border-accent-line bg-accent-soft' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]',
                    )}
                  >
                    <span className={clsx('grid h-9 w-9 shrink-0 place-items-center rounded-lg', on ? 'bg-accent text-surface-0' : 'bg-white/[0.07] text-ink-2')}>
                      {on ? <Check size={16} strokeWidth={2.5} aria-hidden /> : <Film size={16} aria-hidden />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body font-medium text-ink-0">{i.name}</span>
                      <span className="block font-mono text-caption tabular-nums text-ink-4">
                        {clock(i.durationSec)} · {new Date(i.createdAt).toLocaleDateString()}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        <Button variant="primary" className="h-11 w-full" disabled={picked.length === 0} onClick={add} data-testid="library-add">
          {t('chat.library.add', { n: picked.length })}
        </Button>
      </div>
    </Dialog>
  )
}
