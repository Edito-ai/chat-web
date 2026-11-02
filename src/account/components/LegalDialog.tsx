'use client'

import { ChevronLeft } from 'lucide-react'
import { useState } from 'react'
import { useT } from '@/i18n'
import { Dialog } from '@/components/Dialog'
import { InlineError } from '@/components/ui'
import { accountApi } from '../accountApi'
import { useAccount } from '../accountStore'
import { formatDate } from '../lib/planView'
import { useAsync } from '../useAsync'
import { MarkdownView } from './MarkdownView'

const reason = (e: unknown) => (e instanceof Error ? e.message : String(e))

function DocBody({ slug }: { slug: string }) {
  const { t, locale } = useT()
  const doc = useAsync((signal) => accountApi().legalDoc(slug, signal))
  if (doc.error) return <InlineError message={t('acct.legal.error', { reason: reason(doc.error) })} onRetry={doc.reload} />
  if (!doc.data) return <p role="status" className="text-label text-ink-3">{t('acct.legal.loading')}</p>
  const d = doc.data
  return (
    <div>
      <p className="mb-2 text-caption text-ink-3">
        {t('acct.legal.version', { version: d.version })} ·{' '}
        {d.effectiveDate ? t('acct.legal.effective', { date: formatDate(d.effectiveDate, locale) || d.effectiveDate }) : t('acct.legal.noEffective')}
      </p>
      <MarkdownView markdown={d.markdown} testId="legal-body" />
    </div>
  )
}

/** Legal: the documents the backend serves (GET /legal) and the Markdown of the one picked (GET /legal/{slug}). */
export function LegalDialog() {
  const { t } = useT()
  const close = useAccount((s) => s.closeDialog)
  const list = useAsync((signal) => accountApi().legalList(signal))
  const [slug, setSlug] = useState<string | null>(null)
  return (
    <Dialog
      title={t('acct.legal.title')}
      onClose={close}
      testId="dialog-legal"
      headerExtra={
        slug ? (
          <button
            type="button"
            onClick={() => setSlug(null)}
            data-testid="legal-back"
            className="flex min-h-[28px] items-center gap-1 rounded-md px-1.5 text-label text-ink-2 hover:text-ink-0"
          >
            <ChevronLeft size={14} aria-hidden /> {t('acct.legal.back')}
          </button>
        ) : undefined
      }
    >
      {slug ? (
        <DocBody slug={slug} />
      ) : (
        <div>
          <p className="mb-3 text-label text-ink-3">{t('acct.legal.intro')}</p>
          {list.error ? (
            <InlineError message={t('acct.legal.error', { reason: reason(list.error) })} onRetry={list.reload} />
          ) : !list.data ? (
            <p role="status" className="text-label text-ink-3">{t('acct.legal.loading')}</p>
          ) : list.data.length === 0 ? (
            <p className="text-label text-ink-3">{t('acct.legal.empty')}</p>
          ) : (
            <ul className="space-y-1.5">
              {list.data.map((d) => (
                <li key={d.slug}>
                  <button
                    type="button"
                    onClick={() => setSlug(d.slug)}
                    data-testid={`legal-doc-${d.slug}`}
                    className="flex min-h-[44px] w-full items-center justify-between gap-3 rounded-lg border border-line bg-black/20 px-3 py-2 text-left transition-colors hover:border-line-strong hover:bg-black/30"
                  >
                    <span className="text-body font-medium text-ink-0">{d.title}</span>
                    <span className="shrink-0 text-caption text-ink-4">{t('acct.legal.version', { version: d.version })}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Dialog>
  )
}
