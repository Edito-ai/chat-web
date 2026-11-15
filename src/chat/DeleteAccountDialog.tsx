'use client'

import { useState, type FormEvent } from 'react'
import { Loader2, Trash2 } from 'lucide-react'
import { useT } from '@/i18n'
import { Dialog } from '@/components/Dialog'
import { Button } from '@/components/ui'
import { ApiError } from '@/lib/apiClient'
import { accountApi } from '@/account/accountApi'

/** What a refused deletion says, by the status the server answered with (the server's own sentence for the rest). */
export function deleteProblem(e: unknown): 'wrong' | 'tooMany' | { text: string } {
  if (e instanceof ApiError) {
    if (e.status === 400) return 'wrong'
    if (e.status === 429) return 'tooMany'
    return { text: e.message.replace(/^\d{3}\s+/, '') }
  }
  return { text: e instanceof Error ? e.message : String(e) }
}

/**
 * "Delete my account": says exactly what goes, asks for the password, and only then deletes. `onDeleted` runs after the
 * server confirmed (the caller signs the person out and clears what the browser kept).
 */
export function DeleteAccountDialog({ email, onClose, onDeleted }: { email: string; onClose: () => void; onDeleted: () => void }) {
  const { t } = useT()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy || password === '') return
    setBusy(true)
    setError(null)
    try {
      await accountApi().deleteAccount(password)
      onDeleted()
    } catch (err) {
      const p = deleteProblem(err)
      setError(p === 'wrong' ? t('acct.delete.wrong') : p === 'tooMany' ? t('acct.delete.tooMany') : p.text || t('acct.delete.failed'))
      setBusy(false)
    }
  }

  return (
    <Dialog title={t('acct.delete.title')} onClose={busy ? () => undefined : onClose} testId="chat-delete-dialog">
      <form onSubmit={(e) => void submit(e)} className="space-y-4" noValidate>
        <p className="text-body text-ink-1">{t('acct.delete.warn', { email })}</p>
        <ul className="list-disc space-y-1 pl-5 text-label text-ink-2">
          <li>{t('acct.delete.item1')}</li>
          <li>{t('acct.delete.item2')}</li>
          <li>{t('acct.delete.item3')}</li>
        </ul>
        <label className="block space-y-1">
          <span className="text-label text-ink-2">{t('acct.delete.password')}</span>
          <input
            className="field"
            data-testid="chat-delete-password"
            type="password"
            autoComplete="current-password"
            value={password}
            disabled={busy}
            onChange={(e) => {
              setPassword(e.target.value)
              setError(null)
            }}
          />
        </label>
        {error && (
          <p role="alert" data-testid="chat-delete-error" className="text-label text-danger">
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            {t('acct.delete.cancel')}
          </Button>
          <button
            type="submit"
            data-testid="chat-delete-confirm"
            disabled={busy || password === ''}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-danger px-3.5 text-body font-semibold text-white transition-[filter,opacity] hover:brightness-110 disabled:pointer-events-none disabled:opacity-40"
          >
            {busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Trash2 size={14} aria-hidden />}
            {t(busy ? 'acct.delete.deleting' : 'acct.delete.confirm')}
          </button>
        </div>
      </form>
    </Dialog>
  )
}
